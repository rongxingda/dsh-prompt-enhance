# dsh-prompt-enhance

DeepSeek Harness(DSH)Web GUI 的「提示词增强」插件:把输入框里的草稿一键改写为结构化提示词——补全背景与约束、明确目标与角色、拆分可执行步骤、指定输出格式与验收标准、补充边界条件;**不改变原意、不凭空编造需求**。增强前后并排对比,一键回填 / 复制 / 撤销。

仿照 WorkBuddy 的提示词增强体验,基于 DSH 的 Cordis 插件体系实现,单包双半区:

- **宿主半区**(`exports "."`):`prompt-enhance` 设置节(schemastery,自动渲染于 设置 → 插件配置)、`POST /prompt-enhance/enhance` 路由(经 `ctx.llm` 调模型,回环安全栅栏)、`/enhance <文本>` 斜杠命令。
- **浏览器半区**(`exports "./client"`):输入框工具栏增强按钮(`conversation.input.right`)、增强前后对比预览面板、撤销条(`conversation.input.dock`)、可配置全局快捷键。

## 触发方式

| 入口 | 行为 |
|---|---|
| 输入框工具栏 ✨ 按钮(发送键左侧) | 读取草稿 → 调用宿主增强 → 弹出对比面板 |
| 快捷键(默认 `Ctrl+Alt+E`,可配置) | 作用于焦点所在的输入框;避免浏览器保留组合 |
| `/enhance <文本>` 斜杠命令 | 增强命令参数文本,结果在命令面板展示可复制,不进入对话历史 |

面板内:**回填到输入框**(保留原文供撤销)/ **复制结果** / **取消**(Esc 或点击遮罩)。回填后输入框上方出现「✓ 已用增强结果替换原提示词 [撤销]」提示条,一键恢复原文;继续输入会自动撤销撤销条,不会用过期文本覆盖新编辑。原文始终保留,任何失败都不改动草稿。

## 模型路由(按优先级)

1. 插件设置中成对填写的 `provider` + `model`;
2. 当前会话已记录的请求路由(跟随会话模型);
3. 全局默认模型(`agent-default-model` 设置)。

三者皆无时明确报错并指引导配置,不做静默兜底。凭据与传输完全复用 harness 的 LLM 服务,无需在插件内再配 API Key。

## 配置(设置 → 插件配置 → prompt-enhance)

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关;关闭隐藏按钮并停用所有触发 |
| `provider` / `model` | 空 | 成对覆盖模型路由;留空跟随当前会话 |
| `temperature` | `0.3` | 低温改写更忠实原意 |
| `maxOutputTokens` | `2048` | 单次输出上限 |
| `maxInputChars` | `12000` | 输入字数上限;**超限拒绝而不截断**(避免改变原意) |
| `timeoutMs` | `60000` | 单次超时(毫秒) |
| `systemPrompt` | 内置策略 | 留空用内置增强策略;可整体替换 |
| `shortcut` | `ctrl+alt+e` | 快捷键(如 `ctrl+shift+p`);留空禁用 |

配置热生效:每次增强调用前重读设置,改完保存即作用于下一次调用。

## 异常与边界

- **空输入 / 仅空白 / 零宽字符**:本地拦截,提示「输入框为空」。
- **超长输入**:本地 + 宿主双重校验,拒绝并给出字数,不截断。
- **仅图片无文本**:提示仅支持文本。
- **含命令 / 文件引用 chip**(如 `/compact`、`@file`):回填会破坏 chip,拒绝并提示先移除。
- **提交中 / 请求在途**:防重入,提示稍候;面板加载中可取消(请求随之中止)。
- **上游失败**:按稳定错误码映射为可读中文(AUTH → 鉴权失败、RATE_LIMIT → 限流、QUOTA_EXCEEDED → 配额不足、CONTEXT_WINDOW_EXCEEDED → 超上下文等),附「原输入未改动」。
- **模型返回空 / 包裹代码围栏 / 请求工具调用**:规范化与校验兜底(剥围栏、拒绝空结果),错误可直接重试。
- **浏览器中途关闭 / 切换会话**:宿主路由侦测连接断开即中止模型调用;面板与撤销栈按会话隔离,随会话清理。
- 所有失败只出现在插件自己的面板中,输入框草稿永不被动丢失,可继续手动输入。

## 安装

```bash
cd dsh-prompt-enhance
npm install
npm run build          # tsc 类型检查 + esbuild 产出 lib/index.js(ESM)与 lib/client.js(ModuleLoader 包裹)
dsh plugin --profile web add link:C:\path\to\dsh-prompt-enhance
# 重启 dsh web
```

从 GitHub 安装(lib 已随仓库提交,无需本地构建):

```bash
dsh plugin --profile web add github:rongxingda/dsh-prompt-enhance
# 重启 dsh web
```

卸载:`dsh plugin --profile web remove dsh-prompt-enhance`(并检查 profile package.json 的 `dsh.profile.bundles` 数组是否残留该行,残留则手动删除)。

要求:`dsh >= 0.1.1-rc.1`,Node `^22.19 || >=24`。

## 发布新版本(维护者)

1. `npm version <patch|minor|major>` 更新版本号并打 tag;
2. `npm run build` 确保 `lib/` 与源码一致,与版本提交一起推送;
3. 推送 tag(`git push --follow-tags`),在 GitHub Releases 上发布说明。

`lib/` 是刻意提交的:GitHub 直装(`dsh plugin add github:...`)不会执行构建,提交产物让安装零构建依赖。CI 会在 `lib/` 与源码不一致时拒绝合并。

## 开发

```bash
npm run typecheck      # tsc --noEmit
npm test               # vitest(48 个单测:校验/规范化/增强调用/撤销栈/快捷键/配置/客户端设置)
npm run watch          # esbuild 监听构建双半区
```

结构:

```
src/
├── index.ts            宿主 apply:设置节 + 路由 + 命令
├── config.ts           schemastery 模式 + 解析校验(成对路由)
├── prompts.ts          内置增强策略系统提示词 + <raw_prompt> 框架
├── enhancer.ts         ctx.llm 辅助调用(路由解析/超时竞速/finish 校验)
├── enhance-routes.ts   POST /prompt-enhance/enhance(回环栅栏/限长/错误码)
├── enhance-command.ts  /enhance 斜杠命令
├── shared/             两端共用:协议类型、输入校验、输出规范化
└── client/
    ├── index.tsx       浏览器 apply:插槽注册 + 设置镜像 + 快捷键
    ├── EnhanceButton   input.right 按钮 + 守卫链 + 调用编排
    ├── ResultPanel     对比预览面板(回填/复制/取消/重试)
    ├── UndoBar         input.dock 撤销条
    ├── ui-state        跨组件面板/撤销/会话注册表(外部 store)
    └── …               fetch 客户端、undo-stack、shortcut、locales、styles
```

## 验收清单(实机 `dsh web`)

- [ ] 中文输入「帮我写个爬虫」→ 增强 → 面板对比,回填后草稿为结构化中文提示词,撤销恢复原文
- [ ] 英文输入返回英文(语言一致性)
- [ ] 空输入 / 超长输入 / 含 `/命令` chip / 提交中,均被拦截且草稿不变
- [ ] 面板加载中点取消:草稿不变,可继续输入
- [ ] 拔掉 API Key 或断网:错误消息可读,重试可用
- [ ] 设置改 `shortcut` / `maxInputChars` / `enabled` 后无需重启即生效
- [ ] `/enhance 帮我写周报` 结果在命令面板展示且未发送给会话模型
