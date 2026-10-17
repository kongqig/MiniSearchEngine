/**
 * 浏览器插件深链接收器（minisearch_plugin 扩展专用）。
 * 扩展通过 <MS 地址>/index.html#ms-import=<base64url(JSON)> 打开本页，
 * 解码载荷后预填「添加条目」表单，由用户确认编辑后保存（可编辑导入）。
 * 载荷字段：{ name, url, description?, tags?, specialTag?, icon? }
 */

import { showEntryFormDialog } from './dialogs.js';
import { toast } from './dom.js';

/** base64url → UTF-8 字符串（与插件 popup.js b64urlEncode 对偶） */
function b64urlDecode(s) {
    let b = s.replace(/-/g, '+').replace(/_/g, '/');
    b += '='.repeat((4 - (b.length % 4)) % 4);
    const bin = atob(b);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** 最小清洗：仅保留表单可承接的字段，脏数据不进入表单 */
function sanitizePayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const url = String(raw.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) return null;
    return {
        name: String(raw.name ?? '').trim().slice(0, 200),
        url,
        description: String(raw.description ?? '').trim().slice(0, 500),
        tags: Array.isArray(raw.tags)
            ? raw.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
            : [],
        specialTag: raw.specialTag === '官方' || raw.specialTag === '政府' ? raw.specialTag : null,
        icon: String(raw.icon ?? '').trim().slice(0, 500) || null,
    };
}

/** 启动完成后调用：识别并消费 #ms-import= 深链（成功后立即清理 hash） */
export function consumePluginImport() {
    const hash = location.hash.slice(1);
    const m = /^ms-import=([A-Za-z0-9\-_]+)$/.exec(hash);
    if (!m) return false;
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 忽略 */ }
    try {
        const entry = sanitizePayload(JSON.parse(b64urlDecode(m[1])));
        if (!entry || !entry.name) throw new Error('invalid payload');
        showEntryFormDialog(entry);
        toast('已从 MiniSearch 助手带入网址，请确认后保存', 'success');
        return true;
    } catch {
        toast('插件导入数据无效', 'error');
        return false;
    }
}
