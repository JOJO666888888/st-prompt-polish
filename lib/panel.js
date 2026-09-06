/**
 * lib/panel.js — 浮动面板管理（润色工作台）
 *
 * 职责：
 *   - 浮动面板三态：open（展开）/ collapsed（收起为标题条）/ closed（隐藏）
 *   - 版本历史：原文 / v1 / v2… 标签跳转、↩ 撤回、🔄 重写、⏩ 多轮 ×3
 *   - 结果手动微调（textarea 可编辑，会同步进当前版本）
 *   - ✓ 应用到输入框 / ✈ 应用并发送
 *   - 📋 诊断日志抽屉
 *   - 魔法棒菜单常驻入口按钮（显隐受 showLauncherButton 控制）
 *
 * 面板标题条拖拽遵循 st-minigames 的 Pointer Events 模式（6px 阈值区分点击/拖拽），
 * 位置持久化到 settings.dragPosition，刷新后恢复。
 */

import { getSettings, updateSettings, onSettingsChanged } from './settings.js';
import { runPolishOnce } from './polish.js';
import { log, getLogs } from './log.js';

const PANEL_ID = 'stpp-panel';
const LAUNCHER_ID = 'stpp-launcher';
const LAUNCHER_CONTAINER_ID = 'stpp-launcher-container';
const INPUT_SELECTOR = '#send_textarea';
const SEND_BUTTON_SELECTOR = '#send_but';
const MULTI_ROUNDS = 3;

// ---- 模块级状态 ----
let panelEl = null;
let statusEl = null;
let versionsEl = null;
let resultTA = null;
let logBodyEl = null;
let launcherContainerEl = null;
let panelState = 'closed'; // 'closed' | 'collapsed' | 'open'
let versions = []; // [{ label, text }]
let currentIndex = -1;
let busy = false;
let dragJustMoved = false;
let initialized = false;

/* ===================== 初始化 ===================== */

/** 安装浮动面板（幂等），结构对齐 st-minigames / st-mainline-plugin */
export function initPanel() {
    if (initialized) return;
    initialized = true;

    panelEl = document.createElement('div');
    panelEl.id = PANEL_ID;
    panelEl.className = 'stpp-panel stpp-hidden';
    panelEl.innerHTML = `
        <div class="stpp-header">
            <span class="stpp-title">✨ 提示词润色</span>
            <span class="stpp-status"></span>
            <button type="button" class="stpp-btn stpp-collapse-btn" title="收起">–</button>
            <button type="button" class="stpp-btn stpp-close-btn" title="关闭">×</button>
        </div>
        <div class="stpp-body">
            <div class="stpp-toolbar">
                <button type="button" class="stpp-btn stpp-primary" id="stpp-polish-btn" title="对当前文本做首轮润色（补全/消歧/结构化）">✨ 润色</button>
                <button type="button" class="stpp-btn" id="stpp-undo-btn" title="撤回上一版本">↩ 撤回</button>
                <button type="button" class="stpp-btn" id="stpp-rewrite-btn" title="基于当前结果再优化一轮">🔄 重写</button>
                <button type="button" class="stpp-btn" id="stpp-multi-btn" title="自动迭代 3 轮，每轮结果进入历史">⏩ 多轮×${MULTI_ROUNDS}</button>
                <button type="button" class="stpp-btn" id="stpp-apply-btn" title="写入输入框，可直接回车发送">✓ 应用到输入框</button>
                <button type="button" class="stpp-btn" id="stpp-send-btn" title="写入输入框并直接发送">✈ 应用并发送</button>
            </div>
            <div class="stpp-versions"></div>
            <textarea class="stpp-result" spellcheck="false" placeholder="输入你想优化的提示词草稿，点击「✨ 润色」；也可以直接点魔法棒菜单的「润色」一键处理输入框内容。"></textarea>
            <div class="stpp-log-toggle" id="stpp-log-toggle" title="打开 / 收起诊断日志">📋 诊断日志 <i class="fa-solid fa-chevron-circle-right"></i></div>
            <div class="stpp-log-wrap stpp-hidden">
                <div class="stpp-log-body"></div>
            </div>
        </div>
    `;
    document.body.appendChild(panelEl);

    statusEl = panelEl.querySelector('.stpp-status');
    versionsEl = panelEl.querySelector('.stpp-versions');
    resultTA = panelEl.querySelector('.stpp-result');
    logBodyEl = panelEl.querySelector('.stpp-log-body');

    // 收起 / 关闭
    panelEl.querySelector('.stpp-collapse-btn').addEventListener('click', () => collapsePanel());
    panelEl.querySelector('.stpp-close-btn').addEventListener('click', () => closePanel());
    // 收起状态下点击标题条（非按钮区）重新展开；刚拖拽过则忽略本次点击
    panelEl.querySelector('.stpp-header').addEventListener('click', (e) => {
        if (dragJustMoved) {
            dragJustMoved = false;
            return;
        }
        if (panelState !== 'collapsed') return;
        if (e.target.closest('.stpp-btn')) return;
        openPanel({ manual: true });
    });

    // 手动编辑文本：同步进当前版本
    resultTA.addEventListener('input', syncWorkingVersion);

    // 工具栏按钮
    panelEl.querySelector('#stpp-polish-btn').addEventListener('click', () => runPolish('polish'));
    panelEl.querySelector('#stpp-undo-btn').addEventListener('click', () => undoVersion());
    panelEl.querySelector('#stpp-rewrite-btn').addEventListener('click', () => runPolish('rewrite'));
    panelEl.querySelector('#stpp-multi-btn').addEventListener('click', () => runPolish('multi'));
    panelEl.querySelector('#stpp-apply-btn').addEventListener('click', () => applyToInput());
    panelEl.querySelector('#stpp-send-btn').addEventListener('click', () => applyAndSend());

    // 日志抽屉
    panelEl.querySelector('#stpp-log-toggle').addEventListener('click', toggleLogDrawer);

    // 标题条拖拽 + 恢复位置
    setupPanelDrag();
    applySavedPosition();

    installLauncher();

    // 设置变更即时生效（入口显隐）
    onSettingsChanged((next) => {
        if (launcherContainerEl) {
            launcherContainerEl.style.display =
                next.enabled && next.showLauncherButton !== false ? '' : 'none';
        }
    });

    console.log('[st-prompt-polish] 浮动面板已安装（#stpp-panel）');
}

/* ===================== 魔法棒菜单入口 ===================== */

/**
 * 魔法棒菜单常驻入口按钮（幂等；菜单未就绪时短轮询重试）。
 * 结构对齐宿主约定（参照 shujuku 与 TauriTavern 内置扩展的魔法棒按钮）：
 *   <div class="extension_container">            ← 外层容器
 *     <div class="list-group-item flex-container flexGap5">  ← 横排布局
 *       <div class="fa-fw fa-solid fa-sparkles extensionsMenuExtensionButton">  ← 图标
 *       <span>润色</span>
 *
 * 注意：extensionsMenuExtensionButton 类必须挂在图标元素上（宿主 CSS 对其强制
 * width/height:20px + pointer-events:none，挂在按钮本身会压坏布局且无法点击）。
 */
function installLauncher(retry = 0) {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) {
        if (retry < 10) {
            setTimeout(() => installLauncher(retry + 1), 500);
        } else {
            console.warn('[st-prompt-polish] 未找到 #extensionsMenu，常驻按钮未安装（仍可通过公开 API 打开面板）');
        }
        return;
    }
    if (document.getElementById(LAUNCHER_CONTAINER_ID)) return;

    launcherContainerEl = document.createElement('div');
    launcherContainerEl.id = LAUNCHER_CONTAINER_ID;
    launcherContainerEl.className = 'extension_container interactable';
    launcherContainerEl.tabIndex = 0;

    const item = document.createElement('div');
    item.id = LAUNCHER_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.title = '提示词润色：一键润色输入框草稿';
    item.innerHTML = `<div class="fa-fw fa-solid fa-sparkles extensionsMenuExtensionButton"></div><span>润色</span>`;
    item.addEventListener('click', handleLauncherClick);
    launcherContainerEl.appendChild(item);

    // 插到内置按钮区（*_wand_container）末尾之后：位于「生成图片」等内置项
    // 之下、其他第三方扩展按钮之上
    const builtins = [...menu.children].filter(
        (el) => typeof el.id === 'string' && el.id.endsWith('_wand_container'),
    );
    const anchor = builtins.length > 0 ? builtins[builtins.length - 1].nextSibling : null;
    menu.insertBefore(launcherContainerEl, anchor);

    const settings = getSettings();
    launcherContainerEl.style.display =
        settings.enabled && settings.showLauncherButton !== false ? '' : 'none';
}

/** 魔法棒菜单入口点击：收起菜单 → 打开面板 → 空面板时自动润色输入框草稿 */
function handleLauncherClick(e) {
    e.stopPropagation();
    const menu = document.getElementById('extensionsMenu');
    const menuButton = document.getElementById('extensionsMenuButton');
    if (menu && menuButton && getComputedStyle(menu).display !== 'none') {
        menuButton.click();
    }
    openPanel({ manual: true });
    autoPolishFromInput();
}

/** 面板内无进行中/已加载内容且有输入框草稿时，自动拉取并执行一键润色 */
function autoPolishFromInput() {
    if (busy) return;
    if (resultTA.value.trim()) return; // 已有进行中的工作，不覆盖
    const inputText = readInput();
    if (!inputText) {
        status('输入框为空，请在输入框或本面板输入内容', true);
        return;
    }
    resultTA.value = inputText;
    runPolish('polish');
}

/* ===================== 面板开关 ===================== */

export function openPanel() {
    if (!panelEl) return;
    panelEl.classList.remove('stpp-hidden');
    panelState = 'open';
    panelEl.classList.remove('stpp-collapsed');
    panelEl.querySelector('.stpp-body').style.display = '';
    renderVersions();
}

export function collapsePanel() {
    if (!panelEl || panelState === 'closed') return;
    panelState = 'collapsed';
    panelEl.querySelector('.stpp-body').style.display = 'none';
    panelEl.classList.add('stpp-collapsed');
}

export function closePanel() {
    if (!panelEl) return;
    panelState = 'closed';
    panelEl.classList.add('stpp-hidden');
}

/* ===================== 润色流程 ===================== */

/**
 * 执行一轮润色：
 *   - 'polish'  首轮：重置历史，草稿作为「原文」起点
 *   - 'rewrite' 重写：基于当前版本再优化一轮
 *   - 'multi'   多轮：连续迭代 3 轮，每轮结果进入历史
 */
export async function runPolish(mode = 'polish') {
    if (busy) return;
    const draft = resultTA.value.trim() || readInput();
    if (!draft) {
        status('输入为空：请在面板或输入框输入内容后重试', true);
        log('warn', 'client', '润色被跳过：输入为空');
        return;
    }

    if (mode === 'polish') {
        // 首轮润色：以草稿为重开历史
        versions = [{ label: '原文', text: draft }];
    } else {
        syncWorkingVersion();
        if (versions.length === 0) {
            versions.push({ label: '原文', text: draft });
        }
    }
    currentIndex = versions.length - 1;
    renderVersions();

    setBusy(true);
    status(`⏳ 优化中…${mode === 'multi' ? `（${MULTI_ROUNDS} 轮）` : ''}`);
    try {
        const settings = getSettings();
        if (mode === 'multi') {
            // 多轮：逐轮改写并依次进历史，每轮结果可见、可跳回
            let cur = draft;
            for (let i = 0; i < MULTI_ROUNDS; i++) {
                cur = await runPolishOnce(cur, settings, 'rewrite');
                versions.push({ label: 'v' + versions.length, text: cur });
                currentIndex = versions.length - 1;
                resultTA.value = cur;
                renderVersions();
            }
        } else {
            const final = await runPolishOnce(draft, settings, mode === 'polish' ? 'polish' : 'rewrite');
            versions.push({ label: 'v' + versions.length, text: final });
            currentIndex = versions.length - 1;
        }
        resultTA.value = versions[currentIndex].text;
        renderVersions();
        if (settings.autoFillInput) fillInput(versions[currentIndex].text);
        status('✔ 润色完成');
        log('info', 'client', `润色完成（${mode}，共 ${versions.length - 1} 版）`);
        toastr?.success?.('润色完成，结果已写入');
    } catch (err) {
        const msg = err?.message || String(err);
        status(`✘ 失败：${msg}`, true);
        log('error', 'client', `润色失败（${mode}）：${msg}`);
        toastr?.error?.(`润色失败：${msg}`);
    } finally {
        setBusy(false);
    }
}

/** 撤回：回到上一个版本 */
export function undoVersion() {
    if (busy || currentIndex <= 0) return;
    currentIndex--;
    syncVersionToTextarea(currentIndex);
    status(`已撤回至「${versions[currentIndex]?.label}」`);
    renderVersions();
}

/** 版本标签跳转 */
function selectVersion(index) {
    if (busy || index < 0 || index >= versions.length) return;
    currentIndex = index;
    syncVersionToTextarea(index);
    status(`已切换至「${versions[index]?.label}」`);
    renderVersions();
}

/** 把当前 textarea 内容同步进 versions[currentIndex]（手动微调后保留） */
function syncWorkingVersion() {
    if (currentIndex >= 0 && currentIndex < versions.length) {
        versions[currentIndex].text = resultTA.value;
    }
}

/** 把某版本内容载入 textarea */
function syncVersionToTextarea(index) {
    if (index >= 0 && index < versions.length) {
        resultTA.value = versions[index].text;
    }
}

/** 渲染版本标签行（原文 / v1 / v2 …），当前版本高亮 */
function renderVersions() {
    if (!versionsEl) return;
    versionsEl.innerHTML = '';
    versions.forEach((v, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'stpp-version' + (i === currentIndex ? ' stpp-version-active' : '');
        chip.textContent = v.label;
        chip.title = v.text.slice(0, 120);
        chip.addEventListener('click', () => selectVersion(i));
        versionsEl.appendChild(chip);
    });
    if (versions.length > 1) {
        const hint = document.createElement('span');
        hint.className = 'stpp-versions-hint';
        hint.textContent = '（点击标签可跳回任意历史版本）';
        versionsEl.appendChild(hint);
    }
}

/* ===================== 应用 / 发送 ===================== */

/** 读取 ST 输入框当前草稿 */
function readInput() {
    const ta = document.querySelector(INPUT_SELECTOR);
    return ta ? ta.value.trim() : '';
}

/** 写入 ST 输入框（触发 input/change 让宿主拾取，并恢复发送按钮可见） */
function fillInput(text) {
    const ta = document.querySelector(INPUT_SELECTOR);
    if (!ta) {
        log('warn', 'client', `未找到输入框 ${INPUT_SELECTOR}，无法写入`);
        return false;
    }
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    const sendBtn = document.querySelector(SEND_BUTTON_SELECTOR);
    if (sendBtn) sendBtn.classList.remove('displayNone');
    return true;
}

/** 应用到输入框 */
export function applyToInput() {
    const text = resultTA.value.trim();
    if (!text) {
        status('没有可应用的内容', true);
        return;
    }
    syncWorkingVersion();
    if (fillInput(text)) {
        status('✔ 已写入输入框，可直接发送');
        log('info', 'client', '已把当前版本写入输入框');
    }
}

/** 应用并直接发送 */
export function applyAndSend() {
    applyToInput();
    if (!resultTA.value.trim()) return;
    const sendBtn = document.querySelector(SEND_BUTTON_SELECTOR);
    if (sendBtn) {
        sendBtn.click();
        status('✈ 已提交发送');
    } else {
        log('warn', 'client', `未找到发送按钮 ${SEND_BUTTON_SELECTOR}`);
    }
}

/* ===================== 日志抽屉 ===================== */

let logDrawerOpen = false;

function toggleLogDrawer() {
    const wrap = panelEl.querySelector('.stpp-log-wrap');
    const icon = panelEl.querySelector('#stpp-log-toggle i');
    logDrawerOpen = !logDrawerOpen;
    wrap.classList.toggle('stpp-hidden', !logDrawerOpen);
    icon.className = logDrawerOpen
        ? 'fa-solid fa-chevron-circle-down'
        : 'fa-solid fa-chevron-circle-right';
    if (logDrawerOpen) refreshLogs();
}

function refreshLogs() {
    if (!logBodyEl) return;
    const settings = getSettings();
    const custom = settings.customApi;
    const health = [
        `润色通道：${settings.llmSource === 'custom' ? `自定义 API（${custom.model}）` : 'ST 当前连接模型'}`,
        `ST 通道支持：${typeof getContextSafe()?.generateQuietPrompt === 'function' ? '✔（generateQuietPrompt 可用）' : '✘ 不可用（ST 版本过旧）'}`,
        `自定义 API：${settings.llmSource === 'custom' ? custom.baseUrl : '未启用'}`,
        `最大输出：${settings.llmSource === 'custom' ? custom.maxTokens : settings.maxTokens} tokens`,
    ];
    const lines = [
        '<div class="stpp-log-health">' + health.map((h) => `<div>${h}</div>`).join('') + '</div>',
        '<hr>',
        ...getLogs().map(
            (e) =>
                `<div class="stpp-log-line stpp-log-${e.level}"><span class="stpp-log-time">${e.time}</span>[${e.source}] ${escapeHtml(e.message)}</div>`,
        ),
    ];
    logBodyEl.innerHTML = lines.join('');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getContextSafe() {
    try {
        return typeof window?.SillyTavern?.getContext === 'function'
            ? window.SillyTavern.getContext()
            : null;
    } catch {
        return null;
    }
}

/* ===================== 状态 / busy ===================== */

function status(text, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = text ?? '';
    statusEl.classList.toggle('stpp-status-error', !!isError && !!text);
}

function setBusy(value) {
    busy = value;
    panelEl?.classList.toggle('stpp-busy', value);
    for (const btn of panelEl?.querySelectorAll('.stpp-toolbar .stpp-btn') ?? []) {
        btn.disabled = value;
    }
}

/* ===================== 面板拖拽 ===================== */

/**
 * 标题条拖拽移动面板（Pointer Events 统一处理鼠标与触摸）。
 * 6px 阈值区分「点击」（收起时展开）与「拖拽」（移动面板）；
 * 拖拽时把面板从默认 right/bottom 定位转为 left/top（CSS left 优先），
 * 结束保存位置到 settings.dragPosition。
 */
function setupPanelDrag() {
    if (!panelEl) return;
    const header = panelEl.querySelector('.stpp-header');
    let session = null;

    header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.stpp-btn')) return;
        session = {
            startX: e.clientX,
            startY: e.clientY,
            baseLeft: panelEl.offsetLeft,
            baseTop: panelEl.offsetTop,
            moved: false,
        };
        header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', (e) => {
        if (!session) return;
        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;
        if (!session.moved && Math.hypot(dx, dy) < 6) return;
        session.moved = true;
        dragJustMoved = true;
        const left = Math.max(0, Math.min(session.baseLeft + dx, window.innerWidth - 60));
        const top = Math.max(0, Math.min(session.baseTop + dy, window.innerHeight - 40));
        panelEl.style.left = `${left}px`;
        panelEl.style.top = `${top}px`;
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
    });
    const endDrag = (e) => {
        if (!session) return;
        session = null;
        saveDragPosition();
    };
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);
}

/** 恢复上次保存的面板位置（未拖过则保持默认右下角） */
function applySavedPosition() {
    const pos = getSettings().dragPosition;
    if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
        panelEl.style.left = `${pos.left}px`;
        panelEl.style.top = `${pos.top}px`;
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
    }
}

function saveDragPosition() {
    if (!panelEl) return;
    updateSettings({ dragPosition: { left: panelEl.offsetLeft, top: panelEl.offsetTop } });
}

/* ===================== 供 index.js 调用的公开入口 ===================== */

export const PanelAPI = {
    openPanel: () => openPanel(),
    collapsePanel,
    closePanel,
    runPolish,
    undoVersion,
    applyToInput,
    applyAndSend,
    autoPolishFromInput,
    refreshLogs,
};