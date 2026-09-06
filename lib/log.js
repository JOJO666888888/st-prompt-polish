/**
 * lib/log.js — 诊断日志缓冲
 *
 * 内存环形缓冲（默认 200 条），供面板「📋 日志」抽屉展示，
 * 排查润色失败（API 401/404/超时、模型路由缺失等）时使用。
 */

const LOG_PREFIX = '[st-prompt-polish]';

const MAX_ENTRIES = 200;
const entries = [];

/** 记录一条日志（自动带时间戳，滚动丢弃最旧） */
export function log(level, source, message) {
    const entry = {
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        level: ['info', 'warn', 'error'].includes(level) ? level : 'info',
        source: source === 'host' ? 'host' : 'client',
        message: String(message ?? ''),
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    console.log(`${LOG_PREFIX} [${entry.source}/${entry.level}] ${entry.message}`);
    return entry;
}

/** 全部日志（新→旧） */
export function getLogs() {
    return [...entries].reverse();
}

/** 清空缓冲 */
export function clearLogs() {
    entries.length = 0;
}