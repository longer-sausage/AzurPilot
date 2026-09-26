import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api/client'
import type { Parameters } from '../api/generated'
import type { AccountStatus } from '../api/types'
import { useApp, useConnection } from '../app/context'
import { FieldInput } from './FieldInput'
import { accountText } from './accountText'

export function AccountPanel({instance}: {instance: string}) {
  const {language, notify} = useApp()
  const text = accountText[language]
  const connection = useConnection()
  const [status, setStatus] = useState<AccountStatus>()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [label, setLabel] = useState('')
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const epoch = useRef(0)
  const hide = () => {
    setStatus(value => value ? {...value, profiles: undefined, selected: undefined} : value)
    setPassword(''); setConfirm(''); setNewPassword(''); setLabel('')
  }
  useEffect(() => {
    const current = ++epoch.current
    setStatus(undefined); setPassword(''); setConfirm(''); setNewPassword(''); setLabel(''); setError(''); setBusy(false); setChanging(false)
    if (connection === 'ready') void api.request('accounts.status', {instance}).then(value => {
      if (epoch.current === current) setStatus(value)
    }).catch(error => { if (epoch.current === current) setError((error as Error).message) })
    return () => { epoch.current++ }
  }, [instance, connection])
  useEffect(() => {
    const hideOnLeave = () => { if (document.hidden) hide() }
    document.addEventListener('visibilitychange', hideOnLeave)
    const timer = status?.profiles ? window.setTimeout(hide, 60_000) : undefined
    return () => { document.removeEventListener('visibilitychange', hideOnLeave); window.clearTimeout(timer) }
  }, [status?.profiles])
  const run = async (action: Parameters['accounts.manage']['action'], extra: Partial<Parameters['accounts.manage']> = {}) => {
    if ((action === 'create' && password !== confirm) || (action === 'password' && newPassword !== confirm)) {
      setError(text.mismatch); return
    }
    const current = epoch.current
    setBusy(true); setError('')
    const params = {instance, action, password, new_password: action === 'password' ? newPassword : '', ...extra}
    hide()
    try {
      const result = await api.request('accounts.manage', params)
      if (epoch.current === current) { setStatus(result); setChanging(false); if (action !== 'list') notify(text.done) }
    } catch (error) {
      if (epoch.current === current) {
        setError((error as Error).message)
        if (error instanceof ApiError && error.code === 'VAULT_DESTROYED') {
          const result = await api.request('accounts.status', {instance}).catch(() => undefined)
          if (result && epoch.current === current) setStatus(result)
        }
      }
    }
    finally { if (epoch.current === current) setBusy(false) }
  }
  const disabled = busy || connection !== 'ready' || !status
  return <section className="panel config-group" aria-label={text.title} data-testid="account-panel">
    <div className="panel-heading"><div><span className="group-indicator"/><h2>{text.title}</h2></div></div>
    <div className="field-row"><div className="field-label"><p>{text.help}</p><p>{text.security}</p></div></div>
    {error && <p className="field-row" role="alert">{error}</p>}
    {status?.destroyed && <p className="field-row" role="alert">{text.destroyed}</p>}
    {status && <>
      {status.initialized && <div className="field-row"><span>{status.unlocked ? text.unlocked : text.locked} · {status.tpm_bound ? text.bound : text.unbound}</span></div>}
      <div className="field-row"><label className="field-label" htmlFor="account-password"><span className="field-name">{text.password}</span></label>
        <div className="field-control"><input id="account-password" type="password" autoComplete="new-password" maxLength={256} value={password} onChange={e => setPassword(e.target.value)} disabled={disabled}/></div></div>
      {(!status.initialized || changing) && <>
        {changing && <div className="field-row"><label className="field-label" htmlFor="account-new-password">{text.newPassword}</label><div className="field-control"><input id="account-new-password" type="password" autoComplete="new-password" maxLength={256} value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={disabled}/></div></div>}
        <div className="field-row"><label className="field-label" htmlFor="account-confirm">{text.confirm}</label><div className="field-control"><input id="account-confirm" type="password" autoComplete="new-password" maxLength={256} value={confirm} onChange={e => setConfirm(e.target.value)} disabled={disabled}/></div></div>
      </>}
      {!status.initialized ? <div className="field-row"><button className="button primary" disabled={disabled || !password || !confirm} onClick={() => void run('create')}>{text.create}</button></div> : <>
        <div className="field-row"><div className="field-label"><span className="field-name">{text.enable}</span><p>{text.enabledHelp}</p></div><div className="field-control"><FieldInput id="account-enabled" label={text.enable} value={status.enabled} disabled={disabled || !password} onChange={value => void run('enable', {enabled: !!value})}/></div></div>
        <div className="field-row"><div className="field-label"><p>{text.tpmHelp}</p></div><div className="field-control"><button className="button" disabled={disabled || !password} onClick={() => void run(status.tpm_bound ? 'unbind_tpm' : 'bind_tpm')}>{status.tpm_bound ? text.unbind : text.tpm}</button></div></div>
        <div className="field-row"><label className="field-label" htmlFor="account-label">{text.label}</label><div className="field-control"><input id="account-label" autoComplete="off" value={label} maxLength={64} onChange={e => setLabel(e.target.value)} disabled={disabled}/></div></div>
        <div className="field-row" style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
          <button className="button" disabled={disabled || !password} onClick={() => void run('capture', {label})}>{text.capture}</button>
          <button className="button" disabled={disabled || !password} onClick={() => void run('list')}>{text.list}</button>
          <button className="button" disabled={disabled || !password} onClick={() => void run('unlock')}>{text.unlock}</button>
          <button className="button" disabled={disabled} onClick={() => void run('lock')}>{text.lock}</button>
          <button className="button" disabled={disabled} onClick={() => { setChanging(!changing); setConfirm(''); setNewPassword('') }}>{text.change}</button>
          {changing && <button className="button primary" disabled={disabled || !password || !newPassword || !confirm} onClick={() => void run('password')}>{text.save}</button>}
        </div>
        <div className="field-row"><p>{text.hidden}</p></div>
        {status.profiles && <>
          {!status.profiles.length && <div className="field-row"><p>{text.empty}</p></div>}
          {status.profiles.map(profile => <div className="field-row" key={profile.id}>
            <div className="field-label"><span className="field-name">{profile.label}{status.selected === profile.id && ` · ${text.selected}`}</span>{profile.users.map(user => <p key={user.uid}>{user.name} · UID {user.uid}</p>)}</div>
            <div className="field-control" style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
              <button className="button primary" disabled={disabled || !password} onClick={() => void run('select', {profile: profile.id})}>{text.switch}</button>
              <button className="button" disabled={disabled || !password} onClick={() => void run('delete', {profile: profile.id})}>{text.delete}</button>
            </div>
          </div>)}
          <div className="field-row"><button className="button" onClick={hide}>{text.hide}</button></div>
        </>}
      </>}
    </>}
  </section>
}
