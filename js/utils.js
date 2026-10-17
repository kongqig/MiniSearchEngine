/**
 * 通用工具函数（DOM / 字符串 / 颜色 / 文件）
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** HTML 转义（正文与属性均安全） */
export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function debounce(fn, wait = 100) {
    let timer = null;
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
}

export function uuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function nowISO() {
    return new Date().toISOString();
}

export function formatTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso ?? '');
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** URL 规范化：补全协议、去掉尾随空格；非法返回 null */
export function normalizeUrl(input) {
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

export function extractDomain(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return String(url ?? '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    }
}

export function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const num = parseInt(m[1], 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function adjustColor(hex, amount) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const num = parseInt(m[1], 16);
    const cl = (v) => Math.max(0, Math.min(255, v));
    const r = cl((num >> 16) + amount), g = cl(((num >> 8) & 255) + amount), b = cl((num & 255) + amount);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * 压缩/缩放图片文件为 dataURL（用于背景图与 Logo，避免撑爆 localStorage）
 */
export function fileToDataURL(file, { maxW = Infinity, maxH = Infinity, mime, quality = 0.85 } = {}) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.onload = () => {
            const raw = reader.result;
            const needResize = maxW !== Infinity || maxH !== Infinity;
            const img = new Image();
            img.onerror = () => resolve(raw);
            img.onload = () => {
                if (!needResize || (img.width <= maxW && img.height <= maxH)) return resolve(raw);
                const scale = Math.min(maxW / img.width, maxH / img.height, 1);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // 带 alpha 通道的格式保留 png，否则用 jpeg 减小体积
                const outMime = mime || (/png|webp|gif|svg/i.test(file.type) ? 'image/png' : 'image/jpeg');
                try {
                    resolve(canvas.toDataURL(outMime, quality));
                } catch {
                    resolve(raw);
                }
            };
            img.src = raw;
        };
        reader.readAsDataURL(file);
    });
}

export function download(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
