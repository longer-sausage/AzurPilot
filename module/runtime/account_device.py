"""国服 B 站登录数据的受限 ADB 传输，不在主机落地明文。"""
import base64
import re
import shlex
import sqlite3
import subprocess
import uuid
import xml.etree.ElementTree as ET
from contextlib import closing

from module.api.protocol import ApiError

PACKAGE = 'com.bilibili.azurlane'
BASES = (f'/data/user/0/{PACKAGE}', f'/data/data/{PACKAGE}')
DATABASE = 'databases/users.db'
SDK_PREFS = 'shared_prefs/com.bilibili.azurlane_preferences.xml'
PLAYER_PREFS = 'shared_prefs/com.bilibili.azurlane.v2.playerprefs.xml'
FILES = (DATABASE, SDK_PREFS, PLAYER_PREFS)


def account_key(name):
    return name.startswith(('user.', 'server.id', 'loginedServer_'))


class AccountDevice:
    def __init__(self, serial, adb):
        if not serial or serial == 'auto' or not re.fullmatch(r'[A-Za-z0-9_.:\-]+', serial):
            raise ApiError('DEVICE_REQUIRED', '账号管理需要明确的模拟器 ADB 地址')
        self.serial, self.adb = serial, str(adb)
        self.use_su = False
        if self.command('id -u').strip() != b'0':
            self.use_su = True
            if self.command('id -u').strip() != b'0':
                raise ApiError('ROOT_REQUIRED', '读取账号需要模拟器 root 权限，请启用 root 或 adb root')

    def resolve_base(self):
        """仅在固定包名目录中寻找完整账号文件，优先使用 user 0 标准路径。"""
        branches = []
        for index, base in enumerate(BASES):
            checks = ' && '.join(f'test -f {base}/{name}' for name in FILES)
            branches.append(f"{'if' if index == 0 else 'elif'} {checks}; then printf {index}")
        result = self.command('; '.join(branches) + '; fi').strip()
        if result not in (b'0', b'1'):
            raise ApiError('ACCOUNT_DATA_NOT_FOUND', '常见应用私有目录中未找到完整账号文件，请先在游戏中登录')
        return BASES[int(result)]

    def command(self, script, data=None):
        if data is not None:
            # Windows adb 的 stdin 会把二进制 Ctrl-Z 当作 EOF；仅通过管道传输 Base64。
            script = f'base64 -d | ({script})'
            data = base64.b64encode(data) + b'\n'
        # shell v2 传递远端退出码；exec-out 会吞掉退出码，不能用于恢复事务。
        # 输出也使用 Base64，避免 Windows 标准流改写二进制换行或 Ctrl-Z。
        script = f'set -o pipefail; ({script}) | base64'
        command = ['su', '-c', shlex.quote(script)] if self.use_su else ['sh', '-c', shlex.quote(script)]
        try:
            result = subprocess.run([self.adb, '-s', self.serial, 'shell', '-T', ' '.join(command)],
                                    input=data, capture_output=True, timeout=30)
            if result.returncode != 0 or len(result.stdout) > 6 * 1024 * 1024:
                raise ValueError()
            output = base64.b64decode(b''.join(result.stdout.split()), validate=True)
            if len(output) > 4 * 1024 * 1024:
                raise ValueError()
            return output
        except (OSError, subprocess.SubprocessError, ValueError):
            # 不转发 stderr、命令内容或带账号数据的底层异常。
            raise ApiError('ACCOUNT_DEVICE_FAILED', '账号设备操作失败，请检查 ADB、root 权限和游戏文件') from None

    def stop(self):
        self.command(f'am force-stop {PACKAGE}')
        if self.command(f'pidof {PACKAGE} || true').strip():
            raise ApiError('GAME_RUNNING', '未确认游戏停止，已拒绝访问账号文件')

    def read(self, name):
        return self.command(f'cat {self.base}/{name}')

    @staticmethod
    def users(blob):
        try:
            with closing(sqlite3.connect(':memory:')) as db:
                db.deserialize(blob)
                db.execute('PRAGMA trusted_schema=OFF')
                if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise ValueError()
                columns = {r[1] for r in db.execute('PRAGMA table_info(users)')}
                if not {'uid', 'uname', 'access_key', 'pwd'} <= columns:
                    raise ValueError()
                return [{'uid': str(r[0]), 'name': str(r[1] or '')}
                        for r in db.execute('SELECT uid, uname FROM users LIMIT 100')]
        except (sqlite3.Error, ValueError):
            raise ApiError('ACCOUNT_SCHEMA_CHANGED', '账号数据库结构不兼容，已拒绝操作') from None

    def capture(self):
        self.stop()
        self.base = self.resolve_base()
        # 非空 WAL/回滚日志可能含未合并事务，不能当作完整快照。
        for suffix in ('-wal', '-journal'):
            self.command(f'test ! -s {self.base}/{DATABASE}{suffix}')
        blobs = {name: self.read(name) for name in FILES}
        users = self.users(blobs[DATABASE])
        if not users:
            raise ApiError('ACCOUNT_EMPTY', '未发现已保存的登录账号')
        try:
            ET.fromstring(blobs[SDK_PREFS])
            player = ET.fromstring(blobs[PLAYER_PREFS])
            selected = ET.Element('map')
            for element in player:
                if account_key(element.get('name', '')):
                    selected.append(element)
            blobs[PLAYER_PREFS] = ET.tostring(selected, encoding='utf-8', xml_declaration=True)
        except ET.ParseError:
            raise ApiError('ACCOUNT_SCHEMA_CHANGED', '登录偏好文件格式不兼容') from None
        return {name: base64.b64encode(blob).decode('ascii') for name, blob in blobs.items()}, users

    def restore(self, files):
        if set(files) != set(FILES):
            raise ApiError('ACCOUNT_SCHEMA_CHANGED', '账号快照文件不兼容')
        try:
            blobs = {name: base64.b64decode(files[name], validate=True) for name in FILES}
            self.users(blobs[DATABASE])
            saved = ET.fromstring(blobs[PLAYER_PREFS])
            ET.fromstring(blobs[SDK_PREFS])
            if any(not account_key(e.get('name', '')) for e in saved):
                raise ValueError()
        except (ValueError, ET.ParseError):
            raise ApiError('ACCOUNT_SCHEMA_CHANGED', '账号快照损坏') from None
        self.stop()
        self.base = self.resolve_base()
        try:
            player = ET.fromstring(self.read(PLAYER_PREFS))
        except ET.ParseError:
            raise ApiError('ACCOUNT_SCHEMA_CHANGED', '设备偏好文件损坏') from None
        for element in list(player):
            if account_key(element.get('name', '')):
                player.remove(element)
        player.extend(saved)
        blobs[PLAYER_PREFS] = ET.tostring(player, encoding='utf-8', xml_declaration=True)
        owner = self.command(f'stat -c %u:%g {self.base}/{DATABASE}').strip().decode('ascii')
        if not re.fullmatch(r'\d+:\d+', owner):
            raise ApiError('ACCOUNT_DEVICE_FAILED', '无法确认账号文件所有者')
        stage = f'{self.base}/.azurpilot-account-{uuid.uuid4().hex}'
        self.command(f'umask 077; mkdir {stage}')
        cleanup = True
        try:
            for index, name in enumerate(FILES):
                self.command(f'cat > {stage}/new{index}', blobs[name])
                if self.command(f'cat {stage}/new{index}') != blobs[name]:
                    raise ApiError('ACCOUNT_DEVICE_FAILED', '设备写入校验失败')
            # 在设备私有目录备份所有目标及 SQLite 边文件；失败则整组回滚。
            targets = (*FILES, DATABASE + '-wal', DATABASE + '-shm', DATABASE + '-journal',
                       SDK_PREFS + '.bak', PLAYER_PREFS + '.bak')
            backup = '\n'.join(f'if test -e {self.base}/{name}; then cp -p {self.base}/{name} {stage}/old{i}; fi'
                               for i, name in enumerate(targets))
            apply = ' &&\n'.join(f'chown {owner} {stage}/new{i} && chmod 660 {stage}/new{i} && mv {stage}/new{i} {self.base}/{name}'
                              for i, name in enumerate(FILES))
            remove = ' &&\n'.join(f'rm -f {self.base}/{name}' for name in targets[len(FILES):])
            rollback = ' &&\n'.join(f'if test -e {stage}/old{i}; then cp -p {stage}/old{i} {self.base}/{name}; else rm -f {self.base}/{name}; fi'
                                 for i, name in enumerate(targets))
            self.command(f'set -e\n{backup}')
            # 回滚失败时保留设备私有恢复目录，不能销毁最后一份原数据。
            cleanup = False
            self.command(f'({apply} &&\n{remove} &&\nrestorecon {self.base}/databases/users.db {self.base}/shared_prefs/*.xml) || {{ ({rollback}) && rm -rf {stage}; exit 1; }}')
            cleanup = True
            for name in FILES:
                if self.read(name) != blobs[name]:
                    cleanup = False
                    self.command(f'({rollback}) && rm -rf {stage}')
                    raise ApiError('ACCOUNT_DEVICE_FAILED', '恢复后校验失败，已回滚')
        finally:
            if cleanup:
                self.command(f'rm -rf {stage}')

    def launch(self):
        self.command(f'monkey -p {PACKAGE} -c android.intent.category.LAUNCHER 1 >/dev/null')
