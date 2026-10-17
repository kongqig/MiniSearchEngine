/**
 * 首页视图：Logo 由 dom.js 应用；这里负责空状态 CTA 与索引构建进度。
 */

import { store } from '../store.js';
import { esc } from '../utils.js';
import { t, tf, onLanguageChange } from '../i18n.js';

/** 首页初始化：订阅条目数量与索引进度 */
export function initView() {
    const emptyState = document.getElementById('home-empty');
    const progressWrap = document.getElementById('index-progress');

    const renderEmpty = (entries) => {
        if (!emptyState) return;
        const empty = !entries || entries.length === 0;
        emptyState.classList.toggle('hidden', !empty);
        if (empty) {
            emptyState.innerHTML = `
                <div class="empty-title">${t('目录还是空的')}</div>
                <div class="empty-desc">${t('把常用的官方网站加进来，搜索后一键直达，远离广告和仿冒站。')}</div>
                <div class="empty-actions">
                    <button class="btn btn-primary" data-action="open-settings" data-panel="dictionary">${t('添加常用网站')}</button>
                    <button class="btn" data-action="load-samples">${t('载入示例条目')}</button>
                </div>
            `;
        }
    };

    const renderProgress = (state) => {
        if (!progressWrap) return;
        const { searchReady, buildProgress, entries } = state;
        const show = !searchReady && entries.length > 0;
        progressWrap.classList.toggle('hidden', !show);
        if (show) {
            progressWrap.innerHTML = `
                <div class="progress-label">${tf('正在构建搜索索引 {n}%', { n: buildProgress || 0 })}</div>
                <div class="progress-track"><div class="progress-bar" style="width:${buildProgress || 0}%"></div></div>
            `;
        }
    };

    store.subscribe('entries', renderEmpty);
    store.subscribe('searchReady', () => renderProgress({ searchReady: store.get('searchReady'), buildProgress: store.get('buildProgress'), entries: store.get('entries') }));
    store.subscribe('buildProgress', () => renderProgress({ searchReady: store.get('searchReady'), buildProgress: store.get('buildProgress'), entries: store.get('entries') }));
    // 语言切换 → 空态文案重渲染
    onLanguageChange(() => renderEmpty(store.get('entries')));

    renderEmpty(store.get('entries'));
}

/** 底部按钮徽标（历史/收藏数量） */
export function updateBadges() {
    const historyCount = store.get('history').length;
    const favCount = store.get('favorites').length;
    const h = document.getElementById('history-badge');
    const f = document.getElementById('favorites-badge');
    if (h) h.textContent = historyCount > 0 ? String(historyCount) : '';
    if (f) f.textContent = favCount > 0 ? String(favCount) : '';
}

export { esc };
