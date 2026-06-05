// —— 持久化层:把用户卷(非示例)存进 IndexedDB,刷新后可恢复 ——
//   db=filmscan / objectStore=rolls / keyPath=id
//   只存可序列化的 {id,name,filmType,shots:Blob[]}(每帧的 shot.blob);
//   url/img 是运行时态(createObjectURL + new Image()),恢复时重建,不入库。
//   全部 async + try/catch;QuotaExceededError 时 console.warn + 轻提示,绝不崩。
import type { FilmType, Roll } from './types';
import { toast } from './core';

const DB_NAME = 'filmscan';
const STORE = 'rolls';

// 入库记录形态(纯可序列化)
interface StoredRoll { id: number; name: string; filmType: FilmType; filmIdx?: number; cap?: number; shots: Blob[]; }

// selftest 写库守卫:任何真正的写/删都自增,selftest 路径不调本模块 -> 恒为 0
export let writeCount = 0;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 写/删事务统一收尾:complete=成功,error/abort=失败(QuotaExceeded 走这里)
function runWrite(db: IDBDatabase, fn: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function handleErr(e: unknown): void {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') {
    console.warn('[persist] 本地存储空间不足,本次未能离线保存。', e);
    toast('存储空间不足,照片未能离线保存(下次刷新可能需要重新导入)');
  } else {
    console.warn('[persist] 持久化操作失败:', e);
  }
}

// upsert 整卷;无 blob 的帧不入库(恢复后无法重建)
export async function persistRoll(roll: Roll): Promise<void> {
  if (!roll) return;
  try {
    writeCount++;
    const shots: Blob[] = [];
    roll.shots.forEach(s => { if (s.blob) shots.push(s.blob); });
    const rec: StoredRoll = { id: roll.id, name: roll.name, filmType: roll.filmType, filmIdx: roll.filmIdx ?? 1, cap: roll.cap, shots };
    const db = await openDB();
    try { await runWrite(db, store => store.put(rec)); }
    finally { db.close(); }
  } catch (e) {
    handleErr(e);
  }
}

export async function deleteRollFromDB(id: number): Promise<void> {
  try {
    writeCount++;
    const db = await openDB();
    try { await runWrite(db, store => store.delete(id)); }
    finally { db.close(); }
  } catch (e) {
    handleErr(e);
  }
}

export async function loadAllRolls(): Promise<Array<{ id: number; name: string; filmType: FilmType; filmIdx?: number; cap?: number; shots: Blob[] }>> {
  try {
    const db = await openDB();
    try {
      return await new Promise<StoredRoll[]>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as StoredRoll[]) || []);
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  } catch (e) {
    handleErr(e);
    return [];
  }
}
