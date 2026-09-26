"""Windows TPM 密钥封装；只使用硬件提供者，不回退到软件密钥。"""
import base64
import hashlib
import json
import os
import subprocess

from module.api.protocol import ApiError

# 参数通过 stdin 传入，不进入进程命令行、环境变量或临时脚本。
SCRIPT = r'''
$ErrorActionPreference = 'Stop'
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $provider = [System.Security.Cryptography.CngProvider]::new('Microsoft Platform Crypto Provider')
    if ($request.action -eq 'wrap') {
        if (![System.Security.Cryptography.CngKey]::Exists($request.name, $provider)) {
            $parameters = [System.Security.Cryptography.CngKeyCreationParameters]::new()
            $parameters.Provider = $provider
            $parameters.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Decryption
            $parameters.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None
            $parameters.Parameters.Add([System.Security.Cryptography.CngProperty]::new(
                'Length', [BitConverter]::GetBytes([int]2048), [System.Security.Cryptography.CngPropertyOptions]::None))
            $key = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::Rsa, $request.name, $parameters)
        } else {
            $key = [System.Security.Cryptography.CngKey]::Open($request.name, $provider)
        }
    } else {
        $key = [System.Security.Cryptography.CngKey]::Open($request.name, $provider)
    }
    $rsa = [System.Security.Cryptography.RSACng]::new($key)
    $bytes = [Convert]::FromBase64String($request.data)
    if ($request.action -eq 'wrap') {
        $result = $rsa.Encrypt($bytes, [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
    } else {
        $result = $rsa.Decrypt($bytes, [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
    }
    [Console]::Out.Write([Convert]::ToBase64String($result))
    $rsa.Dispose()
    $key.Dispose()
} catch { exit 1 }
'''


class TpmProtector:
    def __init__(self, root, instance):
        # TPM 密钥归属于当前 Windows 用户；同实例复制到另一目录不共享绑定。
        identity = str(root.resolve()) + '\0' + instance
        self.name = 'AzurPilot.Account.' + hashlib.sha256(identity.encode('utf-8')).hexdigest()

    def execute(self, action, data):
        if os.name != 'nt':
            raise ApiError('TPM_UNAVAILABLE', 'TPM 自动解锁目前只支持 Windows 主机')
        request = json.dumps({'action': action, 'name': self.name, 'data': base64.b64encode(data).decode('ascii')})
        try:
            result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', SCRIPT],
                                    input=request.encode('utf-8'), capture_output=True, timeout=30,
                                    creationflags=subprocess.CREATE_NO_WINDOW)
            if result.returncode != 0:
                raise ValueError()
            blob = base64.b64decode(result.stdout, validate=True)
            if len(blob) != (256 if action == 'wrap' else 32):
                raise ValueError()
            return blob
        except (OSError, subprocess.SubprocessError, ValueError):
            raise ApiError('TPM_UNAVAILABLE', 'TPM 不可用或本机绑定失效，请用实例密码解锁；不会回退到软件密钥') from None

    def wrap(self, key):
        return self.execute('wrap', key)

    def unwrap(self, blob):
        return self.execute('unwrap', blob)
