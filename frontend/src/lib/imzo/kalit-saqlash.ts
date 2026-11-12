/**
 * lib/imzo/kalit-saqlash.ts - shaxsiy imzo kaliti QURILMADA (ADR_SHAXSIY_IMZO.md §2).
 *
 * WebCrypto ECDSA P-256, `extractable:false`: maxfiy kalit baytlarini JavaScript ham, server ham, foydalanuvchi ham OLA OLMAYDI
 * (faqat `sign` chaqirish mumkin). CryptoKey obyekti IndexedDB da saqlanadi (structured clone). Ochiq kalit serverga yuboriladi.
 * Brauzer ma'lumotlari tozalansa kalit yo'qoladi - u holda eski kalit bekor qilinib, yangisi yaratiladi (ADR: yo'qotilgan qurilma).
 */
import { b64uKodla } from './yadro';

export type QurilmaKaliti = { foydalanuvchi_id: number; kalit_id: string | null; ochiq: string; privateKey: CryptoKey; yaratilgan: number };

/** Saqlash qatlami (testda xotira bilan almashtiriladi). */
export type KalitOmbori = {
  oqi(userId: number): Promise<QurilmaKaliti | null>;
  yoz(k: QurilmaKaliti): Promise<void>;
  ochir(userId: number): Promise<void>;
};

const DB = 'smeta-imzo-v1'; const STORE = 'kalit';

function idbOch(): Promise<IDBDatabase> {
  return new Promise((ok, xato) => {
    if (typeof indexedDB === 'undefined') return xato(new Error('IDB_YOQ'));
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => { q.result.createObjectStore(STORE, { keyPath: 'foydalanuvchi_id' }); };
    q.onsuccess = () => ok(q.result);
    q.onerror = () => xato(q.error ?? new Error('IDB_XATO'));
  });
}
function tx<T>(rejim: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idbOch().then((db) => new Promise<T>((ok, xato) => {
    const r = f(db.transaction(STORE, rejim).objectStore(STORE));
    r.onsuccess = () => { ok(r.result); db.close(); };
    r.onerror = () => { xato(r.error ?? new Error('IDB_XATO')); db.close(); };
  }));
}

export const idbOmbori: KalitOmbori = {
  oqi: async (id) => ((await tx('readonly', (s) => s.get(id))) as QurilmaKaliti | undefined) ?? null,
  yoz: async (k) => { await tx('readwrite', (s) => s.put(k)); },
  ochir: async (id) => { await tx('readwrite', (s) => s.delete(id)); },
};

export function webCryptoBormi(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';
}

/** Yangi kalit jufti yaratadi va SAQLAYDI (kalit_id hali yo'q - server ro'yxatdan o'tkazgach belgilanadi). */
export async function kalitYarat(userId: number, ombor: KalitOmbori = idbOmbori): Promise<QurilmaKaliti> {
  const j = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']) as CryptoKeyPair;
  const ochiq = b64uKodla(new Uint8Array(await crypto.subtle.exportKey('raw', j.publicKey) as ArrayBuffer));
  const k: QurilmaKaliti = { foydalanuvchi_id: userId, kalit_id: null, ochiq, privateKey: j.privateKey, yaratilgan: Date.now() };
  await ombor.yoz(k);
  return k;
}

export async function kalitBelgila(userId: number, kalitId: string, ombor: KalitOmbori = idbOmbori): Promise<void> {
  const k = await ombor.oqi(userId);
  if (k) await ombor.yoz({ ...k, kalit_id: kalitId });
}

/** Shu qurilmadagi (ro'yxatdan o'tgan) kalit; yo'q bo'lsa null. */
export async function qurilmaKaliti(userId: number, ombor: KalitOmbori = idbOmbori): Promise<QurilmaKaliti | null> {
  try { const k = await ombor.oqi(userId); return k && k.kalit_id ? k : null; } catch { return null; }
}

export async function kalitOchir(userId: number, ombor: KalitOmbori = idbOmbori): Promise<void> {
  try { await ombor.ochir(userId); } catch { /* yo'q bo'lsa ham maqsadga erishildi */ }
}

/** Xabarni qurilma kaliti bilan imzolaydi (ECDSA P-256 / SHA-256, P1363). Maxfiy kalit hech qachon qaytmaydi. */
export async function xabarImzola(k: QurilmaKaliti, xabar: Uint8Array): Promise<string> {
  const buf = xabar.buffer.slice(xabar.byteOffset, xabar.byteOffset + xabar.byteLength) as ArrayBuffer;
  return b64uKodla(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.privateKey, buf)));
}
