/**
 * lib/settings.js — 插件设置读写与设置 UI
 *
 * 存储位置：SillyTavern extensionSettings['st_prompt_polish']，经 saveSettingsDebounced 持久化。
 * 设置 UI 手动注入 #extensions_settings（备选 #extensions_settings2），对 ST / TauriTavern 均稳定。
 */

import { getHostContext } from './host.js';

export const SETTING_NAMESPACE = 'st_prompt_polish';

/** 默认「提示词工程专家」系统提示词（可在设置页替换/恢复默认） */
export const DEFAULT_POLISH_SYSTEM_PROMPT = `你是一位资深的提示词工程专家（Prompt Engineer）。你的任务是把用户给出的提示词草稿润色、补全为高质量、可直接使用的提示词。

润色规则：
1. 补全缺失要素：目标、对象、范围、约束条件、输出格式、验收标准，缺失的要素给出合理补全。
2. 消除歧义：把含糊、有歧义的表述改写为明确、无歧义的指令。
3. 组织结构：按「角色 / 任务 / 步骤 / 输出格式 / 质量约束」的提示词工程最佳实践组织内容。
4. 保持意图与语言：不得改变用户的原始意图；中文草稿输出中文，其他语言草稿保持原语言。
5. 只输出优化后的提示词正文：不要解释、不要加前言后语、不要包裹代码围栏。`;

/** 插件设置默认值 */
export const DEFAULT_SETTINGS = {
    /** 总开关：关闭后隐藏面板与菜单按钮（重新开启需刷新页面） */
    enabled: true,
    /** 是否在魔法棒菜单显示常驻入口按钮 */
    showLauncherButton: true,
    /** 润色通道：'st'（复用 ST 当前连接模型）| 'custom'（自定义 OpenAI 兼容 API） */
    llmSource: 'st',
    /** ST 通道最大输出 Tokens */
    maxTokens: 2048,
    /** 润色完成后是否自动把结果填入输入框 */
    autoFillInput: true,
    /** 「提示词工程专家」系统提示词 */
    polishSystemPrompt: DEFAULT_POLISH_SYSTEM_PROMPT,
    /** 自定义 OpenAI 兼容 API 配置 */
    customApi: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'deepseek-chat',
        maxTokens: 8192,
    },
    /** 面板拖拽位置（left/top 视口坐标）；null = 未拖过，用默认右下角 */
    dragPosition: null,
};

/** 设置变更订阅者（panel 等模块用于即时生效） */
const settingsListeners = new Set();

/** 读取设置：逐字段回填默认值，保证结构完整 */
export function getSettings() {
    const ctx = getHostContext();
    const raw = ctx?.extensionSettings?.[SETTING_NAMESPACE];
    const merged = {
        ...DEFAULT_SETTINGS,
        customApi: { ...DEFAULT_SETTINGS.customApi },
    };
    if (raw && typeof raw === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            const value = raw[key];
            if (value !== undefined && value !== null) {
                if (key === 'customApi' && typeof value === 'object') {
                    merged.customApi = { ...DEFAULT_SETTINGS.customApi, ...value };
                } else {
                    merged[key] = value;
                }
            }
        }
    }
    return merged;
}

/** 将设置写入宿主 extensionSettings 并触发防抖持久化 */
function persistSettings(settings) {
    const ctx = getHostContext();
    if (!ctx) return;
    if (!ctx.extensionSettings) ctx.extensionSettings = {};
    ctx.extensionSettings[SETTING_NAMESPACE] = settings;
    try {
        ctx.saveSettingsDebounced?.();
    } catch {
        // 保存失败不致命：内存中的设置仍然生效，仅本次未落盘
    }
}

/**
 * 更新设置（浅合并 partial，customApi 深合并），持久化并通知所有订阅者。
 * @returns 合并后的完整设置
 */
export function updateSettings(partial) {
    const next = getSettings();
    for (const [key, value] of Object.entries(partial ?? {})) {
        if (key === 'customApi' && value && typeof value === 'object') {
            next.customApi = { ...next.customApi, ...value };
        } else {
            next[key] = value;
        }
    }
    persistSettings(next);
    for (const listener of settingsListeners) {
        try {
            listener(next);
        } catch (err) {
            console.error('[st-prompt-polish] 设置变更回调异常:', err);
        }
    }
    return next;
}

/** 订阅设置变更，返回取消订阅函数 */
export function onSettingsChanged(listener) {
    settingsListeners.add(listener);
    return () => settingsListeners.delete(listener);
}

/** 立即落盘当前设置（绕过防抖），页面卸载/切后台等临界场景使用 */
export function flushSettings() {
    const ctx = getHostContext();
    if (!ctx) return;
    try {
        ctx.saveSettings?.();
    } catch {
        // 保存失败不致命
    }
}

/**
 * 初始化设置 UI：注入 SillyTavern「扩展」设置页。
 * 幂等：容器内已存在 .stpp-settings 时跳过。
 */
export function initSettingsUI() {
    const anchor =
        document.getElementById('extensions_settings') ??
        document.getElementById('extensions_settings2');
    if (!anchor) {
        console.warn('[st-prompt-polish] 未找到扩展设置容器（#extensions_settings），设置 UI 未注入');
        return;
    }
    if (anchor.querySelector('.stpp-settings')) return;

    const settings = getSettings();
    const custom = settings.customApi;

    const root = document.createElement('div');
    root.className = 'stpp-settings';
    root.innerHTML = `
        <div class="inline-drawer stpp-settings-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>提示词润色</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content" style="display:none">
                <label class="stpp-setting-row" title="关闭后隐藏面板与菜单按钮；重新开启需刷新页面">
                    <span>启用插件</span>
                    <input type="checkbox" data-setting="enabled">
                </label>
                <label class="stpp-setting-row" title="在魔法棒菜单中显示「润色」入口">
                    <span>显示菜单入口按钮</span>
                    <input type="checkbox" data-setting="showLauncherButton">
                </label>
                <div class="stpp-setting-row" title="润色请求走哪条模型通道">
                    <span>润色通道</span>
                    <select data-setting="llmSource">
                        <option value="st">ST 当前连接模型</option>
                        <option value="custom">自定义 API（OpenAI 兼容）</option>
                    </select>
                </div>
                <div class="stpp-setting-row" title="ST 通道的最大输出 Tokens">
                    <span>ST 通道输出上限</span>
                    <input type="number" min="256" max="32768" step="256" data-setting="maxTokens">
                </div>
                <label class="stpp-setting-row" title="润色完成后自动把结果写入输入框，可直接回车发送">
                    <span>自动填入输入框</span>
                    <input type="checkbox" data-setting="autoFillInput">
                </label>
                <div class="stpp-custom-section" title="自定义 OpenAI 兼容 API（OpenAI / DeepSeek / Azure / Ollama / vLLM / LM Studio 等）">
                    <div class="stpp-setting-section-title">自定义 API 配置（通道选「自定义 API」时生效）</div>
                    <div class="stpp-setting-row">
                        <span>API 地址（自动拼接 /chat/completions）</span>
                        <input type="text" placeholder="https://api.openai.com/v1" data-custom="baseUrl">
                    </div>
                    <div class="stpp-setting-row">
                        <span>API Key（本地服务可留空）</span>
                        <input type="password" placeholder="sk-..." data-custom="apiKey">
                    </div>
                    <div class="stpp-setting-row">
                        <span>模型名称</span>
                        <input type="text" placeholder="deepseek-chat" data-custom="model">
                    </div>
                    <div class="stpp-setting-row">
                        <span>输出上限 Tokens</span>
                        <input type="number" min="256" max="32768" step="256" data-custom="maxTokens">
                    </div>
                    <div class="stpp-custom-actions">
                        <button type="button" class="menu_button stpp-custom-save">💾 保存配置</button>
                        <button type="button" class="menu_button stpp-custom-test">🧪 保存并测试</button>
                    </div>
                </div>
                <div class="stpp-setting-row stpp-sysprompt-row" title="控制润色 agent 的优化规则与输出格式">
                    <span>系统提示词（提示词工程专家）</span>
                    <textarea rows="6" data-setting="polishSystemPrompt"></textarea>
                </div>
                <button type="button" class="menu_button stpp-sysprompt-reset" style="margin-bottom:16px">↺ 恢复默认系统提示词</button>
            </div>
        </div>
    `;

    // ---- inline-drawer 折叠交互（自实现，不依赖宿主全局委托） ----
    const contentEl = root.querySelector('.inline-drawer-content');
    const iconEl = root.querySelector('.inline-drawer-icon');
    let drawerOpen = false;
    root.querySelector('.inline-drawer-toggle').addEventListener('click', () => {
        drawerOpen = !drawerOpen;
        contentEl.style.display = drawerOpen ? '' : 'none';
        iconEl?.classList.toggle('down', drawerOpen);
    });

    // ---- 通用控件（checkbox / select / number / textarea）初始值与变更绑定 ----
    for (const input of root.querySelectorAll('[data-setting]')) {
        const key = input.dataset.setting;
        applyControlValue(input, settings[key]);
        input.addEventListener('change', () => {
            updateSettings({ [key]: controlToValue(input) });
        });
        if (input.tagName === 'TEXTAREA') {
            // 文本域还需要 input 事件实时同步，避免失去焦点前就切换面板丢改动
            input.addEventListener('input', () => {
                updateSettings({ [key]: input.value });
            });
        }
    }

    // ---- 自定义 API 控件 ----
    for (const input of root.querySelectorAll('[data-custom]')) {
        const key = input.dataset.custom;
        applyControlValue(input, custom[key]);
        input.addEventListener('change', () => {
            updateSettings({ customApi: { [key]: controlToValue(input) } });
        });
        input.addEventListener('input', () => {
            updateSettings({ customApi: { [key]: input.value } });
        });
    }

    // ---- 保存 / 保存并测试 ----
    root.querySelector('.stpp-custom-save').addEventListener('click', async () => {
        updateSettings({ customApi: readCustomControls(root) });
        toastr?.success('自定义 API 配置已保存');
    });
    // 测试用「保存并测试」回调由 index.js 注入（依赖 polish.js，避免循环依赖）
    const testBtn = root.querySelector('.stpp-custom-test');
    testBtn.addEventListener('click', async () => {
        updateSettings({ customApi: readCustomControls(root) });
        if (typeof root.__stppOnTest === 'function') {
            testBtn.disabled = true;
            try {
                await root.__stppOnTest();
            } finally {
                testBtn.disabled = false;
            }
        }
    });

    // ---- 恢复默认系统提示词 ----
    root.querySelector('.stpp-sysprompt-reset').addEventListener('click', () => {
        const textarea = root.querySelector('[data-setting="polishSystemPrompt"]');
        updateSettings({ polishSystemPrompt: DEFAULT_POLISH_SYSTEM_PROMPT });
        textarea.value = DEFAULT_POLISH_SYSTEM_PROMPT;
        toastr?.success('已恢复默认系统提示词');
    });

    anchor.appendChild(root);
    console.log('[st-prompt-polish] 设置 UI 已注入扩展设置页');
    return root;
}

/** 读取所有 data-custom 控件的当前值 */
function readCustomControls(root) {
    const out = {};
    for (const input of root.querySelectorAll('[data-custom]')) {
        out[input.dataset.custom] = controlToValue(input);
    }
    return out;
}

/** 按控件类型回填初始值 */
function applyControlValue(input, value) {
    if (input.type === 'checkbox') {
        input.checked = !!value;
    } else {
        input.value = value ?? '';
    }
}

/** 按控件类型转换值为设置字段 */
function controlToValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number') return Number(input.value) || 0;
    return input.value;
}