/**
 * 视图基础层：主题 / Logo / 背景 应用，页面切换，toast 轻提示。
 * 订阅 store.config 自动生效，业务模块无需手动调用。
 */

import { store } from '../store.js';
import { adjustColor, hexToRgba, esc } from '../utils.js';
import { APP_VERSION } from '../config.js';

/** 应用主题（模式 / 主题色 / 背景图） */
export function applyTheme(cfg) {
    const root = document.documentElement;
    const theme = cfg.theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : cfg.theme;
    root.setAttribute('data-theme', theme);

    const color = /^#[0-9a-f]{6}$/i.test(cfg.themeColor || '') ? cfg.themeColor : '#1a73e8';
    root.style.setProperty('--theme-color', color);
    root.style.setProperty('--theme-color-hover', adjustColor(color, -18));
    root.style.setProperty('--theme-color-light', hexToRgba(color, 0.12));

    if (cfg.backgroundImage) {
        root.style.setProperty('--background-image', `url("${cfg.backgroundImage}")`);
        root.style.setProperty('--background-opacity', String(cfg.backgroundOpacity ?? 1));
    } else {
        root.style.setProperty('--background-image', 'none');
        root.style.setProperty('--background-opacity', '1');
    }
}

/** 应用 Logo（图片优先，其次文字） */
export function applyLogo(cfg) {
    const el = document.getElementById('logo');
    if (!el) return;
    if (cfg.logoImage) {
        el.innerHTML = `<img class="logo-img" src="${esc(cfg.logoImage)}" alt="logo">`;
    } else {
        el.innerHTML = `<span class="logo-text">${esc(cfg.logoText || 'MiniSearch')}</span>`;
    }
}

/** 页面切换：home | search */
export function showPage(name) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    const target = document.getElementById(name === 'search' ? 'search-page' : 'home-page');
    target?.classList.add('active');
    if (name === 'search') window.scrollTo({ top: 0 });
}

let toastTimer = null;
/** 轻提示（2.4s 自动消失） */
export function toast(message, type = 'info') {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = String(message ?? '');
    el.className = `toast visible toast-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 2400);
}

/** 初始化主题 / Logo / 语言的响应式应用 */
export function initViewFoundation() {
    applyTheme(store.get('config'));
    applyLogo(store.get('config'));
    store.subscribe('config', (cfg) => {
        applyTheme(cfg);
        applyLogo(cfg);
        document.documentElement.lang = cfg.language === 'en' ? 'en' : 'zh-CN';
    });

    // 系统主题跟随
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (store.get('config').theme === 'system') applyTheme(store.get('config'));
    });
}

export { APP_VERSION };
