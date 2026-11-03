# 0.3.4 — 有推理预算了，长草稿也不再撞 2048

两个改动都来自**外部贡献者的 PR**，加上 0.3.3 那次 rc.5 适配（它没发布过，因为没有生产代码改动，所以没东西可发）。合入时保留了原作者提交。

## 改了什么

| 面 | 之前 | 现在 |
|---|---|---|
| `reasoningEffort`（新增字段） | 不传，完全跟随模型默认档 | `off`（默认）/ `low` / `high` / `inherit`；`inherit` 就是旧行为 |
| `maxOutputTokens` 默认 | `2048` | `8192` |

**为什么要动推理档**：改写是短而明确的任务，模型默认档几乎是纯浪费。原作者在同一份草稿上测得 `off` 252 输出 token、`high` 2897，同样的结果差 11 倍——而增强是按快捷键就会触发的高频操作。

**为什么要动输出上限**：长草稿是插件的常态输入，撞上 2048 会以 `max-tokens` 终止，而插件从不把半截结果填回输入框，于是用户第一次用长草稿就会失败一次，还得自己去设置里找这个字段。

## 真机实测（0.2.1-rc.5，同一份草稿、同一路由 `deepseek-official/deepseek-flash`）

| 配置 | 输出 token | 耗时 |
|---|---|---|
| `reasoningEffort: off`（新默认） | **176** | 1.6 s |
| `reasoningEffort: inherit`（旧行为） | **322** | 3.6 s |

结论：这个字段**确实到达了适配器**，不是写进配置就没了。顺带确认设置面：`--dump-config-schema` 把本条目投影成 `config100`，**17/17 字段带 `x-cordis.volatile`**（16 个旧字段 + 新增的 `reasoningEffort`），设置页不会因为多了字段而少一个。

## 扣下了 #10 的第二半

PR #10 里还有一半：让开头带**命令 chip**（如 `/计划`）的草稿也能增强。没有合。

它填回结果时调的是 `setDraft({ text, references, command })`——宿主**实现**了这个对象形式（`resolveDraftInput` 会解析 references 与 command 并把 chip 重建出来），但 `InputActions.setDraft` 的**公开类型只有 `text: string`**，所以它能编译，是靠一个 `as never` 强制转换。

把"契约未公开、且落在会覆盖用户草稿的那条路径上"的写入合进来，风险不值得：一旦宿主改了 `resolveDraftInput` 的行为，症状是用户的输入框被写成 `[object Object]` 或直接丢掉命令。PR 保持打开，评论里写了这条理由与替代方案。

## 验证

- `npm run typecheck` 干净
- `npm test` **24 文件 / 256 用例全绿**（0.3.2 是 246：`maxOutputTokens` 1 条 + 推理档 9 条）
- `lib/` 重新构建并提交
- 真实 rc.5 宿主上：条目进入 loader 树、`/enhance` 返回 200、schema 17/17 volatile；临时 profile 用完即删

## 未做（有意）

- 命令 chip 草稿的增强（同上，等 PR 作者在真机上验证或改成公开契约）。
- 撤销仍会丢引用 chip：`setDraft` 到 rc.5 为止的公开签名仍是纯文本。
