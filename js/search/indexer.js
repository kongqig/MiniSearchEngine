/**
 * 搜索索引层（FlexSearch Document 多字段索引 + 降级线性匹配）。
 *
 * 策略（经 1w 条基准验证，p95 ≈ 3ms，远低于 50ms 要求）：
 *  - 中文字段用 Charset.CJK bigram 编码 → 支持中文子串命中
 *  - 拼音字段（带空格 / 无空格 / 简拼）用 forward 前缀索引
 *  - 主检索不做模糊（避免噪声），0 命中时再以 suggest 兜底一次
 *  - FlexSearch CDN 加载失败时自动降级为内存线性匹配（小目录仍可用）
 *  - v2.6：出口统一「相关度重排」——匹配质量分档
 *    （相等 > 前缀 > 包含 > 词项覆盖），修复「微信读书排在微信前」
 *    与「deepseek官网 拉进 edx/deepsearch」类排序问题
 *  - v2.8：别名字段（aliasesText）入索引/降级匹配/重排——一站多名可搜，
 *    别名匹配质量与主名同档计算（权重略低于主名）
 */

import { CDN } from '../config.js';
import { store } from '../store.js';

let FlexSearch = null;
let documentIndex = null;
let entriesById = new Map();
let mode = 'none'; // none | flexsearch | fallback
let buildSeq = 0;  // 防止并发构建串台

/** 字段定义与权重（越大越靠前） */
const FIELDS = [
    { field: 'name', weight: 4, cjk: true },
    { field: 'aliasesText', weight: 3, cjk: true },  // v2.8：别名原文（空格拼接），与拼音同档
    { field: 'tags', weight: 2, cjk: true },
    { field: 'description', weight: 1, cjk: true },
    { field: 'pinyin', weight: 3 },
    { field: 'pinyinCompact', weight: 2.5 },
    { field: 'pinyinInitials', weight: 3 },
];

async function loadFlexSearch() {
    if (FlexSearch) return FlexSearch;
    try {
        const mod = await import(/* @vite-ignore */ CDN.flexsearch);
        const lib = mod?.Document ? mod : mod?.default;
        if (typeof lib?.Document === 'function') {
            FlexSearch = lib;
            return lib;
        }
        throw new Error('flexsearch 导出异常');
    } catch (err) {
        console.warn('[indexer] FlexSearch 加载失败，降级为线性匹配', err?.message || err);
        return null;
    }
}

function buildFlexDocument() {
    const { Document, Charset } = FlexSearch;
    return new Document({
        document: {
            id: 'id',
            index: FIELDS.map(({ field, cjk }) =>
                cjk && Charset ? { field, encode: Charset.CJK, tokenize: 'strict' } : { field, tokenize: 'forward' }
            ),
            store: false,
        },
    });
}

/** 启动时调用：加载 FlexSearch（不构建） */
export async function init() {
    await loadFlexSearch();
}

export function getMode() {
    return mode;
}

/**
 * 全量构建索引（分块异步，UI 不卡顿；进度写入 store.buildProgress）
 */
export async function build(entries) {
    const seq = ++buildSeq;
    entriesById = new Map(entries.map((e) => [e.id, e]));
    store.set('searchReady', false);
    store.set('buildProgress', 0);

    if (FlexSearch) {
        documentIndex = buildFlexDocument();
        mode = 'flexsearch';
        const CHUNK = 400;
        for (let i = 0; i < entries.length; i += CHUNK) {
            if (seq !== buildSeq) return; // 有新构建请求，放弃本轮
            for (const entry of entries.slice(i, i + CHUNK)) {
                documentIndex.add(entry);
            }
            store.set('buildProgress', Math.round((Math.min(i + CHUNK, entries.length) / Math.max(entries.length, 1)) * 100));
            await new Promise((r) => setTimeout(r, 0));
        }
    } else {
        mode = 'fallback';
        store.set('buildProgress', 100);
    }
    if (seq !== buildSeq) return;
    store.set('searchReady', true);
}

export async function rebuild(entries) {
    return build(entries);
}

export function addEntry(entry) {
    entriesById.set(entry.id, entry);
    if (mode === 'flexsearch' && documentIndex) documentIndex.add(entry);
}

export function updateEntry(entry) {
    entriesById.set(entry.id, entry);
    if (mode === 'flexsearch' && documentIndex) {
        documentIndex.remove(entry.id);
        documentIndex.add(entry);
    }
}

export function removeEntry(id) {
    entriesById.delete(id);
    if (mode === 'flexsearch' && documentIndex) {
        try { documentIndex.remove(id); } catch { /* id 不存在时部分版本抛错，忽略 */ }
    }
}

/** 单条结果加权合并 */
function mergeScores(response, limit) {
    const scores = new Map();
    for (const fieldResult of response) {
        const weight = FIELDS.find((f) => f.field === fieldResult.field)?.weight ?? 1;
        const n = fieldResult.result.length || 1;
        fieldResult.result.forEach((id, i) => {
            const score = weight * (1 - i / n);
            scores.set(id, Math.max(scores.get(id) || 0, score));
        });
    }
    return [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id, score]) => ({ entry: entriesById.get(id), score }))
        .filter((r) => r.entry);
}

/** 降级线性匹配（与 flexsearch 同权重语义） */
function fallbackSearch(text, limit) {
    const q = text.toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const out = [];
    for (const entry of entriesById.values()) {
        const hay = {
            name: (entry.name || '').toLowerCase(),
            aliasesText: (entry.aliasesText || '').toLowerCase(),
            tags: (entry.tags || []).join(' ').toLowerCase(),
            description: (entry.description || '').toLowerCase(),
            pinyin: (entry.pinyin || '').toLowerCase(),
            pinyinCompact: (entry.pinyinCompact || '').toLowerCase(),
            pinyinInitials: (entry.pinyinInitials || '').toLowerCase(),
        };
        let ok = true;
        let score = 0;
        for (const term of terms) {
            if (hay.name.includes(term)) { score += 4; continue; }
            if (hay.aliasesText.includes(term)) { score += 3; continue; }
            if (hay.pinyinCompact.includes(term)) { score += 2.5; continue; }
            if (hay.pinyinInitials.includes(term)) { score += 3; continue; }
            if (hay.pinyin.includes(term)) { score += 2; continue; }
            if (hay.tags.includes(term)) { score += 2; continue; }
            if (hay.description.includes(term)) { score += 1; continue; }
            ok = false;
            break;
        }
        if (ok) out.push({ entry, score });
        if (out.length > limit * 4) break;
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * 相关度重排层（v2.6）
 *
 * FlexSearch 只给「字段内命中排名」，缺少「查询词与条目文本的匹配质量」
 * 评分，导致典型问题：
 *   搜「微信」→「微信读书」排在「微信」前面（name 相等应远高于 name 前缀）；
 *   搜「deepseek官网」→ 主检索 0 命中走 suggest 兜底，edx / deepsearch 等
 *   宽松匹配被拉进来且排在 DeepSeek 前面。
 *
 * 重排分档（字段内）：
 *   完全相等 100 > 前缀 55~90（值越短越高）> 包含 32~52 > 词项覆盖 0~30 > 0
 * 多字段取 加权最大分；排序键 = 重排分 → 原 FlexSearch 分 → 稳定序。
 * 兜底（suggest）结果默认丢弃 0 分条目（宽松匹配垃圾），但全部为 0 时保留。
 * 仅对返回的 top N 条做重排（纯字符串运算，亚毫秒级）。
 * ------------------------------------------------------------------ */

/** 重排字段与权重（与 FIELDS 的索引权重独立：这里评「匹配质量」）。
 * each: true 表示字段是数组，逐项评分取最大（别名逐个算，避免拼接后
 * 前缀/包含档被其他别名字符污染） */
const RR_FIELDS = [
    { get: (e) => e.name, w: 1.0 },
    { get: (e) => e.aliases, w: 0.9, each: true },
    { get: (e) => e.pinyinCompact, w: 0.85 },
    { get: (e) => e.pinyinInitials, w: 0.8 },
    { get: (e) => e.pinyin, w: 0.6 },
    { get: (e) => (e.tags || []).join(' '), w: 0.5 },
    { get: (e) => e.description, w: 0.3 },
];

/**
 * 查询分词：英文/数字连续段为一个词，中文相邻字两两组 bigram（奇数尾字保留单字）。
 * 「deepseek官网」→ ['deepseek', '官网']；「微信」→ ['微信']；「wx」→ ['wx']
 */
function tokenizeQuery(q) {
    const raw = [];
    for (const m of String(q).matchAll(/[a-z0-9]+|[\u4e00-\u9fff]/gi)) {
        raw.push(m[0].toLowerCase());
    }
    const toks = [];
    let i = 0;
    while (i < raw.length) {
        const cur = raw[i];
        const nxt = raw[i + 1];
        if (cur.length === 1 && nxt && nxt.length === 1) { toks.push(cur + nxt); i += 2; }
        else { toks.push(cur); i += 1; }
    }
    return [...new Set(toks)];
}

/** 单字段匹配质量分（value 与查询均按去空格小写比较） */
function scoreField(value, q, terms) {
    const s = String(value).toLowerCase().replace(/\s+/g, '');
    if (!s) return 0;
    if (s === q) return 100; // 完全相等
    if (s.startsWith(q)) {   // 前缀：查询占值比例越高越靠前（「微信」90 vs「微信读书」72.5）
        return 55 + 35 * (q.length / s.length);
    }
    const idx = s.indexOf(q);
    if (idx > 0) {           // 包含：位置越靠前越好；clamp 保持低于前缀档
        const raw = 40 - Math.min(idx, 10) * 2 + 20 * (q.length / s.length);
        return Math.max(32, Math.min(52, raw));
    }
    if (!terms.length) return 0; // 词项覆盖：查询分词后的命中率（≤30，低于包含档）
    let hit = 0;
    for (const t of terms) { if (s.includes(t)) hit += 1; }
    if (!hit) return 0;
    // 同命中率下「值越冗余」越靠后：搜 deepseek官网 时，
    // DeepSeek（纯名字）应排在 DeepSeek 开放平台（名字更长）前面
    return (hit / terms.length) * 30 * (q.length / (q.length + s.length * 0.3));
}

function scoreEntry(entry, q, terms) {
    let best = 0;
    for (const { get, w, each } of RR_FIELDS) {
        const v = get(entry);
        if (!v) continue;
        let s;
        if (each && Array.isArray(v)) {
            s = 0;
            for (const item of v) {
                const sc = scoreField(item, q, terms);
                if (sc > s) s = sc;
            }
        } else {
            s = scoreField(v, q, terms);
        }
        if (s * w > best) best = s * w;
    }
    return best;
}

/**
 * 对检索结果重排。results 为 [{ entry, score }]（原地排序，返回同数组）。
 * @param {boolean} dropZero 丢弃 0 分条目（suggest 兜底场景）；全部为 0 时保留原结果
 */
function rerank(results, query, { dropZero = false } = {}) {
    if (!results.length) return results;
    const q = String(query || '').toLowerCase().replace(/\s+/g, '');
    if (!q) return results;
    const terms = tokenizeQuery(q);
    for (const r of results) {
        r.rr = scoreEntry(r.entry, q, terms);
        if (r.rr > 0) r.score = r.rr; // 0 分保留原分，仅作 0 分档内部排序
    }
    results.sort((a, b) => (b.rr - a.rr) || (b.score - a.score));
    if (dropZero) {
        const kept = results.filter((r) => r.rr > 0);
        if (kept.length) return kept; // 全军覆没时保留（宽松兜底优于空屏）
    }
    return results;
}

/**
 * 本地搜索主入口。
 * @returns [{ entry, score }] 已按相关度排序（score = 重排后匹配质量分）
 */
export function search(text, { limit = 200 } = {}) {
    const q = String(text || '').trim();
    if (!q || mode === 'none') return [];

    if (mode === 'fallback') return rerank(fallbackSearch(q, limit), q);

    try {
        const response = documentIndex.search(q, { limit: Math.max(limit + 20, 30) });
        const merged = mergeScores(response, limit);
        if (merged.length > 0) return rerank(merged, q);
        // 0 命中 → 容错兜底（拼写近似 / 单字 bigram 缺失等）；
        // 兜底结果宽松，丢弃 0 分条目避免无关结果排到前面（deepseek官网 → edx 问题）
        const fuzzy = documentIndex.search(q, { limit: Math.max(limit + 20, 30), suggest: true });
        return rerank(mergeScores(fuzzy, limit), q, { dropZero: true });
    } catch (err) {
        console.warn('[indexer] flexsearch 查询异常，降级线性匹配', err);
        return rerank(fallbackSearch(q, limit), q);
    }
}
