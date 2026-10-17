/**
 * 字典库维护：加载 → 建索引 → 后台补算缺失拼音字段 → 重建。
 * 启动、导入、清除数据后统一走这里，保证 store.entries 与索引一致。
 */

import { store } from '../store.js';
import { entriesRepo } from './repo.js';
import * as indexer from '../search/indexer.js';
import { computeFields, isLibReady, hasSearchFields, ensureLib } from '../search/precompute.js';
import { invalidateCache } from '../search/service.js';

/** 全量加载字典并构建索引（先快速可搜，再后台补算拼音） */
export async function loadLibrary() {
    let entries = await entriesRepo.list();
    store.set('entries', entries);
    await indexer.build(entries); // 即使部分条目缺拼音字段，文本检索立即可用

    // 后台补算缺失的搜索字段（pinyin 库就绪时）
    if (isLibReady()) {
        const missing = entries.filter((e) => !hasSearchFields(e));
        if (missing.length > 0) {
            try {
                const updated = missing.map((e) => ({ ...e, ...computeFields(e) }));
                await entriesRepo.bulkPut(updated, { batch: 500 });
                const map = new Map(updated.map((u) => [u.id, u]));
                entries = entries.map((e) => map.get(e.id) || e);
                store.set('entries', entries);
                await indexer.build(entries);
            } catch (err) {
                console.warn('[library] 拼音字段补算失败（不影响文本搜索）', err);
            }
        }
    }
    invalidateCache();
}

/** 重建索引（导入/批量变更后调用；条目已在 store 中） */
export async function rebuildLibrary() {
    invalidateCache();
    return indexer.build(store.get('entries'));
}

/** 确保 pinyin 库可用（预热，不抛错） */
export function warmupPinyin() {
    return ensureLib();
}
