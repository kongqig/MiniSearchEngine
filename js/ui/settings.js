/**
 * 设置面板：8 个子面板（主题/搜索/字典/AI/功能区/数据/帮助/关于），横向 tab（移动）/侧栏（桌面）。
 * 所有配置控件 data-cfg / data-aicfg 声明绑定，变更即时写 store（自动持久化并生效），
 * 因此无需"保存"按钮。复杂动作（导入导出/测试/获取模型/清除）走 data-action 委托。
 * 子面板中打开的表单/确认框关闭后自动回到本面板（dialogs.js restore 栈）。
 */

import { store, updateConfig, updateAiConfig } from '../store.js';
import { esc, fileToDataURL, download, normalizeUrl, uuid } from '../utils.js';
import { APP_VERSION, SAMPLE_ENTRIES, DEFAULT_CONFIG, DEFAULT_AI_CONFIG, PROMPT_TEMPLATES, sanitizeConfig, sanitizeAiConfig } from '../config.js';
import { entriesRepo, favoritesRepo } from '../data/repo.js';
import { planSameUrlMerge, precheckEntry } from '../data/merge.js';
import { loadLibrary, rebuildLibrary } from '../data/library.js';
import * as indexer from '../search/indexer.js';
import { AI_PROVIDERS, resolveEndpoint, testConnection, fetchModelList, diag } from '../ai/client.js';
import { openDialog, confirmDialog, showEntryFormDialog, deleteEntry, loadSampleEntries, closeDialog } from './dialogs.js';
import { toast } from './dom.js';
import { t, tf } from '../i18n.js';

const PANELS = [
    { key: 'theme', label: '主题设置' },
    { key: 'search', label: '搜索设置' },
    { key: 'dictionary', label: '字典管理' },
    { key: 'ai', label: 'AI 设置' },
    { key: 'functions', label: '功能区设置' },
    { key: 'data', label: '数据管理' },
    { key: 'help', label: '帮助' },
    { key: 'about', label: '关于' },
];

let currentPanel = 'theme';

export function openSettings(panel = 'theme') {
    currentPanel = PANELS.some((p) => p.key === panel) ? panel : 'theme';
    openDialog({
        title: t('设置'),
        wide: true,
        content: `
            <div class="settings-layout">
                <div class="settings-sidebar" id="settings-tabs">
                    ${PANELS.map((p) => `<button class="settings-item ${p.key === currentPanel ? 'active' : ''}" data-action="settings-tab" data-panel="${p.key}">${t(p.label)}</button>`).join('')}
                </div>
                <div class="settings-panel" id="settings-panel">${renderPanel(currentPanel)}</div>
            </div>
        `,
    });
}

/** 子对话框（表单/确认框）关闭后恢复设置面板：app.js 的 restore 参数用 */
export function reopenSettings() {
    openSettings(currentPanel);
}

export function switchSettingsTab(panel) {
    currentPanel = panel;
    document.querySelectorAll('#settings-tabs .settings-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.panel === panel);
    });
    const panelEl = document.getElementById('settings-panel');
    if (panelEl) panelEl.innerHTML = renderPanel(panel);
}

/** 把配置控件值写回 store（app.js 的 input/change 委托调用） */
export function applyControlValue(el) {
    const cfgKey = el.dataset.cfg;
    const aiKey = el.dataset.aicfg;
    if (!cfgKey && !aiKey) return false;

    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') value = Math.max(Number(el.min ?? -Infinity), Math.min(Number(el.max ?? Infinity), Number(el.value)));
    else if (el.type === 'range') value = Number(el.value);
    else if (el.dataset.json === 'headers') value = parseHeaders(el.value);
    else value = el.value;

    if (cfgKey) updateConfig(sanitizeConfig({ [cfgKey]: value }));
    else if (aiKey) updateAiConfig(sanitizeAiConfig({ [aiKey]: value }));

    // provider 切换 → 重渲染 AI 面板（刷新默认值提示与模型列表）
    if (aiKey === 'provider') switchSettingsTab(currentPanel);
    // 语言切换 → 整体重开设置（侧栏 tab 与面板文案同步）
    if (cfgKey === 'language') openSettings(currentPanel);
    // 每页结果数变化 → 立即影响当前分页
    if (cfgKey === 'resultsPerPage') {
        const s = store.get('search');
        if (s?.status === 'done') store.set('search', { ...s, pageSize: Number(value) || 20, page: 1 });
    }
    // 同网址导入策略变化 → 重渲染字典面板（说明文字随选择变化）
    if (cfgKey === 'importConflict') switchSettingsTab(currentPanel);
    return true;
}

function parseHeaders(text) {
    const out = {};
    for (const line of String(text || '').split('\n')) {
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k && v) out[k] = v;
    }
    return out;
}

function headersToText(headers) {
    return Object.entries(headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
}

// ---------------- 各面板渲染 ----------------

function renderPanel(key) {
    switch (key) {
        case 'theme': return renderThemePanel();
        case 'search': return renderSearchPanel();
        case 'dictionary': return renderDictPanel();
        case 'ai': return renderAiPanel();
        case 'functions': return renderFunctionsPanel();
        case 'data': return renderDataPanel();
        case 'help': return renderHelpPanel();
        case 'about': return renderAboutPanel();
        default: return '';
    }
}

function section(title, body) {
    return `<div class="settings-section"><div class="settings-section-title">${title}</div>${body}</div>`;
}
function row(label, control, hint = '') {
    return `
        <div class="settings-row">
            <span class="settings-label">${label}</span>
            <div class="settings-value">${control}</div>
        </div>
        ${hint ? `<div class="settings-hint">${hint}</div>` : ''}`;
}
function toggle(id, cfgKey, checked) {
    return `<label class="toggle-switch"><input type="checkbox" id="${id}" data-cfg="${cfgKey}" ${checked ? 'checked' : ''}><span class="toggle-slider"></span></label>`;
}
/** 自定义文件字段：隐藏原生 input，按钮 + 状态文字，避免“未选择文件”状态不同步 */
function fileField(kind, current) {
    const status = current ? t('已设置') : t('未选择文件');
    return `
        <span class="file-field">
            <input type="file" class="file-input-hidden" id="file-${kind}" accept="image/*" data-file="${kind}">
            <button type="button" class="btn btn-sm" data-action="pick-file" data-target="file-${kind}">${t('选择图片')}</button>
            <span class="file-status" id="file-status-${kind}">${esc(status)}</span>
        </span>`;
}
const cfg = () => store.get('config');
const ai = () => store.get('aiConfig');

function renderThemePanel() {
    const c = cfg();
    return `
        ${section(t('外观'), `
            ${row(t('主题模式'), `
                <select data-cfg="theme">
                    <option value="system" ${c.theme === 'system' ? 'selected' : ''}>${t('跟随系统')}</option>
                    <option value="light" ${c.theme === 'light' ? 'selected' : ''}>${t('亮色')}</option>
                    <option value="dark" ${c.theme === 'dark' ? 'selected' : ''}>${t('暗色')}</option>
                </select>`)}
            ${row(t('主题颜色'), `<input type="color" data-cfg="themeColor" value="${esc(c.themeColor)}">
                <button class="btn btn-sm" data-action="reset-theme-color">${t('恢复默认')}</button>`)}
        `)}
        ${section(t('背景'), `
            ${row(t('背景图片'), `${fileField('bg', c.backgroundImage)}
                ${c.backgroundImage ? `<button class="btn btn-sm" data-action="clear-bg">${t('清除')}</button>` : ''}`)}
            ${row(t('背景透明度'), `<input type="range" min="0.1" max="1" step="0.05" data-cfg="backgroundOpacity" value="${c.backgroundOpacity}">`)}
        `)}
        ${section(t('Logo'), `
            ${row(t('Logo 文字'), `<input type="text" data-cfg="logoText" value="${esc(c.logoText)}">`)}
            ${row(t('Logo 图片'), `${fileField('logo', c.logoImage)}
                ${c.logoImage ? `<button class="btn btn-sm" data-action="clear-logo">${t('清除')}</button>` : ''}`)}
        `)}
    `;
}

function renderSearchPanel() {
    const c = cfg();
    const engineOpts = (current) => [
        ['dictionary', t('自定义字典')],
        ['bing', t('必应')],
        ['baidu', t('百度')],
        ['google', t('谷歌')],
        ['github', t('GitHub')],
        ['custom', t('自定义')],
    ].map(([v, label]) => `<option value="${v}" ${current === v ? 'selected' : ''}>${label}</option>`).join('');
    const sourceOpts = (current) => [
        ['dict', t('字典（默认）')],
        ['bing', t('必应')],
        ['baidu', t('百度')],
        ['google', t('谷歌')],
        ['custom', t('自定义')],
    ].map(([v, label]) => `<option value="${v}" ${current === v ? 'selected' : ''}>${label}</option>`).join('');
    return `
        ${section(t('搜索引擎'), `
            ${row(t('默认搜索引擎'), `<select data-cfg="defaultEngine">${engineOpts(c.defaultEngine)}</select>`,
                t('选择外部引擎时，输入后按 Enter 将直接跳转到该引擎；选择字典时在本机搜索'))}
            ${row(t('自定义引擎地址'), `<input type="text" data-cfg="customEngineUrl" value="${esc(c.customEngineUrl || '')}" placeholder="https://example.com/search?q={query}">`,
                t('支持 {query} 占位符；不含时自动追加 ?q=。选择“自定义”引擎前请先填写'))}
            ${row(t('多数据源搜索'), toggle('cfg-multi', 'multiSourceSearch', c.multiSourceSearch),
                c.defaultEngine === 'dictionary'
                    ? t('开启后，字典搜索结果底部显示外部引擎快捷跳转；关闭则仅显示本地结果')
                    : t('当前默认引擎为外部引擎，搜索时将直接跳转；此开关仅在字典模式下生效'))}
            ${row(t('新标签页打开'), toggle('cfg-newtab', 'openInNewTab', c.openInNewTab))}
        `)}
        ${section(t('搜索结果'), `
            ${row(t('每页结果数'), `
                <select data-cfg="resultsPerPage">
                    ${[10, 20, 50].map((n) => `<option value="${n}" ${c.resultsPerPage === n ? 'selected' : ''}>${n}</option>`).join('')}
                </select>`)}
            ${row(t('搜索缓存'), toggle('cfg-cache', 'cacheEnabled', c.cacheEnabled), t('同一查询 5 分钟内复用结果，修改字典后自动失效'))}
        `)}
        ${section(t('高级功能'), `
            ${row(t('高级搜索语法'), toggle('cfg-adv', 'advancedSearch', c.advancedSearch), t('支持 site:example.com 限定域名、filetype:pdf 限定类型，本地与外部引擎均生效'))}
        `)}
        ${section(t('搜索推荐'), `
            ${row(t('启用推荐'), toggle('cfg-sug', 'suggestionsEnabled', c.suggestionsEnabled))}
            ${row(t('推荐数量'), `<input type="number" min="1" max="10" data-cfg="suggestionsCount" value="${c.suggestionsCount}">`)}
            ${row(t('建议来源'), `<select data-cfg="suggestSource">${sourceOpts(c.suggestSource)}</select>`,
                t('字典：建议始终来自本机字典，不随搜索引擎变化；百度 / 必应 / 谷歌：内置接口直连可用（JSONP 免跨域，无需代理），网络建议叠加在字典建议之上，失败自动回退字典'))}
            ${row(t('自定义建议接口'), `<input type="text" data-cfg="suggestCustomUrl" value="${esc(c.suggestCustomUrl || '')}" placeholder="https://api.example.com/suggest?q={query}">`,
                t('建议来源选“自定义”时必填，响应支持 OpenSearch 数组 / suggestions / 字符串数组'))}
            ${row(t('建议接口代理'), `<input type="text" data-cfg="suggestProxyUrl" value="${esc(c.suggestProxyUrl || '')}" placeholder="https://proxy.example.com/?url={url}">`,
                t('仅自定义接口需要：若接口被浏览器跨域（CORS）拦截，填入代理模板重试，{url} 为目标地址占位符'))}
        `)}
    `;
}

/** 同网址导入策略下拉的动态说明（随选择变化） */
function strategyHint(key) {
    switch (key) {
        case 'alias': return t('在智能合并基础上，新名称存入「别名」——新旧名称都能搜到，条数不增加，适合一站多名（如 DeepSeek / 大肥鱼AI）');
        case 'overwrite': return t('新数据的名称/简介/标签覆盖旧条目（新数据缺的字段保留旧值），旧名称自动转为别名保留可搜');
        case 'duplicate': return t('同一网址保留多条独立记录（多名称场景），搜索范围最大，条数会增加');
        case 'skip': return t('同网址条目直接跳过，不做任何修改（标题不参与判重，同名/近名条目不受影响）');
        default: return t('网址重复时保留旧条目，仅补全缺失的简介/标签/图标，名称保留先导入的；新数据自带的别名会并入');
    }
}

function renderDictPanel() {
    const entries = store.get('entries');
    const c = store.get('config') || {};
    const filter = document.getElementById('dict-filter')?.value || '';
    const list = filter
        ? entries.filter((e) => (e.name + ' ' + (e.aliases || []).join(' ') + ' ' + e.url + ' ' + (e.tags || []).join(' ')).toLowerCase().includes(filter.toLowerCase()))
        : entries;
    const strategyOpts = [
        ['merge', t('智能合并（默认）')],
        ['alias', t('合并为别名')],
        ['overwrite', t('新数据覆盖')],
        ['duplicate', t('保留多条')],
        ['skip', t('完全跳过')],
    ];
    return `
        <div class="dict-toolbar">
            <button class="btn btn-primary" data-action="dict-add">${t('添加条目')}</button>
            <button class="btn" data-action="load-samples">${t('载入示例')}</button>
            <span class="toolbar-spacer"></span>
            <span class="dict-strategy-inline">
                <label class="dict-strategy-label" for="cfg-import-conflict">${t('同网址导入策略')}</label>
                <select id="cfg-import-conflict" data-cfg="importConflict" title="${esc(strategyHint(c.importConflict || 'merge'))}">
                    ${strategyOpts.map(([v, label]) => `<option value="${v}" ${(c.importConflict || 'merge') === v ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
                <button class="btn" data-action="dict-import">${t('导入')}</button>
                <button class="btn" data-action="dict-export">${t('导出')}</button>
            </span>
        </div>
        <div class="settings-hint dict-strategy-hint">${strategyHint(c.importConflict || 'merge')}</div>
        ${entries.length > 0 ? `<input type="text" class="dict-filter" id="dict-filter" placeholder="${t('筛选...')}" value="${esc(filter)}">` : ''}
        <div class="dict-count">${t('条目')} ${entries.length}</div>
        <div class="dict-list" id="dict-list">
            ${list.length === 0
                ? `<div class="dialog-empty">${entries.length === 0 ? t('暂无条目，点击上方「添加条目」或「载入示例」开始') : t('无匹配条目')}</div>`
                : list.map((e) => `
                    <div class="dict-item">
                        <div class="dict-item-info">
                            <div class="dict-item-name">${esc(e.name)}${e.specialTag ? `<span class="tag ${e.specialTag === '官方' ? 'tag-official' : 'tag-gov'}">${esc(e.specialTag)}</span>` : ''}</div>
                            <div class="dict-item-url">${esc(e.url)}</div>
                            ${(e.aliases || []).length ? `<div class="dict-item-alias">${t('别名：')}${e.aliases.map((a) => esc(a)).join('、')}</div>` : ''}
                            ${(e.tags || []).length ? `<div class="dict-item-tags">${e.tags.map((tg) => `<span class="tag tag-data">${esc(tg)}</span>`).join('')}</div>` : ''}
                        </div>
                        <div class="dict-item-actions">
                            <button class="btn btn-sm" data-action="dict-edit" data-id="${esc(e.id)}">${t('编辑')}</button>
                            <button class="btn btn-sm" data-action="dict-del" data-id="${esc(e.id)}">${t('删除')}</button>
                        </div>
                    </div>`).join('')}
        </div>
        <details class="dict-help">
            <summary>${t('字典 JSON 格式与导入说明')}</summary>
            <div class="dict-help-body">${dictHelpHtml()}</div>
        </details>
        <button class="btn btn-sm dict-help-more" data-action="settings-tab" data-panel="help">${t('更多帮助：查看帮助中心')}</button>
        <input type="file" id="dict-import-file" accept=".json,application/json" class="hidden">
    `;
}

/** 字典 JSON 格式 / 字段表 / 导入规则（字典面板 details 与帮助中心共用，勿内联展开） */
function dictHelpHtml() {
    return `
                <p><strong>${t('文件格式')}</strong>：${t('JSON 数组，或包含 entries 字段的对象')}</p>
                <pre><code>[
  {
    "name": "${t('中国铁路12306')}",
    "url": "https://www.12306.cn",
    "description": "${t('铁路官方购票网站')}",
    "tags": ["${t('出行')}", "${t('购票')}"],
    "specialTag": "官方",
    "icon": "https://www.12306.cn/favicon.ico"
  }
]</code></pre>
                <table>
                    <thead><tr><th>${t('字段')}</th><th>${t('必填')}</th><th>${t('说明')}</th></tr></thead>
                    <tbody>
                        <tr><td><code>name</code></td><td>${t('必填')}</td><td>${t('网站名称，支持中文/全拼/简拼搜索')}</td></tr>
                        <tr><td><code>url</code></td><td>${t('必填')}</td><td>${t('网址；导入时按它判断重复')}</td></tr>
                        <tr><td><code>description</code></td><td>${t('可选')}</td><td>${t('一句话描述')}</td></tr>
                        <tr><td><code>tags</code></td><td>${t('可选')}</td><td>${t('标签数组，最多 12 个')}</td></tr>
                        <tr><td><code>aliases</code></td><td>${t('可选')}</td><td>${t('别名数组，与名称同样参与搜索（中文/拼音/简拼），适合一站多名')}</td></tr>
                        <tr><td><code>specialTag</code></td><td>${t('可选')}</td><td>${t('仅支持 "官方" 或 "政府"')}</td></tr>
                        <tr><td><code>icon</code></td><td>${t('可选')}</td><td>${t('图标图片地址')}</td></tr>
                    </tbody>
                </table>
                <p><strong>${t('导入规则')}</strong></p>
                <ul>
                    <li>${t('追加导入：现有条目保留，新条目追加到列表')}</li>
                    <li>${t('网址重复：按「同网址导入策略」处理（「导入」按钮旁可改）：')}</li>
                    <li>${t('智能合并（默认）：名称保留先导入的，旧条目缺的简介/标签/图标由新数据补全')}</li>
                    <li>${t('合并为别名：同上，且新名称写入「别名」——新旧名称都能搜到，条数不增加')}</li>
                    <li>${t('新数据覆盖：新名称/简介/标签覆盖旧条目，旧名称自动转为别名保留可搜')}</li>
                    <li>${t('保留多条：同一网址保留多条独立记录（多名称场景），条数增加')}</li>
                    <li>${t('完全跳过：同网址条目直接丢弃，不做任何修改')}</li>
                    <li>${t('子域名或路径不同（如 api.example.com、example.com/chat）是不同网址，全部保留——它们是不同入口，不会误合并')}</li>
                    <li>${t('标题相似或相同不判重：判重只认规范化网址，同名/近名条目是合法的别名场景')}</li>
                    <li>${t('无效条目（缺名称或网址不合法）：自动跳过，不影响其余条目')}</li>
                    <li>${t('拼音字段无需提供，导入后自动补算（别名也参与拼音/简拼索引）')}</li>
                    <li>${t('导入完成后显示统计：新增 / 合并补全 / 网址重复 / 无效 各多少条')}</li>
                    <li>${t('「数据管理 → 导入全部数据」为全量覆盖：替换现有字典、设置、历史与收藏')}</li>
                </ul>
            `;
}

function renderAiPanel() {
    const a = ai();
    const provider = AI_PROVIDERS[a.provider] || AI_PROVIDERS.custom;
    const eff = resolveEndpoint(a);
    return `
        ${section(t('AI 功能'), `
            ${row(t('在结果页显示 AI 回答'), toggle('cfg-ai', 'aiEnabled', cfg().aiEnabled))}
        `)}
        ${section(t('服务商配置'), `
            ${row(t('服务商'), `
                <select data-aicfg="provider">
                    ${Object.entries(AI_PROVIDERS).map(([k, p]) => `<option value="${k}" ${a.provider === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
                </select>`)}
            ${row(`${t('Base URL (域名)')}`, `<input type="text" data-aicfg="baseUrl" value="${esc(a.baseUrl)}" placeholder="${esc(provider.baseUrl || 'https://...')}">`)}
            ${row(t('服务路径 (留空使用默认)'), `<input type="text" data-aicfg="apiPath" value="${esc(a.apiPath)}" placeholder="${esc(provider.apiPath)}">`,
                `${t('完整URL')}: <code id="full-url-preview">${esc(eff.baseUrl + eff.apiPath)}</code>`)}
            ${row(t('API Key'), `
                <input type="password" id="ai-key" data-aicfg="apiKey" value="${esc(a.apiKey)}" placeholder="sk-...">
                <button class="btn btn-sm" data-action="ai-toggle-key">${t('显示')}</button>`)}
            ${row(t('模型'), `
                <input type="text" list="ai-model-list" data-aicfg="model" value="${esc(a.model)}" placeholder="${t('选择或输入模型名称')}">
                <datalist id="ai-model-list">${(provider.models || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
                <button class="btn btn-sm" data-action="ai-fetch-models">${t('获取模型')}</button>`)}
            ${row(t('测试连接'), `<button class="btn" data-action="ai-test">${t('测试')}</button><span id="ai-test-result" class="test-result"></span>`)}
        `)}
        ${section(t('自定义请求头'), `
            <div class="form-group">
                <textarea data-aicfg="customHeaders" data-json="headers" rows="3" placeholder="Header-Name: value">${esc(headersToText(a.customHeaders))}</textarea>
            </div>
        `)}
        ${section(t('高级选项'), `
            ${row(t('CORS 代理策略'), `
                <select data-aicfg="corsPolicy">
                    <option value="auto" ${a.corsPolicy === 'auto' ? 'selected' : ''}>${t('自动（失败后走代理重试）')}</option>
                    <option value="on" ${a.corsPolicy === 'on' ? 'selected' : ''}>${t('总是使用代理')}</option>
                    <option value="off" ${a.corsPolicy === 'off' ? 'selected' : ''}>${t('从不使用代理')}</option>
                </select>`,
                t('已知被 CORS 拦截的服务商（NVIDIA、腾讯混元）在自动模式下会直接走代理'))}
            ${row(t('代理地址模板'), `<input type="text" data-aicfg="proxyTemplate" value="${esc(a.proxyTemplate)}">`,
                t('支持占位符 {url} 与 {encodedUrl}；走代理时自动改用非流式请求'))}
        `)}
        ${section(t('系统提示词'), `
            <div class="form-group">
                <textarea data-aicfg="systemPrompt" rows="3">${esc(a.systemPrompt)}</textarea>
            </div>
            <div class="btn-row">
                <button class="btn btn-sm" data-action="ai-prompt" data-tpl="concise">${t('简洁模式')}</button>
                <button class="btn btn-sm" data-action="ai-prompt" data-tpl="detailed">${t('详细模式')}</button>
                <button class="btn btn-sm" data-action="ai-prompt" data-tpl="creative">${t('创意模式')}</button>
            </div>
        `)}
        ${section(t('诊断信息'), `<div id="ai-diag-list" class="diag-box">${renderDiag()}</div>`)}
    `;
}

function renderDiag() {
    const list = store.get('aiDiag') || [];
    if (list.length === 0) return `<div class="diag-empty">${t('暂无诊断信息')}</div>`;
    return list.map((d) => `<div class="diag-line diag-${d.level}">[${d.time}] ${esc(d.message)}</div>`).join('');
}

function renderFunctionsPanel() {
    const c = cfg();
    return `
        ${section(t('功能区设置'), `
            ${row(t('界面语言'), `
                <select data-cfg="language">
                    <option value="zh" ${c.language === 'zh' ? 'selected' : ''}>中文</option>
                    <option value="en" ${c.language === 'en' ? 'selected' : ''}>English</option>
                </select>`)}
            ${row(t('工具卡片'), toggle('cfg-tools', 'toolsEnabled', c.toolsEnabled), t('按查询关键词触发：时间、日期、计算器、进制、单位、汇率、IP、随机数'))}
        `)}
    `;
}

function renderDataPanel() {
    const c = cfg();
    return `
        ${section(t('历史与收藏'), `
            ${row(t('历史保存数量'), `<input type="number" min="1" max="1000" step="1" data-cfg="historyLimit" value="${c.historyLimit}">`,
                tf('最多保留最近 {n} 条搜索记录，超出自动删除最旧的；调小后立即裁剪', { n: c.historyLimit }))}
            ${row(t('收藏保存数量'), `<input type="number" min="1" max="5000" step="1" data-cfg="favoritesLimit" value="${c.favoritesLimit}">`,
                t('超出后自动移除最早收藏的条目；调小后立即裁剪（不可恢复）'))}
            <div class="data-row">
                <button class="btn" data-action="export-history">${t('导出历史')}</button>
                <button class="btn" data-action="import-history">${t('导入历史')}</button>
                <span class="data-hint">${t('历史 JSON：数组或 {history:[...]}；导入按查询词合并去重（时间取最新），不超过保存数量')}</span>
            </div>
            <div class="data-row">
                <button class="btn" data-action="export-favorites">${t('导出收藏')}</button>
                <button class="btn" data-action="import-favorites">${t('导入收藏')}</button>
                <span class="data-hint">${t('收藏 JSON：数组或 {favorites:[...]}；导入按 id 与网址去重后追加，保留原收藏时间')}</span>
            </div>
            <input type="file" id="history-import-file" accept=".json,application/json" class="hidden">
            <input type="file" id="favorites-import-file" accept=".json,application/json" class="hidden">
        `)}
        ${section(t('导出配置'), `
            <div class="data-row">
                <button class="btn btn-primary" data-action="export-all">${t('导出全部数据')}</button>
                <span class="data-hint">${t('导出所有设置和数据到 JSON 文件（不包含 API Key）')}</span>
            </div>
            <div class="data-row">
                <button class="btn" data-action="dict-export">${t('仅导出字典')}</button>
                <span class="data-hint">${t('只导出字典条目 JSON（name、url 必填，description、tags、specialTag、icon 可选）')}</span>
            </div>
        `)}
        ${section(t('导入配置'), `
            <div class="data-row">
                <button class="btn btn-primary" data-action="import-all">${t('导入全部数据')}</button>
                <span class="data-hint">${t('从 JSON 备份文件导入设置和数据（全量覆盖现有字典、设置、历史与收藏）')}</span>
            </div>
            <div class="data-row">
                <button class="btn" data-action="dict-import">${t('仅导入字典')}</button>
                <span class="data-hint">${t('追加导入；网址重复时按「同网址导入策略」处理（字典管理面板可改，默认智能合并：名称保留先导入的，补全缺失字段）')}</span>
            </div>
            <input type="file" id="import-all-file" accept=".json,application/json" class="hidden">
        `)}
        ${section(t('清除数据'), `
            <div class="data-row">
                <button class="btn btn-danger" data-action="clear-dict">${t('仅清除字典')}</button>
                <span class="data-hint">${t('删除全部字典条目，保留设置与历史')}</span>
            </div>
            <div class="data-row">
                <button class="btn btn-danger" data-action="clear-all-data">${t('清除全部数据')}</button>
                <span class="data-hint">${t('清除所有本地存储的数据（设置、字典、历史、收藏）')}</span>
            </div>
        `)}
    `;
}

// ---------------- 帮助中心 ----------------

/**
 * 帮助面板：全部使用说明集中在此（用户要求「在设置里直接加帮助页面」）。
 * 目录按钮 data-action=help-jump 平滑滚动到对应小节。
 */
function renderHelpPanel() {
    const toc = [
        ['help-start', '快速上手'],
        ['help-dict', '字典管理'],
        ['help-search', '搜索与引擎'],
        ['help-suggest', '搜索建议'],
        ['help-histfav', '历史与收藏'],
        ['help-data', '数据管理'],
        ['help-ai', 'AI 回答'],
        ['help-theme', '外观个性化'],
        ['help-faq', '常见问题'],
    ];
    const helpSection = (id, title, body) =>
        `<div class="settings-section help-section" id="${id}"><div class="settings-section-title">${title}</div><div class="help-body">${body}</div></div>`;
    return `
        <div class="help-toc">
            <span class="help-toc-label">${t('目录')}</span>
            ${toc.map(([id, label]) => `<button class="btn btn-sm" data-action="help-jump" data-target="${id}">${t(label)}</button>`).join('')}
        </div>
        ${helpSection('help-start', t('快速上手'), `
            <ol>
                <li>${t('在「字典管理」中「载入示例」或「添加条目」，把常用官方网站加入字典')}</li>
                <li>${t('回到首页输入关键词（中文 / 全拼 weixin / 简拼 wxzf 均可命中），下拉会显示历史与字典建议')}</li>
                <li>${t('回车在本机搜索，点击结果直达官网；结果右侧星标可收藏')}</li>
                <li>${t('输入框下方的引擎快捷条可切换到必应 / 百度 / 谷歌 / GitHub / 自定义，回车直接跳转')}</li>
                <li>${t('快捷键：Ctrl / Cmd + K 聚焦搜索框，Esc 关闭弹层与下拉')}</li>
            </ol>
        `)}
        ${helpSection('help-dict', t('字典管理'), `
            ${dictHelpHtml()}
            <p><strong>${t('添加与编辑')}</strong></p>
            <ul>
                <li>${t('表单字段与 JSON 字段一一对应；标签输入后按回车生成标签块，点 ✕ 删除')}</li>
                <li>${t('新增时可点「保存并继续」：保存后表单自动清空，适合连续录入')}</li>
                <li>${t('在设置中进行的添加 / 编辑 / 删除，确认后都会自动回到原界面，不会丢失当前设置页')}</li>
                <li>${t('「同网址导入策略」下拉与导入 / 导出按钮在同一行（字典列表上方）；导出内容就是上表格式的纯数组（不含拼音等内部字段）')}</li>
            </ul>
        `)}
        ${helpSection('help-search', t('搜索与引擎'), `
            <ul>
                <li>${t('默认引擎为「自定义字典」时在本机搜索；选择外部引擎后回车将直接跳转到该引擎（新标签页）')}</li>
                <li>${t('自定义引擎：填写地址模板，{query} 会被替换为搜索词；不含占位符时自动追加 ?q=；缺协议自动补 https://')}</li>
                <li>${t('高级搜索语法：site:example.com 限定域名；filetype:pdf 限定类型。本地与外部引擎均生效')}</li>
                <li>${t('「多数据源搜索」开启后，字典搜索结果底部附带外部引擎快捷跳转')}</li>
                <li>${t('搜索缓存：同一查询 5 分钟内复用结果；修改字典后缓存自动失效')}</li>
            </ul>
        `)}
        ${helpSection('help-suggest', t('搜索建议'), `
            <ul>
                <li>${t('建议来源与搜索引擎相互独立：选「字典」时建议始终来自本机字典，不随搜索引擎变化')}</li>
                <li>${t('选百度 / 必应 / 谷歌：内置官方建议接口，JSONP 直连免代理，国内网络与开代理均可使用')}</li>
                <li>${t('选「自定义」：填写建议接口地址（{query} 占位符），响应支持 OpenSearch 数组 / suggestions 字段 / 纯字符串数组')}</li>
                <li>${t('远程建议叠加在字典建议之上并自动去重；接口失败时静默回退为字典建议，不影响使用')}</li>
                <li>${t('「建议接口代理」仅自定义接口被浏览器跨域（CORS）拦截时需要：填代理模板（{url} 占位符）重试')}</li>
                <li>${t('建议数量 1–10 条；关闭「启用推荐」后输入框不再弹下拉')}</li>
            </ul>
        `)}
        ${helpSection('help-histfav', t('历史与收藏'), `
            <p><strong>${t('保存数量')}</strong></p>
            <ul>
                <li>${t('历史默认保存 100 条（可设 1–1000），收藏默认 500 条（可设 1–5000），在「数据管理」页修改')}</li>
                <li>${t('超出数量后自动删除最旧的记录；把数量调小会立即裁剪且不可恢复')}</li>
            </ul>
            <p><strong>${t('导入 / 导出格式')}</strong></p>
            <pre><code>${t('历史')}：[ { "query": "火车票", "time": "2026-01-01T08:00:00.000Z" } ]
${t('收藏')}：[ { "id": "...", "name": "中国铁路12306", "url": "https://www.12306.cn",
         "icon": null, "specialTag": "官方", "addedAt": "..." } ]</code></pre>
            <ul>
                <li>${t('文件可为纯数组，也可为 {history:[...]} / {favorites:[...]} 包裹对象；「导出全部数据」的备份文件可直接用于导入')}</li>
                <li>${t('历史导入：按查询词合并去重，同一查询保留最新时间，不超过保存数量')}</li>
                <li>${t('收藏导入：按 id 与规范化网址去重后追加，保留原收藏时间；字段缺 id 会自动补齐')}</li>
                <li>${t('历史保存在浏览器 localStorage，收藏保存在 IndexedDB，均仅存本机')}</li>
            </ul>
        `)}
        ${helpSection('help-data', t('数据管理'), `
            <ul>
                <li>${t('「导出全部数据」= 设置 + 字典 + 历史 + 收藏 打包为一个 JSON 备份（不含 AI API Key）')}</li>
                <li>${t('「导入全部数据」为全量覆盖：字典、设置、历史、收藏都会被备份文件替换，操作前有确认提示')}</li>
                <li>${t('「仅导入字典」为追加模式（网址重复按导入策略处理）；「仅导出字典」只含条目数组')}</li>
                <li>${t('「仅清除字典」删除全部条目但保留设置与历史；「清除全部数据」恢复到初始状态')}</li>
                <li>${t('全部数据保存在本机（IndexedDB + localStorage），无任何上传与同步')}</li>
            </ul>
        `)}
        ${helpSection('help-ai', t('AI 回答'), `
            <ul>
                <li>${t('先在「AI 设置」开启「在结果页显示 AI 回答」，再选择服务商并填写 API Key 与模型')}</li>
                <li>${t('Base URL 留空使用服务商默认域名；服务路径留空使用默认；下方实时显示最终请求地址')}</li>
                <li>${t('「测试连接」验证配置，「获取模型」拉取可用模型列表（也可手动输入模型名）')}</li>
                <li>${t('CORS 代理策略：自动 = 直连失败自动改走代理；被 CORS 拦截的服务商在自动模式下会直接走代理')}</li>
                <li>${t('代理地址模板支持 {url} 与 {encodedUrl} 占位符；走代理时自动改用非流式请求')}</li>
                <li>${t('「诊断信息」记录每次请求的关键步骤与错误原因，排查连通性问题时先看这里')}</li>
            </ul>
        `)}
        ${helpSection('help-theme', t('外观个性化'), `
            <ul>
                <li>${t('主题模式：跟随系统 / 亮色 / 暗色；主题颜色改强调色，可一键恢复默认')}</li>
                <li>${t('背景图片自动压缩存储，透明度滑杆调节背景与内容的融合程度')}</li>
                <li>${t('Logo 支持文字与图片两种；界面语言（中文 / English）切换即时生效')}</li>
            </ul>
        `)}
        ${helpSection('help-faq', t('常见问题'), `
            <ul>
                <li><strong>${t('打开白屏，控制台报 does not provide an export named ...')}</strong>：${t('浏览器缓存了旧版模块。按 Ctrl+F5 强制刷新，或用无痕窗口打开；升级版本时建议删除旧目录后完整重新解压')}</li>
                <li><strong>${t('双击 index.html 打不开或一直构建索引')}</strong>：${t('file:// 协议下浏览器会拦截 ES 模块。请用本地 HTTP 服务，例如在目录内执行 python3 -m http.server 8080 后访问 http://localhost:8080')}</li>
                <li><strong>${t('搜索建议不出现')}</strong>：${t('检查「搜索设置 → 启用推荐」是否开启；字典为空时只有历史与远程建议；远程源失败会自动回退字典建议')}</li>
                <li><strong>${t('必应 / 谷歌建议可用吗')}</strong>：${t('可用。两者均走内置 JSONP 接口直连，无需代理，与系统代理无关')}</li>
                <li><strong>${t('换电脑 / 浏览器如何迁移数据')}</strong>：${t('旧环境「数据管理 → 导出全部数据」，新环境「导入全部数据」；API Key 出于安全不随备份导出，需重新填写')}</li>
                <li><strong>${t('删除的条目 / 收藏能恢复吗')}</strong>：${t('不能。删除立即生效且不可恢复；重要数据请先导出备份')}</li>
            </ul>
        `)}
    `;
}

function renderAboutPanel() {
    return `
        ${section('MiniSearch', `
            <div class="about-line"><strong>${t('版本')}</strong>v${APP_VERSION}</div>
            <div class="about-line"><strong>${t('定位')}</strong>${t('个人可信网站目录搜索引擎：字典条目手动维护，搜索后一键直达官网，替代广告与仿冒站。')}</div>
            <div class="about-line"><strong>${t('数据')}</strong>${t('全部保存在本机（IndexedDB + localStorage），无任何上传。')}</div>
        `)}
        ${section(t('快捷键'), `
            <div class="about-line"><code>Ctrl / Cmd + K</code>${t('聚焦搜索框')}</div>
            <div class="about-line"><code>Enter</code>${t('搜索')}　<code>↑ ↓</code>${t('搜索推荐')}　<code>Esc</code>${t('关闭')}</div>
        `)}
        ${section(t('搜索技巧'), `
            <div class="about-line">${t('直接输入中文、全拼（<code>weixin</code>）、简拼（<code>wxzf</code>）均可命中')}</div>
            <div class="about-line"><code>site:gov.cn</code>${t('搜索')}　<code>filetype:pdf</code></div>
        `)}
    `;
}

// ---------------- 字典列表 / 诊断 实时刷新 ----------------

export function initSettingsView() {
    store.subscribe('entries', () => {
        if (currentPanel === 'dictionary' && document.getElementById('dict-list')) {
            document.getElementById('settings-panel').innerHTML = renderDictPanel();
        }
    });
    store.subscribe('aiDiag', () => {
        const el = document.getElementById('ai-diag-list');
        if (el) el.innerHTML = renderDiag();
    });
}

// ---------------- 字典筛选输入 ----------------

export function onDictFilterInput(value) {
    const list = document.getElementById('dict-list');
    if (!list) return;
    const entries = store.get('entries');
    const q = value.toLowerCase();
    const filtered = q
        ? entries.filter((e) => (e.name + ' ' + e.url + ' ' + (e.tags || []).join(' ')).toLowerCase().includes(q))
        : entries;
    list.innerHTML = filtered.length === 0
        ? `<div class="dialog-empty">${t('无匹配条目')}</div>`
        : filtered.map((e) => `
            <div class="dict-item">
                <div class="dict-item-info">
                    <div class="dict-item-name">${esc(e.name)}${e.specialTag ? `<span class="tag ${e.specialTag === '官方' ? 'tag-official' : 'tag-gov'}">${esc(e.specialTag)}</span>` : ''}</div>
                    <div class="dict-item-url">${esc(e.url)}</div>
                </div>
                <div class="dict-item-actions">
                    <button class="btn btn-sm" data-action="dict-edit" data-id="${esc(e.id)}">${t('编辑')}</button>
                    <button class="btn btn-sm" data-action="dict-del" data-id="${esc(e.id)}">${t('删除')}</button>
                </div>
            </div>`).join('');
}

// ---------------- 导入 / 导出 / 清除 ----------------

function stripKey(aiConfig) {
    const { apiKey, ...rest } = aiConfig || {};
    return rest;
}

export async function exportAllData() {
    const payload = {
        app: 'minisearch',
        version: 2,
        exportedAt: new Date().toISOString(),
        config: store.get('config'),
        aiConfig: stripKey(store.get('aiConfig')),
        history: store.get('history'),
        entries: store.get('entries').map(({ searchText, pinyin, pinyinCompact, pinyinInitials, ...rest }) => rest),
        favorites: store.get('favorites'),
    };
    download(`minisearch-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
    toast(t('导出成功'), 'success');
}

export async function exportDictionary() {
    const entries = store.get('entries').map(({ searchText, pinyin, pinyinCompact, pinyinInitials, aliasesText, ...rest }) => rest);
    if (entries.length === 0) return toast(t('字典为空，无可导出条目'), 'info');
    download(`minisearch-dictionary-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(entries, null, 2));
    toast(t('导出成功'), 'success');
}

function pickJsonFile(inputId) {
    return new Promise((resolve) => {
        const input = document.getElementById(inputId)
            || document.getElementById('import-all-file')
            || document.getElementById('dict-import-file');
        if (!input) return resolve(null);
        input.value = '';
        input.onchange = () => resolve(input.files?.[0] || null);
        input.click();
    });
}

function readJson(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.onload = () => {
            try { resolve(JSON.parse(reader.result)); }
            catch { reject(new Error('JSON 格式不正确')); }
        };
        reader.readAsText(file);
    });
}

export async function importAllData() {
    try {
        const file = await pickJsonFile('import-all-file');
        if (!file) return;
        const data = await readJson(file);
        if (!data || typeof data !== 'object') throw new Error(t('文件内容不是有效的备份数据'));
        const entriesIn = Array.isArray(data.entries) ? data.entries : [];
        await entriesRepo.replaceAll(entriesIn);
        if (Array.isArray(data.favorites)) await favoritesRepo.replaceAll(data.favorites);
        if (data.config && typeof data.config === 'object') updateConfig(sanitizeConfig(data.config));
        if (data.aiConfig && typeof data.aiConfig === 'object') {
            updateAiConfig(sanitizeAiConfig({ ...data.aiConfig, apiKey: store.get('aiConfig').apiKey || '' }));
        }
        if (Array.isArray(data.history)) {
            const limit = Math.max(1, Math.floor(Number(store.get('config')?.historyLimit) || 100));
            store.set('history', data.history.slice(0, limit));
        }
        store.set('favorites', await favoritesRepo.list());
        await loadLibrary();
        closeDialog();
        toast(tf('导入成功：共 {n} 条', { n: entriesIn.length }), 'success');
    } catch (err) {
        toast(`${t('导入失败')}：${err.message}`, 'error');
    }
}

export async function importDictionaryData() {
    try {
        const file = await pickJsonFile('dict-import-file');
        if (!file) return;
        const data = await readJson(file);
        const list = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : null;
        if (!list) throw new Error(t('未找到条目数组（应为 JSON 数组或 {entries:[...]}）'));
        // v2.8：同网址冲突处理策略由用户在字典管理面板选择（config.importConflict）
        const strategy = store.get('config')?.importConflict || 'merge';
        const byUrl = new Map(store.get('entries').map((e) => [e.url, e]));
        let added = 0, dup = 0, invalid = 0, merged = 0;
        for (const raw of list) {
            try {
                // 与 normalizeEntry 同规则预判：名称非空 + url 可规范化，再按规范化 url 去重
                const hit = precheckEntry(raw);
                if (!hit) { invalid++; continue; }
                const prev = byUrl.get(hit.url);
                if (prev) {
                    // 网址相同 → 按策略处理：merge 智能合并 / alias 合并为别名 /
                    // overwrite 新数据覆盖 / duplicate 保留多条 / skip 完全跳过。
                    // 子域名/路径不同（api.example.com、example.com/chat）是不同网址，正常新增
                    if (strategy === 'skip') { dup++; continue; }
                    if (strategy === 'duplicate') {
                        const record = await entriesRepo.add(raw);
                        indexer.addEntry(record);
                        added++; // 保留多条：重复网址按新条目落库
                        continue;
                    }
                    const patch = planSameUrlMerge(prev, raw, strategy);
                    if (patch) {
                        const record = await entriesRepo.update(prev.id, patch);
                        indexer.updateEntry(record); // update 内部重算拼音搜索字段，索引同步
                        byUrl.set(record.url, record);
                        merged++;
                    } else dup++;
                    continue;
                }
                const record = await entriesRepo.add(raw);
                indexer.addEntry(record);
                byUrl.set(record.url, record);
                added++;
            } catch { invalid++; /* 跳过非法条目 */ }
        }
        store.set('entries', await entriesRepo.list());
        await rebuildLibrary();
        toast(`${t('导入成功')}：${tf('新增 {a} 条，合并补全 {m} 条，网址重复 {b} 条，无效 {c} 条', { a: added, m: merged, b: dup, c: invalid })}`, 'success');
    } catch (err) {
        toast(`${t('导入失败')}：${err.message}`, 'error');
    }
}

export async function clearDictionary() {
    const ok = await confirmDialog(t('此操作不可恢复，确定继续吗（将删除全部字典条目）'), { danger: true, okText: t('清除'), restore: reopenSettings });
    if (!ok) return;
    await entriesRepo.clear();
    store.set('entries', []);
    await rebuildLibrary();
    toast(t('字典已清空'), 'success');
}

export async function clearAllData() {
    const ok = await confirmDialog(t('此操作不可恢复，确定继续吗（设置、字典、历史、收藏将全部删除）'), { danger: true, okText: t('全部清除'), restore: reopenSettings });
    if (!ok) return;
    await entriesRepo.clear();
    await favoritesRepo.clear();
    try {
        localStorage.removeItem('ms.config.v2');
        localStorage.removeItem('ms.ai.v2');
        localStorage.removeItem('ms.history.v2');
    } catch { /* ignore */ }
    store.set('entries', []);
    store.set('favorites', []);
    store.set('history', []);
    store.set('config', { ...DEFAULT_CONFIG });
    store.set('aiConfig', { ...DEFAULT_AI_CONFIG });
    await rebuildLibrary();
    closeDialog();
    toast(t('已恢复到初始状态'), 'success');
}

// ---------------- 历史 / 收藏：数量上限与导入导出 ----------------

/** 历史保存数量生效：把内存中的历史裁剪到 config.historyLimit（持久化随订阅自动写回） */
export function enforceHistoryLimit() {
    const limit = Math.max(1, Math.floor(Number(store.get('config')?.historyLimit) || 100));
    const list = store.get('history');
    if (Array.isArray(list) && list.length > limit) {
        store.set('history', list.slice(0, limit));
        toast(tf('已按新上限保留最近 {n} 条历史', { n: limit }), 'info');
    }
}

/** 收藏保存数量生效：超出部分从 IndexedDB 与内存中同时移除（不可恢复，调用方需在 change 确认后触发） */
export async function enforceFavoritesLimit() {
    const limit = Math.max(1, Math.floor(Number(store.get('config')?.favoritesLimit) || 500));
    const list = store.get('favorites');
    if (!Array.isArray(list) || list.length <= limit) return;
    const overflow = list.slice(limit);
    for (const f of overflow) {
        try { await favoritesRepo.remove(f.id); } catch { /* ignore */ }
    }
    store.set('favorites', list.slice(0, limit));
    toast(tf('已按新上限移除 {n} 条较早收藏', { n: overflow.length }), 'info');
}

export function exportHistory() {
    const history = store.get('history');
    if (!Array.isArray(history) || history.length === 0) return toast(t('历史为空，无可导出记录'), 'info');
    const payload = {
        app: 'minisearch',
        type: 'history',
        version: 2,
        exportedAt: new Date().toISOString(),
        history,
    };
    download(`minisearch-history-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
    toast(t('导出成功'), 'success');
}

export async function exportFavorites() {
    const favorites = await favoritesRepo.list();
    if (favorites.length === 0) return toast(t('收藏为空，无可导出条目'), 'info');
    const payload = {
        app: 'minisearch',
        type: 'favorites',
        version: 2,
        exportedAt: new Date().toISOString(),
        favorites,
    };
    download(`minisearch-favorites-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
    toast(t('导出成功'), 'success');
}

/**
 * 导入搜索历史：接受数组或 {history:[...]}（也兼容「导出全部数据」的完整备份）。
 * 合并语义：按查询词去重，同一查询保留最新时间；导入后按时间排序并裁剪到保存数量。
 */
export async function importHistoryData(file) {
    try {
        const f = file || await pickJsonFile('history-import-file');
        if (!f) return;
        const data = await readJson(f);
        const list = Array.isArray(data) ? data : Array.isArray(data?.history) ? data.history : null;
        if (!list) throw new Error(t('未找到历史数组（应为 JSON 数组或 {history:[...]}）'));
        const existing = new Map(store.get('history').map((h) => [h.query, h.time]));
        let added = 0, updated = 0, invalid = 0;
        for (const raw of list.slice(0, 5000)) {
            const q = String(raw?.query ?? '').trim();
            if (!q) { invalid++; continue; }
            const time = new Date(raw?.time ?? 0);
            const tNew = Number.isNaN(time.getTime()) ? new Date(0).toISOString() : time.toISOString();
            if (!existing.has(q)) {
                existing.set(q, tNew);
                added++;
            } else if (tNew > (existing.get(q) || '')) {
                existing.set(q, tNew);
                updated++;
            }
        }
        const merged = [...existing.entries()]
            .map(([query, time]) => ({ query, time }))
            .sort((a, b) => (a.time < b.time ? 1 : -1));
        const limit = Math.max(1, Math.floor(Number(store.get('config')?.historyLimit) || 100));
        store.set('history', merged.slice(0, limit));
        toast(`${t('导入成功')}：${tf('新增 {a} 条，合并更新 {b} 条，无效 {c} 条', { a: added, b: updated, c: invalid })}`, 'success');
    } catch (err) {
        toast(`${t('导入失败')}：${err.message}`, 'error');
    }
}

/**
 * 导入收藏：接受数组或 {favorites:[...]}（也兼容「导出全部数据」的完整备份）。
 * 合并语义：按 id 与规范化网址去重后追加（不改变现有收藏顺序），保留原收藏时间；导入后裁剪到保存数量。
 */
export async function importFavoritesData(file) {
    try {
        const f = file || await pickJsonFile('favorites-import-file');
        if (!f) return;
        const data = await readJson(f);
        const list = Array.isArray(data) ? data : Array.isArray(data?.favorites) ? data.favorites : null;
        if (!list) throw new Error(t('未找到收藏数组（应为 JSON 数组或 {favorites:[...]}）'));
        const current = store.get('favorites');
        const ids = new Set(current.map((x) => x.id));
        const urls = new Set(current.map((x) => normalizeUrl(x.url)).filter(Boolean));
        const merged = [...current];
        let added = 0, dup = 0, invalid = 0;
        for (const raw of list.slice(0, 5000)) {
            try {
                const url = normalizeUrl(String(raw?.url ?? '').trim());
                const name = String(raw?.name ?? '').trim();
                if (!name || !url) { invalid++; continue; }
                const id = String(raw?.id ?? '').trim() || uuid();
                if (ids.has(id) || urls.has(url)) { dup++; continue; }
                const record = await favoritesRepo.put({ ...raw, id, name, url });
                ids.add(record.id);
                urls.add(record.url);
                merged.push(record);
                added++;
            } catch { invalid++; /* 跳过非法条目 */ }
        }
        // 裁剪到收藏保存数量（从列表尾部移除最早/后追加的）
        const limit = Math.max(1, Math.floor(Number(store.get('config')?.favoritesLimit) || 500));
        let overflow = [];
        if (merged.length > limit) {
            overflow = merged.slice(limit);
            for (const fo of overflow) {
                try { await favoritesRepo.remove(fo.id); } catch { /* ignore */ }
            }
        }
        store.set('favorites', merged.slice(0, limit));
        const kept = added - overflow.length;
        toast(`${t('导入成功')}：${tf('新增 {a} 条，重复跳过 {b} 条，无效 {c} 条', { a: Math.max(0, kept), b: dup, c: invalid })}${overflow.length ? tf('，超出保存数量移除 {n} 条', { n: overflow.length }) : ''}`, 'success');
    } catch (err) {
        toast(`${t('导入失败')}：${err.message}`, 'error');
    }
}

// ---------------- AI 面板动作 ----------------

export async function onAiToggleKey() {
    const input = document.getElementById('ai-key');
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    document.querySelector('[data-action="ai-toggle-key"]').textContent = show ? t('隐藏') : t('显示');
}

export async function onAiTest() {
    const resultEl = document.getElementById('ai-test-result');
    if (!resultEl) return;
    resultEl.textContent = t('测试中...');
    resultEl.className = 'test-result pending';
    const res = await testConnection();
    resultEl.textContent = res.message;
    resultEl.className = `test-result ${res.ok ? 'ok' : 'fail'}`;
    if (!res.ok) diag(`${t('测试连接失败')}：${res.message}`, 'error');
}

export async function onAiFetchModels() {
    const btn = document.querySelector('[data-action="ai-fetch-models"]');
    if (btn) btn.disabled = true;
    try {
        const models = await fetchModelList();
        if (models.length === 0) return toast('服务商未返回模型列表，可手动输入模型名', 'info');
        const datalist = document.getElementById('ai-model-list');
        if (datalist) datalist.innerHTML = models.map((m) => `<option value="${esc(m)}">`).join('');
        // 保存到 provider 记忆（写入 aiConfig 无处存放，直接提示即可）
        toast(`获取到 ${models.length} 个模型，点击模型输入框查看`, 'success');
    } catch (err) {
        toast(`获取模型失败：${err.message}`, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

export function onAiPromptTemplate(tpl) {
    updateAiConfig({ systemPrompt: PROMPT_TEMPLATES[tpl] || '' });
    switchSettingsTab(currentPanel);
    toast('已应用模板', 'success');
}

// ---------------- 文件选择（背景图 / Logo） ----------------

export async function onImageFile(kind, file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        toast(t('请选择图片文件'), 'error');
        switchSettingsTab(currentPanel); // 恢复状态文字
        return;
    }
    try {
        const dataUrl = kind === 'bg'
            ? await fileToDataURL(file, { maxW: 2560, maxH: 1440, quality: 0.82 })
            : await fileToDataURL(file, { maxW: 600, maxH: 200, quality: 0.9 });
        if (dataUrl.length > 2_500_000) {
            toast(t('图片过大（>2MB），请压缩后再试'), 'error');
            switchSettingsTab(currentPanel);
            return;
        }
        updateConfig(kind === 'bg' ? { backgroundImage: dataUrl } : { logoImage: dataUrl });
        switchSettingsTab(currentPanel);
        toast(kind === 'bg' ? t('已更新背景图片') : t('已更新Logo 图片'), 'success');
    } catch (err) {
        switchSettingsTab(currentPanel);
        toast(`${t('图片处理失败')}：${err.message}`, 'error');
    }
}

export function onClearBg() {
    updateConfig({ backgroundImage: null });
    switchSettingsTab(currentPanel);
}
export function onClearLogo() {
    updateConfig({ logoImage: null });
    switchSettingsTab(currentPanel);
}
export function onResetThemeColor() {
    updateConfig({ themeColor: '#1a73e8' });
    switchSettingsTab(currentPanel);
}

export { loadSampleEntries, deleteEntry, showEntryFormDialog, SAMPLE_ENTRIES };
