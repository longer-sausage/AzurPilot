# AzurPilot React 控制台

前端采用 React、TypeScript、Vite 与 React Router。保留「应用功能栏 → 实例和任务导航 → 工作区」布局，提供浅色/深色主题和移动端折叠菜单。业务通信统一使用 `/api/v1/ws`，不依赖 PyWebIO、Vue 或 Electron。

## 启动

需要 Python 3.14、uv，以及 Node.js 22.12 或更高版本（推荐 Node.js 24）。在仓库根目录运行：

```powershell
uv sync --frozen
npm ci --prefix frontend
npm run build --prefix frontend
uv run python gui.py --host 127.0.0.1 --port 22267
```

浏览器打开 `http://127.0.0.1:22267`。不指定端口时沿用 `config/deploy.yaml` 的 `WebuiPort`，代码默认值为 25548。首次使用可从默认模板创建实例，再设置模拟器序列号、服务器及需要启用的任务。

`gui.py` 会检查前端源码摘要，缺少产物或源码有变化时自动执行 `npm ci` 和构建。Docker 通过多阶段构建预装静态产物，运行时无需 Node；容器中自动更新源码后，应重新构建镜像。不要用空的宿主机目录覆盖镜像里的 `frontend/dist`。

## 开发

后端：

```powershell
uv run python gui.py --host 127.0.0.1 --port 22267
```

另一个终端：

```powershell
cd frontend
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。Vite 将 WebSocket 代理到 22267；其他端口可设置 `AZURPILOT_BACKEND=http://127.0.0.1:实际端口`。代理保留 Host，使浏览器来源校验仍然有效。

## 目录职责

| 目录 | 职责 |
| --- | --- |
| `src/api/client.ts` | 连接、认证、心跳、请求关联、超时和重连 |
| `src/api/generated.ts` | 从 Python 模型生成的方法参数类型 |
| `src/api/contract.json` | 版本化参数 JSON Schema |
| `src/api/types.ts` | 响应数据及页面领域类型 |
| `src/app` | 应用布局、连接状态、共享元数据 |
| `src/components` | 可复用表单、弹窗、空状态等 |
| `src/pages` | 总览、配置、日志、统计和系统设置 |
| `src/styles` | 设计变量、布局、组件样式 |
| `e2e` | 连接真实测试 API 的浏览器回归 |
| `../module/api` | 协议、认证会话、路由和业务适配 |
| `../module/runtime` | 独立于界面的进程、OCR、更新与认证服务 |

配置表单直接读取已有 `args.json`、`menu.json` 和中文翻译，覆盖全部任务菜单；无需在 React 中重复登记游戏配置。字段支持字符串、数值、范围、开关、日期、多选、选项和任务优先级。隐藏字段不展示，运行器存储及固定字段禁止经 API 修改。

## 验证

```powershell
uv run python -m dev_tools.export_api_schema
uv run python -m unittest tests.test_api tests.test_api_lifecycle tests.test_config_transaction tests.test_runtime_task_handler tests.test_frontend_build
npm run build --prefix frontend
npm test --prefix frontend
cd frontend
npx playwright install chromium
npm run test:e2e
```

浏览器测试服务只使用临时配置，并拒绝执行真实游戏任务。截图输出在被忽略的 `frontend/test-results`。模拟器截图和游戏实际执行仍需连接模拟器验收。

## 迁移边界

- `gui.py` 保留原有父监督器、依赖同步、双栈监听与工作进程回收，应用入口改为 `module.api.app:create_app`。
- 原有 `module/webui` 和 `webapp` 源码已移除。运行服务迁往 `module/runtime`，核心配置类不再引用 PyWebIO 或修改其全局类型。
- JSON 配置、YAML 参数生成流程、现有调度器和 `/mcp` 挂载保持兼容。独立 MCP 使用迁移后的运行服务。
- 新预览通过 WebSocket 返回 JPEG 截图，自动刷新周期至少三秒；不再使用旧 WebRTC/视频控制页面，也不提供旧 OBS HTML 覆盖层。
- 当前统计页提供资源时间线与记录导出。旧界面专用的统计 HTML/JavaScript、翻译编辑器和 Electron 专用页面均不再加载。
- 服务端部署设置重启后生效；浏览器主题即时生效。密码不会由设置接口返回，填写空密码表示保留。

协议详情见 [API.md](API.md)，验证结果与迁移限制见 [REVIEW.md](REVIEW.md)。增加方法时先定义后端参数模型和路由，再生成契约，更新响应类型与对应测试；不得通过方法名反射任意 Python 属性。
