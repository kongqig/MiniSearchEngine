/**
 * IndexedDB 低层封装 —— 所有 IDB 操作集中于此，业务代码禁止直接触碰。
 * 库结构（v2，全新，不兼容 v1）：
 *   entries   keyPath=id
 *   favorites keyPath=id
 *   meta      keyPath=key
 */

import { DB } from '../config.js';

let dbPromise = null;

export function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) {
            reject(new Error('当前环境不支持 IndexedDB（file:// 直开可能被浏览器限制，请通过本地 HTTP 服务访问）'));
            return;
        }
        const req = indexedDB.open(DB.name, DB.version);
        req.onupgradeneeded = (event) => {
            const database = event.target.result;
            for (const name of Object.values(DB.stores)) {
                if (!database.objectStoreNames.contains(name)) {
                    database.createObjectStore(name, name === DB.stores.meta ? { keyPath: 'key' } : { keyPath: 'id' });
                }
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
        req.onblocked = () => reject(new Error('IndexedDB 被其他标签页占用，请关闭后重试'));
    }).catch((err) => {
        dbPromise = null; // 允许重试
        throw err;
    });
    return dbPromise;
}

export async function tx(storeName, mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const objectStore = transaction.objectStore(storeName);
        let result;
        try {
            result = fn(objectStore);
        } catch (err) {
            reject(err);
            return;
        }
        transaction.oncomplete = () => resolve(result?._result !== undefined ? result._result : result);
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB 事务失败'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 事务被中止'));
    });
}

/** 把 IDBRequest 包装为 Promise，并在事务完成后 resolve */
function reqAsPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export const dbGet = (storeName, key) => tx(storeName, 'readonly', (s) => reqAsPromise(s.get(key)));
export const dbGetAll = (storeName) => tx(storeName, 'readonly', (s) => reqAsPromise(s.getAll()));
export const dbPut = (storeName, value) => tx(storeName, 'readwrite', (s) => reqAsPromise(s.put(value)));
export const dbAdd = (storeName, value) => tx(storeName, 'readwrite', (s) => reqAsPromise(s.add(value)));
export const dbDelete = (storeName, key) => tx(storeName, 'readwrite', (s) => reqAsPromise(s.delete(key)));
export const dbClear = (storeName) => tx(storeName, 'readwrite', (s) => reqAsPromise(s.clear()));
export const dbCount = (storeName) => tx(storeName, 'readonly', (s) => reqAsPromise(s.count()));

/**
 * 批量写入（单事务，分批 yield 避免长事务阻塞）
 */
export async function dbBulkPut(storeName, items, { batch = 500, onProgress } = {}) {
    const db = await openDB();
    for (let i = 0; i < items.length; i += batch) {
        const slice = items.slice(i, i + batch);
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const objectStore = transaction.objectStore(storeName);
            for (const item of slice) objectStore.put(item);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        onProgress?.(Math.min(items.length, i + batch), items.length);
        await new Promise((r) => setTimeout(r, 0));
    }
}

/** 元信息读写 */
export const metaGet = (key) => dbGet(DB.stores.meta, key).then((row) => row?.value);
export const metaSet = (key, value) => dbPut(DB.stores.meta, { key, value });

/** 整库清空（清除数据用） */
export async function wipeAll() {
    for (const name of Object.values(DB.stores)) {
        await dbClear(name);
    }
}
