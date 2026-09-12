import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Save, Settings2, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { Settings as SettingsData, Value } from '../api/types'
import { useApp, useConnection } from '../app/context'
import { CreateInstance } from '../app/App'
import { ErrorBox, Loading, Modal, PageTitle } from '../components/ui'
import { FieldInput } from '../components/FieldInput'

export function Settings() {
  const {instance = ''} = useParams()
  const {notify, refresh, instances} = useApp()
  const [data, setData] = useState<SettingsData>()
  const [draft, setDraft] = useState<Record<string, Value>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [startup, setStartup] = useState(false)
  const connection = useConnection()
  useEffect(() => {
    if (connection !== 'ready') return
    let active = true
    void Promise.all([api.request('settings.get', {}), api.request('startup.get', {instance})]).then(([data, start]) => {if (active) {setData(data); setStartup(start.enabled)}}).catch(error => {if (active) setError(error.message)})
    return () => {active = false}
  }, [connection, instance])
  async function save() {
    setBusy(true); setError('')
    try {await api.request('settings.patch', {values: draft}); setData(await api.request('settings.get', {})); setDraft({}); notify('部署设置已保存，重启服务后生效')}
    catch (error) {setError((error as Error).message)} finally {setBusy(false)}
  }
  async function remove() {
    setBusy(true)
    try {const config = await api.request('config.get', {instance}); await api.request('instances.delete', {instance, revision: config.revision}); await refresh(); notify('实例已移入配置备份目录'); setDeleting(false)}
    catch (error) {setError((error as Error).message)} finally {setBusy(false)}
  }
  async function setAutoRun() {
    setBusy(true)
    try {await api.request('startup.set', {instance, enabled: !startup}); setStartup(!startup)} catch (error) {setError((error as Error).message)} finally {setBusy(false)}
  }
  return <><PageTitle eyebrow="WORKSPACE SETTINGS" title="系统设置" description="管理实例、服务连接与运行环境。" actions={<button className="button primary" onClick={save} disabled={!Object.keys(draft).length || busy || connection !== 'ready'}><Save size={16}/>保存设置</button>}/>
    {error && <ErrorBox message={error}/>}
    <section className="panel instance-settings"><div className="panel-heading"><div><Settings2 size={18}/><h2>实例管理</h2></div><button className="text-button" onClick={() => setCreating(true)} disabled={connection !== 'ready'}><Plus size={16}/>新建实例</button></div><div className="field-row"><div className="field-label"><label>启动服务时自动运行 {instance}</label><p>服务启动后自动接续此实例的任务调度。</p></div><FieldInput id="startup" value={startup} onChange={setAutoRun} label="启动时自动运行" disabled={busy || connection !== 'ready'}/></div><div className="field-row"><div className="field-label"><label>删除当前实例</label><p>配置将移入备份目录；必须先停止运行中的实例。</p></div><button className="button danger subtle" disabled={busy || connection !== 'ready' || instances.find(item => item.name === instance)?.status === 'running'} onClick={() => setDeleting(true)}><Trash2 size={15}/>删除实例</button></div></section>
    <p className="settings-notice">以下为服务端部署设置，保存后需要重启服务生效。主题可通过左下角按钮即时切换。</p>
    {!data ? <Loading/> : data.groups.map(group => <section className="panel config-group" key={group.key}><div className="panel-heading"><h2>{group.label}</h2><span className="small-label">{group.key}</span></div>{group.fields.filter(field => !['CDN', 'DpiScaling', 'Theme'].includes(field.key)).map(field => <div className="field-row" key={field.key}><div className="field-label"><label htmlFor={`deploy-${field.key}`}>{field.label}</label><p>{field.key === 'Password' ? '留空保留原密码。新密码在重启服务后生效。' : field.help.replace(/<[^>]*>/g, '')}</p></div><div className="field-control"><FieldInput id={`deploy-${field.key}`} label={field.label} type={field.type} options={field.options} value={field.key in draft ? draft[field.key] : field.value} disabled={busy || connection !== 'ready'} onChange={value => setDraft(previous => ({...previous, [field.key]: value}))}/></div></div>)}</section>)}
    {deleting && <Modal title={`删除实例 ${instance}`} onClose={() => setDeleting(false)}><p>实例将从列表移除，原配置保留在 config/backup 中。</p><button className="button danger" disabled={busy} onClick={remove}>确认删除</button></Modal>}
    {creating && <CreateInstance onClose={() => setCreating(false)}/>}
  </>
}
