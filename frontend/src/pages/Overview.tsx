import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpRight, Box, CalendarClock, ChevronRight, Clock3, Coins, Compass, Droplets, Gem, Play, Radio, Settings2, ShieldCheck, Square, Waves } from 'lucide-react'
import { api } from '../api/client'
import type { Overview as OverviewData, Preview } from '../api/types'
import { useApp, useConnection } from '../app/context'
import { Empty, ErrorBox, Loading, PageTitle, StatusBadge } from '../components/ui'
import { LogPanel } from './Logs'

const resourceLabels: Record<string, string> = {Oil: '石油储备', Coin: '物资储备', Gem: '钻石', Cube: '心智魔方', Pt: '活动 PT', ActionPoint: '行动力'}
const resourceIcons = {Oil: Droplets, Coin: Coins, Gem, Cube: Box}

export function Overview() {
  const {instance = ''} = useParams()
  const [data, setData] = useState<OverviewData>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const connection = useConnection()
  const {notify} = useApp()
  useEffect(() => {
    if (connection !== 'ready') return
    let active = true
    void api.request('overview.get', {instance}).then(value => { if (active) {setData(value); setError('')} }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [instance, connection])
  useEffect(() => api.onEvent(event => { if (event.topic === 'overview' && (event.data as OverviewData).instance === instance) setData(event.data as OverviewData) }), [instance])
  async function toggle() {
    if (!data) return
    setBusy(true)
    try { setData(await api.request(data.status === 'running' ? 'scheduler.stop' : 'scheduler.start', {instance})); notify(data.status === 'running' ? '调度器已停止' : '调度器已启动') }
    catch (error) { notify((error as Error).message, true) } finally { setBusy(false) }
  }
  if (error) return <ErrorBox message={error}/>
  if (!data) return <Loading/>
  const pending = data.tasks.filter(task => task.pending).length
  return <>
    <PageTitle eyebrow="FLEET COMMAND CENTER" title="运行总览" description="你的舰队，一切尽在掌握。" actions={<><Link className="button secondary" to={`/i/${instance}/task/Alas`}><Settings2 size={16}/>连接设置</Link><button className={`button ${data.status === 'running' ? 'danger' : 'primary'}`} onClick={toggle} disabled={busy || connection !== 'ready'}>{data.status === 'running' ? <Square size={15}/> : <Play size={15}/>} {busy ? '正在处理…' : data.status === 'running' ? '停止运行' : '启动调度器'}</button></>}/>
    <section className="command-banner"><div className="command-icon"><Compass size={32} strokeWidth={1.4}/></div><div><div className="banner-title">{data.status === 'running' ? '航线已规划，自动化正在进行' : data.status === 'error' ? '航行需要你的关注' : '一切就绪，等待你的出航指令'}<StatusBadge status={data.status}/></div><p>当前实例 <strong>{instance}</strong><span>·</span>{data.emulator.Serial === 'auto' ? '自动识别模拟器' : String(data.emulator.Serial ?? '尚未设置模拟器')}<span>·</span>{data.tasks.length} 项任务已启用</p></div><div className="banner-decoration"><Waves size={110} strokeWidth={0.7}/></div></section>
    <div className="resource-grid">{(['Oil', 'Coin', 'Gem', 'Cube'] as const).map((key, index) => {
      const resource = data.resources.find(item => item.name === key)
      const Icon = resourceIcons[key]
      const recorded = resource?.record && !resource.record.startsWith('2020-01-01')
      return <section key={key} className={`resource-card resource-${index}`}><div className="resource-heading"><span>{resourceLabels[key]}</span><div><Icon size={18}/></div></div><div className="resource-value">{recorded && resource?.value !== null ? Number(resource?.value).toLocaleString() : '—'}{recorded && !!resource?.limit && <small>/ {resource.limit.toLocaleString()}</small>}</div><div className="resource-foot"><span className="tiny-dot"/>{recorded ? `记录于 ${resource.record?.slice(11, 16)}` : '等待游戏内资源同步'}<ArrowUpRight size={13}/></div></section>
    })}</div>
    <div className="overview-grid"><section className="panel schedule-panel"><div className="panel-heading"><div><CalendarClock size={18}/><h2>任务计划</h2><span className="count-badge">{data.tasks.length}</span></div><span className="small-label">自动同步</span></div><div className="schedule-summary"><div><span className="tiny-dot teal"/>待执行 <strong>{pending}</strong></div><div><Clock3 size={13}/>等待中 <strong>{data.tasks.length - pending}</strong></div><span>下次运行时间</span></div><div className="task-table">{data.tasks.length ? data.tasks.slice(0, 8).map((task, index) => <Link className="task-row" key={task.name} to={`/i/${instance}/task/${task.name}`}><span className="task-order">{String(index + 1).padStart(2, '0')}</span><div className="task-row-name"><strong>{task.label}</strong><small>{task.name}</small></div><span className={`task-state ${task.pending ? 'pending' : ''}`}>{task.pending ? '待执行' : '等待中'}</span><time>{task.pending ? '等待调度' : task.nextRun.slice(5, 16)}</time><ChevronRight size={14}/></Link>) : <Empty icon={<CalendarClock size={30}/>} title="还没有启用的任务">从左侧任务配置中启用日常任务。</Empty>}</div>{data.tasks.length > 8 && <div className="panel-note">另有 {data.tasks.length - 8} 项任务已安排，可在左侧查看配置。</div>}</section>
      <PreviewPanel instance={instance}/>
    </div>
    <LogPanel compact/>
    <div className="quiet-note"><ShieldCheck size={14}/>任务独立运行，关闭浏览器不会中断调度。<span><Radio size={12}/> 实时状态同步</span></div>
  </>
}

function PreviewPanel({instance}: {instance: string}) {
  const {setPreviewEnabled} = useApp()
  const [preview, setPreview] = useState<Preview>()
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const connection = useConnection()
  async function capture() {
    setBusy(true); setError('')
    try {setPreview(await api.request('preview.capture', {instance}))} catch (error) {setError((error as Error).message)} finally {setBusy(false)}
  }
  useEffect(() => {
    // 订阅统一由应用壳层发送，避免重连时不同组件互相覆盖主题集合。
    setPreviewEnabled(enabled)
    return () => setPreviewEnabled(false)
  }, [enabled, setPreviewEnabled])
  useEffect(() => api.onEvent(event => {
    if (event.topic === 'preview' && (event.data as Preview).instance === instance) {setPreview(event.data as Preview); setError('')}
    if (event.topic === 'subscription.error') { const data = event.data as {instance: string; topic: string; message: string}; if (data.instance === instance && data.topic === 'preview') setError(data.message) }
  }), [instance])
  return <section className="panel preview-panel"><div className="panel-heading"><div><Radio size={18}/><h2>模拟器预览</h2></div><label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={connection !== 'ready'}/>自动刷新</label></div>
    <div className="preview-screen">{preview ? <img src={preview.image} alt="模拟器当前画面"/> : <><div className="radar"><div/><div/><Compass size={48} strokeWidth={1}/></div><strong>等待与你的舰队连接</strong><span>连接模拟器后，画面将在这里显示</span><span className="preview-resolution">1280 × 720 · LANDSCAPE</span></>}</div>
    {error && <div className="preview-error" role="alert">{error}</div>}
    <div className="preview-toolbar"><span><span className={`tiny-dot ${preview ? 'teal' : ''}`}/>{preview ? `截图于 ${preview.capturedAt.slice(11, 19)}` : '尚未获取画面'}</span><button className="text-button" onClick={capture} disabled={busy || connection !== 'ready'}><ArrowDownToLine size={14}/>{busy ? '获取中…' : '获取截图'}</button></div>
  </section>
}
