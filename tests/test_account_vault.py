"""账号安全边界及设备快照回归；只使用临时文件和合成账号。"""
import base64
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from module.api.account_service import AccountService
from module.api.config_service import ConfigService
from module.api.protocol import AccountParams, ApiError, InstanceParams
from module.runtime.account_device import AccountDevice, DATABASE, FILES, PLAYER_PREFS, SDK_PREFS
from module.runtime.account_vault import AccountVault, SecretKey, sensitive_operation
from tests.test_api import fixture

PASSWORD = 'temporary-Test-Password-59!'
NEW_PASSWORD = 'another-Strong-Passphrase-62!'


def snapshot():
    with closing(sqlite3.connect(':memory:')) as db:
        db.execute('CREATE TABLE users(uid TEXT, uname TEXT, access_key TEXT, pwd TEXT)')
        db.execute("INSERT INTO users VALUES ('synthetic-uid', '合成账号', 'synthetic-secret-token', 'synthetic-secret-password')")
        db.commit()
        blob = db.serialize()
    return {DATABASE: base64.b64encode(blob).decode(), SDK_PREFS: base64.b64encode(b'<map/>').decode(),
            PLAYER_PREFS: base64.b64encode(b'<map><string name="user.arg1">synthetic-secret-token</string></map>').decode()}


class VaultTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.vault = AccountVault(self.root)
        self.vault.create('testpilot', PASSWORD)

    def test_all_project_files_contain_no_plaintext_or_key(self):
        row, key, data = self.vault.authenticate('testpilot', PASSWORD)
        data['profiles'] = [{'id': 'profile', 'label': '私密账号名称', 'files': snapshot()}]
        data['selected'] = 'profile'
        self.vault.save('testpilot', row[0], key, data, True)
        for path in self.root.rglob('*'):
            if path.is_file():
                raw = path.read_bytes()
                for secret in (PASSWORD.encode(), key.value, b'synthetic-secret-token', '私密账号名称'.encode(), b'synthetic-uid'):
                    self.assertNotIn(secret, raw)
        self.assertEqual(256, len(self.vault.record('testpilot')[0]))
        copied = AccountVault(self.root)
        with self.assertRaisesRegex(ApiError, '重新解锁'):
            copied.startup_key('testpilot')
        self.assertEqual(data, copied.authenticate('testpilot', PASSWORD)[2])

    def test_wrong_password_tamper_and_throttling(self):
        with self.assertRaises(ApiError) as error:
            self.vault.authenticate('testpilot', NEW_PASSWORD)
        self.assertEqual('VAULT_AUTH_FAILED', error.exception.code)
        with self.assertRaises(ApiError) as error:
            self.vault.authenticate('testpilot', PASSWORD)
        self.assertEqual('RATE_LIMITED', error.exception.code)
        self.vault.failures.clear()
        with closing(sqlite3.connect(self.vault.path('testpilot'))) as db, db:
            db.execute('UPDATE vault SET enabled=1')
        with self.assertRaises(ApiError):
            self.vault.authenticate('testpilot', PASSWORD)

    def test_disabled_never_touches_device_and_paths_reject_escape(self):
        device = Mock()
        self.vault.restore('testpilot', device)
        device.restore.assert_not_called()
        for name in ('../other', 'test/other', 'CON'):
            with self.assertRaises(ApiError):
                self.vault.path(name)
        self.vault.keys.clear()
        self.assertIsNone(self.vault.startup_key('testpilot'))

    def test_sensitive_traceback_discards_locals_and_key_repr(self):
        from rich.console import Console
        from rich.traceback import Traceback
        import io

        @sensitive_operation
        def fail():
            password = PASSWORD
            token = 'synthetic-secret-token'
            raise RuntimeError(password + token)

        try:
            fail()
        except ApiError as error:
            output = io.StringIO()
            Console(file=output, width=120).print(Traceback.from_exception(type(error), error,
                error.__traceback__.tb_next, show_locals=True))
            text = output.getvalue()
        self.assertNotIn(PASSWORD, text)
        self.assertNotIn('synthetic-secret-token', text)
        self.assertNotIn('unsafe-key-bytes', repr(SecretKey(b'unsafe-key-bytes')))

    def test_tpm_unlock_only_with_original_hardware_and_authenticated_blob(self):
        row, key, data = self.vault.authenticate('testpilot', PASSWORD)
        data.update(profiles=[{'id': 'profile'}], selected='profile')
        self.vault.save('testpilot', row[0], key, data, True, b'wrapped-hardware-key')
        cold = AccountVault(self.root)
        with patch('module.runtime.account_tpm.TpmProtector') as tpm:
            tpm.return_value.unwrap.return_value = key.value
            self.assertEqual(key.value, cold.startup_key('testpilot').value)
        cold.keys.clear()
        with patch('module.runtime.account_tpm.TpmProtector') as tpm:
            tpm.return_value.unwrap.side_effect = ApiError('TPM_UNAVAILABLE', '绑定失效')
            with self.assertRaises(ApiError):
                cold.startup_key('testpilot')
        self.assertEqual(data, cold.authenticate('testpilot', PASSWORD)[2])


class AccountApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.configs = ConfigService(fixture(self.temp.name))
        self.service = AccountService(self.configs)
        self.idle = patch('module.api.account_service.ensure_idle')
        self.idle.start()
        self.addCleanup(self.idle.stop)

    def manage(self, action, **kwargs):
        return self.service.manage(AccountParams(instance='testpilot', action=action, password=PASSWORD, **kwargs))

    def test_password_required_before_identity_and_every_sensitive_action(self):
        self.manage('create')
        device = Mock()
        device.capture.return_value = (snapshot(), [{'uid': 'synthetic-uid', 'name': '合成账号'}])
        with patch('module.api.account_service.device_for', return_value=device):
            response = self.manage('capture', label='私密名称')
            self.assertNotIn('profiles', response)
            self.assertNotIn('profiles', self.service.status(InstanceParams(instance='testpilot')))
            listing = self.manage('list')
            profile = listing['profiles'][0]['id']
            self.manage('select', profile=profile)
            device.restore.assert_called_once_with(snapshot())
            device.launch.assert_called_once()
        with self.assertRaises(ApiError):
            self.service.manage(AccountParams(instance='testpilot', action='list'))
        self.service.vault.failures.clear()
        self.manage('enable', enabled=True)
        self.manage('password', new_password=NEW_PASSWORD)
        self.assertEqual(1, len(self.service.vault.authenticate('testpilot', NEW_PASSWORD)[2]['profiles']))
        self.assertNotIn('synthetic-secret-token', json.dumps(listing))

    def test_reused_password_missing_profile_and_running_instance(self):
        with self.assertRaises(ApiError) as error:
            self.service.manage(AccountParams(instance='testpilot', action='create', password=PASSWORD), PASSWORD)
        self.assertEqual('PASSWORD_REUSED', error.exception.code)
        self.manage('create')
        with self.assertRaises(ApiError):
            self.manage('enable', enabled=True)
        with patch('module.api.account_service.ensure_idle', side_effect=ApiError('INSTANCE_RUNNING', '运行中')):
            with self.assertRaises(ApiError):
                self.manage('capture')

    def test_password_fields_never_appear_in_model_repr(self):
        params = AccountParams(instance='testpilot', action='password', password=PASSWORD, new_password=NEW_PASSWORD)
        self.assertNotIn(PASSWORD, repr(params))
        self.assertNotIn(NEW_PASSWORD, repr(params))


class DeviceTests(unittest.TestCase):
    def test_capture_only_account_files_and_player_keys(self):
        device = AccountDevice.__new__(AccountDevice)
        device.stop = Mock()
        device.command = Mock(return_value=b'')
        blobs = {name: base64.b64decode(value) for name, value in snapshot().items()}
        blobs[PLAYER_PREFS] = b'<map><string name="user.arg1">secret</string><int name="fps_limit" value="60"/></map>'
        device.read = Mock(side_effect=lambda name: blobs[name])
        files, users = device.capture()
        self.assertEqual(set(FILES), set(files))
        self.assertNotIn(b'fps_limit', base64.b64decode(files[PLAYER_PREFS]))
        self.assertEqual('synthetic-uid', users[0]['uid'])
        device.stop.assert_called_once()

    def test_root_and_transport_errors_never_echo_secret(self):
        with patch('module.runtime.account_device.subprocess.run', return_value=SimpleNamespace(returncode=1, stdout=b'', stderr=b'secret-account')):
            with self.assertRaises(ApiError) as error:
                AccountDevice('127.0.0.1:16384', 'adb')
        self.assertNotIn('secret-account', str(error.exception))

    def test_transport_preserves_binary_and_remote_exit_code(self):
        blob = bytes(range(256))
        device = AccountDevice.__new__(AccountDevice)
        device.adb, device.serial, device.use_su = 'adb', '127.0.0.1:16384', False
        with patch('module.runtime.account_device.subprocess.run') as run:
            run.return_value = SimpleNamespace(returncode=0, stdout=base64.b64encode(blob), stderr=b'')
            self.assertEqual(blob, device.command('cat > /synthetic/file', blob))
            args, kwargs = run.call_args
            self.assertEqual(['shell', '-T'], args[0][3:5])
            self.assertNotIn(base64.b64encode(blob).decode(), ' '.join(args[0]))
            self.assertEqual(base64.b64encode(blob) + b'\n', kwargs['input'])
            run.return_value = SimpleNamespace(returncode=1, stdout=b'', stderr=b'synthetic-secret-token')
            with self.assertRaises(ApiError) as error:
                device.command('false')
            self.assertEqual('ACCOUNT_DEVICE_FAILED', error.exception.code)
            self.assertNotIn('synthetic-secret-token', str(error.exception))


if __name__ == '__main__':
    unittest.main()
