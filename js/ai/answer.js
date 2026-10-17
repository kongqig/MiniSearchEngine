/**
 * AI 回答编排：把 ai/client.js 的流式能力接到 store.ai 状态上。
 * 结果页视图订阅 store.ai 渲染；设置面板的"测试连接"直接调用 client.testConnection。
 */

import { store } from '../store.js';
import { streamAnswer, stopStreaming, diag } from './client.js';
import { t } from '../i18n.js';

let gen = 0; // 会话序号：新查询自动作废旧流的回调

/**
 * 发起一次 AI 问答（在结果页侧栏流式渲染）。
 * @param {string} query 已清洗的查询文本
 */
export async function runAiAnswer(query) {
    const myGen = ++gen;
    const aiConfig = store.get('aiConfig');
    store.set('ai', {
        status: 'loading',
        query,
        content: '',
        error: null,
        provider: aiConfig.provider || '',
    });

    try {
        const { text } = await streamAnswer({
            messages: [{ role: 'user', content: query }],
            onDelta: (_delta, full) => {
                if (myGen !== gen) return;
                const cur = store.get('ai');
                store.set('ai', { ...cur, status: 'streaming', content: full });
            },
        });
        if (myGen !== gen) return;
        store.set('ai', { ...store.get('ai'), status: 'done', content: text || t('（模型未返回内容）') });
    } catch (err) {
        if (myGen !== gen) return;
        diag(`${t('AI 回答失败')}：${err.message}`, 'error');
        store.set('ai', { ...store.get('ai'), status: 'error', error: err.message || t('请求失败') });
    }
}

/** 停止当前回答（停止按钮 / 新搜索前调用） */
export function stopAiAnswer() {
    gen++; // 作废在途回调
    stopStreaming();
    const ai = store.get('ai');
    if (ai && (ai.status === 'loading' || ai.status === 'streaming')) {
        store.set('ai', { ...ai, status: 'stopped' });
    }
}
