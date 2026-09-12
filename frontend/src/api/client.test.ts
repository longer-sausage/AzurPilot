import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'

class FakeSocket {
  static OPEN = 1
  static latest: FakeSocket
  readyState = 1
  onmessage?: (event: {data: string}) => void
  onclose?: () => void
  sent: Record<string, unknown>[] = []
  constructor() {FakeSocket.latest = this}
  send(message: string) {this.sent.push(JSON.parse(message))}
  close() {this.readyState = 3; this.onclose?.()}
  emit(message: unknown) {this.onmessage?.({data: JSON.stringify(message)})}
}

describe('WebSocket 客户端', () => {
  let client: ApiClient
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {location: {href: 'http://localhost:5173/', protocol: 'http:'}})
    vi.stubGlobal('WebSocket', FakeSocket)
    client = new ApiClient(); client.connect()
    FakeSocket.latest.emit({v: 1, type: 'event', topic: 'session', seq: 1, data: {authRequired: false}})
  })
  afterEach(() => {client.disconnect(); vi.useRealTimers(); vi.unstubAllGlobals()})
  it('乱序响应按请求 ID 关联', async () => {
    const first = client.request('system.ping', {})
    const second = client.request('instances.list', {})
    const socket = FakeSocket.latest
    socket.emit({v: 1, type: 'response', id: socket.sent[1].id, ok: true, result: []})
    socket.emit({v: 1, type: 'response', id: socket.sent[0].id, ok: true, result: {pong: true}})
    expect(await first).toEqual({pong: true}); expect(await second).toEqual([])
  })
  it('断线拒绝未完成请求，不自动重复写操作', async () => {
    const request = client.request('instances.create', {name: 'pilot'})
    const rejection = expect(request).rejects.toMatchObject({code: 'DISCONNECTED'})
    FakeSocket.latest.close(); await rejection
    await vi.advanceTimersByTimeAsync(2000)
    expect(FakeSocket.latest.sent).toEqual([])
  })
  it('请求超时后清理等待项', async () => {
    const request = client.request('system.ping', {})
    const rejection = expect(request).rejects.toMatchObject({code: 'TIMEOUT'})
    await vi.advanceTimersByTimeAsync(45000); await rejection
  })
  it('认证完成前不发送业务请求', async () => {
    client.disconnect(); client = new ApiClient(); client.connect()
    FakeSocket.latest.emit({v: 1, type: 'event', topic: 'session', seq: 1, data: {authRequired: true}})
    await expect(client.request('instances.list', {})).rejects.toMatchObject({code: 'DISCONNECTED'})
    expect(FakeSocket.latest.sent).toHaveLength(0)
  })
})
