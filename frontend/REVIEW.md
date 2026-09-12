# 前端重构自审记录

检查日期：2026-09-13。

## 发现的问题

本次自审覆盖入口迁移、运行器与配置并发、WebSocket 会话、页面状态、构建及部署链路。

- 首次安装前端依赖可能超过原启动器的监听就绪超时。
- Windows 不能直接通过 `subprocess` 把 `npm.cmd` 当作可执行文件运行。
- 后台任务调度器迁移时遗漏了回调生成器和类型导入；原有测试只覆盖直接注册 Task，未覆盖启动时使用的 `add()`。
- 连接取消时需要等待会话任务完成清理；多个组件分别发送订阅会在重连时覆盖自动预览主题。
- API 启动任务需要传递更新服务的停止事件，才能保留更新时的退出行为。
- 核心运行器的旧配置快照可能覆盖页面刚保存的其他字段。

以上问题均已修正并补充回归验证。

全量 Python 测试仍有四项既有失败，已在隔离的原始 HEAD 中复现，没有修改对应游戏行为或断言：

| 测试 | 原有失败原因 |
| --- | --- |
| `TestGameNotRunningErrorHandling.test_schedules_restart_without_requesting_traceback` | 模拟对象缺少初始化字段，随后错误日志处理使用了不完整的 Mock 配置 |
| `TestCommissionAlgorithmSwitch.test_dynamic_programming_is_disabled_by_default` | 测试期待关闭，现有生成配置默认开启 |
| `TestCommissionValueModel.test_delaying_more_high_value_jobs_reduces_threshold` | 两个计算结果同为 43199，未满足严格小于断言 |
| `TestFarmingCombatConfig.test_old_config_gets_priority_without_changing_submarine_defaults` | 测试期待 `default_mode`，现有默认值为 `S1_enemy_first` |

## 建议修正

已落实的修正包括：在启动监听计时前构建、Windows 使用 Node 执行 npm CLI、统一订阅所有权、补齐后台回调包装、使用共享配置事务锁和 revision 冲突检测。API 方法参数由后端模型生成契约与 TypeScript 类型，避免两端独立维护请求定义。

验证结果：

- React 生产构建及 TypeScript 检查通过；客户端单元测试 4 项通过。
- Playwright 浏览器测试 4 项通过，覆盖配置持久化、未保存提示、创建实例、移动端布局、真实断线、草稿保留及预览订阅恢复。
- 最新 API、生命周期、配置事务、任务调度与构建回归共 31 项通过；启动监督器专项检查通过。
- 最近一次全量 Python 检查共 478 项，474 项通过，余下四项为上表中的原有失败；之后新增的两项配置保存与更新事件回归均通过。
- Ruff 仓库 CI 规则，以及新 API、运行服务的未定义名称和未使用导入检查通过。
- `config_updater`、`button_extract` 执行成功，生成文件未产生额外差异。
- Windows 自动构建实际执行成功，静态产物的摘要与当前源码一致。
- 已人工检查桌面总览、配置页、移动端和深色主题的浏览器截图。

原有四项测试应结合对应游戏需求单独修正。不要为让前端重构通过而直接更改游戏默认值。

## 是否需要继续修改

本次 React 与 WebSocket 重构的已发现问题已完成修正。运行说明见 [README.md](README.md)，协议见 [API.md](API.md)。

模拟器截图、真实任务执行、长期运行及 Docker 镜像构建尚未在本次环境中实测。浏览器验收使用临时实例和测试资源数值，禁止调用真实设备；这些测试数据不进入生产前端。

迁移后的预览采用 WebSocket 截图，统计页提供资源时间线。旧 WebRTC 控制页、OBS 覆盖层、翻译编辑器和专用统计页面已移除，不宣称逐项复刻这些旧页面。

构建、依赖、截图和测试日志均为忽略的本地产物，未执行 Git 提交或推送。
