// 由 dev_tools.export_api_schema 生成，请勿手动编辑。
export interface Parameters {
  "system.ping": Record<string, never>
  "schema.get": Record<string, never>
  "instances.list": Record<string, never>
  "instances.create": { name: string; source?: string | null }
  "instances.delete": { instance: string; revision: string }
  "config.get": { instance: string }
  "config.patch": { instance: string; revision: string; changes: Array<{ path: string; value: unknown }> }
  "overview.get": { instance: string }
  "scheduler.start": { instance: string }
  "scheduler.stop": { instance: string }
  "tasks.run": { instance: string; task: string }
  "logs.get": { instance: string; after?: number }
  "preview.capture": { instance: string }
  "statistics.resources": { instance: string; days?: number; resource?: "Oil" | "Coin" | "Gem" | "Cube" | "Pt" | "ActionPoint" }
  "settings.get": Record<string, never>
  "settings.patch": { values: Record<string, unknown> }
  "startup.get": { instance: string }
  "startup.set": { instance: string; enabled: boolean }
  "auth.login": { password?: string }
  "events.subscribe": { instance?: string | null; topics: Array<"instances" | "overview" | "logs" | "preview"> }
}
