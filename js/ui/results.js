/**
 * 结果页视图：搜索状态（加载/空/错误/完成）、结果列表（收藏星标）、
 * 过滤说明、外部引擎跳转、分页、AI 回答侧栏。全部由 store 驱动渲染。
 */

import { store } from '../store.js';
import { esc, extractDomain } from '../utils.js';
import { ENGINES, applyEngineTemplate } from '../config.js';
import { showPage } from './dom.js';
import { t, tf, onLanguageChange } from '../i18n.js';

const favSet = () => new Set(store.get('favorites').map((f) => f.id));

function renderResults(s) {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (s.status === 'loading') {
        container.innerHTML = `
            <div class="state-block">
                <div class="spinner"></div>
                <div class="state-text">${t('搜索中...')}</div>
            </div>`;
        return;
    }
    if (s.status === 'error') {
        container.innerHTML = `
            <div class="state-block">
                <div class="state-icon">⚠️</div>
                <div class="state-text">${t('搜索出错')}：${esc(s.error || t('未知错误'))}</div>
                <button class="btn btn-primary" data-action="retry-search">${t('重试')}</button>
            </div>`;
        return;
    }
    if (!s.results || s.results.length === 0) {
        const hasSyntax = s.parsed && (s.parsed.site || s.parsed.filetype);
        container.innerHTML = `
            <div class="state-block">
                <div class="state-icon">🔍</div>
                <div class="state-text">${t('没有找到相关网站')}</div>
                <div class="state-sub">${hasSyntax ? t('语法过滤后无命中，可去掉 site:/filetype: 试试') : t('试试其他关键词、拼音或简拼')}</div>
            </div>`;
        return;
    }

    const start = (s.page - 1) * (Number(s.pageSize) || 20);
    const pageSize = Number(s.pageSize) || 20;
    const pageItems = s.results.slice(start, start + pageSize);
    const favs = favSet();

    container.innerHTML = `
        <div class="results-meta">
            <span>${tf('共 {n} 条结果', { n: s.total })}</span>
            <span class="results-perf">${s.perfMs} ms</span>
        </div>
        <div class="result-list">
            ${pageItems.map(({ entry }) => renderItem(entry, favs.has(entry.id))).join('')}
        </div>
    `;
}

function renderItem(entry, isFav) {
    const tags = [
        ...(entry.tags || []).map((tg) => `<span class="tag tag-data">${esc(tg)}</span>`),
        entry.specialTag ? `<span class="tag ${entry.specialTag === '官方' ? 'tag-official' : 'tag-gov'}">${esc(entry.specialTag)}</span>` : '',
        `<span class="tag tag-source">${t('字典')}</span>`,
    ].join('');
    return `
        <div class="result-item" data-entry-id="${esc(entry.id)}">
            <div class="result-title-row">
                <a class="result-title" href="${esc(entry.url)}" ${store.get('config').openInNewTab ? 'target="_blank" rel="noopener noreferrer"' : ''}>${esc(entry.name)}</a>
                <button class="fav-btn ${isFav ? 'faved' : ''}" data-action="toggle-fav" data-id="${esc(entry.id)}" title="${isFav ? t('取消收藏') : t('收藏')}" aria-label="${t('收藏')}">${isFav ? '★' : '☆'}</button>
            </div>
            <div class="result-url">
                <span class="result-host">${esc(extractDomain(entry.url))}</span>
                ${tags}
            </div>
            ${entry.description ? `<div class="result-desc">${esc(entry.description)}</div>` : ''}
        </div>
    `;
}

function renderExternal(s) {
    const el = document.getElementById('external-engines');
    if (!el) return;
    const engines = s.external || [];
    if (engines.length === 0) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.classList.remove('hidden');
    const target = store.get('config').openInNewTab ? 'target="_blank" rel="noopener noreferrer"' : '';
    el.innerHTML = `
        <div class="external-title">${t('外部搜索')}</div>
        <div class="external-list">
            ${engines.map((key) => `
                <a class="external-chip" href="${esc(externalUrl(key, s))}" ${target}>
                    <span class="external-dot" data-engine="${key}"></span>${esc(ENGINES[key]?.name || key)}
                </a>`).join('')}
        </div>
    `;
}

function externalUrl(key, s) {
    let q = s.parsed?.text || s.raw || '';
    if (s.parsed?.site) q += ` site:${s.parsed.site}`;
    if (s.parsed?.filetype) q += ` filetype:${s.parsed.filetype}`;
    if (key === 'custom') return applyEngineTemplate(store.get('config').customEngineUrl || '', q);
    return ENGINES[key]?.url ? ENGINES[key].url(q) : '#';
}

function renderPagination(s) {
    const el = document.getElementById('pagination');
    if (!el) return;
    const pageSize = Number(s.pageSize) || 20;
    const totalPages = Math.ceil(s.total / pageSize);
    if (!s.total || !Number.isFinite(totalPages) || totalPages <= 1) {
        el.innerHTML = '';
        return;
    }
    const btn = (label, page, opts = {}) => `
        <button class="page-btn ${opts.active ? 'active' : ''}" data-action="goto-page" data-page="${page}"
            ${opts.disabled ? 'disabled' : ''}>${label}</button>`;

    const pages = new Set([1, 2, s.page - 1, s.page, s.page + 1, totalPages - 1, totalPages].filter((p) => p >= 1 && p <= totalPages));
    const sorted = [...pages].sort((a, b) => a - b);
    let html = btn(t('上一页'), s.page - 1, { disabled: s.page <= 1 });
    let prev = 0;
    for (const p of sorted) {
        if (p - prev > 1) html += `<span class="page-ellipsis">…</span>`;
        html += btn(String(p), p, { active: p === s.page });
        prev = p;
    }
    html += btn(t('下一页'), s.page + 1, { disabled: s.page >= totalPages });
    el.innerHTML = html;
}

function renderNote(s) {
    const el = document.getElementById('filter-note');
    if (!el) return;
    if (s.filteredNote) {
        el.classList.remove('hidden');
        el.innerHTML = `<span class="note-chip">${tf('已按 {q} 过滤', { q: esc(s.filteredNote) })}</span>`;
    } else {
        el.classList.add('hidden');
        el.innerHTML = '';
    }
}

function renderHeader(s) {
    const input = document.getElementById('search-input-result');
    if (input && document.activeElement !== input && s.raw) input.value = s.raw;
}

/** AI 侧栏 */
function renderAi(ai) {
    const wrap = document.getElementById('ai-response');
    if (!wrap) return;
    if (!ai || ai.status === 'idle') {
        wrap.classList.add('hidden');
        return;
    }
    wrap.classList.remove('hidden');
    const providerName = ai.provider || '';
    const statusText = {
        loading: t('正在思考...'),
        streaming: '',
        done: '',
        stopped: t('（已停止）'),
        error: '',
    }[ai.status] || '';

    const body = ai.status === 'loading' && !ai.content
        ? `<div class="ai-thinking"><span class="spinner spinner-sm"></span>${statusText}</div>`
        : ai.status === 'error'
            ? `<div class="ai-error">${esc(ai.error || t('请求失败'))}</div>`
            : `<div class="ai-text">${renderMarkdownish(ai.content)}${ai.status === 'streaming' ? '<span class="ai-cursor"></span>' : ''}</div>`;

    wrap.innerHTML = `
        <div class="ai-header">
            <span>${t('AI 回答')}${providerName ? `<span class="ai-provider">${esc(providerName)}</span>` : ''}</span>
            <div class="ai-header-actions">
                ${ai.status === 'loading' || ai.status === 'streaming' ? `<button class="ai-btn" data-action="ai-stop">${t('停止')}</button>` : ''}
                ${ai.status === 'error' || ai.status === 'stopped' ? `<button class="ai-btn" data-action="ai-retry">${t('重试')}</button>` : ''}
            </div>
        </div>
        <div class="ai-content">${body}</div>
    `;
}

/** 极轻量 Markdown 渲染（安全：先转义再替换，支持粗体/行内代码/换行/列表） */
function renderMarkdownish(text) {
    let s = esc(text || '');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/^#{1,4}\s+(.+)$/gm, '<strong>$1</strong>');
    s = s.replace(/^\s*[-*]\s+(.+)$/gm, '• $1');
    s = s.replace(/\n/g, '<br>');
    return s;
}

export function initView() {
    store.subscribe('search', (s) => {
        if (!s || s.status === 'idle') return;
        showPage('search');
        renderAll(s);
    });
    store.subscribe('ai', renderAi);
    // 收藏变化 → 同步星标（只更新按钮，不整页重绘）
    store.subscribe('favorites', () => {
        const favs = favSet();
        document.querySelectorAll('.result-item').forEach((item) => {
            const id = item.dataset.entryId;
            const btn = item.querySelector('.fav-btn');
            if (!btn || !id) return;
            const faved = favs.has(id);
            btn.classList.toggle('faved', faved);
            btn.textContent = faved ? '★' : '☆';
        });
    });
    // 语言切换 → 重渲染结果页静态文案
    onLanguageChange(() => {
        const s = store.get('search');
        if (s && s.status !== 'idle') {
            renderAll(s);
            renderAi(store.get('ai'));
        }
    });
}

function renderAll(s) {
    renderHeader(s);
    renderNote(s);
    renderResults(s);
    renderExternal(s);
    renderPagination(s);
}
