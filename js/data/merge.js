/**
 * 字典导入「同网址冲突策略」与「别名」纯逻辑层（v2.8）。
 *
 * 背景：批量导入时会遇到同一网站的多份记录——名称不同（DeepSeek / 大肥鱼AI）、
 * 简介不同、甚至只有一字之差。v2.7 的策略是"网址相同→名称先到先得、仅补全空字段"，
 * 用户反馈先到先得并不总是合理：
 *   - 有的场景希望新数据的名称更新旧条目（旧名称是随手起的占位名）；
 *   - 有的场景故意要让多个名称指向同一网址，扩大搜索命中率。
 * 因此 v2.8 把同网址冲突的处理权交给用户，五种策略（config.importConflict）：
 *   merge     智能合并（默认，v2.7 语义）：名称保留先导入的，旧条目缺的字段由新数据补全；
 *             新数据自带的别名并入旧条目
 *   alias     合并为别名：在智能合并之上，把新名称写入旧条目的 aliases——
 *             新旧名称都能搜到，条数不膨胀（推荐一站多名的场景）
 *   overwrite 新数据覆盖：新名称/简介/标签/特殊标记/图标覆盖旧条目（新数据缺的字段保留旧值），
 *             旧名称自动转为别名保留可搜——更新名字但不丢搜索命中率
 *   duplicate 保留多条：同一网址保留多条独立记录（多名称场景，搜索范围最大，条数增加）
 *   skip      完全跳过：网址重复的条目直接丢弃（v2.6 语义）
 *
 * 设计红线：
 *   - 绝不静默删数据：除 skip 外没有任何策略会丢弃字段；skip 也是用户主动选择
 *   - 别名是新增量：任何策略都不会移除已有别名，只做并集
 *   - 标题不参与判重：判重只认规范化网址（utils.normalizeUrl），
 *     相似/相同的标题是合法共存（别名场景），由策略决定怎么处理
 *
 * 本模块为纯函数（无 DOM / IndexedDB 依赖），可被 node 单测直接 import
 * （scripts/test_merge.mjs）。
 */

import { normalizeUrl } from '../utils.js';

export const IMPORT_CONFLICT_STRATEGIES = ['merge', 'alias', 'overwrite', 'duplicate', 'skip'];

/** 别名条数上限 / 单个别名长度上限（与 tags 上限同量级，防脏数据撑爆记录） */
export const ALIASES_MAX = 12;
export const ALIAS_MAX_LEN = 50;

/**
 * 规范化别名数组：转字符串、去空白、去重、限长限量，并排除与主名相同的项。
 * 输入可以是任意脏数据（导入文件 / 表单拆分结果），输出保证是 string[]。
 */
export function normalizeAliases(input, { exclude = [] } = {}) {
    if (!Array.isArray(input)) return [];
    const banned = new Set(exclude.filter(Boolean).map((s) => String(s).trim()));
    const out = [];
    for (const item of input) {
        const s = String(item ?? '').trim().slice(0, ALIAS_MAX_LEN);
        if (!s || banned.has(s) || out.includes(s)) continue;
        out.push(s);
        if (out.length >= ALIASES_MAX) break;
    }
    return out;
}

/**
 * 别名并集：保留旧条目别名在前（稳定、可读），新增项按传入顺序追加。
 * exclude 中的名称（如主名）不会进入结果。
 */
export function unionAliases(prevAliases, addAliases = [], exclude = []) {
    return normalizeAliases([...(Array.isArray(prevAliases) ? prevAliases : []), ...addAliases], { exclude });
}

/** 从表单/导入的任意字符串拆出别名候选（逗号/顿号/分号/换行分隔） */
export function splitAliasText(text) {
    return String(text ?? '').split(/[,，、;；\n]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * 计算"同网址冲突"在某策略下对旧条目的补丁。
 *
 * @param {object} prev  旧条目（已规范化：name/url/description/tags/specialTag/icon/aliases...）
 * @param {object} raw   新导入的原始条目
 * @param {string} strategy  IMPORT_CONFLICT_STRATEGIES 之一
 * @returns {object|null} 需要应用到旧条目的 patch（交给 entriesRepo.update）；
 *                        null 表示无需修改（duplicate/skip 由调用方另行处理：
 *                        duplicate→按新条目新增，skip→计入重复跳过）
 */
export function planSameUrlMerge(prev, raw, strategy) {
    // 统一提取新数据字段（导入数据是脏的，全部过一遍 trim / 类型收敛）
    const newName = String(raw?.name ?? '').trim();
    const newDesc = String(raw?.description ?? '').trim();
    const newTags = Array.isArray(raw?.tags) ? raw.tags : [];
    const newTagsHas = newTags.some((x) => String(x ?? '').trim());
    const newSpecial = raw?.specialTag === '官方' || raw?.specialTag === '政府' ? raw.specialTag : null;
    const newIcon = String(raw?.icon ?? '').trim();
    const newAliasesIn = normalizeAliases(raw?.aliases);
    const oldName = String(prev?.name ?? '').trim();
    const prevAliasCount = normalizeAliases(prev?.aliases).length;

    if (strategy === 'merge' || strategy === 'alias') {
        const patch = {};
        // ① 补全空字段（v2.7 语义：只填旧条目缺的，绝不覆盖已有内容）
        if (!String(prev?.description || '').trim() && newDesc) patch.description = newDesc;
        if ((!Array.isArray(prev?.tags) || prev.tags.length === 0) && newTagsHas) patch.tags = newTags;
        if (!prev?.specialTag && newSpecial) patch.specialTag = newSpecial;
        if (!prev?.icon && newIcon) patch.icon = newIcon;
        // ② 别名只增不减：新数据自带别名并入；alias 策略下新名称也进别名
        const add = [...newAliasesIn];
        if (strategy === 'alias' && newName && newName !== oldName) add.push(newName);
        const union = unionAliases(prev?.aliases, add, [oldName]);
        if (union.length !== prevAliasCount) patch.aliases = union;
        return Object.keys(patch).length ? patch : null;
    }

    if (strategy === 'overwrite') {
        const patch = {};
        // ① 新数据非空字段一律覆盖（空字段保留旧值，避免坏数据洗掉好内容）
        if (newName && newName !== oldName) patch.name = newName;
        if (newDesc) patch.description = newDesc;
        if (newTagsHas) patch.tags = newTags;
        if (newSpecial) patch.specialTag = newSpecial;
        if (newIcon) patch.icon = newIcon;
        // ② 名称被替换时，旧名称转入别名保留可搜（更新名字但不丢搜索命中率）
        const finalName = patch.name || oldName;
        const add = [...newAliasesIn];
        if (patch.name && oldName && oldName !== finalName) add.push(oldName);
        const union = unionAliases(prev?.aliases, add, [finalName]);
        if (union.length !== prevAliasCount) patch.aliases = union;
        return Object.keys(patch).length ? patch : null;
    }

    // duplicate / skip：不做字段级合并，交由调用方处理
    return null;
}

/**
 * 导入前的单条预检：与 normalizeEntry 同规则判断合法性，并给出规范化网址。
 * 返回 { url } 或 null（非法条目）。
 */
export function precheckEntry(raw) {
    const name = String(raw?.name ?? '').trim();
    const url = normalizeUrl(String(raw?.url ?? '').trim());
    if (!name || !url) return null;
    return { url };
}
