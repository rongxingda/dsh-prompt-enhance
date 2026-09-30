# dsh-prompt-enhance 代码审阅报告

审阅对象：`dsh-prompt-enhance@0.2.2`（单包双半的 DSH Web GUI 提示词增强插件）
审阅方式：全量静态阅读 + 依赖契约逐项比对 + 真实 `tsc`/`vitest`/`esbuild` 验证 + **GUI 实机冒烟**
最终状态：typecheck 通过、**20 文件 / 207 用例全绿**、`lib/` 产物与 `src/` 一致、**插件在真实 `dsh web` 中加载并可用**

---

## 一、功能定位

在 dsh Web GUI 的作曲区提供一个「增强」入口：把草稿经 harness 自带 LLM 服务低温重写为结构化提示词，预览原文/结果后回填、复制或撤销。

**硬约束（修复过程中一律未改动）**

- 原文永不被动修改：只有显式「回填」才会改动作曲区，且可一键撤销。
- 结果永远是规范化正文（去代码围栏、trim），超长输入**拒绝而非截断**。
- 流式仅为显示：最终应用内容始终来自 `normalizeOutput` 的完整结果。
- 上下文感知失败即 fail-open 回退到单条增强，绝不因读不到历史而失败。

**模型路由优先级**：设置里的 provider/model 对 → 会话请求头路由 → harness 默认模型。

---

## 二、目录结构与入口

```
src/
  index.ts              宿主入口：name/inject、跨代设置分区装配、装配 route+command
  config.ts             schemastery schema、DEFAULT_CONFIG、resolveConfig
  enhance-routes.ts     两个 POST 端点：准入闸门、限流/并发、SSE 与 JSON
  enhance-command.ts    /enhance 斜杠命令
  orchestrate.ts        两条入口共用的路由解析 + 上下文装配
  enhancer.ts           一次 LLM 调用：超时竞速、BlockAssembler、finish 校验、错误映射
  context.ts            会话历史 → 有界、去框架化的 <conversation_context> 片段
  prompts.ts            内置增强策略 + 上下文规则 + <raw_prompt> 框架化
  loopback.ts           socket + Host + Origin 三重信任围栏（防 DNS rebinding）
  http.ts               readBoundedJson / writeJson
  sse.ts                带背压的 SSE 帧写入器（本次新增）
  shared/               protocol / validate / normalize / stream-text（两端共用）
  client/
    index.tsx           词典注册、设置镜像、两个 slot 注册、快捷键
    EnhanceButton.tsx   守卫链 + fetch + 面板 + 回填/undo
    ResultPanel.tsx     预览面板（loading/stream/result/error、焦点陷阱、复制兜底）
    UndoBar.tsx         撤销条
    enhance-client.ts   同源 fetch + SSE 读取 + 类型化错误
    settings.ts         客户端设置镜像（不 import host config）
    shortcut.ts         快捷键解析/匹配（event.code 优先，布局无关）
    ui-state.ts         面板/undo/session 注册表 + 微任务合并 delta
    session-key.ts      sessionId 兼容 shim（0.1.1-rc ↔ 0.1.2-rc）
    undo-stack.ts       按会话的深度受限 undo 栈
    locales.ts          中英文字典
    styles.ts           自注入样式
```

- **宿主半**：`exports["."]` → `lib/index.js`（ESM，包引用保持 external）
- **浏览器半**：`dsh.client` → `lib/client.js`（CJS，包进 `window.__ModuleLoader__.load`）
- **bundle patch**：`cordis.patch.yml` 把插件行插入 web profile 名单

---

## 三、发现的问题与处置

### P0-1　`error.upstream.<reason>` 键名错配（8 个原因中 5 个失效）

线上 `reason` 是 kebab-case，字典键是 camelCase，用 `` `error.upstream.${reason}` `` 拼键导致 `invalid-credential`／`rate-limit`／`context-window`／`tool-call`／`max-tokens` 全部落空，永远退化成通用文案——而对应词条其实早已写好。

**处置**：改为显式映射表 `UPSTREAM_ERROR_KEYS`（`PromptEnhanceKey` 字面量校验），并补两层回归测试（键集一致性 + 真实面板逐 reason 渲染 + 负例）。

### P0-2　`npm run typecheck` 在 CI 第一步即断

`tests/client-components.test.tsx` 导入了未公开的 `InputState`（该类型刻意不从包根与 `./client` 转出），导致 `tsc` 报错；CI 顺序为 typecheck → test → build，因此后续从未执行。

**处置**：测试改为本地字面量类型。过程中曾尝试用 `Parameters<>` 从 slot props 反推，核实后发现 `SnapshotSelectorHook<T>` 在 selector 上对 `T` 泛型、会擦除状态类型，该写法不可编译，故弃用并在注释中说明原因。

### P0-3　运行时依赖声明不完整

- `lib/client.js` 实际 `require("react")`／`require("react-dom")`／`require("react/jsx-runtime")`，但只声明了 `react`。
- `lib/index.js` 静态 `import "@deepseek-ai/dsh-llm"`，却只写在 devDependencies。

**处置**：`peerDependencies` 补 `react-dom`、`@deepseek-ai/dsh-llm`；`dsh.client.inject` 补 `react-dom`。

### P1-1　SSE 响应从不结束（隐藏最深的真缺陷）

流式路由写完 `done` 帧后从不调用 `res.end()`，chunked 响应永远缺 `0\r\n\r\n`：

- 浏览器里"看起来正常"——客户端在 `done` 帧上 `return` 并 `reader.cancel()`，掩盖了它；
- 但**每次流式增强都泄漏一个未收尾的响应**，keep-alive 无法复用连接；
- 任何整 body 读取者（`response.text()`、curl、反向代理、访问日志中间件）**永久挂起**。

**处置**：路由在 `done` 帧后调用 `res.end()`（带 `writableEnded`/`destroyed` 守卫与 try/catch，避免客户端中途断开时抛出覆盖真实结果）。既有测试从未覆盖 SSE 端点，是它长期潜伏的原因；本次补了 SSE 端到端用例，并用裸 socket 字节打印取得铁证（修复前末尾无 `0\r\n\r\n`，修复后有，且 `response.text()` 从永久挂起变为 `200 / 236 bytes`）。

### P1-2　SSE 帧写入无背压

忽略 `res.write()` 返回的 `false`，慢客户端可让 socket 缓冲无界增长。

**处置**：新增 `src/sse.ts`——帧在缓冲区满时停靠至 `drain`，`close` 释放停靠，`dispose()` 释放监听；配 10 条单测。

### P0-4　浏览器半硬声明可选服务，导致整个 Web 启动失败（本次审阅引入的回归）

我把 `settingsScope` 写进了客户端半的 `inject`。cordis 的契约是"`inject` 里列了谁，就等于没有它就不加载"（`Plugin.Base.inject`：*Services the plugin requires; it only loads while all are available*），而该服务由可选的设置面板包 `@deepseek-ai/dsh-client-ui-settings` 提供——目标 profile 的 bundles 名单里没有它。结果插件永久 `pending`，shell 把"有 entry 没激活"当作致命错误，**整个 GUI 白屏**，报错为 `web boot: 1 entry did not activate`。

**处置**：改为**不硬依赖任何服务**——`slots`／`locale`／`settingsScope` 全部走可选的 `ctx.inject`，`apply` 本体不直接触碰任何服务；缺服务时降级（无设置面板则用内置默认值，无 locale 则渲染字典键）。配 `tests/client-apply.test.ts`（4 条）锁定"裸环境也必须能启动"。

### P0-5　渲染期脆性读取使插槽条目被错误边界卸载（既有缺陷）

`EnhanceButton` 直接读 `state.imageIds.length` / `state.occurrences.length`。这两个字段在插件编写时所依据的 dsh 版本里属于输入快照，但 slot 宿主不保证提供；字段缺失时 `.length` 在**渲染期**抛错，React 错误边界据此卸载整个 `conversation.input.right` 条目——表现为按钮消失 + 控制台狂刷同一条堆栈（实测 `slot entry crashed in 'conversation.input.right'`），功能彻底不可用。

**处置**：新增 `countOf` / `stringOf` 防御式读取：字段缺失或类型畸形一律降级为"无此计数 / 空串"，代价仅是两条**提示性**守卫（仅图片、含命令块）不触发，增强本身照常。同时给 `UndoBar` 的 `draft` 读取加同样防护（避免把 `undefined` 误判为"用户继续输入"而静默丢弃撤销记录）。配一条回归用例：宿主只提供 `{ draft, phase }` 时按钮必须照常渲染。

### P1-3　其他

- `context.ts` 用 UTF-16 单元而非码点计上下文预算（中文/emoji 场景预算偏差约 2 倍），截断还可能劈开代理对 → 改用共享 `countText` 并按码点截断。
- `resolveConfig` 可原样返回 `provider: ''`，让下游把空串读成"存在覆盖" → 归一为 `undefined`。
- 跨会话 busy 用 `disabled` 静默禁用按钮，键盘/读屏用户连原因都读不到 → 改 `aria-disabled` + 可读原因文案。
- `abort()` 回调抛错会阻断面板状态迁移 → 统一用 `abortOf()` 包裹。
- `ResultPanel` 焦点还原挂在第二个 mount-only effect 上，StrictMode 下会立刻把焦点吐回按钮、使焦点陷阱与 Esc 失效 → 合并进同一 effect 并加"不抢用户已移动的焦点"守卫。
- `openError` 冗余同时传 `message` 与 `localized` → 只留 `localized`。
- CI `node-version: 22` 不满足 `engines: ^22.19.0` → 改为 `'22.19'`。
- `files` 未包含 README 引用的 `docs/` 截图 → 补入；加 `prepublishOnly` 与 `publishConfig.access`。

---

## 四、验证证据

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过，无错误 |
| `npm test` | **20 文件 / 207 用例全绿** |
| `npm run build` | 通过；`lib/index.js` 与 `lib/client.js` 均含最新逻辑 |
| `git status`（build 后） | 无产物漂移，符合 CI 的 lib 一致性校验 |
| SSE 协议 | 裸 socket 确认 `0\r\n\r\n` 终止符存在；`response.text()` 正常返回 |
| 安装形态 | `dsh plugin --profile web add link:C:\prompt-enhance-fresh`，插件行显示为 `link:` |
| **GUI 实机** | **插件在真实 `dsh web` 中加载成功、按钮渲染、增强流程可用** |

**审阅过程中被证伪的两处自身判断（记录以示校准）**

1. 我曾判定「`README.md`／`README.zh-CN.md` 不存在、需补写」——错，两份都存在（305／304 行），是目录列举被输出截断误导；最终未改写，只补了 `docs/` 并同步架构树。
2. 我曾推测 `tests/client-components.test.tsx` 导出的 `sessionId` 是类型错误——错，`dsh-client-runtime` 通过声明合并提供了它（`SessionIdentity` 非可选）；真正的类型错误只有 `InputState` 一处。

**另一条被实践证的教训**：207 个自动化用例全绿，而插件在真实宿主里一加载就崩（P0-5）。差别在于"宿主不提供某些字段"这种**跨版本形状差异**，只有真正装进宿主才暴露得出来——因此新增的两组用例（`tests/client-apply.test.ts` 的裸环境启动、`tests/client-components.test.tsx` 的缺字段渲染）都把"宿主比预期更贫瘠"当作一等公民来锁定。

---

## 五、GUI 冒烟结果

已在真实 `dsh web` 中完成基础冒烟：插件加载、作曲区按钮渲染、增强流程可用。

仍建议按需逐条确认的细项（均已有自动化覆盖，此处仅列人工回归点）：

1. Settings → 插件配置出现 `prompt-enhance` 分区（目标 profile 未打包设置面板时，此项**预期不出现**，功能自动使用内置默认值）。
2. ✨ 按钮与 `Ctrl+Alt+E` 走同一流程；空输入/超长/含引用块各自给出可读拒绝文案。
3. 预览面板：回填 → 撤销条出现 → 撤销恢复原文；复制可用（含非安全上下文回退）。
4. 流式增强：文字边写边显示，结束后面板**平滑切到规范化结果**（`display.finish()` 冲刷确保末尾字符不丢）。
5. `/enhance <文本>` 在命令面板可复制、不进入模型历史。
6. 多会话布局：另一会话增强中时，本会话按钮给出"另一个会话正在增强中"提示而非静默变灰。
7. 上游错误（如错误 API Key）能否显示**具体**修复提示（对应 P0-1 的修复面）。

---

## 六、安装形态提醒

当前 profile 通过 `link:` 指向本仓库，**宿主半改动必须重启 `dsh web`**；且 profile 的 `package.json` 里若残留 `^0.2.x` 语义版本声明，任何一次 `npm install` 都可能把 `link:` 覆盖回 npm 上的版本，从而静默丢掉本地修复。
