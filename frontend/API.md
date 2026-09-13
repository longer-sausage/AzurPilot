# WebSocket API v1

## 连接与认证

地址为同源 `/api/v1/ws`，HTTPS 下使用 `wss`。协议版本固定为 `v: 1`。服务只通过 HTTP 提供静态资源与 `/healthz`；业务数据与操作使用 WebSocket。独立 MCP 是另一项对外集成，仍保留自己的 SSE 协议。

服务升级连接前检查 Origin 与 Host 是否一致，拒绝跨站连接。最多同时保留 32 个连接，每连接请求上限 30 次/秒、单请求 1 MiB。反向代理必须支持 WebSocket Upgrade，并正确保留外部 Host/Origin。

建立连接后收到：

```json
{"v":1,"type":"event","topic":"session","seq":1,"data":{"authRequired":true,"protocolVersion":1}}
```

若需要认证，先调用 `auth.login`。认证前不能调用业务方法或订阅。密码来自现有 `--key` 或部署文件的 Password；通配地址监听且未设置密码时延用随机密码生成策略。认证材料放在消息体中，不放在 URL、本地存储或日志中。客户端仅在当前页面内存中保留密码用于重连，重新打开页面需要重新登录。

```json
{"v":1,"type":"request","id":"login-1","method":"auth.login","params":{"password":"访问密码"}}
```

登录失败按来源地址递增退避，最长 60 秒。未认证会话 30 秒无消息后断开，已认证会话 60 秒无消息后断开。官方客户端每 15 秒发送一次 `system.ping`。

## 信封

请求必须包含 `v`、`type`、唯一字符串 `id`、白名单 `method`；`params` 默认空对象。不允许额外参数或隐式类型转换。

```json
{"v":1,"type":"request","id":"request-42","method":"config.get","params":{"instance":"alas"}}
```

成功：

```json
{"v":1,"type":"response","id":"request-42","ok":true,"result":{"instance":"alas","revision":"SHA256","values":{}}}
```

失败：

```json
{"v":1,"type":"response","id":"request-42","ok":false,"error":{"code":"CONFLICT","message":"配置已被其他页面或运行任务修改，请重新加载后保存","details":null}}
```

同一连接最近 128 个请求 ID 不允许重复。ID 用于关联请求，**不是**跨连接的幂等键。客户端不会在断线或超时后自动重试写操作；必须先查询最终状态，防止重复启停或创建实例。默认请求超时 45 秒，超时不代表服务端事务回滚。

## 方法

精确参数结构、必填项、长度和范围约束以 [contract.json](src/api/contract.json) 为准；前端参数类型由同一份 Python 模型生成。

| 方法 | 参数 | 结果/作用 |
| --- | --- | --- |
| `auth.login` | password | 当前连接通过认证 |
| `system.ping` | 无 | pong |
| `schema.get` | 可选 language | 任务菜单、参数定义与指定语言翻译；默认 zh-CN |
| `instances.list` | 无 | 实例名称、状态、序列号、服务器 |
| `instances.create` | name、可选 source | 从模板或已有实例复制配置 |
| `instances.delete` | instance、revision | 停止状态下将配置移至备份 |
| `config.get` | instance | 当前值及 revision |
| `config.patch` | instance、revision、changes | 校验后原子保存全部修改 |
| `overview.get` | instance | 资源、任务计划、连接配置与状态 |
| `scheduler.start` | instance | 启动调度器，返回当前总览 |
| `scheduler.stop` | instance | 停止调度器并执行配置的收尾动作 |
| `tasks.run` | instance、task | 运行允许单独执行的工具 |
| `logs.get` | instance、可选 after | 游标之后的日志，有界保留 |
| `preview.capture` | instance | 一张 JPEG data URL 及采集时间 |
| `statistics.resources` | instance、days、resource | 资源时间线，最多 5,000 点 |
| `settings.get` | 无 | 部署设置定义及值，密码只写不读 |
| `settings.patch` | values | 校验并保存部署设置，重启生效 |
| `startup.get` | instance | 当前实例是否启动时自动运行 |
| `startup.set` | instance、enabled | 修改启动时自动运行 |
| `events.subscribe` | topics、可选 instance | 原子替换当前连接的订阅集合 |

`instance` 必须指向 config 目录内已存在的实例，禁止路径分隔符、符号链接和系统保留名称。创建实例名称以英文字母开头，可包含字母、数字、短横线和下划线，总长不超过 64。运行实例禁止删除，已有运行实例禁止重复启动。

状态枚举：`running`、`stopped`、`error`、`updating`。枚举表示工作进程状态，不能据此推断游戏中的具体画面。

`schema.get.language` 支持 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`zh-MIAO`，只影响本次返回的翻译，不修改运行器或其他浏览器的语言。参数定义保留 `mode: yaml`，供前端选择多行 YAML 编辑器。

## 配置事务

revision 是磁盘 JSON 内容的 SHA-256。`config.patch` 仅接受 `Task.Group.Argument` 形式的叶子路径，最多 200 项修改。完整校验成功后一次性原子替换；失败不保存任何字段。

```json
{"v":1,"type":"request","id":"save-1","method":"config.patch","params":{"instance":"alas","revision":"读取到的SHA256","changes":[{"path":"Alas.Emulator.Serial","value":"127.0.0.1:5555"},{"path":"Main.Scheduler.Enable","value":true}]}}
```

API 和核心运行器共用跨进程事务锁。运行器保存时重新读取文件，仅合并自己修改的字段，避免用旧快照覆盖前端修改。发生冲突时，前端保留草稿、展示错误，由用户重新加载后保存。直接绕开配置服务的外部脚本不受此事务锁约束。

隐藏、固定和只读字段由服务端强制拒绝修改；`storage` 的唯一例外是通过 `config.patch` 将值清空为 `{}`，用于恢复旧版清除内部任务状态的按钮，其他状态内容仍禁止写入。布尔值必须是真正的 JSON boolean；数值范围来自参数定义；日期格式为 `YYYY-MM-DD HH:mm:ss`；多选值必须来自声明的候选项。

## 订阅与恢复

```json
{"v":1,"type":"request","id":"subscribe-1","method":"events.subscribe","params":{"instance":"alas","topics":["instances","overview","logs"]}}
```

支持 `instances`、`overview`、`logs`、`preview`。除 `instances` 外必须提供 instance；空 topics 表示取消订阅。订阅会立即生效，并在下一次采样时发送初始快照。默认两秒采样，内容未变化时不发送。预览需显式开启，至少三秒一次。

```json
{"v":1,"type":"event","topic":"overview","seq":2,"data":{"instance":"alas","status":"stopped","revision":"SHA256","tasks":[],"resources":[],"emulator":{}}}
```

`seq` 只在当前连接内递增。重连后从新会话开始，客户端重新认证、读取元数据并重建订阅；服务不提供跨连接事件重放。切换实例时，旧订阅未完成的采样结果会被丢弃。

日志响应包含 `cursor`、`reset`、`entries`。每条日志有单调递增的 `id`、`level` 和纯文本 `text`。服务及页面各保留最多 400 条；客户端游标落后缓冲区或服务重启时返回 reset，客户端替换窗口。清空页面只影响当前视图，不删除服务端日志。完整运行日志仍由原有文件日志系统保存。

单连接发送队列最多 32 条，慢客户端以 1013 关闭并重新同步。网络断开不停止任务。预览/实例读取失败会发送 `subscription.error`，包含 topic、instance、code、message；其他订阅继续运行。

## 错误码

| 类别 | 错误码 |
| --- | --- |
| 协议 | INVALID_REQUEST、INVALID_PARAMS、METHOD_NOT_FOUND、DUPLICATE_REQUEST |
| 认证/权限 | UNAUTHORIZED、RATE_LIMITED、READ_ONLY |
| 配置/实例 | NOT_FOUND、ALREADY_EXISTS、CONFIG_INVALID、CONFLICT、INSTANCE_RUNNING |
| 运行/设备 | START_FAILED、STOP_FAILED、DEVICE_UNAVAILABLE |
| 服务内部 | INTERNAL_ERROR |
| 客户端本地 | DISCONNECTED、TIMEOUT |

INTERNAL_ERROR 不向浏览器返回堆栈；参数校验详情不回显输入。DEMO 模式下所有注册的写方法统一拒绝执行。

## 扩展与版本规则

1. 在 `module/api/protocol.py` 添加严格参数模型。
2. 在独立业务服务中实现操作，在 `router.py` 显式登记是否写入。
3. 执行 `uv run python -m dev_tools.export_api_schema` 更新 JSON Schema 和 TypeScript 参数类型。
4. 更新 `types.ts` 响应类型和 API 文档，并增加真实 WebSocket 回归。
5. v1 只允许兼容性新增；删除方法、更换字段语义或类型需要新版本路径。

前端构建方式参考 [React 官方说明](https://react.dev/learn/build-a-react-app-from-scratch)，开发代理行为参考 [Vite 官方文档](https://vite.dev/config/server-options.html)。
