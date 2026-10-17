/**
 * MiniSearch v2 - 全局常量与默认配置
 * 旧版（v1）的 localStorage / IndexedDB 结构完全不兼容，数据不迁移。
 */

export const APP_VERSION = '2.8.1';

/** 本地存储 key（全新命名空间，与 v1 不冲突） */
export const STORAGE_KEYS = {
    config: 'ms.config.v2',
    aiConfig: 'ms.ai.v2',
    history: 'ms.history.v2',
};

/** IndexedDB（全新库名，与 v1 不冲突） */
export const DB = {
    name: 'minisearch-v2',
    version: 1,
    stores: {
        entries: 'entries',      // 字典条目（含预计算搜索字段）
        favorites: 'favorites',  // 收藏
        meta: 'meta',            // 元信息（key-value）
    },
};

/** CDN 依赖（允许运行时动态 import，加载失败自动降级） */
export const CDN = {
    flexsearch: 'https://cdn.jsdelivr.net/npm/flexsearch@0.8.212/dist/flexsearch.bundle.module.min.mjs',
    pinyin: [
        'https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.7/+esm',
        'https://esm.sh/pinyin-pro@3.19.7',
    ],
};

/** 外部搜索引擎 */
export const ENGINES = {
    bing: { name: '必应', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    baidu: { name: '百度', url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
    google: { name: '谷歌', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    github: { name: 'GitHub', url: (q) => `https://github.com/search?q=${encodeURIComponent(q)}` },
    custom: { name: '自定义', url: null }, // URL 来自 config.customEngineUrl，由 buildEngineUrl 统一解析
};

/**
 * 应用用户模板：含 {query} 占位符则替换；否则智能追加 ?q= / &q=。
 * 模板缺协议时自动补 https://。
 */
export function applyEngineTemplate(tpl, q) {
    const query = String(q ?? '');
    let url = String(tpl || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const enc = encodeURIComponent(query);
    if (url.includes('{query}')) return url.replaceAll('{query}', enc);
    return url + (url.includes('?') ? '&' : '?') + `q=${enc}`;
}

/** 搜索历史最大条数（默认值，运行时以 config.historyLimit 为准） */
export const HISTORY_LIMIT = 100;

/** 收藏保存数量默认值与上下限（历史/收藏共用同一套边界） */
export const HISTORY_LIMIT_RANGE = { min: 1, max: 1000 };
export const FAVORITES_LIMIT_RANGE = { min: 1, max: 5000 };

/** 搜索结果缓存容量 */
export const SEARCH_CACHE_SIZE = 50;

/** 默认设置 */
export const DEFAULT_CONFIG = {
    // 外观
    theme: 'system',            // system | light | dark
    themeColor: '#1a73e8',
    logoText: 'MiniSearch',
    logoImage: null,            // dataURL
    backgroundImage: null,      // dataURL
    backgroundOpacity: 1,       // 0 - 1
    // 搜索
    defaultEngine: 'dictionary',// dictionary | bing | baidu | google | github | custom
    customEngineUrl: '',        // 自定义引擎地址模板（{query} 占位符，缺省自动追加 ?q=）
    multiSourceSearch: true,    // 结果页附带外部引擎跳转
    resultsPerPage: 20,         // 10 | 20 | 50
    openInNewTab: true,
    advancedSearch: true,       // 启用 site:/filetype: 语法
    cacheEnabled: true,         // 搜索结果缓存（同一查询短时间复用）
    suggestionsEnabled: true,
    suggestionsCount: 5,
    suggestSource: 'dict',      // 建议来源：dict=始终本机字典（与搜索引擎无关）| bing | baidu | google | custom
    suggestCustomUrl: '',       // 自定义建议接口（{query} 占位符）
    suggestProxyUrl: '',        // 建议接口代理模板（{url} 占位符，直连失败时使用；留空不代理）
    historyLimit: 100,          // 搜索历史保存数量（超出删最旧，调小立即裁剪）
    favoritesLimit: 500,        // 收藏保存数量（超出移除最早收藏，调小立即裁剪）
    importConflict: 'merge',    // 同网址导入策略：merge智能合并 | alias合并为别名 | overwrite新数据覆盖 | duplicate保留多条 | skip跳过
    // 功能
    aiEnabled: false,           // 在结果页显示 AI 回答
    toolsEnabled: true,         // 按关键词触发工具卡片
    language: 'zh',             // zh | en
};

/** 默认 AI 配置 */
export const DEFAULT_AI_CONFIG = {
    provider: 'deepseek',
    baseUrl: '',                // 留空使用 provider 默认
    apiPath: '',                // 留空使用 provider 默认
    apiKey: '',
    model: '',
    systemPrompt: '你是一个简洁的搜索引擎助手，请用简洁的语言回答用户的问题，回答控制在300字以内。',
    customHeaders: {},          // { 'Header-Name': 'value' }
    corsPolicy: 'auto',         // auto | on | off
    proxyTemplate: 'https://corsproxy.io/?url={url}',
    temperature: 0.7,
    maxTokens: 1024,
};

/** 系统提示词模板 */
export const PROMPT_TEMPLATES = {
    concise: '你是一个简洁的搜索引擎助手，请用简洁的语言回答用户的问题，回答控制在300字以内。',
    detailed: '你是一个详细的搜索引擎助手，请尽可能详细地回答用户的问题，提供全面的信息和解释。',
    creative: '你是一个有创意的搜索引擎助手，请用有趣、生动的方式回答用户的问题，让回答更加引人入胜。',
};

/**
 * AI 配置清洗：与 sanitizeConfig 同思路，防止导入文件注入脏值。
 */
export function sanitizeAiConfig(raw) {
    const out = {};
    const d = DEFAULT_AI_CONFIG;
    for (const key of Object.keys(d)) {
        if (!raw || !(key in raw)) continue;
        const v = raw[key];
        const t = typeof d[key];
        if (t === 'number') { if (Number.isFinite(Number(v))) out[key] = Number(v); }
        else if (t === 'string') { if (typeof v === 'string') out[key] = v; }
        else if (key === 'customHeaders') {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                out[key] = Object.fromEntries(Object.entries(v).filter(([k, val]) => typeof k === 'string' && typeof val === 'string').slice(0, 20));
            }
        }
    }
    return out;
}

/**
 * 配置清洗：只接受已知键且类型正确，非法值丢弃（导入备份 / 持久化读取 / 控件写入前的最后防线）。
 * 防止如 resultsPerPage: "" 一类的脏值污染分页等数值计算。
 */
export function sanitizeConfig(raw) {
    const out = {};
    const d = DEFAULT_CONFIG;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, Math.floor(Number(v) || min)));
    for (const key of Object.keys(d)) {
        if (!raw || !(key in raw)) continue;
        const v = raw[key];
        const t = typeof d[key];
        if (t === 'boolean') { if (typeof v === 'boolean') out[key] = v; }
        else if (key === 'historyLimit') { out[key] = clamp(v, HISTORY_LIMIT_RANGE.min, HISTORY_LIMIT_RANGE.max); }
        else if (key === 'favoritesLimit') { out[key] = clamp(v, FAVORITES_LIMIT_RANGE.min, FAVORITES_LIMIT_RANGE.max); }
        else if (t === 'number') { if (Number.isFinite(Number(v))) out[key] = Number(v); }
        else if (key === 'defaultEngine') { if (['dictionary', 'bing', 'baidu', 'google', 'github', 'custom'].includes(v)) out[key] = v; }
        else if (key === 'suggestSource') { if (['dict', 'bing', 'baidu', 'google', 'custom'].includes(v)) out[key] = v; }
        else if (key === 'importConflict') { if (['merge', 'alias', 'overwrite', 'duplicate', 'skip'].includes(v)) out[key] = v; }
        else if (key === 'theme') { if (['system', 'light', 'dark'].includes(v)) out[key] = v; }
        else if (key === 'language') { if (['zh', 'en'].includes(v)) out[key] = v; }
        else if (t === 'string') {
            if (typeof v !== 'string') continue;
            // URL 模板字段：清洗危险协议与溢出长度
            if (['customEngineUrl', 'suggestCustomUrl', 'suggestProxyUrl'].includes(key)) {
                const s = v.trim().slice(0, 500);
                if (/^(java|vb|data|blob|file)\s*:/i.test(s)) continue; // 拒绝危险协议
                out[key] = s.replace(/[<>"`]/g, '');
            } else out[key] = v;
        }
        else { if (v === null || typeof v === 'string') out[key] = v; } // dataURL 等
    }
    return out;
}

/** 首次使用的示例可信网站（可在字典管理中一键载入） */
export const SAMPLE_ENTRIES = [
    { name: '中华人民共和国中央人民政府', url: 'https://www.gov.cn', description: '国务院官网，权威政策发布入口', tags: ['政府', '政策'], specialTag: '政府' },
    { name: '国家政务服务平台', url: 'https://gjzwfw.www.gov.cn', description: '全国一体化政务服务，跨省办事入口', tags: ['政务', '办事'], specialTag: '政府' },
    { name: '工信部ICP备案管理系统', url: 'https://beian.miit.gov.cn', description: '网站备案信息查询官方入口', tags: ['备案', '查询'], specialTag: '政府' },
    { name: '中国铁路12306', url: 'https://www.12306.cn', description: '铁路车票唯一官方购票平台', tags: ['火车票', '出行'], specialTag: '官方' },
    { name: '国家电网网上国网', url: 'https://www.95598.cn', description: '电费缴纳与用电服务官方平台', tags: ['电费', '生活'], specialTag: '官方' },
    { name: '中国邮政速递物流', url: 'https://www.ems.com.cn', description: 'EMS快递查询与寄件官方入口', tags: ['快递', '物流'], specialTag: '官方' },
    { name: '个人所得税', url: 'https://etax.chinatax.gov.cn', description: '自然人电子税务局，个税办税入口', tags: ['税务', '办税'], specialTag: '政府' },
    { name: '学信网', url: 'https://www.chsi.com.cn', description: '教育部学历学位查询指定网站', tags: ['学历', '教育'], specialTag: '政府' },
    { name: '国家社会保险公共服务平台', url: 'https://si.12333.gov.cn', description: '社保查询与待遇认证官方平台', tags: ['社保', '查询'], specialTag: '政府' },
    { name: 'Microsoft 微软中国', url: 'https://www.microsoft.com/zh-cn', description: '微软官网，Windows 与 Office 正版下载', tags: ['软件', '下载'], specialTag: '官方' },
    { name: 'Apple 中国', url: 'https://www.apple.com.cn', description: '苹果官网，产品购买与售后服务', tags: ['数码', '官方'], specialTag: '官方' },
    { name: 'GitHub', url: 'https://github.com', description: '全球最大代码托管与开源社区', tags: ['开发', '代码'] },
];
