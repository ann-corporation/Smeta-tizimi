import type { OchirishBuyruq, RejaliBuyruq } from './f2-moslash-v3/rejali';
import type { F2Akt } from './smeta-anatomiya/f2';
import { f2Imzo, rzKalit, type F2MoslashNatija } from './f2-moslash-v3';
import { bogIdlari, f2Indeks, taqsimTekshir, yozishManbasi, type F2Indeks, type IshJoyi, type SmetaIndeks } from './f2-moslash-v3/ishJoyi';
import { sbT2F2ImportDraftRoyxat, sbT2F2ImportDraftSaqla, sbT2F2ImportJobHolat, sbT2F2ImportJobIlgarilash, sbT2F2ImportJobYarat } from '../api/supabase';

/** Рабочее состояние, не акт и не финансовая запись. IndexedDB сохраняет Map/Set и исходный Blob. */
export interface F2IshchiQoralama {
  version: 1;
  companyId: number;
  objectId: number;
  savedAt: number;
  aktlar: F2Akt[];
  aktIdx: number;
  davr: string;
  ij: IshJoyi;
  natija: F2MoslashNatija;
  rzBog: Map<string, number>;
  source: { blob: Blob; name: string; lastModified: number; documentId?: number };
  operationId: string;
  sourceOperationId: string;
  server?: F2ServerQoralama;
  correction?: F2PendingCorrection;
  /** Hali yozilmagan qo'shimcha/zamena buyruqlari (oxirida «Saqlash» bilan yoziladi). */
  rejali?: RejaliBuyruq[];
  /** O'chirishga belgilangan (siz avval qo'shgan) qatorlar. */
  ochirishlar?: OchirishBuyruq[];
  /** F2 hujjat raqami (akt №) — bir obyekt+oyda bir nechta F2 bo'lsa ularni ajratadi. */
  raqam?: string;
}

export type F2PendingCorrection = { oldIds: number[]; newId: number | null };

export interface F2ServerQoralama { jobId: number; versiya: number; rows: Map<string, number> }

/**
 * Parser versiyasi: qoralama saqlanganda cursor ga yoziladi (ma'lumot uchun). Parser yaxshilanganda (yangi qatorlar,
 * float yaxlitlash o'zgarishi) saqlangan qoralamalar BUZILMASLIGI shart — tiklash versiyaga chidamli (f2ManbaMosla).
 */
export const F2_PARSER_VERSIYA = 3;

const sonMi = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Ikki qiymat teng: ikkalasi ham bo'sh, yoki sonlar float shovqini (1e-9 nisbiy / 1e-6 mutlaq) ichida. */
export function qiymatTeng(a: unknown, b: unknown): boolean {
  const x = a == null || a === '' ? null : Number(a), y = b == null || b === '' ? null : Number(b);
  if (x == null || y == null) return x == y;
  if (!sonMi(x) || !sonMi(y)) return false;
  return Math.abs(x - y) <= Math.max(1e-6, Math.abs(y) * 1e-9);
}

export interface F2ManbaMosla {
  /** Qoralamadagi qator yangi parse da topilmadi yoki qiymati boshqa — faqat shular «qayta tekshiring». */
  buzilgan: Set<string>;
  /** Yangi parse da paydo bo'lgan (qoralamada yo'q) qatorlar — bog'lanmagan holda qo'shiladi. */
  yangi: string[];
  mos: number;
}

/** Saqlangan qoralama qatorlari ↔ yangi parse (uid bo'yicha). Hech narsa rad etilmaydi: har qator alohida baholanadi. */
export function f2ManbaMosla(saqlangan: ReadonlyArray<{ uid: string; hajm?: unknown; narx?: unknown; summa?: unknown }>, ind: F2Indeks): F2ManbaMosla {
  const buzilgan = new Set<string>();
  const bor = new Set<string>();
  let mos = 0;
  for (const s of saqlangan) {
    bor.add(s.uid);
    const n = ind.byUid.get(s.uid);
    if (!n || !qiymatTeng(n.hajm, s.hajm) || !qiymatTeng(n.narx, s.narx) || !qiymatTeng(n.summa, s.summa)) buzilgan.add(s.uid); else mos++;
  }
  const yangi = ind.qatorlar.filter((n) => !bor.has(n.uid)).map((n) => n.uid);
  return { buzilgan, yangi, mos };
}

/** Buzilgan qatorlarning bog'lanish/o'tkazish qarorlari olib tashlanadi (qayta tekshirish uchun); qolganlari saqlanadi. */
export function f2BuzilganniBoshat(ij: IshJoyi, buzilgan: ReadonlySet<string>): IshJoyi {
  if (!buzilgan.size) return ij;
  return { bog: new Map([...ij.bog].filter(([uid]) => !buzilgan.has(uid))), otkaz: new Set([...ij.otkaz].filter((uid) => !buzilgan.has(uid))) };
}

/** Проекция чернового акта: только подтверждённые связи. Исходник и решения не изменяются. */
export function f2QoralamaYozish(ind: F2Indeks, ij: IshJoyi, S?: SmetaIndeks) {
  const qolgan = ind.qatorlar.filter((n) => !ij.otkaz.has(n.uid) && !(n.podval && !ij.bog.has(n.uid)) &&
    (!ij.bog.has(n.uid) || ij.bog.get(n.uid)!.holat === 'taklif'));
  const tanlangan = ind.qatorlar.filter((n) => !ij.otkaz.has(n.uid) &&
    ij.bog.has(n.uid) && ij.bog.get(n.uid)!.holat !== 'taklif');
  // Сохраняем полный индекс родителей: ресурс остаётся ресурсом даже без связи его работы.
  return { ...yozishManbasi({ ...ind, qatorlar: tanlangan }, ij, S), qolgan };
}

/** Сохраняет ВСЕ исходные строки, включая неразрешённые/отрицательные. Не создаёт акт. */
export async function f2ServerSaqla(d: F2IshchiQoralama, documentId: number, state?: F2ServerQoralama, jobOperationId?: string): Promise<F2ServerQoralama> {
  const nodes = f2Indeks(d.aktlar[d.aktIdx].daraxt).qatorlar;
  if (!state) {
    const job = await sbT2F2ImportJobYarat({ obyektId: d.objectId, operationId: jobOperationId ?? d.operationId, totalRows: nodes.length, sourceDocumentId: documentId });
    if (!job.ok || !job.job_id) throw new Error(job.code || job.error || 'F2 qoralama ochilmadi.');
    if (job.takror) throw new Error(`Qoralama #${job.job_id} avval yaratilgan. Uni davom ettirish orqali oching — parallel qarorlar bosib yozilmaydi.`);
    state = { jobId: job.job_id, versiya: job.versiya ?? 1, rows: new Map() };
    d.server = state; // Idempotent retry after later network/batch failure.
  }
  const cursor = { phase: 'f2_v3_review', parserVersiya: F2_PARSER_VERSIYA, sourceDocumentId: documentId, month: d.davr, actIdx: d.aktIdx,
    correction: d.correction ?? null, rejali: d.rejali ?? [], ochirishlar: d.ochirishlar ?? [], aktRaqam: d.raqam ?? '', file: d.source.name, sourceOperationId: d.sourceOperationId, writeOperationId: d.operationId, rzBog: [...d.rzBog], savedRows: state.rows.size };
  const checkpoint = async (complete: boolean) => {
    const r = await sbT2F2ImportJobIlgarilash({ jobId: state!.jobId, expectedVersiya: state!.versiya,
      processedDelta: 0, matchedDelta: 0, unmatchedDelta: 0, cursor: { ...cursor, savedRows: state!.rows.size, complete } });
    if (!r.ok || r.versiya == null) throw new Error(r.code || r.error || 'Qoralama belgisi saqlanmadi.');
    state!.versiya = r.versiya;
  };
  await checkpoint(false);
  for (let offset = 0; offset < nodes.length; offset += 1000) {
    const batch = nodes.slice(offset, offset + 1000);
    const r = await sbT2F2ImportDraftSaqla({ jobId: state.jobId, qatorlar: batch.map((n) => {
      const binding = d.ij.bog.get(n.uid);
      return { uid: n.uid, expectedVersiya: state!.rows.get(n.uid),
        holat: d.ij.otkaz.has(n.uid) ? 'otkazib_yuborildi' : !binding || binding.holat === 'taklif' ? 'hal_qilinmagan' : binding.holat === 'qolda' ? 'qolda_moslashtirildi' : 'avto_moslashti',
        lrvVaraq: n.manzil.varaq, lrvRow: n.manzil.qator, kod: n.kod ?? undefined, hajm: n.hajm ?? undefined,
        narx: n.narx ?? undefined, summa: n.summa ?? undefined, tur: n.tur, sabab: JSON.stringify(binding ?? null) };
    }) });
    if (!r.ok || r.saqlandi !== batch.length) throw new Error(r.code || r.error || 'Qoralama qatorlari to‘liq saqlanmadi.');
    for (const n of batch) state.rows.set(n.uid, (state.rows.get(n.uid) ?? 0) + 1);
  }
  await checkpoint(true);
  return state;
}

/** Serverdagi qoralama qarori mahalliy qaror bilan ZIDDIYATda (bir manba qatori boshqa smeta qatoriga bog'langan). */
export class F2ServerZiddiyat extends Error {
  readonly uidlar: string[];
  constructor(uidlar: string[]) { super(`F2_SERVER_ZIDDIYAT: ${uidlar.length}`); this.uidlar = uidlar; }
}

export interface F2ServerSaqlaNatija { state: F2ServerQoralama; ogohlantirish?: string }

const TUGAGAN_JOB = /TERMINAL_JOB/;
const ESKIRGAN = /STALE_VERSION|STALE_DRAFT_VERSION/;

/**
 * Server qoralamasini saqlash — yozish oqimining YORDAMCHI qadami (asosiy: akt). Bardoshli:
 *  - TERMINAL_JOB (qoralama bekor qilingan/tugagan): bog'lanishlar lokal holatdan YANGI nusxaga saqlanadi (ogohlantirish bilan);
 *  - STALE_VERSION: job holati va qator versiyalari serverdan qayta o'qiladi (lokal bog'lanishlar saqlanadi), BIR marta qayta uriniladi;
 *    server qatori boshqacha bog'langan bo'lsa — qayta urinilmaydi, `F2ServerZiddiyat` (faqat o'sha qatorlar) tashlanadi.
 */
export async function f2ServerSaqlaBardoshli(d: F2IshchiQoralama, documentId: number, state?: F2ServerQoralama,
  yangiJobOperatsiya: () => string = () => crypto.randomUUID()): Promise<F2ServerSaqlaNatija> {
  const yangiNusxa = async (): Promise<F2ServerSaqlaNatija> => {
    d.server = undefined;
    const s = await f2ServerSaqla(d, documentId, undefined, yangiJobOperatsiya());
    return { state: s, ogohlantirish: 'Bu qoralama bekor qilingan — yangi nusxa saqlandi.' };
  };
  try { return { state: await f2ServerSaqla(d, documentId, state) }; }
  catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (!state) throw e;
    if (TUGAGAN_JOB.test(m)) return yangiNusxa();
    if (!ESKIRGAN.test(m)) throw e;
    const [job, draft] = await Promise.all([sbT2F2ImportJobHolat(state.jobId), sbT2F2ImportDraftRoyxat(state.jobId)]);
    if (!job.ok || !draft.ok || job.versiya == null) throw e;
    if (job.status === 'cancelled' || job.status === 'failed') return yangiNusxa();
    const ziddiyat: string[] = [];
    for (const row of draft.qatorlar) {
      const mahalliy = d.ij.bog.get(row.uid);
      if (!mahalliy || !row.sabab) continue;
      let server: { qatorId?: number } | null = null;
      try { server = JSON.parse(row.sabab) as { qatorId?: number } | null; } catch { server = null; }
      if (server && Number.isSafeInteger(server.qatorId) && server.qatorId !== mahalliy.qatorId && row.holat !== 'hal_qilinmagan') ziddiyat.push(row.uid);
    }
    if (ziddiyat.length) throw new F2ServerZiddiyat(ziddiyat);
    const yangi: F2ServerQoralama = { jobId: state.jobId, versiya: job.versiya, rows: new Map(draft.qatorlar.map((r) => [r.uid, r.versiya])) };
    return { state: await f2ServerSaqla(d, documentId, yangi), ogohlantirish: 'Qoralama boshqa joyda o‘zgargan edi — yangi holati o‘qilib, qayta saqlandi.' };
  }
}

/** Checkpoint a known canonical result before refreshing the tree. No source rows are rewritten. */
export async function f2ServerCorrectionSaqla(d: F2IshchiQoralama): Promise<void> {
  const state = d.server;
  if (!state) return;
  if (!Number.isSafeInteger(d.source.documentId) || Number(d.source.documentId)<=0) throw new Error('F2_SOURCE_REQUIRED');
  const nodes = f2Indeks(d.aktlar[d.aktIdx].daraxt).qatorlar;
  const toliq = nodes.every((n) => state.rows.has(n.uid));
  const r = await sbT2F2ImportJobIlgarilash({jobId:state.jobId,expectedVersiya:state.versiya,
    processedDelta:0,matchedDelta:0,unmatchedDelta:0,cursor:{phase:'f2_v3_review',
      sourceDocumentId:d.source.documentId,month:d.davr,actIdx:d.aktIdx,aktRaqam:d.raqam??'',file:d.source.name,
      sourceOperationId:d.sourceOperationId,writeOperationId:d.operationId,rzBog:[...d.rzBog],
      savedRows:state.rows.size,complete:toliq,correction:d.correction??null}});
  if (!r.ok || r.versiya == null) throw new Error(r.code || r.error || 'Tuzatish belgisi saqlanmadi. Qayta urinib ko‘ring.');
  state.versiya=r.versiya;
}

export function f2PendingCorrectionOl(value: unknown): F2PendingCorrection | undefined {
  if (value == null) return undefined;
  const v=value as F2PendingCorrection;
  if (!Array.isArray(v.oldIds) || !v.oldIds.every((id)=>Number.isSafeInteger(id)&&id>0)
      || (v.newId!==null && (!Number.isSafeInteger(v.newId)||v.newId<=0))) throw new Error('F2_CORRECTION_INVALID');
  return {oldIds:[...v.oldIds],newId:v.newId};
}

export async function f2ServerOl(jobId: number) {
  const [job, draft] = await Promise.all([sbT2F2ImportJobHolat(jobId), sbT2F2ImportDraftRoyxat(jobId)]);
  if (!job.ok || !draft.ok || job.cursor?.phase !== 'f2_v3_review' || job.versiya == null || job.obyekt_id == null)
    throw new Error(job.error || draft.error || 'Bu F2 V3 ish qoralamasi topilmadi yoki unga ruxsat yo‘q.');
  // Parser yaxshilangach qoralamada total_rows dan KO'P qator bo'lishi mumkin (podval va h.k.) — faqat KAM bo'lsa to'liq emas.
  if (job.cursor.complete !== true || draft.qatorlar.length < Number(job.total_rows) || Number(job.cursor.savedRows) < Number(job.total_rows))
    throw new Error('Serverda qoralama bo‘laklari to‘liq emas. Asl ochiq sahifadagi mahalliy ishni saqlab, yana yuboring.');
  const bog: Map<string, import('./f2-moslash-v3/ishJoyi').Bog> = new Map(), otkaz = new Set<string>();
  // Rejali (hali yozilmagan) qo'shimcha/zamenaga bog'langan qatorlar vaqtinchalik (manfiy) id ga ishora qiladi — ular
  // cursor dagi rejali buyruqlarda bo'lsa qabul qilinadi (T7, 2026-10-24: aks holda boshqa kompyuterda bog'lanish yo'qolardi).
  const rejaliIdlar = new Set<number>();
  const rejali = (job.cursor as { rejali?: unknown }).rejali;
  if (Array.isArray(rejali)) for (const r of rejali as Array<{ tempId?: unknown; resursTempIds?: unknown }>) {
    if (Number.isSafeInteger(r?.tempId)) rejaliIdlar.add(r.tempId as number);
    if (Array.isArray(r?.resursTempIds)) for (const x of r.resursTempIds) if (Number.isSafeInteger(x)) rejaliIdlar.add(x as number);
  }
  for (const row of draft.qatorlar) {
    if (row.holat === 'otkazib_yuborildi') { otkaz.add(row.uid); continue; }
    const b = row.sabab ? JSON.parse(row.sabab) as import('./f2-moslash-v3/ishJoyi').Bog | null : null;
    if (b && Number.isSafeInteger(b.qatorId) && (b.qatorId > 0 || rejaliIdlar.has(b.qatorId))
      && ['aniq', 'xotira', 'taklif', 'qolda'].includes(b.holat)) {
      // Taqsimlab bog'lash (bir F2 qatori → bir necha smeta qatori) shu `sabab` JSON ida saqlanadi; buzilgan bo'lsa — oddiy bog'lanish.
      const { taqsim, ...asos } = b;
      const tq = taqsim === undefined ? undefined : taqsimTekshir(taqsim, (id) => id > 0 || rejaliIdlar.has(id));
      bog.set(row.uid, tq ? { ...asos, qatorId: tq[0].qatorId, taqsim: tq } : asos);
    }
  }
  return { objectId: job.obyekt_id, cursor: job.cursor, ij: { bog, otkaz }, sourceRows: draft.qatorlar,
    state: { jobId, versiya: job.versiya, rows: new Map(draft.qatorlar.map((r) => [r.uid, r.versiya])) } };
}

function baza(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Bu brauzerda mahalliy qoralama saqlash mavjud emas.')); return; }
    const r = indexedDB.open('t2-f2-working-drafts', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Qoralama bazasi ochilmadi.'));
    r.onblocked = () => reject(new Error('Qoralama bazasi band. Boshqa F2 oynasini tekshiring.'));
  });
}

let saveQueue: Promise<void> = Promise.resolve();
export function f2IshchiSaqla(draft: F2IshchiQoralama): Promise<void> {
  const next = saveQueue.catch(() => undefined).then(() => saqla(draft));
  saveQueue = next;
  return next;
}
async function saqla(draft: F2IshchiQoralama): Promise<void> {
  const db = await baza();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(draft, `${draft.companyId}:${draft.objectId}`);
      // Успех только после commit транзакции, не после успешного put.
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Qoralama saqlanmadi.'));
    });
  } finally { db.close(); }
}

export async function f2IshchiOl(companyId: number, objectId?: number): Promise<F2IshchiQoralama | null> {
  const db = await baza();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const r = tx.objectStore('drafts').getAll();
      r.onsuccess = () => {
        const drafts = r.result as F2IshchiQoralama[];
        resolve(drafts.filter((d) => d.version === 1 && d.companyId === companyId && (objectId == null || d.objectId === objectId))
          .sort((a, b) => b.savedAt - a.savedAt)[0] ?? null);
      };
      r.onerror = () => reject(r.error ?? new Error('Qoralama o‘qilmadi.'));
    });
  } finally { db.close(); }
}

/** Удалённые канонические строки не восстанавливаются как действующие связи. */
export function f2QoralamaBogTekshir(ij: IshJoyi, currentIds: ReadonlySet<number>): IshJoyi {
  return { bog: new Map([...ij.bog].filter(([, b]) => bogIdlari(b).every((id) => currentIds.has(id)))), otkaz: new Set(ij.otkaz) };
}

/** Только предложение: знак объёма не доказывает, какую прошлую запись отменили.
 * Одна и та же подпись/родитель/путь и единственная уже подтверждённая связь в этом акте. */
export function f2MinusTaklif(akt: F2Akt, ij: IshJoyi): { ij: IshJoyi; soni: number } {
  const ind = f2Indeks(akt.daraxt);
  const signature = (uid: string): string => {
    const t = ind.byUid.get(uid)!;
    const parent = ind.ota.get(uid);
    const scope = t.yol.map(rzKalit).join('/');
    return `${t.tur}|${f2Imzo(t, parent && parent.tur !== 'rz' ? f2Imzo(parent, scope) : scope)}`;
  };
  const targets = new Map<string, Set<number>>();
  for (const t of ind.qatorlar) {
    const b = ij.bog.get(t.uid);
    if (!b || b.holat === 'taklif' || ij.otkaz.has(t.uid) || t.hajm == null || t.hajm <= 0) continue;
    const key = signature(t.uid), ids = targets.get(key) ?? new Set<number>();
    ids.add(b.qatorId); targets.set(key, ids);
  }
  const bog = new Map(ij.bog);
  let soni = 0;
  for (const t of ind.qatorlar) {
    if (t.hajm == null || t.hajm >= 0 || ij.otkaz.has(t.uid) || bog.has(t.uid)) continue;
    const ids = targets.get(signature(t.uid));
    if (ids?.size !== 1) continue;
    bog.set(t.uid, { qatorId: [...ids][0], holat: 'taklif', usul: 'pereraschet_taklif' });
    soni++;
  }
  return { ij: { bog, otkaz: new Set(ij.otkaz) }, soni };
}
