/**
 * 拼音预计算层。
 * 写入 IndexedDB 时即完成计算，搜索时零等待：
 *   searchText       name+tags+desc 拼接小写
 *   pinyin           带空格分隔的全拼（如 "wei xin zhi fu"）
 *   pinyinCompact    无分隔全拼（如 "weixinzhifu"），支持整词连打
 *   pinyinInitials   简拼（如 "wxzf"）
 *
 * pinyin-pro 通过 CDN 动态加载；失败时功能自动降级（仅文本搜索），不阻塞应用。
 */

import { CDN } from '../config.js';

let pinyinLib = null;   // 模块内单例，不泄漏到全局
let libPromise = null;

async function loadOnce() {
    if (pinyinLib) return pinyinLib;
    if (!libPromise) {
        libPromise = (async () => {
            let lastErr = null;
            for (const url of CDN.pinyin) {
                try {
                    const mod = await import(/* @vite-ignore */ url);
                    const lib = mod?.pinyin ? mod : mod?.default;
                    if (typeof lib?.pinyin === 'function') {
                        pinyinLib = lib;
                        return lib;
                    }
                } catch (err) {
                    lastErr = err;
                }
            }
            console.warn('[precompute] pinyin-pro 加载失败，拼音搜索不可用', lastErr?.message || lastErr);
            return null;
        })();
    }
    return libPromise;
}

/** 预热（启动时调用，不抛错） */
export function ensureLib() {
    return loadOnce().catch(() => null);
}

export function isLibReady() {
    return Boolean(pinyinLib);
}

const PY_OPTS = { toneType: 'none', type: 'array', nonZh: 'consecutive', v: true };

/** 对单条记录计算全部搜索字段（需 isLibReady()） */
export function computeFields(entry) {
    if (!pinyinLib) throw new Error('pinyin 库未就绪');
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    // v2.8：别名参与全部拼音字段——「大肥鱼AI」作为 DeepSeek 的别名时，
    // 搜 dafeyu / dfy / 大肥鱼AI 都能命中（hay 顺序：主名 → 别名 → 标签 → 简介）
    const hay = [entry.name, ...aliases, (entry.tags || []).join(' '), entry.description || '']
        .filter(Boolean).join(' ');
    const toks = pinyinLib
        .pinyin(hay, PY_OPTS)
        .map((s) => String(s).trim())
        .filter(Boolean);
    return {
        searchText: hay.toLowerCase(),
        pinyin: toks.join(' ').toLowerCase(),
        pinyinCompact: toks.join('').replace(/\s+/g, '').toLowerCase(),
        pinyinInitials: toks.map((s) => s[0]).join('').toLowerCase(),
        aliasesText: aliases.join(' '),
    };
}

/** 记录是否已带完整搜索字段 */
export function hasSearchFields(entry) {
    return Boolean(entry && typeof entry.searchText === 'string' && typeof entry.pinyinCompact === 'string');
}
