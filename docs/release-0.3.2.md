# 0.3.2 — Origin 栅栏补上端口，顺带修掉 IPv6 误拒

0.3.1 的"未做"清单里有四项，这是其中唯一带安全含义的一项：**回环栅栏比对 `Origin` 的 hostname，却从不比对端口**。因此 `localhost` 上图方便利的另一个本地服务——`localhost:4000` 的开发工具、某个 playground、文档预览——在栅栏眼里与插件自己的页面**是同一个来源**，可以把草稿 POST 到 `/prompt-enhance/enhance`，花掉运维者配置的模型额度。

## 改了什么

| 面 | 0.3.1 | 0.3.2 |
|---|---|---|
| `Origin` 端口 | 只看 hostname ∈ `{localhost, 127.0.0.1, ::1}` | 还要求端口 **等于本次请求被投递到的端口**（取自 `Host` 头） |
| 省略端口的比较 | 不涉及 | 用协议默认端口补齐：`http://localhost` ≡ `localhost:80`、`https://localhost` ≡ `localhost:443`；`localhost:80` 配 `https://localhost` 仍然拒绝 |
| `Host` 无端口 | 只比 hostname | **不变**：默认端口服务或 HTTP/1.0 无 `Host` 时没有可钉的端口，退回原行为 |
| IPv6 `Origin` | `URL.hostname` 返回 `[::1]`（带括号），与允许表里的 `::1` 永不相等 ⇒ **合法页面被误拒** | 比较前剥括号 |

`Host` 无端口那条不是新开口子，而是 0.3.1 的同一条信任边界，只是这次把它写进了函数注释，而不是留给读者从代码里推断。

## 证伪

四条新用例（3 条单元 + 1 条真实监听服务器的 403）里**有 3 条在 0.3.1 代码上失败**——包括那条 IPv6 误拒，说明它不是纸面推演；第 4 条（`Host` 无端口时退回 hostname-only）是**双向守卫**，固定的是刻意保留的旧行为，因此旧代码、新代码都通过。

```
git stash push -- src/loopback.ts
  × pins the Origin port to the port the request was addressed to
  × treats bracketed and bare IPv6 Origins alike
  × refuses an Origin from a different local port with 403
git stash pop
```

## 验证

- `npm run typecheck` 干净
- `npm test` **24 文件 / 246 用例全绿**（0.3.1 为 242）
- `lib/` 重新构建，随代码一起提交（工作流会校验 `lib/` 与源码是否漂移）
- 发布走 Trusted Publisher（OIDC），此版本同时用于验证该配置

## 仍未做（有意）

- **快捷键没有迁移到宿主的 `shortcuts` 服务**：需要先确认 `dsh-client-shortcuts` 的注册契约与冲突消解语义，属独立改动。
- **撤销后 `setDraft(string)` 会清掉引用 chip**：宿主 `setDraft` 只接受纯文本，保留 chip 需要在文本之外重建引用结构，目前按"以文本为准"处理。
- 跨代探测的兼容死分支（`installSection`、旧 settings 模块、`webUiSettings`、`settingsScope`）保留：在旧版本线上仍是唯一路径。
