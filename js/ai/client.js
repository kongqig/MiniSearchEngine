/**
 * AI 客户端：provider 注册表 / 请求构造 / SSE 流式解析 / CORS 代理策略。
 *
 * CORS 代理策略（corsPolicy: auto | on | off）：
 *  - auto（默认）：provider 标记 cors:'blocked' 的直接走代理；
 *    其余先直连，若发生网络层错误（TypeError，多为 CORS 拦截）自动经代理重试一次。
 *  - on：总是走代理。  off：从不开代理（直连失败即报错）。
 *  - 代理地址为模板 proxyTemplate，占位符 {url}（原样）与 {encodedUrl}（encodeURIComponent）。
 *  注意：多数公共代理不支持 SSE 流式转发，走代理时自动改用非流式请求，一次性拿全文。
 */

import { store } from '../store.js';
import { DEFAULT_AI_CONFIG, PROMPT_TEMPLATES } from '../config.js';
import { t, tf } from '../i18n.js';

/**
 * provider 注册表
 * cors: 'ok' 直连可用 | 'blocked' 已知浏览器直连被 CORS 拦截 | 'unknown' 未验证，按 auto 处理
 * protocol: 'openai' | 'gemini' | 'claude'
 */
export const AI_PROVIDERS = {
    deepseek:    { name: 'DeepSeek（深度求索）', baseUrl: 'https://api.deepseek.com', apiPath: '/chat/completions', modelsPath: '/models', protocol: 'openai', cors: 'ok',       models: ['deepseek-chat', 'deepseek-reasoner'] },
    qwen:        { name: 'Qwen（阿里百炼）',     baseUrl: 'https://dashscope.aliyuncs.com', apiPath: '/compatible-mode/v1/chat/completions', modelsPath: '/compatible-mode/v1/models', protocol: 'openai', cors: 'ok',   models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
    kimi:        { name: 'Kimi（月之暗面）',     baseUrl: 'https://api.moonshot.cn', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'ok',           models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
    zhipu:       { name: 'Zhipu（智谱）',        baseUrl: 'https://open.bigmodel.cn', apiPath: '/api/paas/v4/chat/completions', modelsPath: '/api/paas/v4/models', protocol: 'openai', cors: 'ok',  models: ['glm-4', 'glm-4-flash', 'glm-4-air', 'glm-3-turbo'] },
    siliconflow: { name: '硅基流动',             baseUrl: 'https://api.siliconflow.cn', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'ok',       models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3'] },
    openai:      { name: 'OpenAI',               baseUrl: 'https://api.openai.com', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'ok',           models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    openrouter:  { name: 'OpenRouter',           baseUrl: 'https://openrouter.ai/api', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'ok',     models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5'] },
    groq:        { name: 'Groq',                 baseUrl: 'https://api.groq.com/openai', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'ok',    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
    gemini:      { name: 'Gemini（谷歌）',       baseUrl: 'https://generativelanguage.googleapis.com', apiPath: '', protocol: 'gemini', cors: 'ok',                models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'] },
    claude:      { name: 'Claude（Anthropic）',  baseUrl: 'https://api.anthropic.com', apiPath: '/v1/messages', protocol: 'claude', cors: 'ok',                             models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'] },
    grok:        { name: 'Grok（xAI）',          baseUrl: 'https://api.x.ai', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'unknown',            models: ['grok-beta'] },
    minimax:     { name: 'Minimax',              baseUrl: 'https://api.minimax.chat', apiPath: '/v1/text/chatcompletion_v2', protocol: 'openai', cors: 'unknown',          models: ['abab6.5s-chat', 'abab5.5-chat'] },
    nvidia:      { name: 'NVIDIA（英伟达）',     baseUrl: 'https://integrate.api.nvidia.com', apiPath: '/v1/chat/completions', protocol: 'openai', cors: 'blocked',        models: ['meta/llama-3.1-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'deepseek-ai/deepseek-r1'] },
    tencent:     { name: '腾讯混元',             baseUrl: 'https://api.hunyuan.cloud.tencent.com', apiPath: '/v1/chat/completions', protocol: 'openai', cors: 'blocked',   models: ['hunyuan-lite', 'hunyuan-standard'] },
    ollama:      { name: 'Ollama（本机）',       baseUrl: 'http://localhost:11434', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'ok',         models: ['llama3.1', 'qwen2.5', 'mistral'] },
    llmstudio:   { name: 'LM Studio（本机）',    baseUrl: 'http://localhost:1234', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'ok',        models: [] },
    custom:      { name: '自定义（OpenAI 兼容）', baseUrl: '', apiPath: '/v1/chat/completions', modelsPath: '/v1/models', protocol: 'openai', cors: 'unknown',             models: [] },
};

const REQUEST_TIMEOUT = 120000; // 单次请求上限
let abortController = null;     // 当前请求控制器（停止按钮 / 超时共用）
let diagSeq = 0;

/** 诊断日志：写入 store.aiDiag（设置面板打开时实时显示） */
export function diag(message, level = 'info') {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = { id: ++diagSeq, time, message: String(message).slice(0, 300), level };
    const list = store.get('aiDiag') || [];
    store.set('aiDiag', [entry, ...list].slice(0, 30));
}

/** 解析最终生效的请求参数（provider 默认值 ← 用户覆盖） */
export function resolveEndpoint(aiConfig) {
    const provider = AI_PROVIDERS[aiConfig.provider] || AI_PROVIDERS.custom;
    const baseUrl = (aiConfig.baseUrl || provider.baseUrl || '').replace(/\/+$/, '');
    let apiPath = aiConfig.apiPath || provider.apiPath || '/v1/chat/completions';
    if (apiPath && !apiPath.startsWith('/')) apiPath = '/' + apiPath;
    const model = aiConfig.model || provider.models?.[0] || '';
    return { provider, baseUrl, apiPath, model, protocol: provider.protocol || 'openai' };
}

/** 判断某 provider + 策略下首次请求是否应走代理 */
function proxyFirst(aiConfig, endpoint) {
    if (aiConfig.corsPolicy === 'on') return true;
    if (aiConfig.corsPolicy === 'off') return false;
    return endpoint.provider.cors === 'blocked';
}

/** 应用代理模板 */
function applyProxy(template, url) {
    const tpl = template || DEFAULT_AI_CONFIG.proxyTemplate;
    if (!tpl.includes('{url}') && !tpl.includes('{encodedUrl}')) return tpl + encodeURIComponent(url);
    return tpl.replaceAll('{encodedUrl}', encodeURIComponent(url)).replaceAll('{url}', url);
}

/** 组装请求头 */
function buildHeaders(aiConfig, endpoint, streaming) {
    const headers = { 'Content-Type': 'application/json' };
    const key = aiConfig.apiKey || '';
    switch (endpoint.protocol) {
        case 'gemini':
            if (key) headers['x-goog-api-key'] = key;
            break;
        case 'claude':
            headers['x-api-key'] = key;
            headers['anthropic-version'] = '2023-06-01';
            // 允许浏览器直连（Anthropic 要求显式开启）
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
            break;
        default:
            if (key) headers['Authorization'] = `Bearer ${key}`;
            if (endpoint.provider === AI_PROVIDERS.openrouter) headers['HTTP-Referer'] = location.origin;
    }
    for (const [k, v] of Object.entries(aiConfig.customHeaders || {})) headers[k] = v;
    if (!streaming) headers['Accept'] = 'application/json';
    return headers;
}

/** 组装请求体（按协议） */
function buildBody(aiConfig, endpoint, messages, streaming) {
    const temperature = Number.isFinite(+aiConfig.temperature) ? +aiConfig.temperature : 0.7;
    const maxTokens = Number.isFinite(+aiConfig.maxTokens) ? +aiConfig.maxTokens : 1024;
    const system = aiConfig.systemPrompt || '';

    if (endpoint.protocol === 'gemini') {
        return {
            contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            systemInstruction: system ? { parts: [{ text: system }] } : undefined,
            generationConfig: { temperature, maxOutputTokens: maxTokens },
        };
    }
    if (endpoint.protocol === 'claude') {
        return {
            model: endpoint.model,
            max_tokens: maxTokens,
            temperature,
            stream: streaming,
            system: system || undefined,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
        };
    }
    // openai 兼容（deepseek/qwen/kimi/zhipu/ollama/...）
    return {
        model: endpoint.model,
        messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
        temperature,
        max_tokens: maxTokens,
        stream: streaming,
    };
}

/** 完整请求 URL（gemini 的模型内嵌路径特殊处理） */
function endpointUrl(endpoint) {
    if (endpoint.protocol === 'gemini') {
        return `${endpoint.baseUrl}/v1beta/models/${encodeURIComponent(endpoint.model)}:streamGenerateContent?alt=sse`;
    }
    return `${endpoint.baseUrl}${endpoint.apiPath}`;
}

/**
 * 从响应 JSON 中提取增量/全文文本（覆盖各协议常见形态）
 */
function extractDelta(json) {
    // OpenAI 兼容：choices[0].delta.content（流式）或 choices[0].message.content（非流式）
    const c = json.choices?.[0];
    if (c?.delta?.content) return c.delta.content;
    if (c?.message?.content) return c.message.content;
    if (c?.text) return c.text; // 老版 completions
    // Gemini：candidates[0].content.parts[].text
    const parts = json.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) return parts.map((p) => p.text || '').join('');
    // Ollama 原生：{message:{content}} 或 {response}
    if (json.message?.content) return json.message.content;
    if (typeof json.response === 'string') return json.response;
    // Claude：content_block_delta
    if (json.type === 'content_block_delta' && json.delta?.text) return json.delta.text;
    return '';
}

/**
 * 健壮响应解析：SSE 流式（分块边界 / CRLF / [DONE] / 多事件）与非 SSE JSON 降级。
 * @returns {Promise<string>} 全文
 */
async function consumeResponse(response, { onDelta }) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isSSE = contentType.includes('text/event-stream');

    // 非 SSE：整体 JSON（走代理 / 非流式请求 / 部分网关的常见形态）
    if (!isSSE || !response.body) {
        const text = await response.text();
        let out = '';
        try {
            const json = JSON.parse(text);
            out = extractDelta(json);
            if (!out && Array.isArray(json)) out = json.map((j) => extractDelta(j)).join(''); // gemini 非流式数组形态
        } catch {
            out = text; // 纯文本兜底
        }
        if (out) onDelta(out, out);
        return out;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    const processLine = (rawLine) => {
        const line = rawLine.replace(/\r$/, '');
        if (!line || line.startsWith(':')) return;          // 空行 / SSE 注释
        if (!line.startsWith('data:')) return;              // event:/id: 等行忽略
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        try {
            const delta = extractDelta(JSON.parse(payload));
            if (delta) {
                full += delta;
                onDelta(delta, full);
            }
        } catch {
            // 非 JSON 的 data 行：部分网关直接发纯文本片段
            full += payload;
            onDelta(payload, full);
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {        // 跨块行缓冲，解决分块边界截断
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            processLine(line);
        }
    }
    if (buffer) processLine(buffer); // 残尾
    return full;
}

/** 统一带超时的 fetch（超时与"停止"共用一个控制器） */
async function fetchWithTimeout(url, options) {
    abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT);
    try {
        return await fetch(url, { ...options, signal: abortController.signal });
    } finally {
        clearTimeout(timer);
    }
}

function friendlyError(err, status, bodyText) {
    if (status === 401 || status === 403) return t('API Key 无效或权限不足，请检查 AI 设置');
    if (status === 404) return t('接口路径不存在，请检查 Base URL 与服务路径');
    if (status === 429) return t('请求过于频繁或额度不足（429）');
    if (status) return `HTTP ${status}：${(bodyText || '').slice(0, 120)}`;
    if (err?.name === 'AbortError') return t('请求超时或已手动停止');
    return t('网络请求失败（可能是 CORS 拦截），可在 AI 设置中调整代理策略');
}

/** 中止当前请求（停止按钮） */
export function stopStreaming() {
    try { abortController?.abort(); } catch { /* ignore */ }
}

/**
 * 流式问答主入口。
 * @param {object} opts { messages:[{role,content}], onDelta(delta, full) }
 * @returns {Promise<{text:string, viaProxy:boolean}>}
 */
export async function streamAnswer(opts) {
    const aiConfig = { ...DEFAULT_AI_CONFIG, ...store.get('aiConfig') };
    const endpoint = resolveEndpoint(aiConfig);
    if (!endpoint.baseUrl) throw new Error(t('未配置 Base URL，请先在 AI 设置中完成服务商配置'));

    // 走代理时改用非流式（多数公共代理不支持 SSE 转发，流式会被缓冲成一次性响应）
    let attemptProxy = proxyFirst(aiConfig, endpoint);
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        const streaming = !attemptProxy;
        const targetUrl = endpointUrl(endpoint);
        const url = attemptProxy ? applyProxy(aiConfig.proxyTemplate, targetUrl) : targetUrl;
        try {
            diag(`${attemptProxy ? t('经代理请求') : t('直连请求')} ${endpoint.provider.name} · ${endpoint.model || '(模型未指定)'}${streaming ? t('（流式）') : t('（非流式）')}`);
            const response = await fetchWithTimeout(url, {
                method: 'POST',
                headers: buildHeaders(aiConfig, endpoint, streaming),
                body: JSON.stringify(buildBody(aiConfig, endpoint, opts.messages, streaming)),
            });
            if (!response.ok) {
                const bodyText = await response.text().catch(() => '');
                throw Object.assign(new Error(friendlyError(null, response.status, bodyText)), { httpStatus: response.status });
            }
            const text = await consumeResponse(response, { onDelta: (d, full) => opts.onDelta?.(d, full) });
            diag(tf('回答完成，共 {n} 字', { n: text.length }) + (attemptProxy ? t('（经代理）') : ''));
            return { text, viaProxy: attemptProxy };
        } catch (err) {
            lastError = err;
            diag(`请求失败：${err.message}`, 'error');
            // auto 策略：直连网络层失败（TypeError，通常是 CORS）→ 换代理重试一次
            const networkError = err instanceof TypeError || err?.name === 'TypeError';
            if (aiConfig.corsPolicy === 'auto' && !attemptProxy && networkError && attempt === 0) {
                attemptProxy = true;
                diag(t('直连疑似被 CORS 拦截，自动改用代理重试…'), 'warn');
                continue;
            }
            break;
        }
    }
    throw lastError || new Error('AI 请求失败');
}

/** 获取模型列表（GET modelsPath） */
export async function fetchModelList() {
    const aiConfig = { ...DEFAULT_AI_CONFIG, ...store.get('aiConfig') };
    const endpoint = resolveEndpoint(aiConfig);
    if (!endpoint.baseUrl) throw new Error(t('请先填写 Base URL'));
    const headers = buildHeaders(aiConfig, endpoint, false);

    let url;
    if (endpoint.protocol === 'gemini') {
        url = `${endpoint.baseUrl}/v1beta/models`;
    } else {
        url = `${endpoint.baseUrl}${endpoint.provider.modelsPath || '/v1/models'}`;
        if (proxyFirst(aiConfig, endpoint)) url = applyProxy(aiConfig.proxyTemplate, url);
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
    return list
        .map((m) => m.id || m.name || String(m))
        .map((s) => String(s).replace(/^models\//, ''))
        .filter(Boolean)
        .slice(0, 100);
}

/** 测试连接：发送一条极小请求，返回耗时与回复摘要 */
export async function testConnection() {
    const started = performance.now();
    try {
        const { text } = await streamAnswer({
            messages: [{ role: 'user', content: '回复"OK"两个字' }],
            onDelta: () => {},
        });
        const ms = Math.round(performance.now() - started);
        return { ok: true, message: `${t('连接成功')}（${ms}ms）：${(text || '').trim().slice(0, 40) || t('（空回复）')}` };
    } catch (err) {
        return { ok: false, message: err.message || t('连接失败') };
    }
}

export { PROMPT_TEMPLATES };
