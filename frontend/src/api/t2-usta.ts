/**
 * USTA «Bugun» API: qoralama fakt, material zayavkasi, prorab qarori, oflayn navbatni yuborish.
 * Yozish: /api/sb-yoz `usta_*_v1` (idempotent operation_id; ruxsat RPC ichida). O'qish: /api/sb `t2_usta_fakt_qoralama`.
 * Haqiqiy fakt faqat `fakt_yoz_v2` orqali yoziladi (fakt.write bor foydalanuvchi yoki prorab tasdig'i).
 */
import { sbOqi, yozAmali, type AktNatija, type SbJavob } from './supabase';
import { hujjatYukla } from './t2-hujjat-canonical';
import { sbFaktYoz } from './t2-fakt';
import type { NavbatYozuv, YuborNatija } from '../lib/usta/navbat';

export type UstaQoralama = {
  id: number; kompaniya_id: number; obyekt_id: number; qator_id: number; sana: string; hajm: number; izoh: string | null;
  foto_hujjat_id: number | null; yozgan_actor_id: number; holat: 'qoralama' | 'tasdiqlangan' | 'rad'; qaror_izoh: string | null; created_at: string;
};
export type UstaYoz = AktNatija & { code?: string; id?: number };

export const sbUstaQoralamaYoz = (p: { kompaniyaId: number; obyektId: number; sana: string; qatorlar: Array<{ qator_id: number; hajm: number }>; izoh?: string | null; fotoHujjatId?: number | null; operationId: string }): Promise<UstaYoz> =>
  yozAmali({ amal: 'usta_fakt_qoralama_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, sana: p.sana, qatorlar: p.qatorlar, izoh: p.izoh ?? null, foto_hujjat_id: p.fotoHujjatId ?? null, operation_id: p.operationId });

export const sbUstaZayavkaYoz = (p: { kompaniyaId: number; obyektId: number; nomi: string; miqdor: number; birlik?: string | null; kerakSana?: string | null; izoh?: string | null; operationId: string }): Promise<UstaYoz> =>
  yozAmali({ amal: 'usta_zayavka_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, nomi: p.nomi, miqdor: p.miqdor, birlik: p.birlik ?? null, kerak_sana: p.kerakSana ?? null, izoh: p.izoh ?? null, operation_id: p.operationId });

export const sbUstaQaror = (p: { kompaniyaId: number; idlar: number[]; qaror: 'tasdiqlangan' | 'rad'; izoh?: string | null; operationId: string }): Promise<UstaYoz> =>
  yozAmali({ amal: 'usta_fakt_qaror_v1', kompaniya_id: p.kompaniyaId, idlar: p.idlar, qaror: p.qaror, izoh: p.izoh ?? null, operation_id: p.operationId });

/** Kompaniyaning qoralamalari (holat bo'yicha). Obyekt berilsa — shu obyektniki. */
export function sbUstaQoralamalarOl(kompaniyaId: number, holat: UstaQoralama['holat'] = 'qoralama', obyektId?: number): Promise<SbJavob<UstaQoralama>> {
  const f = [`kompaniya_id=eq.${kompaniyaId}`, `holat=eq.${holat}`]; if (obyektId != null) f.push(`obyekt_id=eq.${obyektId}`);
  return sbOqi<UstaQoralama>({ jadval: 't2_usta_fakt_qoralama', filtr: f.join('&'), tartib: 'created_at.desc', limit: 500 });
}

const VAQTINCHALIK = new Set(['NETWORK', 'OFFLINE', 'SEND_FAILED', 'TIMEOUT', 'SERVER', 'SESSION_EXPIRED', 'SERIALIZE', 'CLIENT']);
export const vaqtinchalikXato = (code?: string) => !!code && VAQTINCHALIK.has(code);

/** Matn qisqa tushuntirish (foydalanuvchi uchun, texnik kodsiz). */
export function ustaXatoMatni(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''} ${r?.xabar ?? ''}`;
  if (/PERMISSION_DENIED|42501|FORBIDDEN/.test(m)) return 'Bu amal uchun ruxsatingiz yo‘q.';
  if (/SANA_NOTOGRI/.test(m)) return 'Sana noto‘g‘ri (31 kundan eski yoki ertangi kundan keyin).';
  if (/FAKT_LINE_OUTSIDE_OBJECT|OBYEKT_NOT_FOUND/.test(m)) return 'Ish yoki obyekt topilmadi — ro‘yxatni yangilang.';
  return r?.error || r?.xabar || 'Saqlanmadi.';
}

/** Navbat yozuvini serverga yuboradi: foto (bo'lsa) avval, keyin qoralama/zayavka. Hammasi o'z operation_id bilan. */
export async function navbatYozuviniYubor(y: NavbatYozuv): Promise<YuborNatija> {
  let fotoId = y.fotoHujjatId ?? null;
  if (y.tur === 'fakt' && y.foto && fotoId == null) {
    const f = new File([y.foto], `usta-${y.id}.jpg`, { type: y.foto.type || 'image/jpeg' });
    const u = await hujjatYukla({ file: f, kompaniyaId: y.kompaniyaId, obyektId: y.obyektId, documentType: 'hujjat', operationId: y.fotoOperationId ?? y.id });
    if (u.ok) fotoId = u.data.document_id;
    else if (vaqtinchalikXato(u.code) || u.code === 'NETWORK') return { ok: false, qayta: true, xato: 'Foto yuborilmadi (tarmoq).' };
    /* Foto yuklanmasa ham ish hajmi yo'qolmasin: fotosiz davom etamiz (foto ixtiyoriy). */
  }
  const p = y.payload;
  const r = y.tur === 'fakt'
    ? await sbUstaQoralamaYoz({ kompaniyaId: y.kompaniyaId, obyektId: y.obyektId, sana: String(p.sana), qatorlar: p.qatorlar as Array<{ qator_id: number; hajm: number }>, izoh: (p.izoh as string) ?? null, fotoHujjatId: fotoId, operationId: y.id })
    : await sbUstaZayavkaYoz({ kompaniyaId: y.kompaniyaId, obyektId: y.obyektId, nomi: String(p.nomi), miqdor: Number(p.miqdor), birlik: (p.birlik as string) ?? null, kerakSana: (p.kerak_sana as string) ?? null, izoh: (p.izoh as string) ?? null, operationId: y.id });
  if (r.ok) return { ok: true };
  return { ok: false, qayta: vaqtinchalikXato(r.code), xato: ustaXatoMatni(r) };
}

/** fakt.write bor foydalanuvchi qoralamasiz — to'g'ridan-to'g'ri mavjud fakt yo'li (idempotent). */
export async function faktTogriYoz(y: NavbatYozuv): Promise<YuborNatija> {
  const p = y.payload;
  const r = await sbFaktYoz({ obyektId: y.obyektId, sana: String(p.sana), operationId: y.id, qatorlar: p.qatorlar as Array<{ qator_id: number; hajm: number }>, izoh: (p.izoh as string) ?? 'Telefondan (Bugun)' });
  if (r.ok) return { ok: true };
  return { ok: false, qayta: vaqtinchalikXato(r.code), xato: ustaXatoMatni(r) };
}
