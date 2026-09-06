/**
 * lib/styles.js — 插件样式注入（idempotent）
 *
 * 面板类名统一 stpp- 前缀；z-index 30000，确保浮于魔法棒菜单(29999)之上。
 */

const STYLE_ID = 'stpp-styles';

const CSS = `
#stpp-panel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    width: 340px;
    max-width: calc(100vw - 24px);
    z-index: 30000;
    display: flex;
    flex-direction: column;
    background: rgba(29, 33, 40, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    color: var(--CLight, #e8e8e8);
    font-size: 12px;
    overflow: hidden;
}
#stpp-panel.stpp-collapsed {
    width: 220px;
}
#stpp-panel.stpp-hidden {
    display: none !important;
}
#stpp-panel .stpp-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: grab;
    user-select: none;
    background: rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
#stpp-panel .stpp-title {
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
}
#stpp-panel .stpp-status {
    flex: 1;
    text-align: right;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.65);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
#stpp-panel .stpp-status.stpp-status-error {
    color: #ff7b7b;
}
#stpp-panel.stpp-busy .stpp-status {
    color: #ffd479;
    animation: stpp-pulse 1.2s ease-in-out infinite;
}
@keyframes stpp-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
}
#stpp-panel .stpp-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    max-height: 560px;
    overflow-y: auto;
}
#stpp-panel .stpp-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
#stpp-panel .stpp-btn {
    min-height: 26px;
    padding: 2px 8px;
    font-size: 11px;
    line-height: 1.4;
    color: inherit;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    cursor: pointer;
}
#stpp-panel .stpp-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.16);
}
#stpp-panel .stpp-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
#stpp-panel .stpp-btn.stpp-primary {
    color: #1a1a1a;
    background: linear-gradient(135deg, #ffd479, #ffb64d);
    border-color: transparent;
    font-weight: 600;
}
#stpp-panel .stpp-btn.stpp-primary:hover:not(:disabled) {
    filter: brightness(1.08);
}
#stpp-panel .stpp-versions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    min-height: 22px;
}
#stpp-panel .stpp-version {
    font-size: 10px;
    padding: 1px 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid transparent;
    color: inherit;
    cursor: pointer;
}
#stpp-panel .stpp-version:hover {
    background: rgba(255, 255, 255, 0.14);
}
#stpp-panel .stpp-version.stpp-version-active {
    background: #ffd479;
    color: #1a1a1a;
    font-weight: 600;
}
#stpp-panel .stpp-versions-hint {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
}
#stpp-panel .stpp-result {
    width: 100%;
    min-height: 140px;
    max-height: 320px;
    resize: vertical;
    padding: 6px 8px;
    font-size: 12px;
    line-height: 1.5;
    color: inherit;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
}
#stpp-panel .stpp-result:focus {
    outline: none;
    border-color: rgba(255, 212, 121, 0.6);
}
#stpp-panel .stpp-log-toggle {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.65);
    cursor: pointer;
    user-select: none;
    padding: 2px 0;
}
#stpp-panel .stpp-log-toggle:hover {
    color: #ffd479;
}
#stpp-panel .stpp-log-wrap {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 4px;
    max-height: 160px;
    overflow-y: auto;
}
#stpp-panel .stpp-log-wrap.stpp-hidden {
    display: none;
}
#stpp-panel .stpp-log-health div {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.55);
}
#stpp-panel .stpp-log-line {
    font-size: 10px;
    font-family: ui-monospace, Consolas, Menlo, monospace;
    word-break: break-all;
    margin-bottom: 2px;
    color: rgba(255, 255, 255, 0.75);
}
#stpp-panel .stpp-log-time {
    color: rgba(255, 255, 255, 0.4);
    margin-right: 6px;
}
#stpp-panel .stpp-log-warn {
    color: #ffd479;
}
#stpp-panel .stpp-log-error {
    color: #ff7b7b;
}

/* ---- 扩展设置页控件 ---- */
.stpp-setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 12px;
}
.stpp-setting-row input[type="text"],
.stpp-setting-row input[type="password"],
.stpp-setting-row input[type="number"],
.stpp-setting-row select {
    width: 55%;
}
.stpp-setting-row input[type="checkbox"] {
    width: auto;
}
.stpp-sysprompt-row {
    flex-direction: column;
    align-items: stretch;
}
.stpp-sysprompt-row textarea {
    width: 100%;
    font-family: ui-monospace, Consolas, Menlo, monospace;
    font-size: 11px;
}
.stpp-custom-section {
    border: 1px dashed rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    padding: 6px 10px;
    margin: 8px 0;
}
.stpp-setting-section-title {
    margin: 4px 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
}
.stpp-custom-actions {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    margin: 6px 0 10px;
}
.stpp-custom-actions .menu_button,
.stpp-sysprompt-reset {
    width: auto;
    margin: 0;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: center;
}
.stpp-custom-actions .menu_button {
    flex: 1 1 auto;
}
.stpp-sysprompt-reset {
    flex: 0 0 auto;
}
`;

/** 注入样式（幂等：已存在则跳过） */
export function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
    console.log('[st-prompt-polish] 样式已注入');
}