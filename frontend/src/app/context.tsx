import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { api } from '../api/client'
import type { Instance, Schema } from '../api/types'

interface AppContext {
  instances: Instance[]; schema?: Schema; refresh: () => Promise<void>; t: (key: string) => string
  notify: (message: string, error?: boolean) => void
  previewEnabled: boolean; setPreviewEnabled: (enabled: boolean) => void
}
const Context = createContext<AppContext | null>(null)
export const useConnection = () => useSyncExternalStore(api.subscribe, api.getSnapshot)
export const useApp = () => useContext(Context)!

export function AppProvider({children}: {children: ReactNode}) {
  const connection = useConnection()
  const [instances, setInstances] = useState<Instance[]>([])
  const [schema, setSchema] = useState<Schema>()
  const [previewEnabled, setPreviewEnabled] = useState(false)
  const [toast, setToast] = useState<{message: string; error: boolean}>()
  useEffect(() => { api.connect(); return () => api.disconnect() }, [])
  const notify = useCallback((message: string, error = false) => setToast({message, error}), [])
  const refresh = useCallback(async () => setInstances(await api.request('instances.list', {})), [])
  useEffect(() => {
    if (connection !== 'ready') return
    let active = true
    void Promise.all([api.request('schema.get', {}), api.request('instances.list', {})]).then(([schema, instances]) => {
      if (active) { setSchema(schema); setInstances(instances) }
    }).catch(error => notify(error.message, true))
    return () => { active = false }
  }, [connection, notify])
  useEffect(() => api.onEvent(event => {
    if (event.topic === 'instances') setInstances(event.data as Instance[])
  }), [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), 6000)
    return () => clearTimeout(timer)
  }, [toast])
  const t = useCallback((key: string) => {
    let value: unknown = schema?.translations
    for (const part of key.split('.')) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
    return typeof value === 'string' && value !== key ? value : key.split('.').filter(item => item !== 'name' && item !== '_info').at(-1) ?? key
  }, [schema])
  return <Context.Provider value={{instances, schema, refresh, t, notify, previewEnabled, setPreviewEnabled}}>
    {children}
    {toast && <div role={toast.error ? 'alert' : 'status'} className={`toast ${toast.error ? 'error' : ''}`} onClick={() => setToast(undefined)}>{toast.message}</div>}
  </Context.Provider>
}
