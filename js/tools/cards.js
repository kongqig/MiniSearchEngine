/**
 * 工具卡片：仅当查询命中关键词时显示（不再每次展示）。
 * 卡片：时间（秒级跳动）/ 日期 / 计算器（自研解析器，不用 eval）/ 进制转换 /
 *       单位转换 / 汇率（会话内缓存）/ IP 查询 / 随机数。
 * 交互元素一律 data-action 委托；定时器在重新渲染时统一清理。
 */

import { esc } from '../utils.js';
import { t, onLanguageChange, currentLocale } from '../i18n.js';
import { store } from '../store.js';

// ---------------- 关键词触发 ----------------

const KEYWORDS = {
    time: ['几点', '时间', '现在时间', '当前时间', 'time', 'what time'],
    date: ['今天', '日期', '几号', '星期', 'date', 'today', '今天是'],
    calculator: ['计算', '计算器', '等于多少', 'calculator', 'calc'],
    baseConvert: ['进制', '二进制', '八进制', '十六进制', 'binary', 'hexadecimal', 'hex'],
    unitConvert: ['单位', '长度换算', '重量换算', '温度换算', '单位转换', 'unit'],
    currency: ['汇率', '汇率换算', '美元', '人民币', '货币', 'exchange rate', 'currency'],
    ip: ['我的ip', 'ip地址', 'ip查询', '本机ip', 'ip address', 'my ip'],
    random: ['随机数', '随机', 'random', '抽签', '骰子'],
};

/** 检测查询命中的工具类型（顺序即展示顺序） */
export function detectTools(query) {
    const q = String(query ?? '').trim();
    const lower = q.toLowerCase();
    const detected = [];
    const isPhrase = q.length <= 24; // 过长短语误触
    for (const [tool, words] of Object.entries(KEYWORDS)) {
        if (words.some((w) => lower === w || (isPhrase && lower.includes(w)))) detected.push(tool);
    }
    // 纯算式 → 计算器（如 12*(3+4)/2）
    if (/^[\d\s+\-*/^().%]+$/.test(q) && /\d/.test(q) && /[+\-*/^%]/.test(q)) {
        if (!detected.includes('calculator')) detected.unshift('calculator');
    }
    return detected.slice(0, 3); // 最多同时展示 3 张
}

// ---------------- 定时器清理 ----------------

let intervals = [];
function addInterval(fn, ms) {
    const id = setInterval(fn, ms);
    intervals.push(id);
    return id;
}
export function cleanupTools() {
    intervals.forEach(clearInterval);
    intervals = [];
}

// ---------------- 安全表达式求值（递归下降，无 eval） ----------------

export function evaluateExpression(input) {
    const src = String(input ?? '').replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/');
    let pos = 0;
    const peek = () => src[pos];
    const eat = (ch) => (src[pos] === ch ? (pos++, true) : false);

    function parseExpr() { // + -
        let v = parseTerm();
        while (peek() === '+' || peek() === '-') {
            const op = src[pos++];
            const r = parseTerm();
            v = op === '+' ? v + r : v - r;
        }
        return v;
    }
    function parseTerm() { // * / %
        let v = parseFactor();
        while (peek() === '*' || peek() === '/' || peek() === '%') {
            const op = src[pos++];
            const r = parseFactor();
            if (op === '*') v *= r;
            else if (op === '/') {
                if (r === 0) throw new Error('除数为 0');
                v /= r;
            } else v %= r;
        }
        return v;
    }
    function parseFactor() { // ^ 右结合
        const base = parseUnary();
        if (peek() === '^') {
            pos++;
            return Math.pow(base, parseFactor());
        }
        return base;
    }
    function parseUnary() {
        if (eat('-')) return -parseUnary();
        if (eat('+')) return parseUnary();
        return parseAtom();
    }
    function parseAtom() {
        if (eat('(')) {
            const v = parseExpr();
            if (!eat(')')) throw new Error('括号不匹配');
            return v;
        }
        const start = pos;
        while (pos < src.length && /[\d.]/.test(src[pos])) pos++;
        if (start === pos) throw new Error('无法解析的表达式');
        const num = Number(src.slice(start, pos));
        if (!Number.isFinite(num)) throw new Error('非法数字');
        return num;
    }

    const value = parseExpr();
    if (pos !== src.length) throw new Error('存在无法解析的字符');
    if (!Number.isFinite(value)) throw new Error('结果不是有限数');
    return value;
}

function formatNumber(n) {
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential(6);
    return String(Math.round(n * 1e10) / 1e10);
}

// ---------------- 卡片渲染 ----------------

/** 渲染所有命中的工具卡片到容器 */
export function renderToolCards(container, types, query) {
    cleanupTools();
    if (!container) return;
    container.innerHTML = '';
    const cards = types.map((type) => createCard(type, query)).filter(Boolean);
    if (cards.length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    cards.forEach((card) => container.appendChild(card));
}

function createCard(type, query) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    switch (type) {
        case 'time': return buildTimeCard(card);
        case 'date': return buildDateCard(card);
        case 'calculator': return buildCalculatorCard(card, query);
        case 'baseConvert': return buildBaseCard(card, query);
        case 'unitConvert': return buildUnitCard(card, query);
        case 'currency': return buildCurrencyCard(card);
        case 'ip': return buildIpCard(card);
        case 'random': return buildRandomCard(card);
        default: return null;
    }
}

function buildTimeCard(card) {
    card.innerHTML = `
        <div class="tool-title">${t('当前时间')}</div>
        <div class="tool-value tool-clock">--:--:--</div>
        <div class="tool-detail tool-weekday"></div>`;
    const locale = currentLocale();
    const tick = () => {
        const now = new Date();
        const timeEl = card.querySelector('.tool-clock');
        const weekEl = card.querySelector('.tool-weekday');
        if (!timeEl) return;
        timeEl.textContent = now.toLocaleTimeString(locale, { hour12: false });
        weekEl.textContent = now.toLocaleDateString(locale, { weekday: 'long' });
    };
    tick();
    addInterval(tick, 1000);
    return card;
}

function buildDateCard(card) {
    const now = new Date();
    const locale = currentLocale();
    card.innerHTML = `
        <div class="tool-title">${t('当前日期')}</div>
        <div class="tool-value">${now.getDate()}</div>
        <div class="tool-detail">${now.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div>`;
    return card;
}

function buildCalculatorCard(card, query) {
    const initial = /^[\d\s+\-*/^().%]+$/.test(query) ? query.trim() : '';
    card.innerHTML = `
        <div class="tool-title">${t('计算器')}</div>
        <input type="text" class="tool-input" data-tool-input="calc" placeholder="${t('输入表达式')}" value="${esc(initial)}">
        <div class="tool-value" data-tool-out="calc">${initial ? '= ...' : '='}</div>`;
    const input = card.querySelector('[data-tool-input="calc"]');
    const out = card.querySelector('[data-tool-out="calc"]');
    const update = () => {
        if (!input.value.trim()) return (out.textContent = '=');
        try {
            out.textContent = `= ${formatNumber(evaluateExpression(input.value))}`;
        } catch (err) {
            out.textContent = `⚠ ${err.message}`;
        }
    };
    input.addEventListener('input', update);
    if (initial) setTimeout(update, 0);
    return card;
}

function buildBaseCard(card, query) {
    // 查询里直接带数字时自动填充，如 "255 十六进制"
    const numMatch = query.match(/\d+/);
    card.innerHTML = `
        <div class="tool-title">${t('进制转换')}</div>
        <div class="tool-inline">
            <input type="text" class="tool-input" data-tool-input="base" placeholder="${t('输入数字')}" value="${numMatch ? esc(numMatch[0]) : ''}">
            <select class="tool-select" data-tool-select="base">
                <option value="10">${t('十进制')}</option>
                <option value="2">${t('二进制')}</option>
                <option value="8">${t('八进制')}</option>
                <option value="16">${t('十六进制')}</option>
            </select>
        </div>
        <div class="tool-grid">
            <span>${t('二进制')}</span><code data-tool-out="bin">-</code>
            <span>${t('八进制')}</span><code data-tool-out="oct">-</code>
            <span>${t('十进制')}</span><code data-tool-out="dec">-</code>
            <span>${t('十六进制')}</span><code data-tool-out="hex">-</code>
        </div>`;
    const input = card.querySelector('[data-tool-input="base"]');
    const select = card.querySelector('[data-tool-select="base"]');
    const update = () => {
        const from = Number(select.value);
        const n = parseInt(String(input.value).trim(), from);
        const put = (key, v) => { const el = card.querySelector(`[data-tool-out="${key}"]`); if (el) el.textContent = v; };
        if (Number.isNaN(n)) { put('bin', '-'); put('oct', '-'); put('dec', '-'); put('hex', '-'); return; }
        put('bin', n.toString(2));
        put('oct', n.toString(8));
        put('dec', n.toString(10));
        put('hex', n.toString(16).toUpperCase());
    };
    input.addEventListener('input', update);
    select.addEventListener('change', update);
    if (numMatch) setTimeout(update, 0);
    return card;
}

const UNITS = {
    length: {
        label: '长度',
        units: { m: '米', km: '千米', cm: '厘米', mi: '英里', ft: '英尺', in: '英寸' },
        // 到米的换算系数
        factor: { m: 1, km: 1000, cm: 0.01, mi: 1609.344, ft: 0.3048, in: 0.0254 },
    },
    weight: {
        label: '重量',
        units: { kg: '千克', g: '克', t: '吨', lb: '磅', oz: '盎司' },
        factor: { kg: 1, g: 0.001, t: 1000, lb: 0.45359237, oz: 0.028349523 },
    },
    temperature: {
        label: '温度',
        units: { c: '摄氏度', f: '华氏度', k: '开尔文' },
    },
};

function tempFrom(value, unit) {
    if (unit === 'c') return value;
    if (unit === 'f') return (value - 32) * 5 / 9;
    return value - 273.15;
}
function tempTo(celsius, unit) {
    if (unit === 'c') return celsius;
    if (unit === 'f') return celsius * 9 / 5 + 32;
    return celsius + 273.15;
}

function buildUnitCard(card, query) {
    const numMatch = String(query || '').match(/-?\d+(\.\d+)?/);
    card.innerHTML = `
        <div class="tool-title">${t('单位转换')}</div>
        <div class="tool-inline">
            <select class="tool-select" data-tool-select="unit-type">
                <option value="length">${t('长度')}</option>
                <option value="weight">${t('重量')}</option>
                <option value="temperature">${t('温度')}</option>
            </select>
            <input type="number" class="tool-input" data-tool-input="unit-value" placeholder="${t('输入数值')}" value="${numMatch ? esc(numMatch[0]) : ''}">
            <select class="tool-select" data-tool-select="unit-from"></select>
        </div>
        <div class="tool-grid" data-tool-out="unit-result"></div>`;
    const typeSel = card.querySelector('[data-tool-select="unit-type"]');
    const valueInput = card.querySelector('[data-tool-input="unit-value"]');
    const fromSel = card.querySelector('[data-tool-select="unit-from"]');
    const out = card.querySelector('[data-tool-out="unit-result"]');

    const fillFrom = () => {
        const type = typeSel.value;
        fromSel.innerHTML = Object.keys(UNITS[type].units).map((k) => `<option value="${k}">${t(UNITS[type].units[k])}</option>`).join('');
    };
    const update = () => {
        const value = parseFloat(valueInput.value);
        if (Number.isNaN(value)) return (out.innerHTML = '');
        const type = typeSel.value;
        const from = fromSel.value;
        if (type === 'temperature') {
            const c = tempFrom(value, from);
            out.innerHTML = ['c', 'f', 'k']
                .filter((u) => u !== from)
                .map((u) => `<span>${t(UNITS.temperature.units[u])}</span><code>${formatNumber(tempTo(c, u))}</code>`)
                .join('');
        } else {
            const typeCfg = UNITS[type];
            const meters = value * typeCfg.factor[from];
            out.innerHTML = Object.keys(typeCfg.units)
                .filter((u) => u !== from)
                .map((u) => `<span>${t(typeCfg.units[u])}</span><code>${formatNumber(meters / typeCfg.factor[u])}</code>`)
                .join('');
        }
    };
    typeSel.addEventListener('change', () => { fillFrom(); update(); });
    valueInput.addEventListener('input', update);
    fromSel.addEventListener('change', update);
    fillFrom();
    if (numMatch) setTimeout(update, 0);
    return card;
}

const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'KRW', 'RUB'];
const rateCache = new Map(); // base -> { at, rates }

async function getRates(base) {
    const hit = rateCache.get(base);
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.rates;
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(base)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.rates) throw new Error('响应格式异常');
    rateCache.set(base, { at: Date.now(), rates: data.rates });
    return data.rates;
}

function buildCurrencyCard(card) {
    card.innerHTML = `
        <div class="tool-title">${t('汇率转换')}</div>
        <div class="tool-inline">
            <input type="number" class="tool-input" data-tool-input="cur-value" placeholder="${t('金额')}" value="100">
            <select class="tool-select" data-tool-select="cur-from">${CURRENCIES.map((c) => `<option value="${c}" ${c === 'CNY' ? 'selected' : ''}>${c}</option>`).join('')}</select>
            <span class="tool-arrow">→</span>
            <select class="tool-select" data-tool-select="cur-to">${CURRENCIES.map((c) => `<option value="${c}" ${c === 'USD' ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
        <div class="tool-value" data-tool-out="cur-result">-</div>
        <div class="tool-detail" data-tool-out="cur-rate"></div>`;
    const valueInput = card.querySelector('[data-tool-input="cur-value"]');
    const fromSel = card.querySelector('[data-tool-select="cur-from"]');
    const toSel = card.querySelector('[data-tool-select="cur-to"]');
    const out = card.querySelector('[data-tool-out="cur-result"]');
    const rateEl = card.querySelector('[data-tool-out="cur-rate"]');

    const convert = async () => {
        const value = parseFloat(valueInput.value);
        const from = fromSel.value;
        const to = toSel.value;
        if (Number.isNaN(value)) return;
        out.textContent = '...';
        try {
            const rates = await getRates(from);
            const rate = rates[to];
            if (!rate) throw new Error('不支持该币种');
            out.textContent = `${formatNumber(Math.round(value * rate * 100) / 100)} ${to}`;
            rateEl.textContent = `1 ${from} = ${rate} ${to}`;
        } catch (err) {
            out.textContent = t('获取汇率失败');
            rateEl.textContent = err.message || '';
        }
    };
    valueInput.addEventListener('input', convert);
    fromSel.addEventListener('change', convert);
    toSel.addEventListener('change', convert);
    setTimeout(convert, 0);
    return card;
}

function buildIpCard(card) {
    card.innerHTML = `
        <div class="tool-title">${t('IP 查询')}</div>
        <div class="tool-detail" data-tool-out="ip-info">${t('查询中...')}</div>`;
    const out = card.querySelector('[data-tool-out="ip-info"]');
    (async () => {
        try {
            const res = await fetch('https://ipapi.co/json/');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();
            out.innerHTML = `
                <div><strong>IP</strong> ${esc(d.ip || '-')}</div>
                <div><strong>${t('位置')}</strong> ${esc([d.country_name, d.region, d.city].filter(Boolean).join(' · ') || '-')}</div>
                <div><strong>${t('运营商')}</strong> ${esc(d.org || '-')}</div>`;
        } catch {
            try {
                const res = await fetch('https://api.ipify.org?format=json');
                const d = await res.json();
                out.innerHTML = `<div><strong>IP</strong> ${esc(d.ip || '-')}</div><div><strong>${t('位置')}</strong> -</div>`;
            } catch {
                out.textContent = t('查询失败');
            }
        }
    })();
    return card;
}

function buildRandomCard(card) {
    card.innerHTML = `
        <div class="tool-title">${t('随机数生成')}</div>
        <div class="tool-inline">
            <input type="number" class="tool-input" data-tool-input="rand-min" placeholder="${t('最小值')}" value="1">
            <input type="number" class="tool-input" data-tool-input="rand-max" placeholder="${t('最大值')}" value="100">
            <button class="btn btn-sm btn-primary" data-action="tool-random">${t('生成')}</button>
        </div>
        <div class="tool-value" data-tool-out="rand-result">-</div>`;
    return card;
}

/** 生成随机数（random 按钮 data-action 委托调用） */
export function generateRandom() {
    const card = document.querySelector('[data-tool-out="rand-result"]')?.closest('.tool-card');
    if (!card) return;
    const minEl = card.querySelector('[data-tool-input="rand-min"]');
    const maxEl = card.querySelector('[data-tool-input="rand-max"]');
    const out = card.querySelector('[data-tool-out="rand-result"]');
    let min = parseFloat(minEl?.value ?? '0');
    let max = parseFloat(maxEl?.value ?? '100');
    if (Number.isNaN(min)) min = 0;
    if (Number.isNaN(max)) max = 100;
    if (min > max) [min, max] = [max, min];
    const isInt = Number.isInteger(min) && Number.isInteger(max);
    const result = isInt
        ? Math.floor(Math.random() * (max - min + 1)) + min
        : Math.random() * (max - min) + min;
    out.textContent = String(result);
}

// 语言切换 → 重渲染当前工具卡片（标题/单位/按钮文案）
onLanguageChange(() => {
    const s = store.get('search');
    if (s && s.status === 'done') {
        const types = store.get('config').toolsEnabled === false ? [] : store.get('toolCards');
        renderToolCards(document.getElementById('tool-cards'), types, s.raw || '');
    }
});
