/**
 * 单一 store + 订阅机制。
 * 约束：
 *  - 所有配置读写、UI 更新都走 store，不允许全局散变量。
 *  - set() 触发对应 key 的订阅者；update() 基于旧值派生新值。
 */

export function createStore(initialState = {}) {
    const state = { ...initialState };
    const subs = new Map(); // key -> Set<fn(value, prev)>

    function notify(key, value, prev) {
        const set = subs.get(key);
        if (!set) return;
        for (const fn of [...set]) {
            try {
                fn(value, prev);
            } catch (err) {
                console.error(`[store] subscriber error for "${key}"`, err);
            }
        }
    }

    return {
        get(key) {
            return key === undefined ? state : state[key];
        },
        set(key, value) {
            const prev = state[key];
            if (prev === value) return value;
            state[key] = value;
            notify(key, value, prev);
            return value;
        },
        update(key, fn) {
            return this.set(key, fn(state[key]));
        },
        /** 合并式更新（浅合并，用于 config / aiConfig 等对象切片） */
        patch(key, partial) {
            return this.set(key, { ...state[key], ...partial });
        },
        subscribe(key, fn, { immediate = true } = {}) {
            if (!subs.has(key)) subs.set(key, new Set());
            subs.get(key).add(fn);
            if (immediate && state[key] !== undefined) {
                try { fn(state[key], undefined); } catch (err) { console.error('[store] initial subscriber error', err); }
            }
            return () => subs.get(key)?.delete(fn);
        },
    };
}

// ---------------- 应用全局状态切片 ----------------
import { DEFAULT_CONFIG, DEFAULT_AI_CONFIG } from './config.js';

export const store = createStore({
    ready: false,            // 启动完成
    bootError: null,         // 启动失败信息（如 IndexedDB 不可用）
    config: { ...DEFAULT_CONFIG },
    aiConfig: { ...DEFAULT_AI_CONFIG },
    history: [],             // [{ query, time }]
    entries: [],             // 字典条目（内存镜像）
    favorites: [],           // 收藏（内存镜像）
    searchReady: false,      // 搜索索引是否就绪
    buildProgress: 0,        // 索引构建进度 0-100
    search: {
        status: 'idle',      // idle | loading | done | error
        raw: '',
        parsed: null,        // { text, site, filetype }
        results: [],         // 全量命中（已排序）
        total: 0,
        page: 1,
        pageSize: 20,
        external: [],        // 展示的外部引擎 key
        perfMs: 0,
        error: null,
        filteredNote: '',    // site:/filetype: 过滤说明
    },
    suggestions: {
        visible: false,
        history: [],         // [{ query, time }]
        items: [],           // 字典建议 [{ entry, score }]
        active: -1,          // 键盘导航索引（扁平合并列表）
    },
    ai: {
        status: 'idle',      // idle | loading | streaming | done | stopped | error
        query: '',
        content: '',
        error: null,
        provider: '',
    },
    toolCards: [],           // 当前命中的工具卡片类型
});

// ---------------- 持久化辅助 ----------------
import { STORAGE_KEYS, sanitizeConfig, sanitizeAiConfig } from './config.js';

export function loadPersisted() {
    const read = (key, fallback) => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (err) {
            console.warn(`[store] 解析 ${key} 失败，使用默认值`, err);
            return fallback;
        }
    };
    return {
        config: sanitizeConfig(read(STORAGE_KEYS.config, {})),
        aiConfig: sanitizeAiConfig(read(STORAGE_KEYS.aiConfig, {})),
        history: Array.isArray(read(STORAGE_KEYS.history, [])) ? read(STORAGE_KEYS.history, []) : [],
    };
}

function persist(key, storageKey, value) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (err) {
        console.warn(`[store] 写入 ${storageKey} 失败（可能超出容量）`, err);
    }
}

/** 启动时调用：把 config / aiConfig / history 的变更自动持久化（不立即回写，避免覆盖待加载数据） */
export function bindPersistence() {
    store.subscribe('config', (v) => persist('config', STORAGE_KEYS.config, v), { immediate: false });
    store.subscribe('aiConfig', (v) => persist('aiConfig', STORAGE_KEYS.aiConfig, v), { immediate: false });
    store.subscribe('history', (v) => persist('history', STORAGE_KEYS.history, v), { immediate: false });
}

export function updateConfig(partial) {
    store.patch('config', partial);
}

export function updateAiConfig(partial) {
    store.patch('aiConfig', partial);
}

export function addHistory(query) {
    const q = String(query || '').trim();
    if (!q) return;
    // 保存数量上限运行时以 config.historyLimit 为准（默认 100，设置中可改）
    const limit = Math.max(1, Math.floor(Number(store.get('config')?.historyLimit) || 100));
    store.update('history', (list) => {
        const next = list.filter((h) => h.query !== q);
        next.unshift({ query: q, time: new Date().toISOString() });
        return next.slice(0, limit);
    });
}

export function removeHistory(query) {
    store.update('history', (list) => list.filter((h) => h.query !== query));
}

export function clearHistory() {
    store.set('history', []);
}
