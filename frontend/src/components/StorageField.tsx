import { Trash2 } from 'lucide-react'
import type { Value } from '../api/types'

export function StorageField({value, disabled, onClear}: {value: Value; disabled: boolean; onClear: () => void}) {
  return <div className="storage-field"><pre aria-label="存储空间内容">{JSON.stringify(value, null, 2)}</pre><button type="button" className="button danger subtle" disabled={disabled} onClick={onClear}><Trash2 size={15}/>清除存储空间</button></div>
}
