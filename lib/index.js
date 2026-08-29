// src/index.ts
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

// src/config.ts
import z from "schemastery";
var PROMPT_ENHANCE_NAMESPACE = "prompt-enhance";
var DEFAULT_CONFIG = {
  enabled: true,
  temperature: 0.3,
  maxOutputTokens: 2048,
  maxInputChars: 12e3,
  timeoutMs: 6e4,
  systemPrompt: "",
  shortcut: "ctrl+alt+e"
};
var Config = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled).description("\u603B\u5F00\u5173\uFF1A\u5173\u95ED\u540E\u9690\u85CF\u8F93\u5165\u6846\u589E\u5F3A\u6309\u94AE\u5E76\u505C\u7528\u6240\u6709\u89E6\u53D1\u65B9\u5F0F"),
  provider: z.string().description("\u8986\u76D6\u6A21\u578B\u8DEF\u7531\u7684 provider\uFF08\u4E0E\u300C\u6A21\u578B\u300D\u5FC5\u987B\u6210\u5BF9\u586B\u5199\uFF1B\u7559\u7A7A\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\uFF09"),
  model: z.string().description("\u8986\u76D6\u6A21\u578B\u8DEF\u7531\u7684 model\uFF08\u4E0E\u300Cprovider\u300D\u5FC5\u987B\u6210\u5BF9\u586B\u5199\uFF1B\u7559\u7A7A\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\uFF09"),
  temperature: z.number().min(0).max(1).step(0.05).default(DEFAULT_CONFIG.temperature).description("\u91C7\u6837\u6E29\u5EA6\uFF1B\u4F4E\u6E29\u6539\u5199\u66F4\u5FE0\u5B9E\u4E8E\u539F\u610F"),
  maxOutputTokens: z.number().step(1).min(256).max(32768).default(DEFAULT_CONFIG.maxOutputTokens).description("\u5355\u6B21\u589E\u5F3A\u7684\u8F93\u51FA token \u4E0A\u9650"),
  maxInputChars: z.number().step(1).min(200).max(2e5).default(DEFAULT_CONFIG.maxInputChars).description("\u8F93\u5165\u5B57\u6570\u4E0A\u9650\uFF1B\u8D85\u9650\u62D2\u7EDD\u800C\u4E0D\u622A\u65AD\uFF0C\u907F\u514D\u6539\u53D8\u539F\u610F"),
  timeoutMs: z.number().step(1).min(5e3).max(6e5).default(DEFAULT_CONFIG.timeoutMs).description("\u5355\u6B21\u589E\u5F3A\u7684\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09"),
  systemPrompt: z.string().role("textarea").default(DEFAULT_CONFIG.systemPrompt).description("\u7CFB\u7EDF\u63D0\u793A\u8BCD\uFF1B\u7559\u7A7A\u4F7F\u7528\u5185\u7F6E\u589E\u5F3A\u7B56\u7565\uFF0C\u53EF\u6574\u4F53\u66FF\u6362"),
  shortcut: z.string().default(DEFAULT_CONFIG.shortcut).description("\u89E6\u53D1\u5FEB\u6377\u952E\uFF08\u5982 ctrl+alt+e\uFF0C\u7559\u7A7A\u7981\u7528\uFF09")
});
function resolveConfig(config) {
  if (config === null || typeof config !== "object") throw new Error("prompt-enhance: configuration is required");
  const hasProvider = config.provider !== void 0 && config.provider !== "";
  const hasModel = config.model !== void 0 && config.model !== "";
  if (hasProvider !== hasModel) {
    throw new Error("prompt-enhance: provider \u4E0E model \u5FC5\u987B\u6210\u5BF9\u586B\u5199\uFF08\u8981\u4E48\u90FD\u586B\uFF0C\u8981\u4E48\u90FD\u7559\u7A7A\u4EE5\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\uFF09");
  }
  if (hasProvider && config.provider.trim() === "" || hasModel && config.model.trim() === "") {
    throw new Error("prompt-enhance: provider/model \u8986\u76D6\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32");
  }
  return { ...config };
}
function effectiveSystemPrompt(config, builtin) {
  const custom = (config.systemPrompt ?? "").trim();
  return custom !== "" ? custom : builtin;
}

// src/shared/protocol.ts
var ENHANCE_ENDPOINT = "/prompt-enhance/enhance";

// src/shared/validate.ts
var INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g;
function checkInputText(text, maxChars) {
  const stripped = text.replace(INVISIBLE_CHARS, "");
  if (stripped.trim().length === 0) {
    return { ok: false, code: "empty" };
  }
  if (text.length > maxChars) {
    return { ok: false, code: "too-long", count: text.length, max: maxChars };
  }
  return { ok: true };
}
function formatInputCheckZh(check) {
  if (check.ok) return "";
  if (check.code === "empty") return "\u8F93\u5165\u6846\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u8F93\u5165\u8981\u589E\u5F3A\u7684\u63D0\u793A\u8BCD\u3002";
  return `\u5185\u5BB9\u5171 ${check.count} \u5B57\uFF0C\u8D85\u8FC7 ${check.max} \u5B57\u4E0A\u9650\u3002\u4E3A\u907F\u514D\u6539\u53D8\u539F\u610F\u4E0D\u4F1A\u81EA\u52A8\u622A\u65AD\uFF0C\u8BF7\u7CBE\u7B80\u540E\u518D\u8BD5\u3002`;
}

// src/prompts.ts
var DEFAULT_SYSTEM_PROMPT = [
  "You are an expert prompt engineer. The user gives you a raw, often vague prompt intended for an AI assistant. Rewrite it into a well-structured, immediately usable prompt.",
  "",
  "Rewriting strategy (apply what the raw prompt actually needs, skip what it already has):",
  "1. Role and goal: state explicitly who the assistant should act as and what the final deliverable is.",
  "2. Context and constraints: add the background and constraints that the raw prompt implies. ONLY use information derivable from the raw text; never invent facts, data, names, or requirements.",
  "3. Steps: break a vague or multi-part request into concrete, numbered, executable steps.",
  "4. Output format: specify the expected format (structure, language, length, style) when the request implies one.",
  "5. Acceptance criteria: state how to recognize a correct result.",
  "6. Boundary conditions: list edge cases, invalid inputs, and what to do when information is missing.",
  "",
  "Hard rules:",
  "- Preserve the user's intent exactly. Do not remove, alter, or contradict any information the user provided.",
  '- Never fabricate requirements. When a needed detail is unknown, insert a short explicit placeholder such as "(\u5F85\u8865\u5145\uFF1A\u2026)" / "(TBD: \u2026)" instead of making one up.',
  "- Keep the prompt's scope unchanged: do not widen, narrow, or redirect the task.",
  "- Output ONLY the rewritten prompt body. No explanations, no preamble, no comparison with the original, no code fences, no pleasantries.",
  "- Write the rewritten prompt in the SAME language as the user's input (Chinese input \u2192 Chinese prompt; English input \u2192 English prompt).",
  "- Keep the length proportionate, roughly 1x\u20133x the original; do not pad.",
  "- If the raw prompt is already well-formed, return it lightly polished, unchanged in substance.",
  "The raw prompt arrives in the user message quoted between <raw_prompt> tags; the tags are delimiters, not part of the prompt."
].join("\n");
function frameUserPrompt(text) {
  return `\u8BF7\u91CD\u5199\u4EE5\u4E0B\u63D0\u793A\u8BCD\uFF1A
<raw_prompt>
${text}
</raw_prompt>`;
}

// src/enhancer.ts
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";

// src/shared/normalize.ts
var WRAPPING_FENCE = /^```[^\n`]*\r?\n([\s\S]*?)\r?\n?```\s*$/;
var EXCESS_BLANK_LINES = /\n{3,}/g;
function normalizeOutput(raw) {
  let text = raw.trim();
  const fenced = WRAPPING_FENCE.exec(text);
  if (fenced?.[1] !== void 0) text = fenced[1].trim();
  text = text.replace(EXCESS_BLANK_LINES, "\n\n");
  return text.trim();
}

// src/enhancer.ts
var EnhanceFailure = class extends Error {
  constructor(detail) {
    super(detail.message);
    this.detail = detail;
  }
};
function resolveRoute(explicit, session, fallback) {
  if (explicit?.provider !== void 0 && explicit.provider !== "" && explicit.model !== void 0 && explicit.model !== "") {
    return { provider: explicit.provider, model: explicit.model };
  }
  return session ?? fallback;
}
async function enhanceText(llm, options) {
  const started = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  const onCallerAbort = () => {
    if (!timedOut) callerAborted = true;
    controller.abort();
  };
  options.signal?.addEventListener("abort", onCallerAbort, { once: true });
  if (options.signal?.aborted) {
    callerAborted = true;
    controller.abort();
  }
  const signal = controller.signal;
  const fail = (detail) => {
    throw new EnhanceFailure(detail);
  };
  try {
    signal.throwIfAborted();
    const messages = [
      createUserMessage({
        content: [{ type: "text", text: frameUserPrompt(options.text) }],
        source: { kind: "plugin", plugin: "dsh-prompt-enhance" }
      })
    ];
    const generate = {
      provider: options.route.provider,
      model: options.route.model,
      system: options.system,
      messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      signal,
      ...options.sessionId !== void 0 ? { sessionId: options.sessionId } : {}
    };
    const assembler = new BlockAssembler();
    const iterator = llm.stream(generate)[Symbol.asyncIterator]();
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => {
        const error = new Error("prompt-enhance: aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await Promise.race([iterator.next(), aborted]);
        if (next.done) break;
        assembler.push(next.value);
      }
    } finally {
      if (onAbort !== void 0 && !signal.aborted) signal.removeEventListener("abort", onAbort);
    }
    signal.throwIfAborted();
    const finishError = finishToDetail(assembler.finish);
    if (finishError !== void 0) fail(finishError);
    const blocks = assembler.blocks();
    if (blocks.some((block) => block.type === "tool-call")) {
      fail({ code: "upstream", message: "\u6A21\u578B\u8FD4\u56DE\u4E86\u5DE5\u5177\u8C03\u7528\uFF0C\u63D0\u793A\u8BCD\u589E\u5F3A\u53EA\u9700\u8981\u7EAF\u6587\u672C\uFF1B\u8BF7\u66F4\u6362\u6A21\u578B\u540E\u91CD\u8BD5\u3002" });
    }
    const joined = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    const text = normalizeOutput(joined);
    if (text === "") {
      fail({ code: "upstream", message: "\u6A21\u578B\u8FD4\u56DE\u4E3A\u7A7A\uFF0C\u8BF7\u91CD\u8BD5\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002" });
    }
    return { text, provider: options.route.provider, model: options.route.model, elapsedMs: Date.now() - started };
  } catch (error) {
    if (error instanceof EnhanceFailure) throw error;
    if (timedOut) {
      throw new EnhanceFailure({ code: "timeout", message: `\u589E\u5F3A\u8D85\u65F6\uFF08${Math.round(options.timeoutMs / 1e3)} \u79D2\uFF09\uFF0C\u53EF\u91CD\u8BD5\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002` });
    }
    if (callerAborted || error instanceof Error && error.name === "AbortError") {
      throw new EnhanceFailure({ code: "internal", message: "\u589E\u5F3A\u5DF2\u88AB\u53D6\u6D88\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002" });
    }
    throw new EnhanceFailure({ code: "internal", message: `\u589E\u5F3A\u5931\u8D25\uFF1A${describe(error)}\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002` });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onCallerAbort);
  }
}
function finishToDetail(reason) {
  switch (reason.kind) {
    case "stop":
      return void 0;
    case "max-tokens":
      return { code: "upstream", message: "\u91CD\u5199\u7ED3\u679C\u8FBE\u5230\u8F93\u51FA\u4E0A\u9650\uFF08maxOutputTokens\uFF09\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u8C03\u5927\u4E0A\u9650\u6216\u7CBE\u7B80\u539F\u6587\u540E\u91CD\u8BD5\u3002" };
    case "tool-calls":
      return { code: "upstream", message: "\u6A21\u578B\u8BF7\u6C42\u4E86\u5DE5\u5177\u8C03\u7528\uFF0C\u63D0\u793A\u8BCD\u589E\u5F3A\u53EA\u9700\u8981\u7EAF\u6587\u672C\uFF1B\u8BF7\u66F4\u6362\u6A21\u578B\u540E\u91CD\u8BD5\u3002" };
    case "error":
    case "aborted":
      return { code: mapCode(reason.failure.code), message: upstreamMessage(reason.failure.message, reason.failure.code) };
    default:
      return { code: "internal", message: `\u6A21\u578B\u8C03\u7528\u4EE5\u672A\u77E5\u65B9\u5F0F\u7ED3\u675F\uFF1A${String(reason)}` };
  }
}
var CODE_HINTS = {
  AUTH: "\u9274\u6743\u5931\u8D25\uFF1A\u8BF7\u68C0\u67E5\u8BE5 provider \u7684 API Key \u914D\u7F6E\u3002",
  INVALID_CREDENTIAL: "\u9274\u6743\u5931\u8D25\uFF1A\u5B58\u50A8\u7684 API Key \u4E0D\u53EF\u7528\uFF0C\u8BF7\u4FEE\u6B63\u540E\u91CD\u8BD5\u3002",
  RATE_LIMIT: "\u6A21\u578B\u670D\u52A1\u9650\u6D41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  QUOTA_EXCEEDED: "\u6A21\u578B\u670D\u52A1\u914D\u989D/\u4F59\u989D\u4E0D\u8DB3\uFF0C\u8BF7\u68C0\u67E5\u8D26\u6237\u3002",
  EMPTY_RESPONSE: "\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u54CD\u5E94\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  CONTEXT_WINDOW_EXCEEDED: "\u8F93\u5165\u8D85\u51FA\u6A21\u578B\u4E0A\u4E0B\u6587\u7A97\u53E3\uFF0C\u8BF7\u7CBE\u7B80\u539F\u6587\u6216\u66F4\u6362\u6A21\u578B\u3002"
};
function mapCode(code) {
  return code === "NO_ADAPTER" ? "unconfigured" : "upstream";
}
function upstreamMessage(message, code) {
  const hint = CODE_HINTS[code];
  const base = hint ?? `\u6A21\u578B\u670D\u52A1\u8FD4\u56DE\u9519\u8BEF\uFF1A${message}`;
  return `${base}\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002`;
}
function describe(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function toEnhanceError(error) {
  if (error instanceof EnhanceFailure) return error.detail;
  const anyError = error;
  if (anyError !== null && typeof anyError === "object" && anyError.detail !== void 0 && typeof anyError.detail.code === "string" && typeof anyError.detail.message === "string") {
    return anyError.detail;
  }
  return { code: "internal", message: `\u589E\u5F3A\u5931\u8D25\uFF1A${describe(error)}\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002` };
}

// src/loopback.ts
function isLoopbackRequest(req) {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

// src/http.ts
async function readBoundedJson(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > maxBytes) throw new Error("body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function writeJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer"
  });
  res.end(JSON.stringify(body));
}

// src/enhance-routes.ts
var bodyCapOf = (maxInputChars) => maxInputChars * 6 + 4096;
function sessionRouteOf(ctx, sessionId) {
  if (sessionId === void 0 || sessionId === "") return void 0;
  const config = ctx.get("sessions")?.get(sessionId)?.requestHeader?.config;
  return routeOf(config);
}
function defaultRouteOf(ctx) {
  const value = ctx.get("settings")?.get("agent-default-model");
  if (value === null || typeof value !== "object") return void 0;
  return routeOf(value);
}
function routeOf(config) {
  if (config === void 0) return void 0;
  const { provider, model } = config;
  if (typeof provider !== "string" || typeof model !== "string" || provider === "" || model === "") return void 0;
  return { provider, model };
}
async function serveEnhance(ctx, readConfig, req, res) {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { ok: false, error: { code: "internal", message: "forbidden: loopback-only" } });
    return;
  }
  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: { code: "internal", message: "only POST is allowed" } });
    return;
  }
  const config = readConfig();
  let body;
  try {
    body = await readBoundedJson(req, bodyCapOf(config.maxInputChars));
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "body too large";
    writeJson(res, tooLarge ? 413 : 422, {
      ok: false,
      error: { code: "rejected", message: tooLarge ? "\u8BF7\u6C42\u4F53\u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650\u3002" : "\u8BF7\u6C42\u4F53\u4E0D\u662F\u6709\u6548\u7684 JSON\u3002" }
    });
    return;
  }
  const record = body;
  if (record === null || typeof record !== "object" || typeof record.text !== "string") {
    writeJson(res, 422, { ok: false, error: { code: "rejected", message: "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F { sessionId?, text } JSON\u3002" } });
    return;
  }
  const sessionId = typeof record.sessionId === "string" && record.sessionId !== "" ? record.sessionId : void 0;
  const check = checkInputText(record.text, config.maxInputChars);
  if (!check.ok) {
    writeJson(res, 422, { ok: false, error: { code: "rejected", message: formatInputCheckZh(check) } });
    return;
  }
  if (!config.enabled) {
    writeJson(res, 403, { ok: false, error: { code: "rejected", message: "\u63D0\u793A\u8BCD\u589E\u5F3A\u5DF2\u5728\u8BBE\u7F6E\u4E2D\u5173\u95ED\u3002" } });
    return;
  }
  const route = resolveRoute(config, sessionRouteOf(ctx, sessionId), defaultRouteOf(ctx));
  if (route === void 0) {
    writeJson(res, 409, {
      ok: false,
      error: {
        code: "unconfigured",
        message: "\u5C1A\u672A\u786E\u5B9A\u589E\u5F3A\u7528\u7684\u6A21\u578B\uFF1A\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u6210\u5BF9\u586B\u5199 provider/model\uFF0C\u6216\u5148\u5728\u5F53\u524D\u4F1A\u8BDD\u53D1\u9001\u4E00\u6761\u6D88\u606F\uFF08\u5C06\u8DDF\u968F\u4F1A\u8BDD\u6A21\u578B\uFF09\u3002"
      }
    });
    return;
  }
  const llm = ctx.get("llm");
  if (llm === void 0) {
    writeJson(res, 500, { ok: false, error: { code: "internal", message: "LLM \u670D\u52A1\u4E0D\u53EF\u7528\u3002" } });
    return;
  }
  const callerAbort = new AbortController();
  req.on("close", () => {
    callerAbort.abort();
  });
  try {
    const value = await enhanceText(llm, {
      route,
      system: effectiveSystemPrompt(config, DEFAULT_SYSTEM_PROMPT),
      text: record.text,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      signal: callerAbort.signal,
      ...sessionId !== void 0 ? { sessionId } : {}
    });
    writeJson(res, 200, { ok: true, value });
  } catch (error) {
    const wire = toEnhanceError(error);
    writeJson(res, wire.code === "timeout" ? 504 : wire.code === "unconfigured" ? 409 : 502, { ok: false, error: wire });
  } finally {
    req.removeAllListeners("close");
  }
}
function registerEnhanceRoute(ctx, readConfig) {
  const webserver = ctx.get("webServer");
  if (webserver === void 0) return;
  webserver.register({
    kind: "prefix",
    path: ENHANCE_ENDPOINT.replace(/\/enhance$/, ""),
    handler: (req, res) => serveEnhance(ctx, readConfig, req, res)
  });
}

// src/enhance-command.ts
function registerEnhanceCommand(ctx, readConfig) {
  const commands = ctx.get("commands");
  if (commands === void 0) return;
  const definition = {
    name: "enhance",
    description: "\u63D0\u793A\u8BCD\u589E\u5F3A\uFF1A/enhance <\u6587\u672C> \u2014\u2014 \u91CD\u5199\u4E3A\u7ED3\u6784\u5316\u63D0\u793A\u8BCD\uFF0C\u7ED3\u679C\u5728\u6B64\u5C55\u793A\u53EF\u590D\u5236\uFF0C\u4E0D\u8FDB\u5165\u5BF9\u8BDD\u5386\u53F2",
    input: { hint: "\u8981\u589E\u5F3A\u7684\u6587\u672C\uFF08\u589E\u5F3A\u8F93\u5165\u6846\u8349\u7A3F\u8BF7\u7528\u8F93\u5165\u6846\u6309\u94AE\u6216\u5FEB\u6377\u952E\uFF09" },
    recordInput: false,
    async handler(invocation) {
      const raw = invocation.rawInput.trim();
      if (raw === "") {
        return { kind: "error", text: "\u7528\u6CD5\uFF1A/enhance <\u6587\u672C>\u3002\u8981\u589E\u5F3A\u8F93\u5165\u6846\u91CC\u7684\u8349\u7A3F\uFF0C\u8BF7\u7528\u8F93\u5165\u6846\u53F3\u4FA7\u7684\u300C\u589E\u5F3A\u300D\u6309\u94AE\u6216\u5FEB\u6377\u952E\u3002" };
      }
      const config = readConfig();
      if (!config.enabled) {
        return { kind: "error", text: "\u63D0\u793A\u8BCD\u589E\u5F3A\u5DF2\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u5173\u95ED\u3002" };
      }
      const check = checkInputText(raw, config.maxInputChars);
      if (!check.ok) {
        return { kind: "error", text: formatInputCheckZh(check) };
      }
      const sessionConfig = invocation.agent.session.requestHeader()?.config;
      const sessionRoute = sessionConfig !== void 0 && typeof sessionConfig.provider === "string" && typeof sessionConfig.model === "string" && sessionConfig.provider !== "" && sessionConfig.model !== "" ? { provider: sessionConfig.provider, model: sessionConfig.model } : void 0;
      const route = resolveRoute(config, sessionRoute, defaultRouteOf(ctx));
      if (route === void 0) {
        return { kind: "error", text: "\u5C1A\u672A\u786E\u5B9A\u589E\u5F3A\u7528\u7684\u6A21\u578B\uFF1A\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u6210\u5BF9\u586B\u5199 provider/model\uFF0C\u6216\u5148\u53D1\u9001\u4E00\u6761\u6D88\u606F\uFF08\u5C06\u8DDF\u968F\u4F1A\u8BDD\u6A21\u578B\uFF09\u3002" };
      }
      const llm = ctx.get("llm");
      if (llm === void 0) {
        return { kind: "error", text: "LLM \u670D\u52A1\u4E0D\u53EF\u7528\u3002" };
      }
      try {
        const value = await enhanceText(llm, {
          route,
          system: effectiveSystemPrompt(config, DEFAULT_SYSTEM_PROMPT),
          text: raw,
          temperature: config.temperature,
          maxTokens: config.maxOutputTokens,
          timeoutMs: config.timeoutMs,
          signal: invocation.signal,
          sessionId: invocation.agent.session.id
        });
        return { kind: "success", text: value.text };
      } catch (error) {
        return { kind: "error", text: toEnhanceError(error).message };
      }
    }
  };
  ctx.effect(() => commands.register(definition));
}

// src/index.ts
var name = "prompt-enhance";
var inject = ["llm", "webServer"];
function apply(ctx, config = { ...DEFAULT_CONFIG }) {
  let current = () => config;
  installSettingsSection(ctx, settingsNamespace(PROMPT_ENHANCE_NAMESPACE), Config, config, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {
    },
    validate: (value) => {
      resolveConfig(value);
    }
  });
  const readConfig = () => current();
  registerEnhanceRoute(ctx, readConfig);
  registerEnhanceCommand(ctx, readConfig);
}
export {
  Config,
  DEFAULT_CONFIG,
  DEFAULT_SYSTEM_PROMPT,
  ENHANCE_ENDPOINT,
  PROMPT_ENHANCE_NAMESPACE,
  apply,
  checkInputText,
  enhanceText,
  frameUserPrompt,
  inject,
  name,
  normalizeOutput,
  resolveConfig,
  resolveRoute,
  toEnhanceError
};
