/**
 * 应用入口：启动流程 + 集中事件绑定。
 * 全部交互通过 document 级委托（click / input / change 按 data-action、data-cfg 分发），
 * 禁止任何内联 onclick；输入框行为在此统一挂接。
 */

import { store, loadPersisted, bindPersistence, removeHistory } from './store.js';
import { APP_VERSION } from './config.js';
import { openDB } from './data/db.js';
import { favoritesRepo } from './data/repo.js';
import { loadLibrary, warmupPinyin } from './data/library.js';
import * as indexer from './search/indexer.js';
import { executeSearch, changePage } from './search/service.js';
import { initViewFoundation, showPage, toast } from './ui/dom.js';
import { initI18n, t, tf } from './i18n.js';
import * as engine from './ui/engine.js';
import * as suggestions from './ui/suggestions.js';
import * as home from './ui/home.js';
import * as results from './ui/results.js';
import {
    closeDialog, isDialogOpen, resolveConfirm, showHistoryDialog, showFavoritesDialog,
    showEntryFormDialog, saveEntryForm, addFormTag, removeFormTag, deleteEntry,
    loadSampleEntries, searchFromHistory, deleteHistoryByQuery, clearAllHistory, removeFavorite,
} from './ui/dialogs.js';
import {
    openSettings, switchSettingsTab, applyControlValue, onDictFilterInput, reopenSettings, initSettingsView,
    exportAllData, exportDictionary, importAllData, importDictionaryData,
    clearDictionary, clearAllData, onAiToggleKey, onAiTest, onAiFetchModels,
    onAiPromptTemplate, onImageFile, onClearBg, onClearLogo, onResetThemeColor,
    enforceHistoryLimit, enforceFavoritesLimit,
    exportHistory, exportFavorites, importHistoryData, importFavoritesData,
} from './ui/settings.js';
import { renderToolCards, cleanupTools, generateRandom } from './tools/cards.js';
import { stopAiAnswer } from './ai/answer.js';
import { consumePluginImport } from './ui/pluginbridge.js';

// 模块图加载成功标记：本语句能执行 = 全部静态 import 均已就绪（index.html 的启动失败
// 浮层依赖此标记区分「浏览器缓存了旧模块」与「启动后运行时错误」，勿删）。
window.__MODULES_OK = true;

// ---------------- 动作分发表（document 级委托唯一出口） ----------------

const actions = {
    // 导航 / 搜索
    'goto-home': () => showPage('home'),
    'retry-search': () => executeSearch(store.get('search')?.raw || ''),
    'goto-page': (el) => changePage(Number(el.dataset.page)),
    'sug-del-history': (el) => {
        removeHistory(el.dataset.query);
        const input = suggestions.currentInput();
        if (input) suggestions.refresh(input);
    },
    // 历史 / 收藏
    'history-search': (el) => searchFromHistory(el.dataset.query),
    'history-del': (el) => deleteHistoryByQuery(el.dataset.query),
    'history-clear': () => clearAllHistory(),
    'fav-open': (el) => {
        const url = el.dataset.url;
        closeDialog();
        if (store.get('config').openInNewTab) window.open(url, '_blank', 'noopener');
        else location.href = url;
    },
    'fav-del': (el) => removeFavorite(el.dataset.id),
    'toggle-fav': async (el) => {
        const id = el.dataset.id;
        const entry = store.get('entries').find((e) => e.id === id);
        if (!entry) return;
        const isFav = store.get('favorites').some((f) => f.id === id);
        if (isFav) {
            await removeFavorite(id);
            toast(t('已取消收藏'), 'info');
        } else {
            const record = await favoritesRepo.add(entry);
            let list = [record, ...store.get('favorites').filter((f) => f.id !== id)];
            // 收藏保存数量上限：超出时移除最早收藏的条目（IndexedDB 同步删除）
            const limit = Math.max(1, Math.floor(Number(store.get('config').favoritesLimit) || 500));
            if (list.length > limit) {
                const overflow = list.slice(limit);
                for (const f of overflow) {
                    try { await favoritesRepo.remove(f.id); } catch { /* ignore */ }
                }
                list = list.slice(0, limit);
                toast(tf('已达到收藏保存上限（{n} 条），最早收藏已移除', { n: limit }), 'info');
            }
            store.set('favorites', list);
            toast(t('已收藏'), 'success');
        }
    },
    // 引擎快捷切换
    'set-engine': (el) => engine.setEngine(el.dataset.engine),
    // 自定义文件字段：点按钮 → 触发隐藏 input
    'pick-file': (el) => document.getElementById(el.dataset.target)?.click(),
    // 设置
    'open-settings': (el) => openSettings(el.dataset.panel || 'theme'),
    'settings-tab': (el) => switchSettingsTab(el.dataset.panel),
    'help-jump': (el) => {
        const target = document.getElementById(el.dataset.target);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'reset-theme-color': () => onResetThemeColor(),
    'clear-bg': () => onClearBg(),
    'clear-logo': () => onClearLogo(),
    // 字典（表单/确认框关闭后自动回到设置面板，见 dialogs.js 的 restore 栈）
    'load-samples': () => loadSampleEntries(),
    'dict-add': () => showEntryFormDialog(null, { restore: reopenSettings }),
    'dict-edit': (el) => {
        const entry = store.get('entries').find((e) => e.id === el.dataset.id);
        if (entry) showEntryFormDialog(entry, { restore: reopenSettings });
    },
    'dict-del': (el) => deleteEntry(el.dataset.id, { restore: reopenSettings }),
    'dict-export': () => exportDictionary(),
    'dict-import': () => importDictionaryData(),
    'import-all': () => importAllData(),
    'export-all': () => exportAllData(),
    'export-history': () => exportHistory(),
    'import-history': () => importHistoryData(),
    'export-favorites': () => exportFavorites(),
    'import-favorites': () => importFavoritesData(),
    'clear-dict': () => clearDictionary(),
    'clear-all-data': () => clearAllData(),
    // 条目表单
    'entry-cancel': () => closeDialog(),
    'entry-save': (el) => saveEntryForm(el.dataset.id),
    'entry-save-continue': () => saveEntryForm('', { keepOpen: true }),
    'chip-del': (el) => removeFormTag(el.dataset.tag),
    // 对话框 / 确认
    'confirm-ok': () => resolveConfirm(true),
    'confirm-cancel': () => resolveConfirm(false),
    // AI
    'ai-stop': () => stopAiAnswer(),
    'ai-retry': () => {
        const q = store.get('ai')?.query;
        if (q) executeSearch(q); else executeSearch(store.get('search')?.raw || '');
    },
    'ai-toggle-key': () => onAiToggleKey(),
    'ai-test': () => onAiTest(),
    'ai-fetch-models': () => onAiFetchModels(),
    'ai-prompt': (el) => onAiPromptTemplate(el.dataset.tpl),
    // 工具卡片
    'tool-random': () => generateRandom(),
};

// ---------------- 事件绑定（全部集中在此） ----------------

let lastToolRaw = null; // 工具卡片当前渲染对应的查询词（翻页不重建）

function bindEvents() {
    // 1) 全局点击委托：data-action 分发 + 建议项选择 + 点击外部关闭建议
    document.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        // 建议下拉：点击条目（非删除按钮）→ 选中搜索
        const sugItem = event.target.closest('[data-sug-index]');
        if (sugItem && !actionEl) {
            const query = suggestions.pickByIndex(Number(sugItem.dataset.sugIndex));
            if (query != null) {
                const input = suggestions.currentInput();
                if (input) input.value = query;
                suggestions.close();
                executeSearch(query);
                return;
            }
        }
        // 点击下拉 / 输入框以外区域 → 关闭建议
        if (!event.target.closest('.search-container') && !event.target.closest('.search-box-header')) {
            suggestions.close();
        }

        if (!actionEl) return;
        const action = actionEl.dataset.action;
        // <a> 元素不拦截，保留原生导航
        if (actionEl.tagName === 'A') return;
        const handler = actions[action];
        if (handler) {
            event.preventDefault();
            handler(actionEl, event);
        }
    });

    // 2) 设置面板配置控件：change（select/checkbox/file/color/range）
    document.addEventListener('change', (event) => {
        const el = event.target;
        if (el.dataset.file) {
            const file = el.files?.[0];
            // 立即反馈选中状态（避免面板重渲染后仍显示“未选择文件”）
            const statusEl = document.getElementById(`file-status-${el.dataset.file}`);
            if (statusEl) statusEl.textContent = file ? file.name : t('未选择文件');
            onImageFile(el.dataset.file, file);
            return;
        }
        if (!applyControlValue(el)) return;
        // 数量上限类设置：change（失焦/回车确认）后立即裁剪生效；
        // input 逐键阶段不裁剪，避免输入中途（如刚键入 "1"）误删大量数据
        if (el.dataset.cfg === 'historyLimit') enforceHistoryLimit();
        if (el.dataset.cfg === 'favoritesLimit') enforceFavoritesLimit();
        // 部分控件需要联动
        if (el.dataset.aicfg === 'apiKey') { /* 即时保存，无额外动作 */ }
    });

    // 3) 设置面板文本类控件：input（text/number/textarea/range 即时生效）
    document.addEventListener('input', (event) => {
        const el = event.target;
        // 字典筛选
        if (el.id === 'dict-filter') {
            onDictFilterInput(el.value);
            return;
        }
        applyControlValue(el);
    });

    // 4) 条目表单：标签输入回车
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.id === 'entry-tags-input') {
            event.preventDefault();
            addFormTag();
        }
    });

    // 5) 两个搜索框：输入建议 / 键盘导航 / 提交
    for (const inputId of ['search-input', 'search-input-result']) {
        const input = document.getElementById(inputId);
        if (!input) continue;

        input.addEventListener('input', () => suggestions.handleInput(input));
        input.addEventListener('focus', () => { if (input.value.trim()) suggestions.refresh(input); });
        input.addEventListener('keydown', (event) => {
            const handled = suggestions.handleKeydown(input, event);
            if (handled === 'consumed') return;
            if (event.key === 'Enter' && handled !== 'consumed') {
                suggestions.close();
                input.blur();
                executeSearch(input.value);
            }
        });
    }

    // 6) 搜索按钮
    document.getElementById('search-btn')?.addEventListener('click', () => {
        const input = document.getElementById('search-input');
        suggestions.close();
        executeSearch(input?.value);
    });
    document.getElementById('search-btn-result')?.addEventListener('click', () => {
        const input = document.getElementById('search-input-result');
        suggestions.close();
        executeSearch(input?.value);
    });

    // 7) 底部按钮（历史/收藏/设置）
    document.getElementById('history-btn')?.addEventListener('click', showHistoryDialog);
    document.getElementById('favorites-btn')?.addEventListener('click', () => { showFavoritesDialog(); });
    document.getElementById('settings-btn')?.addEventListener('click', () => openSettings('theme'));

    // 8) 对话框遮罩点击关闭
    document.getElementById('dialog-overlay')?.addEventListener('mousedown', (event) => {
        if (event.target === event.currentTarget) closeDialog();
    });
    document.getElementById('dialog-close')?.addEventListener('click', closeDialog);

    // 9) 全局快捷键
    document.addEventListener('keydown', (event) => {
        // Ctrl/Cmd + K → 聚焦当前页搜索框
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            const onSearchPage = document.getElementById('search-page')?.classList.contains('active');
            const input = document.getElementById(onSearchPage ? 'search-input-result' : 'search-input');
            input?.focus();
            input?.select();
            return;
        }
        if (event.key === 'Escape') {
            if (isDialogOpen()) closeDialog();
            else suggestions.close();
        }
    });

    // 10) 跨模块搜索事件（对话框内触发搜索）
    document.addEventListener('ms:search', (event) => {
        const input = document.getElementById('search-input');
        if (input) input.value = event.detail;
        executeSearch(event.detail);
    });

    // 11) 工具卡片渲染（订阅式，容器由视图层持有）
    store.subscribe('toolCards', (types) => {
        if (store.get('config').toolsEnabled === false) types = [];
        lastToolRaw = store.get('search')?.raw || '';
        renderToolCards(document.getElementById('tool-cards'), types, lastToolRaw);
    });

    // 12) 搜索完成兜底：仅当查询词变化时重渲染（避免翻页重建卡片丢失输入状态）
    store.subscribe('search', (s) => {
        if (s?.status === 'done' && s.raw !== lastToolRaw) {
            lastToolRaw = s.raw || '';
            const types = store.get('config').toolsEnabled === false ? [] : store.get('toolCards');
            renderToolCards(document.getElementById('tool-cards'), types, s.raw || '');
        }
    });

    // 12.5) 工具卡片开关 / 语言变更 → 重渲染当前卡片
    store.subscribe('config', (cfg, prev) => {
        if (!prev) return;
        const toolsChanged = cfg.toolsEnabled !== prev.toolsEnabled;
        const langChanged = cfg.language !== prev.language;
        if ((toolsChanged || langChanged) && store.get('search')?.status === 'done') {
            lastToolRaw = store.get('search')?.raw || '';
            const types = cfg.toolsEnabled === false ? [] : store.get('toolCards');
            renderToolCards(document.getElementById('tool-cards'), types, lastToolRaw);
        }
    }, { immediate: false });

    // 13) 离开结果页时清理工具卡片定时器
    window.addEventListener('pagehide', cleanupTools);
}

// ---------------- 启动流程 ----------------

async function boot() {
    const t0 = performance.now();

    // 持久化配置
    bindPersistence();
    const persisted = loadPersisted();
    store.set('config', { ...store.get('config'), ...persisted.config });
    store.set('aiConfig', { ...store.get('aiConfig'), ...persisted.aiConfig });
    store.set('history', Array.isArray(persisted.history) ? persisted.history : []);

    // 视图基础（主题/Logo/i18n）
    initViewFoundation();
    initI18n();

    // 视图初始化（订阅渲染）
    home.initView();
    results.initView();
    suggestions.initView();
    engine.initView();
    home.updateBadges();
    store.subscribe('history', home.updateBadges);
    store.subscribe('favorites', home.updateBadges);

    // 事件绑定
    bindEvents();
    // 设置面板视图订阅（字典列表 / AI 诊断随 store 实时刷新）
    initSettingsView();

    // 拼音库预热（不阻塞）；FlexSearch 索引引擎加载（必须先于建索引）
    warmupPinyin();
    await indexer.init();

    // 数据层启动
    await openDB();
    store.set('favorites', await favoritesRepo.list());
    await loadLibrary();

    store.set('ready', true);
    console.log(`[MiniSearch] v${APP_VERSION} 启动完成 ${Math.round(performance.now() - t0)}ms · 索引模式: ${indexer.getMode()} · 条目: ${store.get('entries').length}`);

    // 浏览器插件深链导入：#ms-import=<base64url(JSON)> → 预填「添加条目」表单
    consumePluginImport();
}

// 启动失败 → 首页展示错误态（IndexedDB 不可用等）
boot().catch((err) => {
    console.error('[MiniSearch] 启动失败', err);
    store.set('bootError', err.message || String(err));
    const empty = document.getElementById('home-empty');
    if (empty) {
        empty.classList.remove('hidden');
        empty.innerHTML = `
            <div class="empty-title">${t('启动失败')}</div>
            <div class="empty-desc">${String(err.message || err).replace(/</g, '&lt;')}</div>
            <div class="empty-desc">${t('如果是直接双击打开（file://），请改用本地 HTTP 服务访问，详见 README。')}</div>
        `;
    }
});
