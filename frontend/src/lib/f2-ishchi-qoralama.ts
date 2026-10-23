import type { OchirishBuyruq, RejaliBuyruq } from './f2-moslash-v3/rejali';
import type { F2Akt } from './smeta-anatomiya/f2';
import { f2Imzo, rzKalit, type F2MoslashNatija } from './f2-moslash-v3';
import { f2Indeks, yozishManbasi, type F2Indeks, type IshJoyi } from './f2-moslash-v3/ishJoyi';
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

/** Проекция чернового акта: только подтверждённые связи. Исходник и решения не изменяются. */
export function f2QoralamaYozish(ind: F2Indeks, ij: IshJoyi) {
  const qolgan = ind.qatorlar.filter((n) => !ij.otkaz.has(n.uid) &&
    (!ij.bog.has(n.uid) || ij.bog.get(n.uid)!.holat === 'taklif'));
  const tanlangan = ind.qatorlar.filter((n) => !ij.otkaz.has(n.uid) &&
    ij.bog.has(n.uid) && ij.bog.get(n.uid)!.holat !== 'taklif');
  // Сохраняем полный индекс родителей: ресурс остаётся ресурсом даже без связи его работы.
  return { ...yozishManbasi({ ...ind, qatorlar: tanlangan }, ij), qolgan };
}

/** Сохраняет ВСЕ исходные строки, включая неразрешённые/отрицательные. Не создаёт акт. */
export async function f2ServerSaqla(d: F2IshchiQoralama, documentId: number, state?: F2ServerQoralama): Promise<F2ServerQoralama> {
  const nodes = f2Indeks(d.aktlar[d.aktIdx].daraxt).qatorlar;
  if (!state) {
    const job = await sbT2F2ImportJobYarat({ obyektId: d.objectId, operationId: d.operationId, totalRows: nodes.length, sourceDocumentId: documentId });
    if (!job.ok || !job.job_id) throw new Error(job.code || job.error || 'F2 qoralama ochilmadi.');
    if (job.takror) throw new Error(`Qoralama #${job.job_id} avval yaratilgan. Uni davom ettirish orqali oching — parallel qarorlar bosib yozilmaydi.`);
    state = { jobId: job.job_id, versiya: job.versiya ?? 1, rows: new Map() };
    d.server = state; // Idempotent retry after later network/batch failure.
  }
  const cursor = { phase: 'f2_v3_review', sourceDocumentId: documentId, month: d.davr, actIdx: d.aktIdx,
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

/** Checkpoint a known canonical result before refreshing the tree. No source rows are rewritten. */
export async function f2ServerCorrectionSaqla(d: F2IshchiQoralama): Promise<void> {
  const state = d.server;
  if (!state) return;
  if (!Number.isSafeInteger(d.source.documentId) || Number(d.source.documentId)<=0) throw new Error('F2_SOURCE_REQUIRED');
  const count = f2Indeks(d.aktlar[d.aktIdx].daraxt).qatorlar.length;
  const r = await sbT2F2ImportJobIlgarilash({jobId:state.jobId,expectedVersiya:state.versiya,
    processedDelta:0,matchedDelta:0,unmatchedDelta:0,cursor:{phase:'f2_v3_review',
      sourceDocumentId:d.source.documentId,month:d.davr,actIdx:d.aktIdx,aktRaqam:d.raqam??'',file:d.source.name,
      sourceOperationId:d.sourceOperationId,writeOperationId:d.operationId,rzBog:[...d.rzBog],
      savedRows:state.rows.size,complete:state.rows.size===count,correction:d.correction??null}});
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
  if (job.cursor.complete !== true || draft.qatorlar.length !== job.total_rows || job.cursor.savedRows !== job.total_rows)
    throw new Error('Serverda qoralama bo‘laklari to‘liq emas. Asl ochiq sahifadagi mahalliy ishni saqlab, yana yuboring.');
  const bog: Map<string, import('./f2-moslash-v3/ishJoyi').Bog> = new Map(), otkaz = new Set<string>();
  for (const row of draft.qatorlar) {
    if (row.holat === 'otkazib_yuborildi') { otkaz.add(row.uid); continue; }
    const b = row.sabab ? JSON.parse(row.sabab) as import('./f2-moslash-v3/ishJoyi').Bog | null : null;
    if (b && Number.isSafeInteger(b.qatorId) && b.qatorId > 0 && ['aniq', 'xotira', 'taklif', 'qolda'].includes(b.holat)) bog.set(row.uid, b);
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
  return { bog: new Map([...ij.bog].filter(([, b]) => currentIds.has(b.qatorId))), otkaz: new Set(ij.otkaz) };
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
