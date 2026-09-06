/**
 * lib/host.js — 宿主上下文访问（SillyTavern / TauriTavern 通用）
 *
 * 统一入口：getHostContext() 优先使用原生 SillyTavern.getContext()，
 * 命名空间写入/读取均在 extensionSettings 上完成（与 shujuku / st-mainline 一致）。
 */

const LOG_PREFIX = '[st-prompt-polish]';

/**
 * 获取宿主上下文（防御式：宿主未就绪 / getContext 抛错时返回 null）。
 * 入口 index.js 的 waitForHost() 已确保轮询到就绪后才初始化各模块，
 * 此处仍做防御以支持设置 UI 在早期注入等边缘时序。
 */
export function getHostContext() {
    try {
        const win = typeof window !== 'undefined' ? window : globalThis;
        if (typeof win?.SillyTavern?.getContext === 'function') {
            const ctx = win.SillyTavern.getContext();
            if (ctx && ctx.extensionSettings) return ctx;
        }
    } catch {
        // getContext 抛出异常说明宿主尚未完全初始化，视为不可用
    }
    return null;
}

/**
 * 等待 SillyTavern 宿主就绪（100ms 轮询 getContext 直至 extensionSettings 可读）。
 * @param {number} maxWaitMs 最大等待时间
 * @returns {Promise<boolean>} 宿主是否在超时内就绪
 */
export async function waitForHost(maxWaitMs) {
    const win = typeof window !== 'undefined' ? window : globalThis;
    const start = Date.now();
    let poll = 0;
    while (Date.now() - start < maxWaitMs) {
        try {
            if (typeof win?.SillyTavern?.getContext === 'function') {
                const ctx = win.SillyTavern.getContext();
                if (ctx && ctx.extensionSettings) {
                    console.log(`${LOG_PREFIX} 宿主就绪，等待 ${Date.now() - start}ms（轮询 ${poll} 次）`);
                    return true;
                }
            }
        } catch {
            // getContext 抛出异常说明宿主尚未完全初始化，继续轮询
        }
        poll++;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.warn(`${LOG_PREFIX} 等待宿主就绪超时（${maxWaitMs}ms），插件未初始化`);
    return false;
}