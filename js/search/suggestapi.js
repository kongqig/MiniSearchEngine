/**
 * 远程搜索建议（独立于搜索引擎，可单独配置）。
 * 来源：百度 / 必应 / 谷歌 / 自定义接口；字典建议始终由 suggestions.js 从本机索引生成，
 * 远程结果只作为额外分组叠加，失败时静默回退（不打扰用户）。
 *
 * 策略（v2.4）：
 *  - 百度 sugrec / 必应 qsonhs / 谷歌 suggestqueries 三个内置源均走 JSONP（script 注入，
 *    天然免 CORS），无需配置任何代理即可直连使用；
 *    （v2.3 及之前必应走 osjson fetch、谷歌走 firefox fetch，均被浏览器 CORS 拦截
 *     —— 即使网络可达也拿不到数据，这正是「只有百度能用」的原因）
 *  - 自定义接口走 fetch；若接口有 CORS 限制，可在设置中配置代理模板（{url} 占位符）重试；
 *  - 全部超时 3s；结果会话内缓存（5 分钟，容量 50）；
 *  - 自定义接口响应格式自动识别（OpenSearch 数组 / suggestions / 字符串数组 / 百度 sugrec）。
 */

import { applyEngineTemplate } from '../config.js';

const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 50;
const TIMEOUT = 3000;
const MAX_ITEMS = 8;

const cache = new Map(); // key -> { at, items }

function cacheGet(key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;
    if (hit) cache.delete(key);
    return null;
}
function cachePut(key, items) {
    if (cache.size >= CACHE_MAX) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(key, { at: Date.now(), items });
}

/**
 * JSONP：注入 script，回调名唯一，超时/出错清理。
 * @param {string} url 目标接口
 * @param {string} cbParam 回调参数名（百度/必应为 cb，谷歌为 jsonp）
 */
function jsonp(url, cbParam = 'cb') {
    return new Promise((resolve, reject) => {
        const cb = `__msSug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const script = document.createElement('script');
        const timer = setTimeout(() => { cleanup(); reject(new Error('jsonp timeout')); }, TIMEOUT);
        const cleanup = () => {
            clearTimeout(timer);
            delete window[cb];
            script.remove();
        };
        window[cb] = (data) => { cleanup(); resolve(data); };
        script.onerror = () => { cleanup(); reject(new Error('jsonp error')); };
        script.src = `${url}${url.includes('?') ? '&' : '?'}${cbParam}=${cb}`;
        document.head.appendChild(script);
    });
}

/** fetch + 超时；失败且配置代理模板 → 包裹重试（仅自定义接口使用） */
async function fetchJson(url, proxyTpl) {
    const tryFetch = async (u) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
        try {
            const res = await fetch(u, { signal: ctrl.signal, credentials: 'omit' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    };
    try {
        return await tryFetch(url);
    } catch (err) {
        if (!proxyTpl) throw err;
        return await tryFetch(proxyTpl.replaceAll('{url}', encodeURIComponent(url)));
    }
}

/** 必应 qsonhs 响应归一化为 OpenSearch [query, items[]] */
function bingNormalize(data) {
    const items = [];
    const push = (v) => {
        const s = String(v ?? '').trim();
        if (s && !items.includes(s)) items.push(s);
    };
    for (const group of data?.AS?.Results || []) {
        for (const sug of group?.Suggests || []) push(sug?.Txt);
    }
    return [String(data?.AS?.Query || ''), items];
}

const ADAPTERS = {
    // 百度 sugrec：JSONP（cb 参数），返回 sugrec 对象（parseItems 识别 g 字段）
    baidu: (q) => jsonp(`https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(q)}`),
    // 必应 qsonhs：JSONP（type=cb 触发回调包裹），响应归一化为 OpenSearch 数组
    bing: (q) => jsonp(`https://api.bing.com/qsonhs.aspx?q=${encodeURIComponent(q)}&type=cb`).then(bingNormalize),
    // 谷歌 suggestqueries：JSONP（回调参数名为 jsonp），firefox 客户端返回 OpenSearch 数组
    google: (q, hl) => jsonp(
        `https://suggestqueries.google.com/complete/search?client=firefox&hl=${hl === 'en' ? 'en' : 'zh-CN'}&q=${encodeURIComponent(q)}`,
        'jsonp',
    ),
};

/** 响应格式容错解析 → string[] */
function parseItems(data) {
    const out = [];
    const push = (v) => {
        const s = String(v ?? '').trim();
        if (s && !out.includes(s)) out.push(s);
    };
    if (Array.isArray(data)) {
        // OpenSearch: [query, [s1, s2]] 或字符串数组
        const arr = Array.isArray(data[1]) ? data[1] : data;
        for (const it of arr.slice(0, MAX_ITEMS * 2)) {
            if (typeof it === 'string') push(it);
            else if (it && typeof it === 'object') push(it.q ?? it.k ?? it.phrase ?? it.keyword ?? it.text ?? '');
            if (out.length >= MAX_ITEMS) break;
        }
    } else if (data && typeof data === 'object') {
        const pool = data.suggestions ?? data.g ?? data.items ?? data.results ?? [];
        for (const it of (Array.isArray(pool) ? pool : []).slice(0, MAX_ITEMS * 2)) {
            if (typeof it === 'string') push(it);
            else if (it && typeof it === 'object') push(it.q ?? it.k ?? it.phrase ?? it.keyword ?? it.text ?? '');
            if (out.length >= MAX_ITEMS) break;
        }
    }
    return out.slice(0, MAX_ITEMS);
}

/**
 * 获取远程建议。
 * @param {string} source bing | baidu | google | custom
 * @param {string} query 用户输入
 * @param {object} cfg store.config（含 suggestCustomUrl / suggestProxyUrl / language）
 * @returns {Promise<string[]>} 失败返回 []（不抛出）
 */
export async function fetchRemote(source, query, cfg) {
    const q = String(query ?? '').trim();
    if (!q || source === 'dict') return [];
    const key = `${source}:${q.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) return cached;

    try {
        let data;
        if (source === 'custom') {
            const tpl = String(cfg?.suggestCustomUrl || '').trim();
            if (!tpl) return [];
            const url = applyEngineTemplate(tpl, q);
            const proxy = String(cfg?.suggestProxyUrl || '').trim();
            data = proxy ? await fetchJson(url, proxy) : await fetchJson(url);
        } else {
            const adapter = ADAPTERS[source];
            if (!adapter) return [];
            data = await adapter(q, cfg?.language);
        }
        const items = parseItems(data);
        cachePut(key, items);
        return items;
    } catch (err) {
        console.warn(`[suggestapi] ${source} 建议获取失败（已回退字典）:`, err?.message || err);
        return [];
    }
}

/** 清空缓存（供测试/诊断） */
export function clearCache() {
    cache.clear();
}
