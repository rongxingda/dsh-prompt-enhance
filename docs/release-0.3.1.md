# 0.3.1 — 设置页真的会出现，失败流真的会关

0.3.0 把插件搬到了 `0.2.1-rc.2` 的契约上，但有两条最关键的路径**在真实宿主上从未生效**：设置页不存在，失败流不结束。两条都属于"看着在、其实不在"，所以这次每条都配了一个**在旧代码上必然失败**的测试。

## 两个致命项

| 面 | 0.2.x 的真实行为 | 用户看到什么 | 修法 |
|---|---|---|---|
| **设置** | `SettingsForms.describe()` 用内部 `volatileForm()` 过滤每个条目：**没有任何字段带 `meta.volatile` 时整条被丢弃** | 设置页里没有本插件；即使写入也会抛 `Plugin entry "prompt-enhance" has no volatile fields` | 16 个字段全部加 `.volatile()`；schema 库从裸 `schemastery` 换成 `@deepseek-ai/schemastery`（只有它带 `.volatile()` 与配套的位置校验） |
| **流式失败** | 错误分支写了 `event: error` 帧，**没有 `res.end()`** | 浏览器因为收到帧而正常显示错误；`curl` / `response.text()` / 代理**永久挂起** | 成功与失败共用 `endResponse()` 收尾 |

复现与验证（不是推断）：

```
宿主 volatileForm(Config)  → 修复前: undefined（条目被跳过）
                           → 修复后: present, 16 个字段
真宿主 dsh web @0.2.1-rc.2 → 插件激活、POST /prompt-enhance/enhance
                             返回 deepseek-official / deepseek-flash 的真实结果
```

失败流那条的证伪：把 `endResponse(res)` 注释掉，新用例在 2.07 秒被 abort 判失败——正是"永久挂起"。

## 生命周期与失败路径

- **路由不随卸载回收**：`webServer.register` 只返回"从表里删项"的函数，disposer 却存在模块级 map 里、无人调用 ⇒ 卸载后路由仍用旧配置与旧限流窗答卷，重载撞 `duplicate prefix route`。改为 `ctx.inject(['webServer'])` + `ctx.effect`，服务按身份跟随、随光纤回收。
- **`/enhance` 在无 webServer 的组合里整体消失**：`inject` 里硬写了 `['llm','webServer']`。`webServer` 移出硬依赖、改按需注入后，斜杠命令在纯 CLI 组合里依然可用。
- **`/enhance` 遇配置异常直接抛**：`readConfig()` 在 `try` 之外，provider/model 半填时抛出的是未捕获异常，而不是路由侧那句中英双语提示。已移入 `try`。
- **流式端点把"服务端拒绝"当成"宿主不支持流式"**：`response.ok === false` 时丢弃整个错误信封并**原样重发一次**——429 反而打两次、结构化原因（`limit`/`retryAfterSeconds`）全丢。现在先按 `ok` 分流：拒绝即报拒绝，只有"200 但不是流"才回退一次性。
- **面板打开时快捷键打到别的会话**：结果面板 `createPortal` 挂在 `body` 上并接管焦点，上溯循环走到 `body` 时 `body.contains(每个 composer)` 恒真 ⇒ 返回注册表里的第一个会话。现在遇 `body`/`documentElement` 即停，退回"最近挂载的会话"。证伪：去掉这行判断，用例立刻变成"点了另一个会话"。
- **设置镜像可能永久停在默认值**：`boundId` 在 `forms.get()` **之前**落值，取不到时后续每次 describe tick 都因 `entryId === boundId` 直接返回 ⇒ 永不重试。改为取到 form 之后才认领 id。

## 可诊断性与小项

- 客户端三处空 `catch` 改为 `console.warn`（模块注释早就承诺 "caught and logged"，代码里一行都没有）——"按钮不出现"这类报告唯一的线索来源。
- 对话框 Tab 焦点陷阱的**反向**漏：面板根节点是刻意 `tabIndex={-1}`，既不是 first 也不是 last，`Shift+Tab` 能直接逃出。已把根节点视为"first 之前"。
- 关闭插件后不再抢键：此前仍 `preventDefault` 后跑一个空动作，等于静默吃掉用户绑给同一组合的宿主快捷键。
- `scripts/build.mjs` 列在 `tsconfig.include` 里但 `allowJs` 没开 ⇒ 从未被检查。现在开 `checkJs`，并给 esbuild 选项补 JSDoc（否则 `packages: 'external'` 会退化成 `string`）。
- README 不再称 `dsh.engines` 为"声明性、不强制"：宿主启动预检会直接 `disabled = true`，放行必须显式 `--accept-risk`。

## 验证

- `npm run typecheck` 干净（`build.mjs` 现在确实在检查范围内，`tsc --listFilesOnly` 命中 1）
- `npm test` **24 文件 / 242 用例全绿**（0.3.0 为 22 / 231，新增 `client-enhance-client`、`client-shortcut-target` 及配置/路由/镜像若干条）
- 真实宿主冒烟：临时 profile 装本地包 → 插件激活、无 `pending` / `did not activate` → 增强路由返回真实模型结果 → 临时 profile 与临时目录已删除

## 未做（有意）

- **快捷键没有迁移到宿主的 `shortcuts` 服务**（`dsh-client-shortcuts` 支持用户改键与冲突消解）。迁移需要先确认该服务的注册契约与冲突语义，属于独立改动，不在这次"失败路径闭包"的范围内。
- **`Origin` 只比对 hostname、不比对端口**：任意 `localhost:任意端口` 的页面都被信任。收紧需要把服务实际监听的端口传进栅栏，同样属独立改动。
- 跨代探测的兼容死分支（`installSection`、旧 settings 模块、`webUiSettings`、`settingsScope`）保留：它们在旧版本线上仍是唯一的路径。
