"""实例账号保险库：磁盘只存密文，解密密钥只驻留当前服务和 worker 内存。"""
import json
import os
import sqlite3
import threading
import time
from contextlib import closing
from pathlib import Path

from Crypto.Cipher import AES
from Crypto.Protocol.KDF import scrypt

from module.api.config_service import ROOT, validate_name
from module.api.protocol import ApiError

OPERATIONS = threading.RLock()
MAX_BYTES = 16 * 1024 * 1024
_KEEP_MACHINE = object()


class SecretKey:
    """跨进程传递密钥时避免调试器和富文本异常日志输出密钥。"""
    def __init__(self, value):
        self.value = value

    def __repr__(self):
        return '<实例密钥已隐藏>'


def sensitive_operation(function):
    """丢弃敏感内部堆栈；项目的异常日志默认会打印局部变量。"""
    from functools import wraps

    @wraps(function)
    def wrapped(*args, **kwargs):
        failure = None
        try:
            return function(*args, **kwargs)
        except ApiError as error:
            failure = (error.code, error.message)
        except Exception:
            failure = ('ACCOUNT_FAILED', '账号操作失败，敏感上下文已隐藏；请检查设备和保险库状态')
        # 清除调用参数，不让上层带局部变量的 traceback 暴露密码或密钥。
        args = kwargs = None
        raise ApiError(*failure) from None

    return wrapped


class AccountVault:
    def __init__(self, root=ROOT):
        self.root = Path(root)
        self.keys = {}
        self.failures = {}

    def path(self, instance):
        instance = validate_name(instance)
        directory = self.root / 'config' / instance
        path = directory / 'config.db'
        if directory.is_symlink() or path.is_symlink() or directory.resolve().parent != (self.root / 'config').resolve():
            raise ApiError('INVALID_PARAMS', '账号保险库路径无效')
        return path

    def record(self, instance):
        path = self.path(instance)
        if not path.exists():
            return None
        try:
            if path.stat().st_size > MAX_BYTES:
                raise ValueError()
            with closing(sqlite3.connect(f'{path.as_uri()}?mode=ro', uri=True)) as db:
                row = db.execute('SELECT salt, nonce, tag, payload, enabled, machine FROM vault WHERE id=1').fetchone()
            if row is None or len(row[0]) != 256 or len(row[1]) != 12 or len(row[2]) != 16:
                raise ValueError()
            return row
        except (sqlite3.Error, ValueError, OSError):
            raise ApiError('VAULT_INVALID', '账号保险库损坏，已拒绝读取或写入游戏') from None

    def status(self, instance):
        row = self.record(instance)
        return {'initialized': row is not None, 'enabled': bool(row and row[4]),
                'unlocked': instance in self.keys, 'tpm_bound': bool(row and row[5])}

    @staticmethod
    def derive(password, salt):
        # 约 128 MiB 内存成本；参数固定，拒绝由不可信文件指定成本。
        return SecretKey(scrypt(password.encode('utf-8'), salt, 32, N=2**17, r=8, p=1))

    @staticmethod
    def aad(instance, enabled, machine):
        return f'AzurPilot/account-vault/v1/{instance}/{int(enabled)}'.encode('utf-8') + (machine or b'')

    def decrypt(self, instance, row, key):
        try:
            cipher = AES.new(key.value, AES.MODE_GCM, nonce=row[1])
            cipher.update(self.aad(instance, row[4], row[5]))
            return json.loads(cipher.decrypt_and_verify(row[3], row[2]))
        except (ValueError, TypeError, UnicodeError):
            raise ApiError('VAULT_AUTH_FAILED', '实例密码不正确或保险库已被篡改') from None

    def authenticate(self, instance, password):
        until = self.failures.get(instance, 0)
        if time.monotonic() < until:
            raise ApiError('RATE_LIMITED', '密码验证失败，请稍后重试')
        row = self.record(instance)
        if row is None:
            raise ApiError('VAULT_NOT_SET', '请先设置独立实例密码')
        key = self.derive(password, row[0])
        try:
            data = self.decrypt(instance, row, key)
        except ApiError:
            self.failures[instance] = time.monotonic() + 5
            raise
        self.failures.pop(instance, None)
        return row, key, data

    def save(self, instance, salt, key, data, enabled=False, machine=_KEEP_MACHINE):
        if machine is _KEEP_MACHINE:
            row = self.record(instance)
            machine = row[5] if row else None
        cipher = AES.new(key.value, AES.MODE_GCM, nonce=os.urandom(12))
        cipher.update(self.aad(instance, enabled, machine))
        payload, tag = cipher.encrypt_and_digest(json.dumps(data, ensure_ascii=False).encode('utf-8'))
        if len(payload) > MAX_BYTES // 2:
            raise ApiError('VAULT_FULL', '账号数据超过保险库容量限制')
        path = self.path(instance)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        # SQLite 文件、回滚日志与旧页从未包含账号明文。
        with closing(sqlite3.connect(path)) as db, db:
            db.execute('PRAGMA secure_delete=ON')
            db.execute('CREATE TABLE IF NOT EXISTS vault (id INTEGER PRIMARY KEY, salt BLOB, nonce BLOB, tag BLOB, payload BLOB, enabled INTEGER, machine BLOB)')
            db.execute('INSERT OR REPLACE INTO vault VALUES (1, ?, ?, ?, ?, ?, ?)',
                       (salt, cipher.nonce, tag, payload, int(enabled), machine))
        path.chmod(0o600)

    def create(self, instance, password):
        if self.record(instance) is not None:
            raise ApiError('VAULT_EXISTS', '实例密码已设置，请使用修改密码')
        self.check_password(password)
        salt = os.urandom(256)
        key = self.derive(password, salt)
        self.save(instance, salt, key, {'profiles': [], 'selected': None})
        self.keys[instance] = key

    @staticmethod
    def check_password(password):
        if len(password) < 16 or len(set(password)) < 8:
            raise ApiError('WEAK_PASSWORD', '请使用至少 16 位、包含至少 8 种不同字符的独立密码或长口令')

    def startup_key(self, instance):
        row = self.record(instance)
        if row is None or not row[4]:
            return None
        key = self.keys.get(instance)
        if key is None and row[5]:
            from module.runtime.account_tpm import TpmProtector
            key = SecretKey(TpmProtector(self.root, instance).unwrap(row[5]))
            self.decrypt(instance, row, key)
            self.keys[instance] = key
        if key is None:
            raise ApiError('VAULT_LOCKED', '账号恢复已启用，请先用实例密码解锁；服务重启后需重新解锁')
        data = self.decrypt(instance, row, key)
        if not any(p['id'] == data['selected'] for p in data['profiles']):
            raise ApiError('ACCOUNT_NOT_SELECTED', '请先备份并选择账号')
        return key

    def restore(self, instance, device):
        with OPERATIONS:
            key = self.startup_key(instance)
            if key is None:
                return
            data = self.decrypt(instance, self.record(instance), key)
            profile = next(p for p in data['profiles'] if p['id'] == data['selected'])
            device.restore(profile['files'])


vault = AccountVault()
