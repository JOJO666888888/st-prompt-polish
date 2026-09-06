/**
 * st-prompt-polish — SillyTavern 提示词润色插件
 *
 * 仿 dsh 生态 prompt-polish（JOJO666888888/prompt-polish），移植为纯客户端 ST 扩展：
 * 在发送提示词之前，调用一个专门的「提示词工程专家」agent 对草稿做
 * 补全 / 消歧 / 扩写 / 结构化，版本化迭代后可一键应用或直接发送。
 *
 * 功能：
 *   - 魔法棒菜单「润色」入口：一键处理输入框草稿
 *   - 浮动面板：✨润色 / ↩撤回 / 🔄重写 / ⏩多轮×3 / ✓应用 / ✈应用并发送
 *   - 版本历史（原文 / v1 / v2…）点击跳转任意版本
 *   - 双通道：ST 当前连接模型（generateQuietPrompt）| 自定义 OpenAI 兼容 API
 *   - 📋 诊断日志抽屉
 *
 * 安装：整个 st-prompt-polish 目录复制到
 *   <SillyTavern>/data/default-user/extensions/st-prompt-polish/
 * 后重启 SillyTavern（新扩展目录需服务端扫描，刷新页面不一定触发）。
 *
 * 公开 API：window.SillyTavernPromptPolish（控制台可调用）
 */

import { getSettings, updateSettings, initSettingsUI, flushSettings, onSettingsChanged } from './lib/settings.js';
import { waitForHost } from './lib/host.js';
import { initPanel, PanelAPI } from './lib/panel.js';
import { runPolishOnce, multiRoundPolish, testCustomApi } from './lib/polish.js';
import { injectStyles } from './lib/styles.js';
import { clearLogs } from './lib/log.js';

const LOG_PREFIX = '[st-prompt-polish]';
const HOST_WAIT_TIMEOUT_MS = 15000;

/** 挂载公开 API：控制台 / 外部脚本统一入口（多为无面板直调，便于测试） */
function mountPublicApi() {
    window.SillyTavernPromptPolish = {
        version: '1.0.0',
        // ---- 面板控制 ----
        openPanel: PanelAPI.openPanel,
        collapsePanel: PanelAPI.collapsePanel,
        closePanel: PanelAPI.closePanel,
        runFlow: PanelAPI.runPolish, // mode: 'polish' | 'rewrite' | 'multi'
        undoVersion: PanelAPI.undoVersion,
        applyToInput: PanelAPI.applyToInput,
        applyAndSend: PanelAPI.applyAndSend,
        // ---- 设置 ----
        getSettings,
        setSettings: updateSettings,
        // ---- 纯文本直调（不进面板） ----
        polish: (text) => runPolishOnce(text, getSettings(), 'polish'),
        rewrite: (text) => runPolishOnce(text, getSettings(), 'rewrite'),
        multiRound: (text, rounds = 3) => multiRoundPolish(text, getSettings(), rounds),
        testCustomApi,
        // ---- 日志 ----
        clearLogs,
        // ---- 版本 ----
        versionTag: '1.0.0',
    };
}

/** 「保存并测试」按钮的处理函数（绑定自设置 UI） */
function makeTestHandler(rootEl) {
    return async () => {
        try {
            const settings = getSettings();
            const result = await testCustomApi(settings.customApi);
            const preview = result.length > 80 ? result.slice(0, 80) + '…' : result;
            toastr?.success?.(`自定义 API 测试成功：${preview}`);
            console.log(`${LOG_PREFIX} 自定义 API 测试成功：${result}`);
        } catch (err) {
            const msg = err?.message || String(err);
            toastr?.error?.(`自定义 API 测试失败：${msg}`);
            console.error(`${LOG_PREFIX} 自定义 API 测试失败：`, err);
        }
    };
}

/** 扩展主流程 */
async function extensionMain() {
    const ready = await waitForHost(HOST_WAIT_TIMEOUT_MS);
    if (!ready) return;

    // 设置 UI 无论开关状态都注入（允许用户在扩展设置里重新启用）
    const settingsRoot = initSettingsUI();
    if (settingsRoot) {
        settingsRoot.__stppOnTest = makeTestHandler(settingsRoot);
    }

    const settings = getSettings();
    if (!settings.enabled) {
        // 按计划：禁用时只注册设置 UI 后退出（重新开启需刷新页面）
        console.log(`${LOG_PREFIX} 插件已禁用（可在 扩展设置 → 提示词润色 中开启后刷新页面）`);
        return;
    }

    injectStyles();
    initPanel();

    // 设置变更即时生效（面板入口显隐等由 panel 内部订阅）
    onSettingsChanged((next) => {
        if (!next.enabled) {
            PanelAPI.closePanel();
        }
    });

    mountPublicApi();
    console.log(`${LOG_PREFIX} 初始化完成（魔法棒菜单 →「润色」）`);
}

extensionMain().catch((err) => {
    console.error(`${LOG_PREFIX} 初始化失败:`, err);
});