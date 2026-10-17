/**
 * 搜索建议下拉：历史匹配 + 字典推荐（走内存索引），首页 / 结果页双输入框各自定位。
 * 键盘：↑↓ 移动、Enter 选中或原文搜索、Esc 关闭。渲染只读 store，事件在 app.js 集中绑定。
 * 建议数据源与搜索引擎解耦：字典建议始终来自本机索引；可选叠加独立配置的远程建议引擎
 * （config.suggestSource，见 search/suggestapi.js），失败静默回退字典。
 * 默认引擎为外部引擎时，下拉底部提示当前搜索目标引擎。
 */

import { store } from '../store.js';
import { esc } from '../utils.js';
import { t, tf } from '../i18n.js';
import { engineName } from './engine.js';
import * as indexer from '../search/indexer.js';
import { fetchRemote } from '../search/suggestapi.js';

let activeInput = null;      // 当前打开建议的输入框
let flatItems = [];          // 扁平可选项 [{type:'remote'|'history'|'entry', query?, id?}]
let remoteSeq = 0;           // 竞态控制：只采纳最新一次输入触发的远程结果
let remoteTimer = null;      // 远程请求防抖

/** 输入框对应的下拉容器（两页各一个） */
function boxFor(inputEl) {
    const id = inputEl?.id === 'search-input-result' ? 'search-suggestions-result' : 'search-suggestions';
    return document.getElementById(id);
}
function box() { return boxFor(activeInput); }

/** 计算建议数据并写入 store.suggestions（字典/历史同步生成，远程建议异步叠加） */
export function refresh(inputEl) {
    activeInput = inputEl || null;
    const cfg = store.get('config');
    const raw = (inputEl?.value || '').trim();
    const prevRemote = (store.get('suggestions')?.remote || []);
    const sug = { visible: false, history: [], items: [], remote: [], active: -1 };

    if (cfg.suggestionsEnabled && raw) {
        const q = raw.toLowerCase();
        sug.history = store.get('history')
            .filter((h) => h.query.toLowerCase().includes(q) && h.query !== raw)
            .slice(0, 3);
        sug.items = indexer.search(raw, { limit: cfg.suggestionsCount });
    }

    // 远程建议：沿用上次结果直到新结果到达（避免闪烁）；来源与搜索引擎完全独立
    if (cfg.suggestionsEnabled && raw && cfg.suggestSource && cfg.suggestSource !== 'dict') {
        sug.remote = filterRemote(prevRemote, raw, sug.history, sug.items);
        scheduleRemote(raw, cfg);
    } else {
        remoteSeq += 1; // 取消在途请求
    }

    const has = sug.remote.length > 0 || sug.history.length > 0 || sug.items.length > 0;
    sug.visible = has;
    store.set('suggestions', sug);
}

/** 远程建议去重（排除历史/字典已有项）并限长 */
function filterRemote(list, raw, history, items) {
    const seen = new Set();
    const lower = raw.toLowerCase();
    for (const h of history || []) seen.add(h.query.toLowerCase());
    for (const it of items || []) seen.add(String(it.entry.name).toLowerCase());
    return list
        .filter((q) => q && q.toLowerCase() !== lower && !seen.has(q.toLowerCase()))
        .slice(0, 5);
}

/** 远程建议防抖拉取（250ms）；到达时输入已变或下拉已关则丢弃 */
function scheduleRemote(raw, cfg) {
    clearTimeout(remoteTimer);
    const seq = ++remoteSeq;
    remoteTimer = setTimeout(async () => {
        const items = await fetchRemote(cfg.suggestSource, raw, cfg);
        if (seq !== remoteSeq) return;                       // 已有更新输入
        const cur = activeInput;
        if (!cur || cur.value.trim() !== raw) return;        // 输入已变化
        const sug = store.get('suggestions');
        if (!sug?.visible) return;                           // 下拉已关闭
        const merged = filterRemote(items, raw, sug.history, sug.items);
        if (JSON.stringify(merged) === JSON.stringify(sug.remote || [])) return;
        store.set('suggestions', { ...sug, remote: merged });
    }, 250);
}

export function close() {
    if (!store.get('suggestions')?.visible) return;
    store.set('suggestions', { visible: false, history: [], items: [], remote: [], active: -1 });
}

export function handleInput(inputEl) {
    const value = inputEl.value.trim();
    if (!value) close();
    else refresh(inputEl);
}

/** 键盘导航。返回 'search' 表示按了 Enter 需要执行搜索（由 app.js 处理） */
export function handleKeydown(inputEl, event) {
    const sug = store.get('suggestions');
    if (!sug?.visible) {
        if (event.key === 'Escape') return 'blur';
        return null;
    }
    flatItems = [
        ...sug.remote.map((q) => ({ type: 'remote', query: q })),
        ...sug.history.map((h) => ({ type: 'history', query: h.query })),
        ...sug.items.map((r) => ({ type: 'entry', query: r.entry.name })),
    ];
    const max = flatItems.length - 1;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            store.set('suggestions', { ...sug, active: Math.min(sug.active + 1, max) });
            scrollActive();
            return 'consumed';
        case 'ArrowUp':
            event.preventDefault();
            store.set('suggestions', { ...sug, active: Math.max(sug.active - 1, -1) });
            scrollActive();
            return 'consumed';
        case 'Enter': {
            const picked = sug.active >= 0 ? flatItems[sug.active] : null;
            if (picked) {
                event.preventDefault();
                inputEl.value = picked.query;
                close();
                return 'search';
            }
            return null; // 无高亮 → 走原文搜索
        }
        case 'Escape':
            close();
            return 'consumed';
        default:
            return null;
    }
}

function scrollActive() {
    requestAnimationFrame(() => {
        box()?.querySelector('.suggestion-item.active')?.scrollIntoView({ block: 'nearest' });
    });
}

/** 渲染下拉（订阅 store.suggestions，渲染到当前输入框对应的容器） */
export function initView() {
    store.subscribe('suggestions', (sug) => {
        const el = box();
        if (!el) return;
        if (!sug?.visible) {
            el.classList.add('hidden');
            el.innerHTML = '';
            return;
        }

        let flatIndex = -1;
        const mk = (content, idx, cls) => `
            <div class="suggestion-item ${idx === sug.active ? 'active' : ''} ${cls || ''}" data-sug-index="${idx}" role="option">
                ${content}
            </div>`;

        const historyHtml = sug.history.map((h) => {
            flatIndex += 1;
            const i = flatIndex;
            return mk(`
                <span class="sug-icon sug-icon-history">🕐</span>
                <span class="sug-text">${esc(h.query)}</span>
                <button class="sug-delete" data-action="sug-del-history" data-query="${esc(h.query)}" title="${t('删除该历史')}">✕</button>
            `, i);
        }).join('');

        const itemsHtml = sug.items.map((r) => {
            flatIndex += 1;
            const i = flatIndex;
            const e = r.entry;
            return mk(`
                <span class="sug-icon sug-icon-entry">🔖</span>
                <span class="sug-text">${esc(e.name)}</span>
                ${e.specialTag ? `<span class="tag ${e.specialTag === '官方' ? 'tag-official' : 'tag-gov'}">${esc(e.specialTag)}</span>` : ''}
            `, i);
        }).join('');

        // 远程建议分组（独立配置的建议引擎，与搜索引擎无关）
        const remoteHtml = (sug.remote || []).map((q) => {
            flatIndex += 1;
            const i = flatIndex;
            return mk(`
                <span class="sug-icon sug-icon-remote">🔍</span>
                <span class="sug-text">${esc(q)}</span>
            `, i);
        }).join('');

        // 外部引擎模式下提示搜索目标
        const engine = store.get('config').defaultEngine || 'dictionary';
        const footer = engine !== 'dictionary'
            ? `<div class="suggestion-footer">${tf('在{engine}中搜索', { engine: engineName(engine) })} ↵</div>`
            : '';

        el.innerHTML = `
            ${remoteHtml ? `<div class="suggestion-section"><div class="suggestion-header">${tf('{source}建议', { source: engineName(store.get('config').suggestSource) })}</div>${remoteHtml}</div>` : ''}
            ${sug.history.length ? `<div class="suggestion-section"><div class="suggestion-header">${t('搜索历史')}</div>${historyHtml}</div>` : ''}
            ${sug.items.length ? `<div class="suggestion-section"><div class="suggestion-header">${t('搜索推荐')}</div>${itemsHtml}</div>` : ''}
            ${footer}
        `;
        el.classList.remove('hidden');
    });

    // 语言或引擎或建议来源变更 → 已打开的下拉重渲染（标题/页脚文案）
    store.subscribe('config', (cfg, prev) => {
        if (prev && cfg && (cfg.language !== prev.language || cfg.defaultEngine !== prev.defaultEngine
            || cfg.suggestSource !== prev.suggestSource || cfg.suggestionsEnabled !== prev.suggestionsEnabled)) {
            if (store.get('suggestions')?.visible && activeInput) refresh(activeInput);
        }
    }, { immediate: false });
}

/** 点击建议项（app.js 的委托里调用）：返回应搜索的词；删除按钮由 data-action 单独处理 */
export function pickByIndex(index) {
    const sug = store.get('suggestions');
    if (!sug?.visible) return null;
    const items = [
        ...(sug.remote || []).map((q) => q),
        ...sug.history.map((h) => h.query),
        ...sug.items.map((r) => r.entry.name),
    ];
    return items[index] ?? null;
}

export function isOpen() {
    return Boolean(store.get('suggestions')?.visible);
}

export function currentInput() {
    return activeInput;
}
