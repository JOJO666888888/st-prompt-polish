/**
 * lib/polish.js — 「提示词工程专家」润色引擎
 *
 * 双通道：
 *   - 'st'      : 复用 ST 当前连接模型（generateQuietPrompt，与 st-minigames 工坊同款调用）
 *   - 'custom'  : 自定义 OpenAI 兼容 API（/chat/completions，可独立指定模型）
 *
 * 模式：
 *   - polish   ：对原始草稿做首轮润色（补全/消歧/结构化）
 *   - rewrite  ：对已润色结果再优化一轮（重写、多轮 ×3 均走此模式）
 *
 * 所有调用带超时保护（st 通道依赖 ST 自身中断，custom 通道用 AbortController）。
 */

import { getHostContext } from './host.js';
import { log } from './log.js';

const CUSTOM_TIMEOUT_MS = 120000;

/** 润色（首轮）：对原始草稿做补全/消歧/结构化 */
export function buildPolishUserMessage(draft) {
    return `请润色以下提示词草稿：

"""${draft}"""

只输出优化后的提示词正文。`;
}

/** 重写（第 2+ 轮）：在上一版结果基础上再优化一轮 */
export function buildRewriteUserMessage(previousText) {
    return `你是一位资深的提示词工程专家。下面是一段已经初步润色过的提示词，请再进行一轮优化：
重点改进：进一步补全缺失要素、打磨措辞消除歧义、强化执行步骤与输出格式、提升可操作性。
保持原始意图、语言与整体结构。只输出优化后的提示词正文，不要任何解释或围栏。

"""${previousText}"""`;
}

/**
 * 构造单次调用的 prompt（含系统提示词）。
 * @returns {{system: string, user: string}}
 */
function buildPromptPair(settings, draft, mode) {
    const user = mode === 'rewrite' ? buildRewriteUserMessage(draft) : buildPolishUserMessage(draft);
    return {
        system: settings.polishSystemPrompt || DEFAULT_FALLBACK_SYSTEM,
        user,
    };
}

/** 设置里系统提示词为空时的兜底 */
const DEFAULT_FALLBACK_SYSTEM =
    '你是一位资深的提示词工程专家。请把用户的提示词草稿补全（目标/对象/范围/约束/输出格式/验收标准）、消除歧义、' +
    '按「角色/任务/步骤/输出格式/质量约束」组织，保持原始意图与语言，只输出优化后的提示词正文。';

/** 获取当前最大输出 tokens（按通道取不同上限） */
function resolveMaxTokens(settings) {
    return settings.llmSource === 'custom' ? settings.customApi.maxTokens : settings.maxTokens;
}

/**
 * ST 通道：generateQuietPrompt。
 * 位置参数形式在标准 ST 与 TauriTavern 上均兼容；
 * skip_wian=true 跳过世界书注入，减少上下文污染；ephemeral=true 不留消息。
 */
async function callStChannel(userPrompt, systemPrompt, maxTokens) {
    const ctx = getHostContext();
    if (typeof ctx?.generateQuietPrompt !== 'function') {
        throw new Error('宿主不支持 generateQuietPrompt（ST 版本过旧或 TauriTavern 接口差异）');
    }
    // 系统提示词拼接进用户消息（quiet prompt 不走完整上下文渲染，系统角色不可靠）
    const merged = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
    const text = await ctx.generateQuietPrompt(merged, false, true, null, null, maxTokens, null);
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('ST 通道返回为空（模型未输出润色结果）');
    }
    return text.trim();
}

/**
 * 自定义 OpenAI 兼容 API 通道：POST /chat/completions。
 * 注意：浏览器直连有 CORS 限制，仅支持允许跨域的服务（OpenAI/DeepSeek/Ollama 等一般可用）。
 */
async function callCustomChannel(userPrompt, systemPrompt, customApi) {
    const baseUrl = String(customApi?.baseUrl || '').replace(/\/+$/, '');
    const model = customApi?.model || 'deepseek-chat';
    const maxTokens = Number(customApi?.maxTokens) || 8192;
    const apiKey = String(customApi?.apiKey || '');
    if (!baseUrl) throw new Error('自定义 API 地址为空，请在设置中配置');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CUSTOM_TIMEOUT_MS);
    let bodyText = '';
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt || DEFAULT_FALLBACK_SYSTEM },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: maxTokens,
                temperature: 0.7,
            }),
            signal: controller.signal,
        });
        bodyText = await response.text();
        if (!response.ok) {
            let detail = '';
            try {
                const parsed = JSON.parse(bodyText);
                detail = parsed?.error?.message || JSON.stringify(parsed).slice(0, 300);
            } catch {
                detail = bodyText.slice(0, 300);
            }
            throw new Error(`HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
        }
        const data = JSON.parse(bodyText);
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('自定义 API 返回为空（无 choices[0].message.content）');
        }
        return content.trim();
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error(`自定义 API 请求超时（${CUSTOM_TIMEOUT_MS / 1000}s），请检查网络或地址`);
        }
        // 未捕获的 fetch 错误多为网络/CORS
        if (err instanceof TypeError && !String(err.message).includes('HTTP')) {
            throw new Error(`无法连接 API（${err.message}）。若为浏览器直连，请确认目标服务允许跨域`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 单次润色调用。
 * @param {string} draft 待处理的文本（草稿或上一版结果）
 * @param {object} settings 完整设置
 * @param {'polish'|'rewrite'} [mode] 轮次模式
 * @returns {Promise<string>}
 */
export async function runPolishOnce(draft, settings, mode = 'polish') {
    if (!draft || !draft.trim()) throw new Error('输入文本为空');
    const { system, user } = buildPromptPair(settings, draft, mode);
    if (settings.llmSource === 'custom') {
        log('info', 'client', `自定义 API 调用（${settings.customApi.model}）…`);
        return await callCustomChannel(user, system, settings.customApi);
    }
    log('info', 'client', `ST 通道调用（generateQuietPrompt，上限 ${resolveMaxTokens(settings)} tokens）…`);
    return await callStChannel(user, system, resolveMaxTokens(settings));
}

/**
 * 多轮改写：连续迭代 n 轮，每轮基于上一轮输出，返回最终结果。
 * @returns {Promise<string>}
 */
export async function multiRoundPolish(draft, settings, rounds = 3) {
    let result = draft;
    for (let i = 0; i < rounds; i++) {
        result = await runPolishOnce(result, settings, 'rewrite');
    }
    return result;
}

/** 便捷：用固定测试文本验证自定义 API 是否可用 */
export async function testCustomApi(customApi) {
    const settings = {
        llmSource: 'custom',
        maxTokens: 2048,
        polishSystemPrompt: undefined, // 走内置兜底系统提示词
        customApi,
    };
    return await runPolishOnce('请帮我写一份简洁的工作周报，不超过 100 字。', settings, 'polish');
}