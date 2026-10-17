/**
 * 对话框层：通用框架（标题/内容/底部按钮）、确认框（Promise）、
 * 搜索历史、收藏、字典条目表单（新增/编辑，标签 chips 输入）。
 * 内容中的交互元素一律 data-action 委托，禁止内联 onclick。
 */

import { store, removeHistory, clearHistory } from '../store.js';
import { esc, formatTime, normalizeUrl } from '../utils.js';
import { entriesRepo, favoritesRepo } from '../data/repo.js';
import { splitAliasText } from '../data/merge.js';
import { SAMPLE_ENTRIES } from '../config.js';
import { toast } from './dom.js';
import { t, tf, onLanguageChange } from '../i18n.js';
import * as indexer from '../search/indexer.js';

const overlay = () => document.getElementById('dialog-overlay');
let onDialogClose = null;
let lastDynamicDialog = null; // 'history' | 'favorites'（语言切换时重渲染）

/**
 * 子对话框栈：设置面板打开时再弹表单/确认框（restore 选项）属于“覆盖”，
 * 子对话框关闭后自动恢复底层面板，而不是把设置一起关掉。
 * 仅支持一层覆盖；顶层 openDialog（不带 restore）会清空栈。
 */
let frameStack = [];      // 被覆盖的底层帧 [{ onClose }]
let subRestore = null;    // 当前子对话框关闭后的恢复函数

/** 打开通用对话框 */
export function openDialog({ title, content, footer = null, onClose = null, wide = false, restore = null }) {
    const ov = overlay();
    if (!ov) return;
    if (restore && isDialogOpen()) {
        frameStack.push({ onClose: onDialogClose });
        subRestore = restore;
    } else {
        frameStack = [];
        subRestore = null;
    }
    onDialogClose = onClose;
    document.getElementById('dialog-title').innerHTML = title;
    document.getElementById('dialog-content').innerHTML = content;
    const footerEl = document.getElementById('dialog-footer');
    if (footer) {
        footerEl.innerHTML = footer;
        footerEl.classList.remove('hidden');
    } else {
        footerEl.innerHTML = '';
        footerEl.classList.add('hidden');
    }
    document.getElementById('dialog').classList.toggle('dialog-wide', wide);
    ov.classList.remove('hidden');
}

export function closeDialog() {
    const cb = onDialogClose;
    const restore = subRestore;
    onDialogClose = null;
    subRestore = null;
    overlay()?.classList.add('hidden');
    cb?.();
    if (restore && frameStack.length) {
        const frame = frameStack.pop();
        restore(); // 重开底层面板（其内部 openDialog 不带 restore，栈随之清空）
        if (frame.onClose && !onDialogClose) onDialogClose = frame.onClose;
    }
}

export function isDialogOpen() {
    return overlay() && !overlay().classList.contains('hidden');
}

/** Promise 化确认框（restore：确认框关闭后恢复底层面板，见 openDialog） */
export function confirmDialog(message, { danger = false, okText = '确定', restore = null } = {}) {
    return new Promise((resolve) => {
        openDialog({
            title: t('请确认'),
            content: `<div class="confirm-text">${esc(message)}</div>`,
            footer: `
                <button class="btn" data-action="confirm-cancel">${t('取消')}</button>
                <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm-ok">${esc(okText)}</button>
            `,
            onClose: () => resolve(false),
            restore,
        });
        pendingConfirm = resolve;
    });
}
let pendingConfirm = null;
export function resolveConfirm(ok) {
    const cb = pendingConfirm;
    pendingConfirm = null;
    onDialogClose = null; // 先摘掉 onClose（其 resolve(false) 会抢先于显式结果）
    closeDialog();
    cb?.(ok);
}

/** 搜索历史对话框 */
export function showHistoryDialog() {
    lastDynamicDialog = 'history';
    const list = store.get('history');
    const content = list.length === 0
        ? `<div class="dialog-empty">${t('暂无搜索历史')}</div>`
        : `
            <div class="history-list">
                ${list.map((h) => `
                    <div class="list-row">
                        <div class="list-row-info">
                            <div class="list-row-title">${esc(h.query)}</div>
                            <div class="list-row-sub">${esc(formatTime(h.time))}</div>
                        </div>
                        <div class="list-row-actions">
                            <button class="btn btn-sm" data-action="history-search" data-query="${esc(h.query)}">${t('搜索')}</button>
                            <button class="btn btn-sm" data-action="history-del" data-query="${esc(h.query)}">${t('删除')}</button>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="btn btn-danger-ghost clear-all-btn" data-action="history-clear">${t('清除全部')}</button>
        `;
    openDialog({ title: t('搜索历史'), content });
}

/** 收藏对话框 */
export async function showFavoritesDialog() {
    lastDynamicDialog = 'favorites';
    const list = store.get('favorites');
    const content = list.length === 0
        ? `<div class="dialog-empty">${t('暂无收藏')}<div class="dialog-empty-sub">${t('在搜索结果中点击星标即可收藏')}</div></div>`
        : `
            <div class="favorites-list">
                ${list.map((f) => `
                    <div class="list-row">
                        <div class="list-row-info">
                            <div class="list-row-title">${esc(f.name)}</div>
                            <div class="list-row-sub">${esc(f.url)}</div>
                        </div>
                        <div class="list-row-actions">
                            <button class="btn btn-sm" data-action="fav-open" data-url="${esc(f.url)}">${t('打开')}</button>
                            <button class="btn btn-sm" data-action="fav-del" data-id="${esc(f.id)}">${t('删除')}</button>
                        </div>
                    </div>`).join('')}
            </div>
        `;
    openDialog({ title: t('收藏'), content });
}

// 语言切换时，重渲染打开中的历史/收藏对话框
onLanguageChange(() => {
    if (!isDialogOpen()) return;
    if (lastDynamicDialog === 'history') showHistoryDialog();
    else if (lastDynamicDialog === 'favorites') showFavoritesDialog();
});

async function removeFavorite(id) {
    await favoritesRepo.remove(id);
    store.set('favorites', store.get('favorites').filter((f) => f.id !== id));
    if (isDialogOpen()) showFavoritesDialog();
}

/**
 * 字典条目表单（新增 / 编辑）。tags 以 chips 交互。
 * restore：表单关闭后恢复底层面板（设置面板打开时调用时传入）。
 * 新增模式底部多一个「保存并继续」：保存成功后重开空白表单，便于连续录入。
 */
export function showEntryFormDialog(entry = null, { restore = null } = {}) {
    const isEdit = Boolean(entry?.id);
    const tags = entry?.tags || [];
    openDialog({
        title: isEdit ? t('编辑字典条目') : t('添加条目'),
        content: `
            <div class="form-group">
                <label class="form-label">${t('名称')} <span class="req">*</span></label>
                <input type="text" id="entry-name" value="${esc(entry?.name || '')}" placeholder="${t('例如：中国铁路12306')}">
            </div>
            <div class="form-group">
                <label class="form-label">${t('网址')} <span class="req">*</span></label>
                <input type="text" id="entry-url" value="${esc(entry?.url || '')}" placeholder="https://www.12306.cn">
            </div>
            <div class="form-group">
                <label class="form-label">${t('描述')}</label>
                <textarea id="entry-desc" rows="2" placeholder="${t('一句话描述该网站')}">${esc(entry?.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">${t('标签')}</label>
                <input type="text" id="entry-tags-input" placeholder="${t('输入标签后按回车')}">
                <div class="tag-chips" id="entry-tag-chips">
                    ${tags.map((tg) => `<span class="chip">${esc(tg)}<button class="chip-del" data-action="chip-del" data-tag="${esc(tg)}">✕</button></span>`).join('')}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">${t('别名')}</label>
                <input type="text" id="entry-aliases" value="${esc((entry?.aliases || []).join(', '))}" placeholder="${t('其他名称，逗号分隔，如：大肥鱼AI、DeepSeek AI')}">
                <div class="form-hint">${t('别名与名称同样参与搜索（中文/拼音/简拼），适合一站多名')}</div>
            </div>
            <div class="form-row-2">
                <div class="form-group">
                    <label class="form-label">${t('特殊标签')}</label>
                    <select id="entry-special">
                        ${['', '官方', '政府'].map((v) => `<option value="${v}" ${(entry?.specialTag || '') === v ? 'selected' : ''}>${v === '' ? t('无') : t(v)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('图标 URL')}</label>
                    <input type="text" id="entry-icon" value="${esc(entry?.icon || '')}" placeholder="https://.../favicon.ico">
                </div>
            </div>
            <div class="form-error hidden" id="entry-form-error"></div>
        `,
        footer: `
            <button class="btn" data-action="entry-cancel">${t('取消')}</button>
            ${isEdit ? '' : `<button class="btn" data-action="entry-save-continue">${t('保存并继续')}</button>`}
            <button class="btn btn-primary" data-action="entry-save" data-id="${esc(entry?.id || '')}">${t('保存')}</button>
        `,
        restore,
    });
    setTimeout(() => document.getElementById('entry-name')?.focus(), 50);
}

function collectFormTags() {
    return [...document.querySelectorAll('#entry-tag-chips .chip')]
        .map((c) => c.firstChild?.textContent?.trim())
        .filter(Boolean);
}

/**
 * 保存条目表单。keepOpen=true（保存并继续）：成功后重开空白表单连续录入；
 * 否则关闭表单——若由设置面板打开（restore 已在 openDialog 栈中）自动回到设置。
 */
export async function saveEntryForm(id, { keepOpen = false } = {}) {
    const name = document.getElementById('entry-name')?.value.trim();
    const url = document.getElementById('entry-url')?.value.trim();
    const errEl = document.getElementById('entry-form-error');
    const showErr = (msg) => {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
    };
    if (!name || !url) return showErr(t('请填写名称和网址'));

    const payload = {
        name,
        url,
        description: document.getElementById('entry-desc')?.value.trim() || '',
        tags: collectFormTags(),
        aliases: splitAliasText(document.getElementById('entry-aliases')?.value),
        specialTag: document.getElementById('entry-special')?.value || null,
        icon: document.getElementById('entry-icon')?.value.trim() || null,
    };
    try {
        let record;
        if (id) {
            record = await entriesRepo.update(id, payload);
            indexer.updateEntry(record);
        } else {
            record = await entriesRepo.add(payload);
            indexer.addEntry(record);
        }
        store.set('entries', await entriesRepo.list());
        if (keepOpen) {
            // 原地清空表单继续录入：不重开对话框，保持与设置面板的恢复关系不变
            for (const elId of ['entry-name', 'entry-url', 'entry-desc', 'entry-tags-input', 'entry-aliases', 'entry-icon']) {
                const el = document.getElementById(elId);
                if (el) el.value = '';
            }
            const special = document.getElementById('entry-special');
            if (special) special.value = '';
            const chips = document.getElementById('entry-tag-chips');
            if (chips) chips.innerHTML = '';
            errEl.classList.add('hidden');
            errEl.textContent = '';
            document.getElementById('entry-name')?.focus();
            toast(t('已保存，可继续添加'), 'success');
        } else {
            closeDialog();
            toast(t('操作成功'), 'success');
        }
    } catch (err) {
        showErr(err.message || t('网址格式不正确'));
    }
}

export function addFormTag() {
    const input = document.getElementById('entry-tags-input');
    if (!input) return;
    const value = input.value.trim().replace(/[,，]$/, '');
    if (!value) return;
    const chips = collectFormTags();
    if (chips.includes(value) || chips.length >= 12) {
        input.value = '';
        return;
    }
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${esc(value)}<button class="chip-del" data-action="chip-del" data-tag="${esc(value)}">✕</button>`;
    document.getElementById('entry-tag-chips').appendChild(chip);
    input.value = '';
}

export function removeFormTag(tag) {
    document.querySelectorAll('#entry-tag-chips .chip').forEach((c) => {
        if (c.firstChild?.textContent?.trim() === tag) c.remove();
    });
}

/** 删除字典条目（带确认；restore 用于确认框关闭后回到设置面板） */
export async function deleteEntry(id, { restore = null } = {}) {
    const entry = store.get('entries').find((e) => e.id === id);
    const ok = await confirmDialog(`${t('确定要删除这个条目吗')}：${entry?.name || id}`, { danger: true, okText: t('删除'), restore });
    if (!ok) return;
    await entriesRepo.remove(id);
    indexer.removeEntry(id);
    store.set('entries', await entriesRepo.list());
    toast(t('操作成功'), 'success');
}

/** 载入示例条目 */
export async function loadSampleEntries() {
    const existing = new Set(store.get('entries').map((e) => e.url));
    const fresh = SAMPLE_ENTRIES.filter((s) => !existing.has(normalizeUrl(s.url)));
    if (fresh.length === 0) {
        toast(t('示例条目已存在'), 'info');
        return;
    }
    for (const sample of fresh) {
        try {
            const record = await entriesRepo.add(sample);
            indexer.addEntry(record);
        } catch { /* 跳过非法 */ }
    }
    store.set('entries', await entriesRepo.list());
    toast(tf('已载入 {n} 条示例条目', { n: fresh.length }), 'success');
}

/** 历史相关动作（委托调用） */
export function searchFromHistory(query) {
    closeDialog();
    const ev = new CustomEvent('ms:search', { detail: query });
    document.dispatchEvent(ev);
}

export function deleteHistoryByQuery(query) {
    removeHistory(query);
    showHistoryDialog();
}

export function clearAllHistory() {
    clearHistory();
    showHistoryDialog();
}

export { removeFavorite };
