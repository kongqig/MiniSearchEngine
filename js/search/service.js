/**
 * 搜索服务编排：解析语法 → 本地检索 → 过滤 → 分页/缓存 → 路由（直跳或结果页）→ 工具卡片 / AI 触发。
 * UI 只调用 executeSearch / changePage / retryAi，不感知内部细节。
 */

import { store, addHistory } from '../store.js';
import { SEARCH_CACHE_SIZE } from '../config.js';
import { t } from '../i18n.js';
import { toast } from '../ui/dom.js';
import * as indexer from './indexer.js';
import { parseQuery, applyFilters, withHost, buildEngineUrl } from './query.js';
import { detectTools } from '../tools/cards.js';
import { runAiAnswer, stopAiAnswer } from '../ai/answer.js';

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map(); // `${query}#${dataStamp}` -> { at, results, note }

// 数据版本戳：字典任何增删改都会使旧缓存自然失效（修复：示例载入/单条编辑后缓存不失效）
let dataStamp = 0;
store.subscribe('entries', () => { dataStamp++; }, { immediate: false });

function cacheGet(key) {
    if (!store.get('config').cacheEnabled) return null;
    const hit = cache.get(`${key}#${dataStamp}`);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL) {
        cache.delete(`${key}#${dataStamp}`);
        return null;
    }
    return hit;
}

function cachePut(key, value) {
    if (!store.get('config').cacheEnabled) return;
    if (cache.size >= SEARCH_CACHE_SIZE) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
    cache.set(`${key}#${dataStamp}`, value);
}

/** 外部引擎跳转区要展示的引擎 key 列表（默认引擎排最前；自定义引擎未配置地址时不展示） */
function externalEngineKeys() {
    const cfg = store.get('config');
    if (!cfg.multiSourceSearch) return [];
    const all = ['bing', 'baidu', 'google', 'github'];
    if (cfg.customEngineUrl) all.push('custom');
    const def = cfg.defaultEngine;
    if (def !== 'dictionary' && (def !== 'custom' || cfg.customEngineUrl)) {
        return [def, ...all.filter((k) => k !== def)];
    }
    return all;
}

/**
 * 执行一次搜索（唯一入口）。
 * 路由规则：默认引擎为外部引擎（bing/baidu/google）→ 直接跳转该引擎（附 site:/filetype: 语法）；
 *           默认引擎为字典 → 本机检索，multiSourceSearch 开启时结果页附带外部引擎跳转。
 * @param {string} raw 用户原始输入
 */
export async function executeSearch(raw) {
    const query = String(raw ?? '').trim();
    if (!query) return;

    const cfg = store.get('config');
    addHistory(query);

    const parsed = parseQuery(query, { enabled: cfg.advancedSearch });

    // 外部引擎为默认 → 直接跳转（附语法）
    if (cfg.defaultEngine && cfg.defaultEngine !== 'dictionary') {
        const url = buildEngineUrl(cfg.defaultEngine, parsed, cfg.customEngineUrl);
        if (!url) {
            // 自定义引擎未配置地址：提示且不跳转（建议与 UI 无耦合，服务层仅 toast）
            toast(t('请先在 设置 → 搜索设置 中配置自定义引擎地址'));
            return;
        }
        if (cfg.openInNewTab) window.open(url, '_blank', 'noopener');
        else location.href = url;
        return;
    }

    store.set('search', {
        status: 'loading',
        raw: query,
        parsed,
        results: [],
        total: 0,
        page: 1,
        pageSize: Number(cfg.resultsPerPage) || 20,
        external: externalEngineKeys(),
        perfMs: 0,
        error: null,
        filteredNote: '',
    });

    // 结果页视图切换由视图层订阅 store.search.status 完成
    const started = performance.now();
    try {
        let results = [];
        let note = '';

        if (parsed.text) {
            const cached = cacheGet(query);
            if (cached) {
                results = cached.results;
                note = cached.note;
            } else {
                const hits = indexer.search(parsed.text, { limit: 300 })
                    .map(({ entry, score }) => ({ entry: withHost(entry), score }));
                const filtered = applyFilters(hits, parsed);
                results = filtered.results;
                note = filtered.note;
                cachePut(query, { at: Date.now(), results, note });
            }
        }

        store.set('search', {
            ...store.get('search'),
            status: 'done',
            results,
            total: results.length,
            page: 1,
            perfMs: Math.round((performance.now() - started) * 10) / 10,
            filteredNote: note,
        });
    } catch (err) {
        console.error('[service] 搜索失败', err);
        store.set('search', { ...store.get('search'), status: 'error', error: err.message || '搜索失败' });
    }

    // 工具卡片：按当前查询关键词触发
    store.set('toolCards', detectTools(parsed.text || query));

    // AI 回答（独立流，不阻塞结果渲染）
    stopAiAnswer();
    if (cfg.aiEnabled && parsed.text) {
        runAiAnswer(parsed.text);
    } else {
        store.set('ai', { status: 'idle', query: '', content: '', error: null, provider: '' });
    }
}

/** 翻页（结果已在内存，直接切片） */
export function changePage(page) {
    const s = store.get('search');
    const pageSize = Number(s.pageSize) || 20;
    const totalPages = Math.max(1, Math.ceil(s.total / pageSize));
    const next = Math.min(Math.max(1, page), totalPages);
    if (next === s.page) return;
    store.set('search', { ...s, page: next });
}

/** 搜索索引重建后清空缓存 */
export function invalidateCache() {
    cache.clear();
}
