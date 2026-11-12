/**
 * Usta oflayn navbati: kiritmalar IndexedDB'da saqlanadi (brauzer yopilsa ham yo'qolmaydi) va internet qaytganda
 * serverga yuboriladi. Har yozuv O'Z operation_id'siga ega — qayta yuborish xavfsiz (server idempotent: takror = bitta natija).
 * Pul ma'lumoti saqlanmaydi (faqat hajm, material nomi, izoh, foto). Xotira zaxirasi: IndexedDB yo'q bo'lsa (private rejim) RAM.
 */
export type NavbatTur = 'fakt' | 'zayavka';
export type NavbatYozuv = {
  /** operation_id (UUID) — yozuv kaliti va server idempotentlik kaliti. */
  id: string;
  tur: NavbatTur;
  kompaniyaId: number;
  obyektId: number;
  payload: Record<string, unknown>;
  /** Siqilgan foto (ixtiyoriy) — serverga avval yuklanadi, keyin hujjat id yozuvga qo'shiladi. */
  foto?: Blob | null;
  fotoOperationId?: string;
  fotoHujjatId?: number | null;
  yaratildi: number;
  urinish: number;
  /** Server qat'iy rad etdi (qayta urinish foydasiz) — foydalanuvchiga ko'rsatiladi. */
  xato?: string | null;
};

export interface NavbatOmbor {
  hammasi(): Promise<NavbatYozuv[]>;
  qosh(y: NavbatYozuv): Promise<void>;
  yangila(y: NavbatYozuv): Promise<void>;
  ochir(id: string): Promise<void>;
}

export function xotiraOmbor(): NavbatOmbor {
  const m = new Map<string, NavbatYozuv>();
  return {
    async hammasi() { return [...m.values()].sort((a, b) => a.yaratildi - b.yaratildi); },
    async qosh(y) { m.set(y.id, y); },
    async yangila(y) { m.set(y.id, y); },
    async ochir(id) { m.delete(id); },
  };
}

const DB_NOM = 'smeta-usta-navbat'; const JADVAL = 'navbat';

function idbOmbor(): NavbatOmbor | null {
  if (typeof indexedDB === 'undefined') return null;
  const ochish = () => new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB_NOM, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(JADVAL, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const amal = async <T,>(rejim: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await ochish();
    return new Promise<T>((res, rej) => {
      const tx = db.transaction(JADVAL, rejim); const rq = f(tx.objectStore(JADVAL));
      tx.oncomplete = () => { db.close(); res(rq.result); };
      tx.onerror = () => { db.close(); rej(tx.error); };
      tx.onabort = () => { db.close(); rej(tx.error); };
    });
  };
  return {
    async hammasi() { return ((await amal('readonly', (s) => s.getAll())) as NavbatYozuv[]).sort((a, b) => a.yaratildi - b.yaratildi); },
    async qosh(y) { await amal('readwrite', (s) => s.put(y)); },
    async yangila(y) { await amal('readwrite', (s) => s.put(y)); },
    async ochir(id) { await amal('readwrite', (s) => s.delete(id)); },
  };
}

/** IndexedDB, ishlamasa (private rejim, kvota) — RAM zaxirasi (sahifa yopilguncha). */
export function navbatOmbori(): NavbatOmbor {
  const idb = idbOmbor(); const ram = xotiraOmbor();
  if (!idb) return ram;
  const xavfsiz = async <T,>(f: () => Promise<T>, zaxira: () => Promise<T>): Promise<T> => { try { return await f(); } catch { return zaxira(); } };
  return {
    hammasi: async () => xavfsiz(async () => [...await idb.hammasi(), ...await ram.hammasi()], () => ram.hammasi()),
    qosh: (y) => xavfsiz(() => idb.qosh(y), () => ram.qosh(y)),
    yangila: async (y) => { await ram.yangila(y).catch(() => undefined); await xavfsiz(() => idb.yangila(y), async () => undefined); },
    ochir: async (id) => { await ram.ochir(id).catch(() => undefined); await xavfsiz(() => idb.ochir(id), async () => undefined); },
  };
}

export type YuborNatija =
  | { ok: true }
  /** Vaqtinchalik (tarmoq/server) — navbatda qoladi, keyinroq qayta uriniladi. */
  | { ok: false; qayta: true; xato: string }
  /** Qat'iy rad (ruxsat yo'q, noto'g'ri qator) — qayta urinish foydasiz, foydalanuvchiga ko'rsatiladi. */
  | { ok: false; qayta: false; xato: string };

export type SyncHisobot = { yuborildi: number; qoldi: number; rad: number };

/** Navbatni ketma-ket yuboradi. Birinchi vaqtinchalik xatoda to'xtaydi (tartib va tarmoq tejaladi). Bir vaqtda bitta sync. */
let ishda: Promise<SyncHisobot> | null = null;
export function navbatniYubor(ombor: NavbatOmbor, yubor: (y: NavbatYozuv) => Promise<YuborNatija>, onlayn: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine)): Promise<SyncHisobot> {
  if (ishda) return ishda;
  ishda = (async () => {
    const h: SyncHisobot = { yuborildi: 0, qoldi: 0, rad: 0 };
    const royxat = (await ombor.hammasi()).filter((y) => !y.xato);
    for (const y of royxat) {
      if (!onlayn()) break;
      const r = await yubor(y).catch((e): YuborNatija => ({ ok: false, qayta: true, xato: e instanceof Error ? e.message : String(e) }));
      if (r.ok) { await ombor.ochir(y.id); h.yuborildi++; continue; }
      if (!r.qayta) { await ombor.yangila({ ...y, xato: r.xato, urinish: y.urinish + 1 }); h.rad++; continue; }
      await ombor.yangila({ ...y, urinish: y.urinish + 1 });
      break;
    }
    h.qoldi = (await ombor.hammasi()).filter((y) => !y.xato).length;
    return h;
  })().finally(() => { ishda = null; });
  return ishda;
}
