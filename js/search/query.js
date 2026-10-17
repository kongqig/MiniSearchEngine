/**
 * 高级搜索语法解析与外部引擎 URL 构造。
 * 语法（advancedSearch 开启时生效）：
 *   site:example.com    限定域名（本地过滤 host 精确或子域匹配；外部追加到引擎语法）
 *   filetype:pdf        限定类型（本地匹配 URL 扩展名或标签；外部追加到引擎语法）
 * 解析出的片段从正文剔除；未开启语法时按原文处理。
 */

import { ENGINES, applyEngineTemplate } from '../config.js';

const SITE_RE = /\bsite:(\S+)/gi;
const FILETYPE_RE = /\bfiletype:(\S+)/gi;

export function parseQuery(raw, { enabled = true } = {}) {
    const original = String(raw ?? '');
    let text = original;
    let site = null;
    let filetype = null;

    if (enabled) {
        const siteMatches = [...text.matchAll(SITE_RE)];
        if (siteMatches.length > 0) {
            site = siteMatches[siteMatches.length - 1][1].replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
        }
        const ftMatches = [...text.matchAll(FILETYPE_RE)];
        if (ftMatches.length > 0) {
            filetype = ftMatches[ftMatches.length - 1][1].replace(/^\./, '').toLowerCase();
        }
        text = text.replace(SITE_RE, ' ').replace(FILETYPE_RE, ' ').replace(/\s+/g, ' ').trim();
    }

    return { raw: original, text: enabled ? text : original.trim(), site, filetype };
}

/** host 是否匹配 site（精确或任意子域） */
function hostMatches(host, site) {
    if (!host || !site) return false;
    return host === site || host.endsWith('.' + site);
}

/** 条目是否命中 filetype（URL 扩展名 或 标签） */
function entryMatchesFiletype(entry, ext) {
    if (!ext) return false;
    try {
        const path = new URL(entry.url).pathname.toLowerCase();
        if (path.endsWith('.' + ext)) return true;
    } catch { /* ignore */ }
    return (entry.tags || []).some((tag) => tag.toLowerCase() === ext);
}

/** 对检索结果应用 site:/filetype: 过滤，返回 { results, note } */
export function applyFilters(results, parsed) {
    const { site, filetype } = parsed;
    if (!site && !filetype) return { results, note: '' };
    const filtered = results.filter(({ entry }) => {
        if (site && !hostMatches(entry.host || '', site)) return false;
        if (filetype && !entryMatchesFiletype(entry, filetype)) return false;
        return true;
    });
    const notes = [];
    if (site) notes.push(`site:${site}`);
    if (filetype) notes.push(`filetype:${filetype}`);
    return { results: filtered, note: notes.join(' · ') };
}

/** 解析时附加 host，避免检索后重复 new URL */
export function withHost(entry) {
    let host = '';
    try { host = new URL(entry.url).hostname.toLowerCase(); } catch { /* ignore */ }
    return { ...entry, host };
}

/**
 * 构造外部引擎搜索 URL（含 site:/filetype: 语法）
 * @param {string} engineKey 引擎 key（github / custom / bing ...）
 * @param {object} parsed parseQuery 结果
 * @param {string} [customUrl] config.customEngineUrl（engineKey === 'custom' 时必传）
 * @returns {string} URL；custom 未配置模板时返回空串
 */
export function buildEngineUrl(engineKey, parsed, customUrl = '') {
    let q = parsed.text;
    if (parsed.site) q += ` site:${parsed.site}`;
    if (parsed.filetype) q += ` filetype:${parsed.filetype}`;
    if (engineKey === 'custom') {
        return customUrl ? applyEngineTemplate(customUrl, q) : '';
    }
    const engine = ENGINES[engineKey];
    if (!engine || !engine.url) return '';
    return engine.url(q);
}
