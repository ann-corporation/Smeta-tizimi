/**
 * Transport paneli gateway mijozi — `/api/transport` (aktor/kompaniya sessiyadan; mijoz actor_id yubormaydi).
 * audit — o'qish; yoy — preview (yoz:false) yoki yozish (yoz:true [+ majburiy]); belgila — usulni o'zgartirish.
 */
import type { TransportUsul, YoyGuruh } from '../lib/transport-yoy/kirish';
import { yoyYukiAjrat, type AuditJavob, type YoyJavob, type YoyYuk } from '../lib/transport-yoy/panel';

export type TransportJavob<T> = T & { ok?: boolean; code?: string; xabar?: string };
export type BelgilaJavob = { ok?: boolean; usul?: string; qator_soni?: number; ozgardi?: number; tkm_qatori_yoq_soni?: number; tkm_qatori_yoq?: number[] };

async function chaqir<T>(kompaniyaId: number, body: Record<string, unknown>): Promise<TransportJavob<T>> {
  try {
    const r = await fetch('/api/transport', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kompaniya_id: kompaniyaId, ...body }) });
    const j = await r.json().catch(() => null) as TransportJavob<T> | null;
    return j && typeof j === 'object' ? { ...j, ok: r.ok && j.ok !== false } : { ok: false, code: 'JAVOB_YOQ' } as TransportJavob<T>;
  } catch { return { ok: false, code: 'TARMOQ_XATO' } as TransportJavob<T>; }
}

export const transportAudit = (kompaniyaId: number, obyektId: number) => chaqir<AuditJavob>(kompaniyaId, { amal: 'audit', obyekt_id: obyektId });

export type YoyChaqiruv = { obyektId: number; rzId: number; tkmNarx: number; qatorlar: ReadonlyArray<YoyGuruh | Record<string, unknown>>; majburiy?: boolean };
/** Preview (hech narsa yozilmaydi). TASDIQ_KERAK emas — preview doim jadval qaytaradi. */
export const transportYoyPreview = (kompaniyaId: number, c: YoyChaqiruv) =>
  chaqir<YoyJavob>(kompaniyaId, { amal: 'yoy', obyekt_id: c.obyektId, rz_id: c.rzId, tkm_narx: c.tkmNarx, qatorlar: c.qatorlar, yoz: false });
/** Yozish: bloklangan bo'lsa `majburiy:true` faqat foydalanuvchi aniq «farqni qabul qilaman» belgilagandan keyin. */
export const transportYoyYoz = (kompaniyaId: number, c: YoyChaqiruv) =>
  chaqir<YoyJavob>(kompaniyaId, { amal: 'yoy', obyekt_id: c.obyektId, rz_id: c.rzId, tkm_narx: c.tkmNarx, qatorlar: c.qatorlar, majburiy: c.majburiy === true, yoz: true });
export const transportBelgila = (kompaniyaId: number, obyektId: number, qatorIdlar: readonly number[], usul: TransportUsul) =>
  chaqir<BelgilaJavob>(kompaniyaId, { amal: 'belgila', obyekt_id: obyektId, qator_idlar: qatorIdlar, usul });

function bytesBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Smeta XLSX dan «Расчёт затрат транспорта» yukini ajratadi (mavjud `/api/f2-moslash` fayl_oqi; yangi parser yo'q). Yuk yo'q bo'lsa `yuk: null`. */
export async function faylTransportOqi(fayl: File): Promise<{ ok: boolean; yuk: YoyYuk | null; code?: string; xabar?: string }> {
  try {
    const fileBase64 = bytesBase64(new Uint8Array(await fayl.arrayBuffer()));
    const r = await fetch('/api/f2-moslash', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal: 'fayl_oqi', fileBase64 }) });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (!r.ok || !j) return { ok: false, yuk: null, code: String(j?.code ?? 'FAYL_OQILMADI'), xabar: typeof j?.xabar === 'string' ? j.xabar : undefined };
    return { ok: true, yuk: yoyYukiAjrat(j) };
  } catch { return { ok: false, yuk: null, code: 'TARMOQ_XATO' }; }
}

/** Server xato kodi → tushunarli o'zbekcha. */
export function transportXatoMatni(code: string | undefined, xabar?: string): string {
  const m: Record<string, string> = {
    PERMISSION_DENIED: 'Bu amalga sizda ruxsat yo‘q.', MODULE_DISABLED: 'Bu modul kompaniyangizda o‘chirilgan.', AUTH_REQUIRED: 'Qayta kiring.', TOPILMADI: 'Obyekt topilmadi.',
    TASDIQ_KERAK: 'Farqlar bor — ko‘rib chiqing va qabul qilsangiz tasdiqlang.', TKM_QATOR_BOR: 'Bu materialda t·km qatori bor — avval uni olib tashlang.', QATOR_YARAMAYDI: 'Faol material qatori emas.',
    TRANSPORT_RPC_YOQ: 'Transport funksiyasi hali yoqilmagan.', TARMOQ_XATO: 'Tarmoq xatosi — qayta urinib ko‘ring.', SERVER_XATO: 'Server xatosi — qayta urinib ko‘ring.',
    BOLIM_KERAK: 'Bo‘limni tanlang.', TKM_NARX_KERAK: '1 t·km narxini kiriting.', RZ_YOQ: 'Bo‘lim shu obyektda topilmadi.',
  };
  return (code && m[code]) || xabar || `Amal bajarilmadi (${code ?? 'xato'}).`;
}
