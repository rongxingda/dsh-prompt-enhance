window.__ModuleLoader__.load({
	id: "dsh-prompt-enhance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  NS: () => NS,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/EnhanceButton.tsx
var import_react2 = require("react");
var import_react_dom = require("react-dom");

// src/shared/validate.ts
var INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g;
function countText(text) {
  return [...text].length;
}
function checkInputText(text, maxChars) {
  const stripped = text.replace(INVISIBLE_CHARS, "");
  if (stripped.trim().length === 0) {
    return { ok: false, code: "empty" };
  }
  const codePoints = countText(text);
  if (codePoints > maxChars) {
    return { ok: false, code: "too-long", count: codePoints, max: maxChars };
  }
  return { ok: true };
}

// src/shared/protocol.ts
var ENHANCE_ENDPOINT = "/prompt-enhance/enhance";

// src/client/enhance-client.ts
var EnhanceClientError = class extends Error {
  constructor(detail) {
    super(detail.message);
    this.detail = detail;
  }
};
var KNOWN_ERROR_CODES = /* @__PURE__ */ new Set([
  "rejected",
  "rate-limit",
  "concurrency-limit",
  "timeout",
  "upstream",
  "unconfigured",
  "internal"
]);
function parseError(value) {
  const record = value;
  if (record !== null && typeof record === "object") {
    const code = typeof record.code === "string" && KNOWN_ERROR_CODES.has(record.code) ? record.code : "internal";
    const message = typeof record.message === "string" && record.message !== "" ? record.message : void 0;
    const params = record.params !== null && typeof record.params === "object" ? record.params : void 0;
    return { code, ...message !== void 0 ? { message } : {}, ...params !== void 0 ? { params } : {} };
  }
  return { code: "internal", message: "\u5BBF\u4E3B\u670D\u52A1\u8FD4\u56DE\u5F02\u5E38\u3002" };
}
function parseResult(value) {
  const record = value;
  if (record !== null && typeof record === "object" && typeof record.text === "string" && record.text !== "" && typeof record.provider === "string" && record.provider !== "" && typeof record.model === "string" && record.model !== "" && typeof record.elapsedMs === "number" && Number.isFinite(record.elapsedMs)) {
    return { text: record.text, provider: record.provider, model: record.model, elapsedMs: record.elapsedMs };
  }
  throw new EnhanceClientError({ code: "internal", message: "\u5BBF\u4E3B\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u7ED3\u679C\u3002" });
}
async function readEnvelope(response) {
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    throw new EnhanceClientError({ code: "internal", message: "\u5BBF\u4E3B\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\u3002" });
  }
  const envelope = parsed;
  if (envelope !== null && typeof envelope === "object" && envelope.ok === true) {
    return parseResult(envelope.value);
  }
  if (envelope !== null && typeof envelope === "object" && envelope.error !== void 0) {
    throw new EnhanceClientError(parseError(envelope.error));
  }
  throw new EnhanceClientError({ code: "internal", message: `\u5BBF\u4E3B\u670D\u52A1\u8FD4\u56DE\u5F02\u5E38\uFF08HTTP ${response.status}\uFF09\u3002` });
}
async function requestEnhance(body, signal) {
  let response;
  try {
    response = await fetch(ENHANCE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new EnhanceClientError({ code: "internal", message: "\u5DF2\u53D6\u6D88\u589E\u5F3A\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002" });
    }
    void error;
    throw new EnhanceClientError({ code: "internal", message: "\u65E0\u6CD5\u8FDE\u63A5\u5BBF\u4E3B\u670D\u52A1\uFF0C\u8BF7\u786E\u8BA4 dsh web \u6B63\u5728\u8FD0\u884C\u540E\u91CD\u8BD5\u3002" });
  }
  return readEnvelope(response);
}

// src/client/ResultPanel.tsx
var import_react = require("react");

// src/client/locales.ts
var zh = {
  "button.title": "\u63D0\u793A\u8BCD\u589E\u5F3A\uFF08\u91CD\u5199\u4E3A\u7ED3\u6784\u5316\u63D0\u793A\u8BCD\uFF09",
  "button.busy": "\u6B63\u5728\u589E\u5F3A\u2026",
  "panel.title": "\u63D0\u793A\u8BCD\u589E\u5F3A",
  "panel.loading": "\u6B63\u5728\u589E\u5F3A\uFF0C\u7A0D\u5019\u2026",
  "panel.loading.hint": "\u539F\u6587\u4FDD\u7559\u5728\u8F93\u5165\u6846\u4E2D\uFF0C\u4E0D\u4F1A\u88AB\u52A8\u4FEE\u6539\u3002",
  "panel.cancel": "\u53D6\u6D88",
  "panel.original": "\u539F\u59CB\u63D0\u793A\u8BCD",
  "panel.enhanced": "\u589E\u5F3A\u7ED3\u679C",
  "panel.apply": "\u56DE\u586B\u5230\u8F93\u5165\u6846",
  "panel.copy": "\u590D\u5236\u7ED3\u679C",
  "panel.copied": "\u5DF2\u590D\u5236",
  "panel.copyFailed": "\u590D\u5236\u5931\u8D25",
  "panel.close": "\u5173\u95ED",
  "panel.retry": "\u91CD\u8BD5",
  "panel.stale.warn": "\u8349\u7A3F\u5728\u589E\u5F3A\u671F\u95F4\u6709\u6539\u52A8\u2014\u2014\u589E\u5F3A\u7ED3\u679C\u57FA\u4E8E\u589E\u5F3A\u524D\u7684\u6587\u672C\u3002\u56DE\u586B\u5C06\u8986\u76D6\u4F60\u7684\u6700\u65B0\u7F16\u8F91(\u64A4\u9500\u53EF\u6062\u590D\u56DE\u586B\u524D\u7684\u8349\u7A3F)\u3002",
  "panel.model": "\u6A21\u578B\uFF1A{provider} / {model}",
  "panel.elapsed": "\u8017\u65F6 {ms}",
  "undo.applied": "\u5DF2\u7528\u589E\u5F3A\u7ED3\u679C\u66FF\u6362\u539F\u63D0\u793A\u8BCD",
  "undo.undo": "\u64A4\u9500",
  "undo.dismiss": "\u5173\u95ED\u63D0\u793A",
  "error.empty": "\u8F93\u5165\u6846\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u8F93\u5165\u8981\u589E\u5F3A\u7684\u63D0\u793A\u8BCD\u3002",
  "error.tooLong": "\u5185\u5BB9\u5171 {count} \u4E2A\u5B57\u7B26\uFF0C\u8D85\u8FC7 {max} \u4E2A\u5B57\u7B26\u4E0A\u9650\uFF08\u6309 Unicode \u5B57\u7B26\u6570\u7EDF\u8BA1\uFF0C\u4E0D\u662F token \u6570\uFF09\u3002\u4E3A\u907F\u514D\u6539\u53D8\u539F\u610F\u4E0D\u4F1A\u81EA\u52A8\u622A\u65AD\uFF0C\u8BF7\u7CBE\u7B80\u540E\u518D\u8BD5\u3002",
  "error.imagesOnly": "\u5F53\u524D\u53EA\u9644\u52A0\u4E86\u56FE\u7247\uFF0C\u4EC5\u652F\u6301\u589E\u5F3A\u6587\u672C\u5185\u5BB9\u3002",
  "error.occurrences": "\u8F93\u5165\u5185\u5BB9\u5305\u542B\u547D\u4EE4\u6216\u6587\u4EF6\u5F15\u7528\uFF0C\u6682\u4E0D\u652F\u6301\u589E\u5F3A\uFF1B\u8BF7\u5148\u79FB\u9664\u540E\u518D\u8BD5\u3002",
  "error.phase": "\u5F53\u524D\u8F93\u5165\u6B63\u88AB\u5360\u7528\uFF08\u63D0\u4EA4\u4E2D\uFF09\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002",
  "error.disabled": "\u63D0\u793A\u8BCD\u589E\u5F3A\u5DF2\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u5173\u95ED\u3002",
  "error.rejected": "\u589E\u5F3A\u8BF7\u6C42\u88AB\u62D2\u7EDD\u3002",
  "error.timeout": "\u589E\u5F3A\u8D85\u65F6\uFF08{seconds} \u79D2\uFF09\uFF0C\u8BF7\u91CD\u8BD5\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002",
  "error.unconfigured": "\u5C1A\u672A\u786E\u5B9A\u589E\u5F3A\u7528\u7684\u6A21\u578B\uFF1A\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u6210\u5BF9\u586B\u5199 provider/model\uFF0C\u6216\u5148\u5728\u5F53\u524D\u4F1A\u8BDD\u53D1\u9001\u4E00\u6761\u6D88\u606F\uFF08\u5C06\u8DDF\u968F\u4F1A\u8BDD\u6A21\u578B\uFF09\u3002",
  "error.upstream": "\u6A21\u578B\u670D\u52A1\u8FD4\u56DE\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002",
  "error.internal": "\u589E\u5F3A\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\uFF1B\u539F\u8F93\u5165\u672A\u6539\u52A8\u3002",
  "error.rateLimit": "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF1A\u6BCF\u5206\u949F\u6700\u591A {limit} \u6B21\u589E\u5F3A\uFF0C\u8BF7\u5728 {retryAfterSeconds} \u79D2\u540E\u518D\u8BD5\u3002",
  "error.concurrencyLimit": "\u5DF2\u6709 {max} \u4E2A\u589E\u5F3A\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7B49\u5176\u4E2D\u4E00\u4E2A\u5B8C\u6210\u540E\u518D\u8BD5\u3002",
  "error.upstream.auth": "\u9274\u6743\u5931\u8D25\uFF1A\u8BF7\u68C0\u67E5\u8BE5 provider \u7684 API Key \u914D\u7F6E\u3002",
  "error.upstream.invalidCredential": "\u9274\u6743\u5931\u8D25\uFF1A\u5B58\u50A8\u7684 API Key \u4E0D\u53EF\u7528\uFF0C\u8BF7\u4FEE\u6B63\u540E\u91CD\u8BD5\u3002",
  "error.upstream.rateLimit": "\u6A21\u578B\u670D\u52A1\u9650\u6D41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "error.upstream.quota": "\u6A21\u578B\u670D\u52A1\u914D\u989D/\u4F59\u989D\u4E0D\u8DB3\uFF0C\u8BF7\u68C0\u67E5\u8D26\u6237\u3002",
  "error.upstream.empty": "\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u54CD\u5E94\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "error.upstream.contextWindow": "\u8F93\u5165\u8D85\u51FA\u6A21\u578B\u4E0A\u4E0B\u6587\u7A97\u53E3\uFF0C\u8BF7\u7CBE\u7B80\u539F\u6587\u6216\u66F4\u6362\u6A21\u578B\u3002",
  "error.upstream.toolCall": "\u6A21\u578B\u8BF7\u6C42\u4E86\u5DE5\u5177\u8C03\u7528\uFF0C\u63D0\u793A\u8BCD\u589E\u5F3A\u53EA\u9700\u8981\u7EAF\u6587\u672C\uFF1B\u8BF7\u66F4\u6362\u6A21\u578B\u540E\u91CD\u8BD5\u3002",
  "error.upstream.maxTokens": "\u91CD\u5199\u7ED3\u679C\u8FBE\u5230\u8F93\u51FA\u4E0A\u9650\uFF08maxOutputTokens\uFF09\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u8C03\u5927\u4E0A\u9650\u6216\u7CBE\u7B80\u539F\u6587\u540E\u91CD\u8BD5\u3002"
};
var en = {
  "button.title": "Enhance prompt (rewrite into a structured prompt)",
  "button.busy": "Enhancing\u2026",
  "panel.title": "Prompt Enhance",
  "panel.loading": "Enhancing, please wait\u2026",
  "panel.loading.hint": "Your draft stays untouched until you apply the result.",
  "panel.cancel": "Cancel",
  "panel.original": "Original prompt",
  "panel.enhanced": "Enhanced result",
  "panel.apply": "Fill into input box",
  "panel.copy": "Copy result",
  "panel.copied": "Copied",
  "panel.copyFailed": "Copy failed",
  "panel.close": "Close",
  "panel.retry": "Retry",
  "panel.stale.warn": "The draft changed while enhancing \u2014 the result is based on the pre-enhance text. Applying will overwrite your latest edits (undo restores the draft as it was before applying).",
  "panel.model": "Model: {provider} / {model}",
  "panel.elapsed": "{ms} elapsed",
  "undo.applied": "Original prompt replaced by the enhanced version",
  "undo.undo": "Undo",
  "undo.dismiss": "Dismiss",
  "error.empty": "The input box is empty \u2014 type a prompt to enhance first.",
  "error.tooLong": "The draft is {count} characters, above the {max} cap (Unicode characters, not tokens). It is never auto-truncated (that would change your meaning) \u2014 please shorten it.",
  "error.imagesOnly": "Only images are attached; prompt enhance supports text only.",
  "error.occurrences": "The draft contains commands or file references, which are not supported yet \u2014 remove them first.",
  "error.phase": "The input box is busy (submitting) \u2014 try again in a moment.",
  "error.disabled": "Prompt enhance is disabled in the plugin settings.",
  "error.rejected": "The enhance request was rejected.",
  "error.timeout": "The enhancement timed out ({seconds}s). Retry; your draft is untouched.",
  "error.unconfigured": "No model resolved for the enhancement: pair provider/model in the plugin settings, or send a message in the current session first (the enhancement will follow the session model).",
  "error.upstream": "The model provider returned an error. Retry; your draft is untouched.",
  "error.internal": "Enhancement failed. Retry; your draft is untouched.",
  "error.rateLimit": "Too many requests \u2014 at most {limit} enhancements per minute; retry in {retryAfterSeconds} seconds.",
  "error.concurrencyLimit": "{max} enhancements are already running \u2014 wait for one to finish, then retry.",
  "error.upstream.auth": "Authentication failed \u2014 check the API key configured for this provider.",
  "error.upstream.invalidCredential": "Authentication failed \u2014 the stored API key is invalid; fix it and retry.",
  "error.upstream.rateLimit": "The model provider is rate-limiting; retry later.",
  "error.upstream.quota": "The model provider reports a quota/balance issue \u2014 check your account.",
  "error.upstream.empty": "The model returned an empty response; retry.",
  "error.upstream.contextWindow": "The input exceeds the model context window \u2014 shorten it or switch models.",
  "error.upstream.toolCall": "The model requested tool calls, but prompt enhance needs plain text \u2014 switch models and retry.",
  "error.upstream.maxTokens": "The rewrite hit the output cap (maxOutputTokens) \u2014 raise it in settings or shorten the draft."
};
var dictionaries = { zh, en };
var NS = "prompt-enhance";

// src/client/ResultPanel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var retryable = (code) => code === "upstream" || code === "timeout" || code === "internal";
function localizedErrorMessage(t, code, params) {
  if (code === "rejected" && typeof params?.count === "number" && typeof params?.max === "number") {
    return t("error.tooLong", { count: params.count, max: params.max });
  }
  if (code === "upstream" && typeof params?.reason === "string") {
    const specific = `error.upstream.${params.reason}`;
    if (specific in zh) return t(specific);
  }
  switch (code) {
    case "rejected":
      return t("error.rejected");
    case "rate-limit":
      return t("error.rateLimit", params);
    case "concurrency-limit":
      return t("error.concurrencyLimit", params);
    case "timeout":
      return t("error.timeout", params);
    case "unconfigured":
      return t("error.unconfigured");
    case "upstream":
      return t("error.upstream");
    default:
      return t("error.internal");
  }
}
function fallbackCopy(text) {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
function ResultPanel(props) {
  const { state, t, onApply, onCancel, onRetry } = props;
  const [copied, setCopied] = (0, import_react.useState)("idle");
  const panelRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    const onKeyDown = (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (panel === null) return;
        const focusables = panel.querySelectorAll('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])');
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (first === void 0 || last === void 0) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);
  (0, import_react.useEffect)(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, []);
  const copy = (0, import_react.useCallback)(() => {
    if (state.result === void 0) return;
    const text = state.result.text;
    const done = (ok) => setCopied(ok ? "ok" : "failed");
    if (navigator.clipboard !== void 0) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(fallbackCopy(text)));
      return;
    }
    done(fallbackCopy(text));
  }, [state.result]);
  const formatMs = (ms) => ms < 1e3 ? `${ms}ms` : `${(ms / 1e3).toFixed(1)}s`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pe-overlay", onMouseDown: (event) => {
    if (event.target === event.currentTarget) onCancel();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "section",
    {
      ref: panelRef,
      className: "dsh-pe-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("panel.title"),
      tabIndex: -1,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "dsh-pe-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            "\u2728 ",
            t("panel.title")
          ] }),
          state.phase === "result" && state.result !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-pe-meta", children: [
            t("panel.model", { provider: state.result.provider, model: state.result.model }),
            " \xB7 ",
            t("panel.elapsed", { ms: formatMs(state.result.elapsedMs) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pe-close", "aria-label": t("panel.close"), onClick: onCancel, children: "\u2715" })
        ] }),
        state.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pe-loading", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pe-spin", "aria-hidden": true }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: t("panel.loading") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pe-hint", children: t("panel.loading.hint") })
        ] }),
        state.phase === "error" && state.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pe-error", children: state.error.localized !== void 0 ? (
          // Client-side guard failures carry their own pre-localized copy.
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: state.error.localized })
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: localizedErrorMessage(t, state.error.code, state.error.params) }),
          state.error.message !== void 0 && state.error.message !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pe-error-detail", children: state.error.message })
        ] }) }),
        state.phase === "result" && state.result !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pe-body", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pe-col", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pe-col-title", children: t("panel.original") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "dsh-pe-col-text", children: state.original })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pe-col", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-pe-col-title", children: t("panel.enhanced") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "dsh-pe-col-text", children: state.result.text })
          ] })
        ] }),
        state.phase === "result" && state.stale && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-pe-stale", children: [
          "\u26A0 ",
          t("panel.stale.warn")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "dsh-pe-foot", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-pe-grow" }),
          state.phase === "error" && retryable(state.error?.code) && onRetry !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pe-btn-action plain", onClick: onRetry, children: t("panel.retry") }),
          state.phase === "result" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pe-btn-action plain", onClick: copy, children: copied === "ok" ? t("panel.copied") : copied === "failed" ? t("panel.copyFailed") : t("panel.copy") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pe-btn-action primary", onClick: onApply, children: t("panel.apply") })
          ] }),
          state.phase !== "result" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-pe-btn-action plain", onClick: onCancel, children: state.phase === "loading" ? t("panel.cancel") : t("panel.close") })
        ] })
      ]
    }
  ) });
}

// src/client/undo-stack.ts
function totalOf(stacks) {
  let n = 0;
  for (const stack of stacks.values()) n += stack.length;
  return n;
}
function createUndoStack(maxDepth = 3, maxTotalEntries = 60) {
  const stacks = /* @__PURE__ */ new Map();
  return {
    push(sessionId, entry) {
      const stack = stacks.get(sessionId) ?? [];
      stack.push(entry);
      while (stack.length > maxDepth) stack.shift();
      stacks.delete(sessionId);
      stacks.set(sessionId, stack);
      while (totalOf(stacks) > maxTotalEntries) {
        const oldest = stacks.keys().next().value;
        if (oldest === void 0) break;
        stacks.delete(oldest);
      }
    },
    peek(sessionId) {
      const stack = stacks.get(sessionId);
      return stack === void 0 || stack.length === 0 ? void 0 : stack[stack.length - 1];
    },
    pop(sessionId) {
      const stack = stacks.get(sessionId);
      const entry = stack?.pop();
      if (stack !== void 0 && stack.length === 0) stacks.delete(sessionId);
      return entry;
    },
    clear(sessionId) {
      stacks.delete(sessionId);
    },
    depth(sessionId) {
      return stacks.get(sessionId)?.length ?? 0;
    }
  };
}

// src/client/ui-state.ts
var listeners = /* @__PURE__ */ new Set();
var panelState;
var version = 0;
function notify() {
  version++;
  for (const listener of listeners) listener();
}
var undoStore = createUndoStack(3);
function pushUndo(sessionId, entry) {
  undoStore.push(sessionId, entry);
  notify();
}
function peekUndo(sessionId) {
  return undoStore.peek(sessionId);
}
function popUndo(sessionId) {
  const entry = undoStore.pop(sessionId);
  notify();
  return entry;
}
var sessions = /* @__PURE__ */ new Map();
var lastMountedSession;
function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getVersion() {
  return version;
}
function getPanel() {
  return panelState;
}
function openLoading(state) {
  panelState?.abort?.();
  panelState = { ...state, phase: "loading" };
  notify();
}
function settleResult(sessionId, result) {
  if (panelState?.sessionId !== sessionId || panelState.phase !== "loading") return;
  panelState = { sessionId, phase: "result", original: panelState.original, result };
  notify();
}
function settleError(sessionId, error) {
  if (panelState?.sessionId !== sessionId || panelState.phase !== "loading") return;
  panelState = { sessionId, phase: "error", original: panelState.original, error };
  notify();
}
function openError(sessionId, original, error) {
  panelState?.abort?.();
  panelState = { sessionId, phase: "error", original, error };
  notify();
}
function setStale(sessionId, stale) {
  if (panelState?.sessionId !== sessionId || panelState.phase !== "result" || panelState.stale === stale) return;
  panelState = { ...panelState, stale };
  notify();
}
function closePanel() {
  panelState?.abort?.();
  if (panelState === void 0) return;
  panelState = void 0;
  notify();
}
function registerSession(sessionId, entry) {
  sessions.set(sessionId, entry);
  lastMountedSession = sessionId;
  notify();
  return () => {
    if (sessions.get(sessionId) === entry) sessions.delete(sessionId);
    if (lastMountedSession === sessionId) {
      const keys = [...sessions.keys()];
      lastMountedSession = keys[keys.length - 1];
    }
    if (panelState?.sessionId === sessionId) closePanel();
    undoStore.clear(sessionId);
    notify();
  };
}
function shortcutTarget() {
  const active = document.activeElement;
  if (active !== null && active instanceof Element) {
    let node = active;
    for (let depth = 0; depth < 8 && node !== null; depth++) {
      for (const entry of sessions.values()) {
        if (entry.root !== null && (node === entry.root || node.contains(entry.root))) {
          const found = entry;
          return () => found.run();
        }
      }
      node = node.parentElement;
    }
  }
  const fallback = lastMountedSession !== void 0 ? sessions.get(lastMountedSession) : void 0;
  return fallback === void 0 ? void 0 : () => fallback.run();
}

// src/client/settings.ts
var DEFAULT_CLIENT_SETTINGS = {
  enabled: true,
  maxInputChars: 12e3,
  shortcut: "ctrl+alt+e"
};
var listeners2 = /* @__PURE__ */ new Set();
var current = DEFAULT_CLIENT_SETTINGS;
function setClientSettings(next) {
  current = next;
  for (const listener of listeners2) listener();
}
function getClientSettings() {
  return current;
}
function subscribeClientSettings(listener) {
  listeners2.add(listener);
  return () => {
    listeners2.delete(listener);
  };
}
function decodeClientSettings(section) {
  const record = section;
  if (record === null || typeof record !== "object") return DEFAULT_CLIENT_SETTINGS;
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_CLIENT_SETTINGS.enabled,
    maxInputChars: typeof record.maxInputChars === "number" && Number.isFinite(record.maxInputChars) && record.maxInputChars > 0 ? Math.floor(record.maxInputChars) : DEFAULT_CLIENT_SETTINGS.maxInputChars,
    shortcut: typeof record.shortcut === "string" ? record.shortcut : DEFAULT_CLIENT_SETTINGS.shortcut
  };
}

// src/client/EnhanceButton.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function EnhanceButton(props) {
  const { t, sessionId, useInput, inputActions } = props;
  const draft = useInput((state) => state.draft);
  const phase = useInput((state) => state.phase);
  const occurrenceCount = useInput((state) => state.occurrences.length);
  const imageCount = useInput((state) => state.imageIds.length);
  const settings = (0, import_react2.useSyncExternalStore)(subscribeClientSettings, getClientSettings);
  const panel = (0, import_react2.useSyncExternalStore)(subscribe, getPanel);
  const rootRef = (0, import_react2.useRef)(null);
  const busy = panel !== void 0 && panel.sessionId === sessionId && panel.phase === "loading";
  const anyBusy = panel !== void 0 && panel.phase === "loading";
  const start = (0, import_react2.useCallback)(() => {
    if (anyBusy) return;
    if (!settings.enabled) {
      openError(sessionId, draft, { code: "rejected", message: t("error.disabled"), localized: t("error.disabled") });
      return;
    }
    if (imageCount > 0 && draft.trim() === "") {
      openError(sessionId, draft, { code: "rejected", message: t("error.imagesOnly"), localized: t("error.imagesOnly") });
      return;
    }
    const check = checkInputText(draft, settings.maxInputChars);
    if (!check.ok) {
      const message = check.code === "empty" ? t("error.empty") : t("error.tooLong", { count: check.count, max: check.max });
      openError(sessionId, draft, { code: "rejected", message, localized: message });
      return;
    }
    if (occurrenceCount > 0) {
      openError(sessionId, draft, { code: "rejected", message: t("error.occurrences"), localized: t("error.occurrences") });
      return;
    }
    if (phase !== "plain") {
      openError(sessionId, draft, { code: "rejected", message: t("error.phase"), localized: t("error.phase") });
      return;
    }
    const controller = new AbortController();
    openLoading({ sessionId, original: draft, abort: () => controller.abort() });
    requestEnhance({ sessionId, text: draft }, controller.signal).then(
      (result) => settleResult(sessionId, result),
      (error) => {
        const detail = error instanceof EnhanceClientError ? error.detail : { code: "internal", message: error instanceof Error ? error.message : String(error) };
        settleError(sessionId, detail);
      }
    );
  }, [anyBusy, draft, imageCount, occurrenceCount, phase, sessionId, settings, t]);
  const runRef = (0, import_react2.useRef)(start);
  (0, import_react2.useEffect)(() => {
    runRef.current = start;
  });
  (0, import_react2.useEffect)(() => {
    const entry = {
      root: rootRef.current,
      run: () => runRef.current()
    };
    return registerSession(sessionId, entry);
  }, [sessionId]);
  (0, import_react2.useEffect)(() => {
    if (panel !== void 0 && panel.sessionId === sessionId && panel.phase === "result") {
      setStale(sessionId, draft !== panel.original);
    }
  }, [draft, panel, sessionId]);
  const apply2 = (0, import_react2.useCallback)(() => {
    if (panel === void 0 || panel.phase !== "result" || panel.result === void 0) return;
    pushUndo(sessionId, { original: draft, applied: panel.result.text });
    inputActions.setDraft(panel.result.text);
    closePanel();
  }, [draft, inputActions, panel, sessionId]);
  if (!settings.enabled) return null;
  const owned = panel !== void 0 && panel.sessionId === sessionId ? panel : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        ref: rootRef,
        type: "button",
        className: `dsh-pe-btn${busy ? " is-busy" : ""}`,
        title: busy ? t("button.busy") : t("button.title"),
        "aria-label": t("button.title"),
        disabled: anyBusy && !busy,
        onClick: start,
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-pe-btn-icon", "aria-hidden": true, children: busy ? "\u25CC" : "\u2728" })
      }
    ),
    owned !== void 0 && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        ResultPanel,
        {
          state: owned,
          t,
          onApply: apply2,
          onCancel: () => closePanel(),
          onRetry: owned.phase === "error" ? start : void 0
        }
      ),
      document.body
    )
  ] });
}

// src/client/UndoBar.tsx
var import_react3 = require("react");
var import_react4 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function UndoBar(props) {
  const { t, sessionId, useInput, inputActions } = props;
  const draft = useInput((state) => state.draft);
  (0, import_react4.useSyncExternalStore)(subscribe, getVersion);
  const entry = peekUndo(sessionId);
  (0, import_react3.useEffect)(() => {
    if (entry !== void 0 && entry.applied !== draft) popUndo(sessionId);
  }, [draft, entry, sessionId]);
  if (entry === void 0 || entry.applied !== draft) return null;
  const undo = () => {
    inputActions.setDraft(entry.original);
    popUndo(sessionId);
  };
  const dismiss = () => {
    popUndo(sessionId);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-pe-undo", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-pe-undo-check", "aria-hidden": true, children: "\u2713" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("undo.applied") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "dsh-pe-undo-link", onClick: undo, children: t("undo.undo") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "dsh-pe-undo-x", "aria-label": t("undo.dismiss"), onClick: dismiss, children: "\u2715" })
  ] });
}

// src/client/styles.ts
var STYLE_ID = "dsh-prompt-enhance-styles";
var CSS = `
.dsh-pe-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--dsh-pe-z-index, 1000);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  padding: 24px 16px;
}
.dsh-pe-panel {
  --pe-bg: #1f2127;
  --pe-fg: #e6e8ee;
  --pe-fg-dim: rgba(230, 232, 238, 0.55);
  --pe-border: rgba(127, 127, 127, 0.35);
  --pe-separator: rgba(127, 127, 127, 0.25);
  --pe-hover: rgba(127, 127, 127, 0.18);
  --pe-danger: #ffb4a8;
  --pe-warn-fg: #e8c07d;
  --pe-warn-border: rgba(230, 158, 60, 0.35);
  --pe-warn-bg: rgba(230, 158, 60, 0.12);
  display: flex;
  flex-direction: column;
  width: min(880px, 100%);
  max-height: min(70vh, 640px);
  border-radius: 12px;
  border: 1px solid var(--pe-border);
  background: var(--pe-bg);
  color: var(--pe-fg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  outline: none;
}
@media (prefers-color-scheme: light) {
  .dsh-pe-panel {
    --pe-bg: #ffffff;
    --pe-fg: #1c1e24;
    --pe-fg-dim: rgba(28, 30, 36, 0.55);
    --pe-border: rgba(0, 0, 0, 0.18);
    --pe-separator: rgba(0, 0, 0, 0.12);
    --pe-hover: rgba(0, 0, 0, 0.08);
    --pe-danger: #a63a2e;
    --pe-warn-fg: #8a5a00;
    --pe-warn-border: rgba(176, 122, 0, 0.4);
    --pe-warn-bg: rgba(230, 158, 60, 0.15);
  }
}
.dsh-pe-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--pe-separator);
  font-size: 13px;
  font-weight: 600;
}
.dsh-pe-head .dsh-pe-meta { margin-left: auto; font-weight: 400; font-size: 11px; opacity: 0.6; }
.dsh-pe-close {
  border: none; background: transparent; color: inherit; opacity: 0.6;
  font-size: 15px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
}
.dsh-pe-close:hover { opacity: 1; background: var(--pe-hover); }
.dsh-pe-body { display: flex; flex: 1; min-height: 0; }
.dsh-pe-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.dsh-pe-col + .dsh-pe-col { border-left: 1px solid var(--pe-separator); }
.dsh-pe-col-title {
  padding: 8px 14px 6px;
  font-size: 11px;
  letter-spacing: 0.04em;
  opacity: 0.55;
}
.dsh-pe-col-text {
  flex: 1;
  margin: 0;
  padding: 0 14px 12px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
}
.dsh-pe-error {
  padding: 20px 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--pe-danger);
  white-space: pre-wrap;
}
.dsh-pe-error .dsh-pe-error-detail {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.75;
  color: inherit;
}
.dsh-pe-loading {
  display: flex; flex-direction: column; gap: 8px;
  align-items: center; justify-content: center;
  flex: 1; padding: 28px 16px; font-size: 13px;
}
.dsh-pe-loading .dsh-pe-hint { font-size: 11px; opacity: 0.55; }
.dsh-pe-spin {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--pe-separator); border-top-color: #6ea8ff;
  animation: dsh-pe-spin 0.9s linear infinite;
}
.dsh-pe-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--pe-separator);
}
.dsh-pe-foot .dsh-pe-grow { flex: 1; }
.dsh-pe-btn-action {
  border: none; border-radius: 6px; padding: 6px 14px;
  font-size: 12px; cursor: pointer; line-height: 1;
}
.dsh-pe-btn-action.primary { background: #3f76e1; color: #fff; }
.dsh-pe-btn-action.primary:hover { background: #4d82ec; }
.dsh-pe-btn-action.plain { background: var(--pe-hover); color: inherit; }
.dsh-pe-btn-action.plain:hover { background: rgba(127, 127, 127, 0.3); }

.dsh-pe-stale {
  padding: 8px 14px;
  font-size: 12px;
  line-height: 1.5;
  border-top: 1px solid var(--pe-warn-border);
  background: var(--pe-warn-bg);
  color: var(--pe-warn-fg);
}

.dsh-pe-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  opacity: 0.75;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}
.dsh-pe-btn:hover:not(:disabled) { opacity: 1; background: var(--pe-hover); }
.dsh-pe-btn:disabled { opacity: 0.45; cursor: default; }
.dsh-pe-btn .dsh-pe-btn-icon { font-size: 14px; }
.dsh-pe-btn.is-busy .dsh-pe-btn-icon { animation: dsh-pe-spin 1s linear infinite; }
@keyframes dsh-pe-spin { to { transform: rotate(360deg); } }

.dsh-pe-undo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  font-size: 12px;
  color: inherit;
  opacity: 0.85;
}
.dsh-pe-undo .dsh-pe-undo-check { color: #7ed491; }
.dsh-pe-undo-link {
  border: none; background: var(--pe-hover); color: inherit;
  border-radius: 5px; padding: 3px 10px; font-size: 12px; cursor: pointer;
}
.dsh-pe-undo-link:hover { background: rgba(127,127,127,0.3); }
.dsh-pe-undo-x {
  border: none; background: transparent; color: inherit; opacity: 0.55;
  cursor: pointer; padding: 0 4px; font-size: 12px;
}
.dsh-pe-undo-x:hover { opacity: 1; }
`;
function ensureStyles() {
  if (document.getElementById(STYLE_ID) !== null) return false;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = CSS;
  document.head.appendChild(element);
  return true;
}

// src/client/shortcut.ts
var MODIFIER_ALIASES = /* @__PURE__ */ new Map([
  ["ctrl", "ctrl"],
  ["control", "ctrl"],
  ["alt", "alt"],
  ["option", "alt"],
  ["shift", "shift"],
  ["meta", "meta"],
  ["cmd", "meta"],
  ["command", "meta"],
  ["win", "meta"],
  ["super", "meta"]
]);
var isKeyToken = (token) => /^[a-z0-9]$/.test(token) || /^f([1-9]|1[0-2])$/.test(token);
function codeFor(token) {
  if (/^[a-z]$/.test(token)) return `Key${token.toUpperCase()}`;
  if (/^[0-9]$/.test(token)) return `Digit${token}`;
  return `F${token.slice(1)}`;
}
function parseShortcut(spec) {
  if (spec === void 0) return null;
  const tokens = spec.trim().toLowerCase().split("+").map((token) => token.trim()).filter((token) => token !== "");
  if (tokens.length === 0 || tokens.length > 5) return null;
  const modifiers = { ctrl: false, alt: false, shift: false, meta: false };
  const last = tokens[tokens.length - 1] ?? "";
  if (!isKeyToken(last)) return null;
  for (const token of tokens.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES.get(token);
    if (modifier === void 0) return null;
    modifiers[modifier] = true;
  }
  if (!modifiers.ctrl && !modifiers.alt && !modifiers.meta) return null;
  return { ...modifiers, key: last, code: codeFor(last) };
}
function matchesShortcut(event, combo) {
  if (combo === null) return false;
  return event.ctrlKey === combo.ctrl && event.altKey === combo.alt && event.shiftKey === combo.shift && event.metaKey === combo.meta && (event.code === combo.code || event.key.toLowerCase() === combo.key);
}

// src/client/index.tsx
var inject = ["slots", "settingsScope", "locale"];
function apply(ctx) {
  ensureStyles();
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, dictionaries);
    } catch {
      return () => {
      };
    }
  }, "dsh-prompt-enhance: dictionaries");
  ctx.inject(["settingsScope"], (settingsCtx) => {
    const scope = settingsCtx.settingsScope.bind({ namespace: NS, decode: decodeClientSettings });
    const sync = () => {
      setClientSettings(scope.getSnapshot().value ?? decodeClientSettings(void 0));
    };
    sync();
    ctx.effect(() => scope.subscribe(sync), "dsh-prompt-enhance: settings mirror");
  });
  ctx.inject(["slots"], (slotsCtx) => {
    const slots = slotsCtx.slots;
    return slots.inject("conversation.input.right", () => {
      try {
        return slots.register(
          { name: "conversation.input.right", id: "prompt-enhance", order: 60, locale: NS },
          EnhanceButton
        );
      } catch {
        return () => {
        };
      }
    });
  });
  ctx.inject(["slots"], (slotsCtx) => {
    const slots = slotsCtx.slots;
    return slots.inject("conversation.input.dock", () => {
      try {
        return slots.register(
          { name: "conversation.input.dock", id: "prompt-enhance-undo", order: 90, locale: NS },
          UndoBar
        );
      } catch {
        return () => {
        };
      }
    });
  });
  ctx.effect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      const combo = parseShortcut(getClientSettings().shortcut);
      if (!matchesShortcut(event, combo)) return;
      const target = shortcutTarget();
      if (target === void 0) return;
      event.preventDefault();
      event.stopPropagation();
      target();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, "dsh-prompt-enhance: shortcut");
}

		return module.exports;
	}
});

