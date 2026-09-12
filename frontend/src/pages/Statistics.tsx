import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChartNoAxesCombined, Download } from 'lucide-react'
import { api } from '../api/client'
import type { Statistics as StatisticsData } from '../api/types'
import type { Parameters } from '../api/generated'
import { useConnection } from '../app/context'
import { Empty, ErrorBox, Loading, PageTitle } from '../components/ui'

export function Statistics() {
  const {instance = ''} = useParams()
  const [resource, setResource] = useState<Parameters['statistics.resources']['resource']>('Oil')
  const [days, setDays] = useState(7)
  const [data, setData] = useState<StatisticsData>()
  const [error, setError] = useState('')
  const connection = useConnection()
  useEffect(() => {
    if (connection !== 'ready') return
    let active = true
    setData(undefined); setError('')
    void api.request('statistics.resources', {instance, resource, days}).then(value => {if (active) setData(value)}).catch(error => {if (active) setError(error.message)})
    return () => {active = false}
  }, [instance, resource, days, connection])
  const points = data?.points ?? []
  const max = Math.max(1, ...points.map(point => point.value))
  const min = Math.min(0, ...points.map(point => point.value))
  const firstTime = points.length ? new Date(points[0].time.replace(' ', 'T')).getTime() : 0
  const lastTime = points.length ? new Date(points.at(-1)!.time.replace(' ', 'T')).getTime() : 1
  const coordinates = points.map(point => `${60 + (new Date(point.time.replace(' ', 'T')).getTime() - firstTime) / Math.max(1, lastTime - firstTime) * 900},${270 - (point.value - min) / (max - min) * 230}`).join(' ')
  function download() {
    const content = '\uFEFF时间,资源,数量\n' + points.map(point => `${point.time},${resource},${point.value}`).join('\n')
    const url = URL.createObjectURL(new Blob([content], {type: 'text/csv;charset=utf-8'}))
    const link = document.createElement('a'); link.href = url; link.download = `${instance}-${resource}.csv`; link.click(); URL.revokeObjectURL(url)
  }
  return <><PageTitle eyebrow="RESOURCE INSIGHTS" title="资源统计" description="回顾资源变化，让下一次任务安排更有依据。" actions={<button className="button secondary" onClick={download} disabled={!points.length}><Download size={16}/>导出记录</button>}/>
    <section className="panel chart-panel"><div className="panel-heading"><div><ChartNoAxesCombined size={19}/><h2>资源变化</h2></div><div><select aria-label="统计资源" value={resource} onChange={event => setResource(event.target.value as typeof resource)}>{Object.entries({Oil: '石油', Coin: '物资', Gem: '钻石', Cube: '心智魔方', Pt: '活动 PT', ActionPoint: '行动力'}).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="统计天数" value={days} onChange={event => setDays(Number(event.target.value))}><option value={1}>最近 24 小时</option><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value={90}>最近 90 天</option></select></div></div>
      {error ? <ErrorBox message={error}/> : !data ? <Loading/> : !points.length ? <Empty icon={<ChartNoAxesCombined size={44} strokeWidth={1.2}/>} title="这段时间还没有资源记录">运行游戏任务后，资源快照会自动出现在这里。</Empty> : <><div className="chart-metrics"><div><span>最新记录</span><strong>{points.at(-1)?.value.toLocaleString()}</strong></div><div><span>区间变化</span><strong>{(points.at(-1)!.value - points[0].value).toLocaleString()}</strong></div><div><span>采样点数</span><strong>{points.length}</strong></div></div><svg className="resource-chart" viewBox="0 0 1000 320" role="img" aria-label={`${resource}资源变化图，${points.length}个采样点`}>
        <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#169b88" stopOpacity=".18"/><stop offset="100%" stopColor="#169b88" stopOpacity="0"/></linearGradient></defs>
        {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="60" x2="960" y1={40 + tick * 57.5} y2={40 + tick * 57.5} stroke="var(--border)" strokeDasharray="4 5"/><text x="45" y={45 + tick * 57.5} textAnchor="end">{Math.round(max - tick * (max - min) / 4).toLocaleString()}</text></g>)}
        {points.length > 1 ? <><polygon points={`60,270 ${coordinates} 960,270`} fill="url(#chart-fill)"/><polyline points={coordinates} fill="none" stroke="#169b88" strokeWidth="2.5"/></> : <circle cx="60" cy={270 - (points[0].value - min) / (max - min) * 230} r="4" fill="#169b88"/>}
        <text x="60" y="302">{points[0].time.slice(5, 16)}</text><text x="960" y="302" textAnchor="end">{points.at(-1)?.time.slice(5, 16)}</text></svg><details className="data-table"><summary>查看原始记录</summary><table><thead><tr><th>记录时间</th><th>资源数量</th></tr></thead><tbody>{points.slice(-100).reverse().map((point, index) => <tr key={index}><td>{point.time}</td><td>{point.value.toLocaleString()}</td></tr>)}</tbody></table><p>显示最近 100 条，完整结果可通过上方按钮导出。</p></details>{data.truncated && <p className="panel-note">记录超过 5,000 条，本次仅显示最近 5,000 条。</p>}</>}
    </section></>
}
