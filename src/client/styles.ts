/**
 * Self-contained stylesheet, injected once as a <style> element: the plugin
 * ships no CSS build step, and class names are prefixed to stay collision
 * free inside the web shell. Colors are declared as panel-scoped variables
 * with a dark default and a light `prefers-color-scheme` override, so the
 * panel follows the OS/shell theme without depending on host theme internals.
 * @module dsh-prompt-enhance/client/styles
 */

const STYLE_ID = 'dsh-prompt-enhance-styles'

/** The plugin's stylesheet. */
export const CSS = `
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
`

/**
 * Inject the stylesheet once per document.
 * @returns true when injected, false when it was already present.
 */
export function ensureStyles(): boolean {
  if (document.getElementById(STYLE_ID) !== null) return false
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  document.head.appendChild(element)
  return true
}
