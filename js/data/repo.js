/**
 * 字典条目 / 收藏 仓库：只负责“存取 + 记录规范化”，不感知索引与 UI。
 * 条目结构（v2.8）：
 *   id, name, url, description, tags[], specialTag, icon,
 *   aliases[]（别名：一站多名，与名称同样参与搜索）,
 *   createdAt, updatedAt,
 *   searchText, pinyin, pinyinCompact, pinyinInitials, aliasesText   // 写入时预计算
 */

import { DB } from '../config.js';
import { dbGetAll, dbGet, dbPut, dbDelete, dbClear, dbBulkPut, metaGet, metaSet } from './db.js';
import { uuid, nowISO, normalizeUrl } from '../utils.js';
import { normalizeAliases } from './merge.js';
import { computeFields as computeSearchFields, isLibReady, hasSearchFields } from '../search/precompute.js';

const S = DB.stores;

/** 校验并规范化一条字典条目（非法抛错） */
export function normalizeEntry(input, existing = {}) {
    const name = String(input.name ?? '').trim();
    const rawUrl = String(input.url ?? '').trim();
    if (!name) throw new Error('名称不能为空');
    const url = normalizeUrl(rawUrl);
    if (!url) throw new Error('网址格式不正确');
    const tags = Array.isArray(input.tags)
        ? [...new Set(input.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12)
        : [];
    const specialTag = input.specialTag === '官方' || input.specialTag === '政府' ? input.specialTag : null;
    const icon = String(input.icon ?? '').trim() || null;
    const description = String(input.description ?? '').trim();
    // v2.8：别名规范化（去重/限长限量/排除主名），脏输入安全
    const aliases = normalizeAliases(input.aliases, { exclude: [name] });
    const now = nowISO();
    const record = {
        id: existing.id || input.id || uuid(),
        name,
        url,
        description,
        tags,
        specialTag,
        icon,
        aliases,
        aliasesText: aliases.join(' '),
        createdAt: existing.createdAt || input.createdAt || now,
        updatedAt: now,
    };
    // 搜索字段：能算就算（pinyin 库可用时），否则留待启动补算
    if (isLibReady()) {
        Object.assign(record, computeSearchFields(record));
    } else if (hasSearchFields(input)) {
        record.searchText = input.searchText;
        record.pinyin = input.pinyin;
        record.pinyinCompact = input.pinyinCompact;
        record.pinyinInitials = input.pinyinInitials;
    }
    return record;
}

export const entriesRepo = {
    async list() {
        return (await dbGetAll(S.entries)) || [];
    },
    async get(id) {
        return dbGet(S.entries, id);
    },
    async add(input) {
        const record = normalizeEntry(input);
        await dbPut(S.entries, record);
        return record;
    },
    async update(id, patch) {
        const existing = await dbGet(S.entries, id);
        if (!existing) throw new Error('条目不存在');
        const record = normalizeEntry({ ...existing, ...patch }, existing);
        await dbPut(S.entries, record);
        return record;
    },
    async remove(id) {
        await dbDelete(S.entries, id);
    },
    async clear() {
        await dbClear(S.entries);
        await metaSet('entriesCount', 0);
    },
    /** 全量替换（导入），保留原 id 或重派生 */
    async replaceAll(inputList, { onProgress } = {}) {
        const records = [];
        for (const raw of inputList) {
            try {
                records.push(normalizeEntry(raw, {}));
            } catch {
                // 跳过非法条目
            }
        }
        await dbClear(S.entries);
        await dbBulkPut(S.entries, records, { onProgress });
        return records;
    },
    /** 批量回写（补算搜索字段） */
    async bulkPut(records, opts) {
        return dbBulkPut(S.entries, records, opts);
    },
};

export const favoritesRepo = {
    async list() {
        return (await dbGetAll(S.favorites)) || [];
    },
    async has(id) {
        return Boolean(await dbGet(S.favorites, id));
    },
    async add(entry) {
        const record = {
            id: entry.id,
            name: entry.name,
            url: entry.url,
            icon: entry.icon || null,
            specialTag: entry.specialTag || null,
            addedAt: nowISO(),
        };
        await dbPut(S.favorites, record);
        return record;
    },
    /** 直接写入收藏记录（导入用：保留原 addedAt，仅做最小校验，非法抛错） */
    async put(raw) {
        const record = {
            id: String(raw?.id ?? '').trim(),
            name: String(raw?.name ?? '').trim(),
            url: String(raw?.url ?? '').trim(),
            icon: String(raw?.icon ?? '').trim() || null,
            specialTag: raw?.specialTag === '官方' || raw?.specialTag === '政府' ? raw.specialTag : null,
            addedAt: String(raw?.addedAt ?? '') || nowISO(),
        };
        if (!record.id || !record.name || !record.url) throw new Error('收藏记录缺少 id/name/url');
        await dbPut(S.favorites, record);
        return record;
    },
    async remove(id) {
        await dbDelete(S.favorites, id);
    },
    async clear() {
        await dbClear(S.favorites);
    },
    async replaceAll(list) {
        await dbClear(S.favorites);
        await dbBulkPut(S.favorites, list.filter((f) => f && f.id && f.name && f.url));
    },
};

export { metaGet, metaSet };
