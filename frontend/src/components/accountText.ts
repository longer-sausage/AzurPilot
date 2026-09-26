import type { Language } from '../i18n'

const zh = {
  title: '账号管理', help: '仅支持国服 B 站客户端及已取得 root 权限的模拟器。默认不读取或写入游戏账号。备份与切换会停止游戏，请先停止使用同一模拟器的全部实例。',
  security: '实例密码独立于 WebUI 密码，至少 16 位，建议使用随机密码或长口令。密码不保存到项目文件；遗忘密码且本机 TPM 绑定失效时无法恢复。',
  password: '实例密码', confirm: '确认密码', create: '设置实例密码', unlock: '解锁启动', lock: '清除内存解锁', list: '验证密码并查看账号',
  capture: '备份当前游戏账号', label: '快照名称', enable: '每次启动游戏前恢复选定账号', enabledHelp: '启用后不会自动采集账号。未绑定 TPM 时，服务重启后必须重新输入实例密码解锁。',
  tpm: '绑定本机 TPM 自动解锁', unbind: '取消 TPM 自动解锁', tpmHelp: 'TPM 绑定运行 WebUI 的 Windows 主机及用户。拷走项目文件无法使用此绑定；已控制原主机的程序仍可能调用解密。',
  bound: '已绑定 TPM', unbound: '未绑定 TPM', unlocked: '内存已解锁', locked: '内存未解锁', change: '修改实例密码', newPassword: '新实例密码', save: '保存新密码',
  switch: '切换并启动游戏', selected: '已选定', delete: '删除快照', empty: '尚无账号快照。请先在游戏中登录，再备份。', hidden: '账号信息已隐藏，查看前需要重新验证密码；显示 60 秒后自动隐藏。', hide: '隐藏账号信息', mismatch: '两次输入的密码不一致', done: '账号操作已完成',
}
type Text = typeof zh
const en: Text = {
  title: 'Account management', help: 'Supports the CN Bilibili client on rooted emulators. Game account files are untouched by default. Backup and switching stop the game; stop all instances using this emulator first.',
  security: 'Use a separate instance password of at least 16 characters, preferably a random password or long passphrase. Passwords are never saved in project files. Losing the password and TPM binding makes recovery impossible.',
  password: 'Instance password', confirm: 'Confirm password', create: 'Set instance password', unlock: 'Unlock for startup', lock: 'Clear memory unlock', list: 'Verify password and show accounts',
  capture: 'Back up current game account', label: 'Snapshot name', enable: 'Restore selected account before every game launch', enabledHelp: 'This does not collect accounts automatically. Without TPM binding, enter the password again after the service restarts.',
  tpm: 'Bind to this PC’s TPM for automatic unlock', unbind: 'Remove TPM automatic unlock', tpmHelp: 'Binding uses the Windows host and user running WebUI. Copied project files cannot use it. Programs controlling the original host may still decrypt.',
  bound: 'TPM bound', unbound: 'TPM not bound', unlocked: 'Unlocked in memory', locked: 'Memory locked', change: 'Change instance password', newPassword: 'New instance password', save: 'Save new password',
  switch: 'Switch and launch game', selected: 'Selected', delete: 'Delete snapshot', empty: 'No snapshots yet. Log in through the game, then make a backup.', hidden: 'Account information is hidden. Verify the password to show it for 60 seconds.', hide: 'Hide account information', mismatch: 'The passwords do not match', done: 'Account operation completed',
}
const tw: Text = {
  title: '帳號管理', help: '僅支援國服 B 站客戶端及已取得 root 權限的模擬器。預設不讀寫遊戲帳號。備份與切換會停止遊戲，請先停止使用同一模擬器的全部實例。',
  security: '實例密碼與 WebUI 密碼獨立，至少 16 位，建議使用隨機密碼或長口令。密碼不儲存在專案檔案；遺忘密碼且本機 TPM 綁定失效時無法復原。',
  password: '實例密碼', confirm: '確認密碼', create: '設定實例密碼', unlock: '解鎖啟動', lock: '清除記憶體解鎖', list: '驗證密碼並查看帳號', capture: '備份目前遊戲帳號', label: '快照名稱',
  enable: '每次啟動遊戲前還原選定帳號', enabledHelp: '啟用後不會自動擷取帳號。未綁定 TPM 時，服務重啟後須重新輸入實例密碼解鎖。',
  tpm: '綁定本機 TPM 自動解鎖', unbind: '取消 TPM 自動解鎖', tpmHelp: 'TPM 綁定執行 WebUI 的 Windows 主機與使用者。複製專案檔案無法使用此綁定；控制原主機的程式仍可能呼叫解密。',
  bound: '已綁定 TPM', unbound: '未綁定 TPM', unlocked: '記憶體已解鎖', locked: '記憶體未解鎖', change: '修改實例密碼', newPassword: '新實例密碼', save: '儲存新密碼',
  switch: '切換並啟動遊戲', selected: '已選定', delete: '刪除快照', empty: '尚無帳號快照。請先在遊戲中登入，再備份。', hidden: '帳號資訊已隱藏，查看前須重新驗證密碼；顯示 60 秒後自動隱藏。', hide: '隱藏帳號資訊', mismatch: '兩次輸入的密碼不一致', done: '帳號操作已完成',
}
const ja: Text = {
  title: 'アカウント管理', help: 'root 権限のあるエミュレーターの中国版 Bilibili クライアントに対応します。初期状態ではゲームのアカウントを読み書きしません。バックアップと切替はゲームを停止するため、同じ端末の全インスタンスを先に停止してください。',
  security: 'WebUI と異なる 16 文字以上の専用パスワードを使用してください。ランダムなパスワードか長いパスフレーズを推奨します。プロジェクトにパスワードは保存しません。パスワードと TPM 保護を失うと復元できません。',
  password: 'インスタンスのパスワード', confirm: 'パスワードの確認', create: '専用パスワードを設定', unlock: '起動用に解除', lock: 'メモリの解除状態を消去', list: 'パスワードを検証して表示', capture: '現在のアカウントを保存', label: 'スナップショット名',
  enable: 'ゲーム起動前に選択したアカウントを復元', enabledHelp: '自動的なアカウント収集は行いません。TPM 未登録の場合、サービス再起動後にパスワードを再入力してください。',
  tpm: 'この PC の TPM で自動解除', unbind: 'TPM 自動解除を解除', tpmHelp: 'WebUI を実行する Windows ホストとユーザーに紐づきます。コピーしたファイルでは利用できません。元のホストを制御するプログラムは復号できる場合があります。',
  bound: 'TPM 登録済み', unbound: 'TPM 未登録', unlocked: 'メモリ内で解除済み', locked: 'メモリ内ではロック中', change: '専用パスワードを変更', newPassword: '新しい専用パスワード', save: '新しいパスワードを保存',
  switch: '切替してゲームを起動', selected: '選択済み', delete: 'スナップショットを削除', empty: '保存したアカウントはありません。ゲームにログインしてから保存してください。', hidden: '情報は非表示です。パスワードを検証すると 60 秒間表示されます。', hide: 'アカウント情報を隠す', mismatch: 'パスワードが一致しません', done: 'アカウント操作が完了しました',
}
export const accountText: Record<Language, Text> = {'zh-CN': zh, 'en-US': en, 'zh-TW': tw, 'ja-JP': ja, 'zh-MIAO': {...zh, title: '账号管理喵', done: '账号操作完成了喵'}}
