# dsh-prompt-enhance

[![CI](https://github.com/rongxingda/dsh-prompt-enhance/actions/workflows/ci.yml/badge.svg)](https://github.com/rongxingda/dsh-prompt-enhance/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-prompt-enhance)](https://www.npmjs.com/package/dsh-prompt-enhance)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

**DeepSeek Harness Web GUI 的「提示词增强」插件** —— 一键把输入框里的草稿改写为结构化提示词:明确的角色与目标、可执行步骤、输出格式、验收标准、边界条件。不改变原意、不凭空编造需求,原文始终保留。

[English](./README.md) | 简体中文

---

## 为什么需要它

好的智能体提示词会讲清*让模型扮演谁*、*交付什么*、*以什么格式*、*怎样算合格*——而大多数草稿不会。本插件给 dsh 输入框加上 WorkBuddy 风格的「增强」入口:草稿经低温重写(走 harness 自带的 LLM 服务),结果与原文并排对比,你可以回填、复制或丢弃。撤销只需一键,且**任何失败路径都不会改动你输入的内容**。

## 功能一览

| | |
|---|---|
| ✨ **输入框按钮** | 工具栏内发送键旁的小按钮,随手可及 |
| 🔀 **对比预览面板** | 原文与增强结果左右并排,附模型名与耗时 |
| ↩️ **一键撤销** | 回填后输入框上方出现撤销条,一键恢复原文 |
| ⌨️ **快捷键** | 默认 `Ctrl+Alt+E` 可配置,作用于你正在使用的输入框 |
| 💬 **`/enhance` 命令** | 斜杠面板直接改写任意文本;结果不进入模型历史 |
| 🧠 **模型路由** | 设置成对覆盖 → 当前会话模型 → 全局默认模型,依次回退 |
| 🔑 **零凭据配置** | 调用走 harness LLM 服务,密钥来自 harness 凭据存储 |
| ⚙️ **配置热生效** | 模型覆盖、温度、预算、系统提示词、快捷键,全部在 设置 → 插件配置 即改即用 |
| 🛡️ **草稿安全** | 空输入、超长、仅图片、含命令块在本地拦截;上游失败映射为可读提示;失败绝不改动草稿 |

## 工作原理

```mermaid
flowchart LR
    A[输入框草稿] --> B{本地守卫<br/>空 / 超长 / 命令块 / 占用}
    B -- 通过 --> C["POST /prompt-enhance/enhance<br/>(仅回环的宿主路由)"]
    B -- 拒绝 --> P[预览面板:<br/>可读错误,草稿不动]
    C --> D["ctx.llm.stream<br/>按内置策略重写"]
    D --> E[规范化:<br/>剥围栏 / 去空白 / 拒空]
    E --> F[预览面板:<br/>原文 | 增强结果]
    F -- 回填 --> G["setDraft(增强文本)<br/>原文压入撤销栈"]
    F -- 取消 / 复制 --> H[草稿不动]
    G --> U[撤销条:一键恢复]
```

插件是单个 npm 包、双半区结构,完全遵循 dsh 插件规范:

- **宿主半区**(`exports "."`,Node):注册 `prompt-enhance` 设置节(schemastery,由内置插件配置页自动渲染)、共享 webserver 上的 `POST /prompt-enhance/enhance` 路由(仅回环、限长),以及 `/enhance` 斜杠命令。模型调用走 `ctx.llm.stream` 并做规范化处理——与 harness 对会话标题相同的辅助调用纪律:超时与调用方取消在流过程中和结束后复查、终结 finish 校验、拒绝工具调用。
- **浏览器半区**(`exports "./client"`):把增强按钮注册进 `conversation.input.right` 插槽、撤销条注册进 `conversation.input.dock` 插槽,绑定设置命名空间的实时镜像,并安装全局快捷键。全部文案经 harness locale 系统提供中英双语。

## 环境要求

- `dsh >= 0.1.1-rc.1`
- Node `^22.19.0 || >=24.0.0`(仅从源码构建时需要)

## 安装

从 npm(推荐):

```bash
dsh plugin --profile web add dsh-prompt-enhance
# 重启 dsh web
```

从 GitHub(构建产物 `lib/` 已随仓库提交,安装无需本地构建):

```bash
dsh plugin --profile web add github:rongxingda/dsh-prompt-enhance
```

从本地检出(开发用,改代码重建 + 重启即生效):

```bash
git clone https://github.com/rongxingda/dsh-prompt-enhance.git
cd dsh-prompt-enhance && npm install && npm run build
dsh plugin --profile web add link:C:\path\to\dsh-prompt-enhance
```

卸载:

```bash
dsh plugin --profile web remove dsh-prompt-enhance
# 检查 profile 的 package.json 中 `dsh.profile.bundles` 数组是否残留
# "dsh-prompt-enhance" 行,有则手动删除,然后重启 dsh web
```

## 使用方法

**输入框按钮 / 快捷键** —— 输入(或留着)草稿,点 ✨ 或按 `Ctrl+Alt+E`:

1. 先跑本地守卫:空草稿、超长草稿(**不自动截断**——截断会改变原意)、仅图片草稿、含命令或文件引用块的草稿,都会被拒绝并给出明确提示。引用块被拒是因为回填会破坏它们。
2. 预览面板打开,显示可取消的加载动画。此时草稿原封不动——面板上写明了这一点。
3. 结果阶段左右并排展示两份文本。**回填**把增强文本写回输入框并升起撤销条;**复制**进剪贴板;**取消**(`Esc` 或点击遮罩)丢弃一切。
4. 撤销条停在输入框上方:一键恢复原文。回填后你继续输入,撤销条会安静地自我退位——过期的原文永远不会覆盖你更新的编辑。

**`/enhance <文本>`** —— 从斜杠菜单改写任意文本。结果在命令面板渲染(可复制),不进入会话历史与模型上下文。要增强**输入框里的草稿**请用按钮或快捷键——草稿在浏览器里。

**语言一致性**由重写策略保证:中文进中文出,英文进英文出。

## 配置

全部配置位于 `prompt-enhance` 设置命名空间,在 Web GUI 的 **设置 → 插件配置** 页编辑。改动作用于下一次调用——无需重启。

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关;关闭隐藏按钮并停用所有触发方式 |
| `provider` + `model` | 空 | 显式路由覆盖;必须**成对**填写(或都留空以跟随当前会话模型) |
| `temperature` | `0.3` | 低温使改写更忠实于原意 |
| `maxOutputTokens` | `2048` | 单次增强调用的输出 token 预算 |
| `maxInputChars` | `12000` | 输入字数上限;超限**拒绝而不截断** |
| `timeoutMs` | `60000` | 单次调用的端到端超时 |
| `systemPrompt` | 内置策略 | 想用自己的增强策略时整体替换 |
| `shortcut` | `ctrl+alt+e` | 快捷键规格(修饰键 + 单个字母/数字/功能键);留空禁用 |

**模型路由优先级:** 设置成对覆盖 → 当前会话请求头中记录的路由 → 全局默认模型(`agent-default-model`)。三者都指不出路由时(例如全新会话且无默认模型),插件给出可操作的报错而不是乱猜。

## 内置增强策略

默认系统提示词让模型扮演提示词重写专家,按草稿的实际需要施加:

1. **角色与目标** —— 写明助手扮演谁、交付物是什么。
2. **背景与约束** —— 只补全草稿可推断的信息;绝不编造事实、数据、名称或需求。
3. **步骤** —— 把模糊或多头需求拆成编号、可执行的步骤。
4. **输出格式** —— 在有暗示处指明结构、语言、长度与风格。
5. **验收标准** —— 写明怎样判断结果正确。
6. **边界条件** —— 列出边界情况与信息缺失时的做法。

硬性规则:精确保留原意(不删除、篡改、 contradict 用户信息);绝不编造——未知细节插入显式占位符如 `(待补充:…)` / `(TBD: …)`;保持任务范围不变;**只输出**改写后的正文(无解释、无围栏、无客套);镜像输入语言;长度约为原文 1–3 倍;已经成形的提示词只做轻度润色而不注水。

在设置中填写 `systemPrompt` 即可整体替换为你的策略。

## 异常与边界

| 情形 | 行为 |
|---|---|
| 空 / 纯空白 / 零宽字符草稿 | 本地拒绝:「输入框为空」 |
| 草稿超过 `maxInputChars` | 本地与路由双重拒绝并给出精确字数;**不自动截断** |
| 只附加了图片没有文本 | 拒绝:仅支持文本 |
| 草稿含命令 / 文件引用块 | 拒绝:回填会破坏引用块 |
| 提交中 / 占用阶段 / 已有请求在途 | 拒绝并提示「稍后再试」 |
| 上游模型失败 | 稳定错误码映射为可读提示:`AUTH` → 检查 API Key、`RATE_LIMIT` → 稍后重试、`QUOTA_EXCEEDED` → 检查余额、`CONTEXT_WINDOW_EXCEEDED` → 精简输入、`NO_ADAPTER`/未配置 → 先配置模型 |
| 输出达到 `maxOutputTokens` | 拒绝并提示调大上限或精简原文 |
| 模型返回空 / 围栏包裹 / 工具调用 | 规范化(剥围栏)或拒绝;可重试 |
| 超时 | 映射为 `504` 的提示并给出配置秒数;可重试 |
| 浏览器中途关闭 | 宿主路由侦测连接断开,立即中止模型调用 |
| 切换会话 | 面板状态、撤销栈、快捷键目标均按会话隔离;切换即关闭面板并清理撤销记录 |

所有失败只出现在插件自己的面板里;失败的调用绝不修改输入框草稿,手动输入不受任何干扰。

## 架构

```
src/
├── index.ts            宿主 apply():设置节 + 路由 + 命令
├── config.ts           schemastery 模式 + 解析校验(成对路由)
├── prompts.ts          内置策略系统提示词 + <raw_prompt> 框架
├── enhancer.ts         ctx.llm 辅助调用(路由解析、超时竞速、finish 校验、
│                       错误码 → 文案映射)
├── enhance-routes.ts   POST /prompt-enhance/enhance(回环栅栏、限长)
├── enhance-command.ts  /enhance 斜杠命令(宿主命令注册表)
├── loopback.ts         路由的 127.0.0.1/::1 栅栏
├── http.ts             限长 JSON body 读取 / 写出
├── shared/             传输协议类型、输入校验、输出规范化(两端共用)
└── client/             浏览器半区
    ├── index.tsx       插槽注册 + 设置镜像 + 快捷键监听
    ├── EnhanceButton   conversation.input.right 条目:守卫链 + 调用编排
    ├── ResultPanel     浮层面板:对比 / 回填 / 复制 / 取消 / 重试
    ├── UndoBar         conversation.input.dock 条目:恢复入口
    ├── ui-state.ts     组件共享的外部 store(面板、撤销、会话注册表)
    ├── enhance-client  fetch 客户端(可中止 + 类型化错误)
    ├── undo-stack.ts   按会话的 LIFO 栈(深度 3)
    ├── shortcut.ts     纯函数的组合键解析 / 匹配
    ├── settings.ts     设置命名空间的客户端镜像
    ├── locales.ts      中英文字典(harness locale 命名空间)
    └── styles.ts       自注入样式表(dsh-pe- 前缀类名)
```

构建产物:`lib/index.js`(宿主半区,ESM,包引用保持外部)与 `lib/client.js`(浏览器半区,打包为 CJS 并包进 dsh web 壳要求的 `window.__ModuleLoader__.load({ id, factory })` 信封)。两者都随仓库提交,因此 GitHub 直装无需构建;CI 会在 `lib/` 与 `src/` 不一致时拒绝合并。

## 开发

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # 56 个单元测试(见下)
npm run build         # 类型检查 + 双半区构建
npm run watch         # esbuild 监听构建双半区
```

**测试覆盖:** 输入校验(空 / 零宽字符 / 超长)、输出规范化(剥围栏、折行、拒空)、以桩 `ctx.llm` 流驱动的增强器(正常路径、AUTH/NO_ADAPTER/max-tokens 终结、空输出、挂起流失超时、预中止的调用方、路由优先级)、路由的真实 `node:http` 端到端套件(回环栅栏、方法守卫、畸形 body、结构化错误信封、停用开关)、撤销栈、快捷键解析与匹配、配置解析、客户端设置解码器。

**发版流程(维护者):**

```bash
npm version patch   # 或 minor / major —— 更新 package.json 并打 tag
npm run build       # 让 lib/ 与 src/ 一致
git push --follow-tags
npm publish         # 带 2FA OTP,或使用勾选了 "bypass 2FA" 的细粒度令牌
```

CI 在每次 push/PR 上运行类型检查 + 测试 + 构建,并在 `lib/` 与已提交构建不一致时拒绝合并。

## FAQ

**为什么草稿里有 `/命令` 或 `@引用` 时被拒绝?**
回填通过 `inputActions.setDraft` 写纯文本,会破坏引用块。先移除它们,增强后再插回。

**为什么不自动截断超长输入?**
截断会无声地改变你的原意——插件宁可拒绝并给出精确字数。

**能固定用某个模型吗?**
在设置中**成对**填写 `provider` 与 `model`(例如 harness 已配置的 provider 路由)。都留空则跟随当前会话模型。

**我的草稿会被发到哪里?**
浏览器 → 你自己的 dsh 宿主(仅回环路由)→ harness LLM 服务 → 配置的模型服务商。不会发往其他任何地方,增强行为也绝不进入会话的模型历史。

**官方 DeepSeek 路由能用吗?**
能——调用走 `ctx.llm`,harness 支持的所有 provider(DeepSeek 官方、OpenAI 兼容网关)都可用。

## 致谢

插件结构、回环栅栏与设置节模式遵循 dsh 插件家族的既有惯例——特别是 [`@linxin666/dsh-tool-describe-image`](https://www.npmjs.com/package/@linxin666/dsh-tool-describe-image)。

## 许可证

[Apache-2.0](./LICENSE)
