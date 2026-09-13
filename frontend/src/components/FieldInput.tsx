import type { Value } from '../api/types'
import { lazy, Suspense } from 'react'
import { AutoTextarea } from './AutoTextarea'

const YamlEditor = lazy(() => import('./YamlEditor').then(module => ({default: module.YamlEditor})))

interface Props {
  id: string; value: Value; onChange: (value: Value) => void; type?: string
  options?: Value[]; disabled?: boolean; label: string; mode?: string; translateOption?: (value: Value) => string
}
export function FieldInput({id, value, onChange, type, options, disabled, label, mode, translateOption}: Props) {
  if (mode === 'yaml' || type === 'yaml') return <Suspense fallback={<div role="status">正在加载编辑器…</div>}><YamlEditor id={id} value={String(value ?? '')} onChange={onChange} disabled={disabled} label={label}/></Suspense>
  if (type === 'multiselect') return <div className="multi-options" id={id} role="group" aria-label={label}>{options?.map(option => {
    const selected = Array.isArray(value) ? value : []
    const checked = selected.includes(option as never)
    return <label key={JSON.stringify(option)}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => onChange(checked ? selected.filter(item => item !== option) : [...selected, option] as Value)}/>{translateOption?.(option) ?? String(option)}</label>
  })}</div>
  if (type === 'checkbox' || type === 'bool' || typeof value === 'boolean') {
    return <button id={id} type="button" role="switch" aria-label={label} aria-checked={!!value} disabled={disabled}
      className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /></button>
  }
  if (options?.length) {
    return <select id={id} value={JSON.stringify(value)} disabled={disabled} onChange={event => onChange(JSON.parse(event.target.value))}>
      {!options.some(option => option === value) && <option value={JSON.stringify(value)}>{String(value ?? '未设置')}</option>}
      {options.map(option => <option value={JSON.stringify(option)} key={JSON.stringify(option)}>{translateOption?.(option) ?? String(option)}</option>)}
    </select>
  }
  if (type === 'textarea' || type === 'task_priority') return <AutoTextarea id={id} value={String(value ?? '')} disabled={disabled} onChange={onChange}/>
  const isNumber = typeof value === 'number' || type === 'int' || type === 'number'
  return <input id={id} disabled={disabled} type={type === 'password' ? 'password' : type === 'datetime' ? 'datetime-local' : isNumber ? 'number' : 'text'}
    step={type === 'datetime' ? 1 : 'any'} autoComplete={type === 'password' ? 'new-password' : 'off'}
    value={type === 'datetime' ? String(value ?? '').replace(' ', 'T') : value === null ? '' : String(value)}
    onChange={event => {
      const next = event.target.value
      onChange(type === 'datetime' ? next.replace('T', ' ').padEnd(19, ':00') : isNumber && next !== '' ? Number(next) : next)
    }}/>
}
