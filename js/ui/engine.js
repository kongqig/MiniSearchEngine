/**
 * 引擎快捷切换条：字典 / 必应 / 百度 / 谷歌 / GitHub / 自定义，首页与结果页各一条，读写同一配置。
 * 选择外部引擎后，搜索将直接跳转到该引擎；选择字典则在本机搜索。
 * 自定义引擎需先在设置中配置地址模板（{query} 占位符，缺省自动追加 ?q=）。
 * 占位符随引擎变化；配置与语言变更时自动重渲染。
 */

import { store, updateConfig } from '../store.js';
import { ENGINES } from '../config.js';
import { t, tf, onLanguageChange } from '../i18n.js';

const KEYS = ['dictionary', 'bing', 'baidu', 'google', 'github', 'custom'];

/** 引擎显示名（i18n 感知） */
export function engineName(key) {
    if (key === 'dictionary') return t('自定义字典');
    return t(ENGINES[key]?.name || key);
}

function isActive(key) {
    return (store.get('config').defaultEngine || 'dictionary') === key;
}

/** 自定义引擎是否已配置地址 */
export function customReady() {
    return Boolean(store.get('config').customEngineUrl);
}

function tabsHtml() {
    return KEYS.map((key) => `
        <button class="engine-tab ${isActive(key) ? 'active' : ''}" data-action="set-engine" data-engine="${key}"
            title="${engineName(key)}">${engineName(key)}</button>
    `).join('');
}

/** 按当前引擎更新两个输入框的占位符 */
export function applyPlaceholder() {
    const cfg = store.get('config');
    const engine = cfg.defaultEngine || 'dictionary';
    let placeholder;
    if (engine === 'dictionary') placeholder = t('搜索可信网站...');
    else if (engine === 'custom' && !cfg.customEngineUrl) placeholder = t('先在设置中配置自定义引擎地址...');
    else placeholder = tf('在{engine}中搜索...', { engine: engineName(engine) });
    for (const id of ['search-input', 'search-input-result']) {
        const input = document.getElementById(id);
        if (input) input.placeholder = placeholder;
    }
}

/** 渲染两处引擎切换条 + 占位符 */
export function renderAll() {
    for (const id of ['engine-tabs-home', 'engine-tabs-result']) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = tabsHtml();
    }
    applyPlaceholder();
}

export function initView() {
    renderAll();
    store.subscribe('config', (cfg, prev) => {
        if (!prev || cfg.defaultEngine !== prev.defaultEngine || cfg.language !== prev.language
            || cfg.customEngineUrl !== prev.customEngineUrl) renderAll();
    }, { immediate: false });
    onLanguageChange(renderAll);
}

/** set-engine 动作（app.js 委托调用） */
export function setEngine(key) {
    if (!KEYS.includes(key)) return;
    if (store.get('config').defaultEngine === key) return;
    updateConfig({ defaultEngine: key });
}
