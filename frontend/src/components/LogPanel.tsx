import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Pause, Play, Search, Terminal, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { Logs as LogsData, LogEntry } from '../api/types'
import { useApp, useConnection } from '../app/context'
import { Empty } from '../components/ui'

export function LogPanel({active = true}: {active?: boolean}) {
  const {instance = ''} = useParams()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('ALL')
  const [follow, setFollow] = useState(true)
  const [floor, setFloor] = useState(0)
  const connection = useConnection()
  const {notify} = useApp()
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (connection !== 'ready') return
    let active = true
    setFloor(0); setEntries([])
    void api.request('logs.get', {instance}).then(value => {if (active) setEntries(previous => {
      const entries = new Map(value.entries.map(entry => [entry.id, entry]))
      previous.forEach(entry => entries.set(entry.id, entry))
      return [...entries.values()].sort((a, b) => a.id - b.id).slice(-400)
    })}).catch(error => notify(error.message, true))
    return () => {active = false}
  }, [connection, instance, notify])
  useEffect(() => api.onEvent(event => {
    if (event.topic !== 'logs') return
    const data = event.data as LogsData
    if (data.instance !== instance) return
    setFloor(previous => data.cursor < previous ? 0 : previous)
    setEntries(previous => {
      if (data.reset) return data.entries
      const byId = new Map(previous.map(entry => [entry.id, entry]))
      data.entries.forEach(entry => byId.set(entry.id, entry))
      return [...byId.values()].sort((a, b) => a.id - b.id).slice(-400)
    })
  }), [instance])
  useEffect(() => { if (active && follow && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }, [entries, follow, active])
  const visible = entries.filter(entry => entry.id > floor && (level === 'ALL' || entry.level === level) && entry.text.toLowerCase().includes(search.toLowerCase()))
  function download() {
    const url = URL.createObjectURL(new Blob([visible.map(entry => entry.text).join('\n')], {type: 'text/plain;charset=utf-8'}))
    const link = document.createElement('a'); link.href = url; link.download = `${instance}-logs.txt`; link.click(); URL.revokeObjectURL(url)
  }
  return <section className="log-panel"><div className="panel-heading"><div><Terminal size={18}/><h2>运行日志</h2><span className="live-label"><i/>实时</span></div><div><button className="icon-button" onClick={() => setFollow(!follow)} aria-label={follow ? '暂停自动滚动' : '恢复自动滚动'}>{follow ? <Pause size={15}/> : <Play size={15}/>}</button><button className="icon-button" onClick={() => setFloor(entries.at(-1)?.id ?? 0)} aria-label="清空当前日志视图"><Trash2 size={15}/></button><button className="text-button" onClick={download}><Download size={15}/>导出</button></div></div>
    <div className="log-filters"><div className="input-icon"><Search size={15}/><input aria-label="搜索日志" placeholder="搜索日志内容…" value={search} onChange={event => setSearch(event.target.value)}/></div><select aria-label="日志级别" value={level} onChange={event => setLevel(event.target.value)}>{['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'].map(item => <option key={item} value={item}>{item === 'ALL' ? '所有级别' : item}</option>)}</select><span>最近 {entries.length} 条</span></div>
    <div className="log-content" ref={scroll} aria-label="运行日志内容">{visible.length ? visible.map(entry => <div className={`log-line ${entry.level.toLowerCase()}`} key={entry.id}><span className="log-number">{String(entry.id).padStart(3, '0')}</span><span className="log-level">{entry.level}</span><span>{entry.text}</span></div>) : <Empty icon={<Terminal size={26}/>} title={entries.length ? '没有匹配的日志' : '日志通道已就绪'}>{entries.length ? '尝试调整筛选条件。' : '启动任务后，运行日志将在这里实时显示。'}</Empty>}</div>
  </section>
}
