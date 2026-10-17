/**
 * MiniSearch 助手 - 弹出面板逻辑（MV3，无构建、无框架，纯原生 JS）
 *
 * 数据约定（与 MiniSearch v2 对齐）：
 * - 字典导入格式：JSON 数组 或 {entries:[...]}，条目字段 name(必填)/url(必填)/description/tags[]/specialTag/icon
 * - url 规范化规则与主站 utils.normalizeUrl 一致：仅接受 http/https，自动补协议
 * - 导出文件：{app:'minisearch', type:'entries', version:2, exportedAt, source, entries:[...]}
 * - 深链导入：<MS地址>/index.html#ms-import=<base64url(JSON)>，由主站 js/ui/pluginbridge.js 接收并预填表单
 */

const DEFAULT_MS_BASE = 'http://localhost:8080';
const FAVICON_TMPL = 'https://www.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=';

const state = {
    tab: null,      // 当前标签页 { url, title }
    msBase: DEFAULT_MS_BASE,
};

const $ = (id) => document.getElementById(id);

function setStatus(el, msg, kind = '') {
    const box = $(el);
    box.textContent = msg || '';
    box.className = `status${kind ? ' ' + kind : ''}`;
}

/** URL 规范化（与 MiniSearch utils.normalizeUrl 同规则）：非法返回 null */
function normalizeUrl(input) {
    let s = String(input ?? '').trim();
    if (!s) return null;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = 'https://' + s;
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return u.href;
    } catch {
        return null;
    }
}

/** UTF-8 安全的 base64url（深链载荷） */
function b64urlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 组装字典条目（url 非法返回 null） */
function toEntry(rawUrl, name, { description = '', tags = [] } = {}) {
    const url = normalizeUrl(rawUrl);
    if (!url) return null;
    const host = new URL(url).hostname;
    return {
        name: String(name || '').trim().slice(0, 200) || host,
        url,
        description: String(description || '').trim().slice(0, 500),
        tags: (Array.isArray(tags) ? tags : [])
            .map((t) => String(t).trim()).filter(Boolean).slice(0, 12),
    };
}

/** 导出文件统一包裹格式（主站「字典管理 → 导入」直接识别 data.entries） */
function wrapExport(source, entries) {
    return {
        app: 'minisearch',
        type: 'entries',
        version: 2,
        exportedAt: new Date().toISOString(),
        source,
        entries,
    };
}

/** 下载 JSON 文件（弹出页内 blob 直下，无需 downloads 权限） */
function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

// ---------------- 当前网址导入 ----------------

function readImportForm() {
    return {
        name: $('imp-name').value.trim(),
        url: $('imp-url').value.trim(),
        description: $('imp-desc').value.trim(),
        tags: $('imp-tags').value.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean),
        specialTag: $('imp-special').value || '',
        icon: $('imp-icon').value.trim(),
    };
}

function currentEntryPayload() {
    const form = readImportForm();
    if (!form.name) return { error: '请填写名称' };
    const url = normalizeUrl(form.url);
    if (!url) return { error: '网址格式不正确（仅支持 http/https）' };
    const entry = {
        name: form.name.slice(0, 200),
        url,
        description: form.description.slice(0, 500),
        tags: form.tags.slice(0, 12),
    };
    if (form.specialTag === '官方' || form.specialTag === '政府') entry.specialTag = form.specialTag;
    if (form.icon) entry.icon = form.icon.slice(0, 500);
    return { entry };
}

/** MiniSearch 深链：地址补 index.html + #ms-import=base64url */
function buildMsImportUrl(entry) {
    let base = (state.msBase || DEFAULT_MS_BASE).trim();
    if (!/^https?:\/\//i.test(base)) base = 'http://' + base;
    base = base.replace(/\/+$/, '');
    const lastSeg = base.split('/').pop() || '';
    if (!lastSeg.includes('.')) base += '/index.html';
    return `${base}#ms-import=${b64urlEncode(JSON.stringify(entry))}`;
}

async function captureCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab || null;
    const url = normalizeUrl(tab?.url);
    $('imp-name').value = (tab?.title || '').slice(0, 200);
    $('imp-url').value = tab?.url || '';
    // 图标预填 gstatic 中国区 favicon 服务（可编辑，可清空）
    $('imp-icon').value = url ? FAVICON_TMPL + encodeURIComponent(url) : '';
    if (!url) {
        $('btn-open-ms').disabled = true;
        setStatus('status-import', '当前页不是 http/https 网址（如浏览器设置页），无法导入字典。', 'err');
    }
}

// ---------------- 浏览器收藏导出 ----------------

/** 浏览器内置根文件夹名（不作为标签） */
const ROOT_FOLDER_NAMES = new Set([
    '', '书签栏', 'Bookmarks bar', '其他书签', 'Other bookmarks', '移动设备书签', 'Mobile bookmarks',
]);

/** 深度优先收集书签：叶子记 {node, folders}；folders 为所在文件夹路径 */
function walkBookmarkTree(nodes, folders, out) {
    for (const n of nodes || []) {
        if (n.url) out.push({ node: n, folders: folders.slice() });
        else if (Array.isArray(n.children)) walkBookmarkTree(n.children, folders.concat([n.title]), out);
    }
}

/** 收藏树 → 字典条目列表（同网址去重，跳过非 http/https） */
function bookmarksToEntries(tree) {
    const leaves = [];
    walkBookmarkTree(tree, [], leaves);
    const byUrl = new Map();
    let skipped = 0;
    for (const { node, folders } of leaves) {
        // 内置根节点名（书签栏/其他书签等）不作为标签，用户自建文件夹名保留
        const folderTags = folders.filter((f) => !ROOT_FOLDER_NAMES.has(f)).slice(0, 3);
        const entry = toEntry(node.url, node.title, {
            tags: folderTags.length ? folderTags : ['收藏'],
        });
        if (!entry) { skipped++; continue; }
        if (byUrl.has(entry.url)) { skipped++; continue; }
        byUrl.set(entry.url, entry);
    }
    return { entries: [...byUrl.values()], skipped, total: leaves.length };
}

async function exportBookmarks() {
    try {
        const tree = await chrome.bookmarks.getTree();
        const { entries, skipped, total } = bookmarksToEntries(tree);
        if (entries.length === 0) {
            setStatus('status-export', '没有可导出的书签（浏览器无收藏或均为非 http/https 链接）。', 'err');
            return;
        }
        downloadJson(`minisearch-bookmarks-${today()}.json`, wrapExport('browser-bookmarks', entries));
        setStatus('status-export', `已导出 ${entries.length} 条书签条目（共 ${total} 个书签，跳过重复/无效 ${skipped} 条）。请到 MiniSearch「设置 → 字典管理 → 导入」导入。`, 'ok');
    } catch (err) {
        setStatus('status-export', `导出失败：${err.message}`, 'err');
    }
}

// ---------------- 浏览器历史导出 ----------------

async function exportHistory() {
    try {
        const days = Number($('hist-days').value) || 0;
        const limit = Math.min(10000, Math.max(1, Math.floor(Number($('hist-limit').value) || 2000)));
        const query = { text: '', maxResults: limit };
        if (days > 0) query.startTime = Date.now() - days * 86400000;
        const items = await chrome.history.search(query);
        const byUrl = new Map();
        let skipped = 0;
        for (const item of items) {
            const date = item.lastVisitTime ? new Date(item.lastVisitTime).toISOString().slice(0, 10) : '';
            const entry = toEntry(item.url, item.title, {
                description: date ? `访问 ${item.visitCount || 1} 次 · 最近访问 ${date}` : '',
                tags: ['历史'],
            });
            if (!entry) { skipped++; continue; }
            const prev = byUrl.get(entry.url);
            if (prev) {
                // 同一网址多次访问：保留访问次数更多的一条
                const prevCount = Number(/访问 (\d+) 次/.exec(prev.description)?.[1]) || 1;
                const thisCount = item.visitCount || 1;
                if (thisCount > prevCount) byUrl.set(entry.url, entry);
                else skipped++;
                continue;
            }
            byUrl.set(entry.url, entry);
        }
        const entries = [...byUrl.values()].sort((a, b) =>
            String(/最近访问 (.+)$/.exec(a.description)?.[1] || '') < String(/最近访问 (.+)$/.exec(b.description)?.[1] || '') ? 1 : -1);
        if (entries.length === 0) {
            setStatus('status-export', '所选时间范围内没有可导出的历史记录。', 'err');
            return;
        }
        downloadJson(`minisearch-history-${today()}.json`, wrapExport('browser-history', entries));
        setStatus('status-export', `已导出 ${entries.length} 条历史条目（跳过重复/无效 ${skipped} 条）。请到 MiniSearch「设置 → 字典管理 → 导入」导入。`, 'ok');
    } catch (err) {
        setStatus('status-export', `导出失败：${err.message}`, 'err');
    }
}

// ---------------- 设置 ----------------

async function loadSettings() {
    const { msBase } = await chrome.storage.local.get('msBase');
    state.msBase = typeof msBase === 'string' && msBase.trim() ? msBase.trim() : DEFAULT_MS_BASE;
    $('set-msbase').value = state.msBase;
}

async function saveSettings() {
    const v = $('set-msbase').value.trim() || DEFAULT_MS_BASE;
    if (!/^https?:\/\//i.test(v)) {
        setStatus('status-settings', '地址需以 http:// 或 https:// 开头。', 'err');
        return;
    }
    state.msBase = v;
    await chrome.storage.local.set({ msBase: v });
    setStatus('status-settings', '已保存。', 'ok');
}

// ---------------- 事件绑定与初始化 ----------------

function switchTab(name) {
    for (const tab of document.querySelectorAll('#tabs .tab')) {
        tab.classList.toggle('active', tab.dataset.tab === name);
    }
    for (const panel of document.querySelectorAll('.panel')) {
        panel.classList.toggle('hidden', panel.id !== `panel-${name}`);
    }
}

function bindEvents() {
    document.getElementById('tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (tab) switchTab(tab.dataset.tab);
    });

    // 导入当前网址
    $('imp-url').addEventListener('input', () => {
        const ok = Boolean(normalizeUrl($('imp-url').value));
        $('btn-open-ms').disabled = !ok;
        if (ok) setStatus('status-import', '');
    });
    $('btn-open-ms').addEventListener('click', () => {
        const { entry, error } = currentEntryPayload();
        if (error) return setStatus('status-import', error, 'err');
        chrome.tabs.create({ url: buildMsImportUrl(entry) });
        window.close();
    });
    $('btn-dl-one').addEventListener('click', () => {
        const { entry, error } = currentEntryPayload();
        if (error) return setStatus('status-import', error, 'err');
        downloadJson(`minisearch-entry-${today()}.json`, wrapExport('plugin-current-tab', [entry]));
        setStatus('status-import', '已下载，请到 MiniSearch「设置 → 字典管理 → 导入」导入。', 'ok');
    });
    $('btn-copy-one').addEventListener('click', async () => {
        const { entry, error } = currentEntryPayload();
        if (error) return setStatus('status-import', error, 'err');
        const ok = await copyText(JSON.stringify([entry], null, 2));
        setStatus('status-import', ok ? '已复制条目 JSON 数组到剪贴板。' : '复制失败，请改用「下载 JSON」。', ok ? 'ok' : 'err');
    });

    // 导出
    $('btn-export-bookmarks').addEventListener('click', exportBookmarks);
    $('btn-export-history').addEventListener('click', exportHistory);

    // 设置
    $('btn-save-settings').addEventListener('click', saveSettings);
}

bindEvents();
loadSettings().then(captureCurrentTab).catch((err) => {
    setStatus('status-import', `初始化失败：${err.message}`, 'err');
});
