/**
 * Bekor qilingan akt qatorlari (audit C m8): `t2_f2_tafsilot` bekor aktni ko'rsatmaydi — `t2_akt_qator` + smeta (tarix bilan)
 * dan faqat KO'RISH/hujjat uchun tafsilot shakli (qiymatlar aynan, qayta hisob yo'q).
 * Sof modul: F2 tarixi sahifasi ham, server hujjat dvigateli (functions/api/hujjat-yarat) ham shu yerdan foydalanadi.
 */
import type { T2AktReestr, T2Qator } from '../api/supabase';
import type { F2Tafsilot } from '../api/t2-narx';
import type { AktQatorXom } from '../api/f2-oylik-paket';

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function bekorQatorlari(akt: Pick<T2AktReestr, 'id' | 'obyekt_id' | 'kompaniya_id' | 'oy' | 'holat' | 'raqam' | 'yaratildi'>, aq: readonly AktQatorXom[], smeta: ReadonlyMap<number, T2Qator>): F2Tafsilot[] {
  return aq.map((q) => {
    const r = smeta.get(q.qator_id);
    const hajm = son(q.certified_quantity) ?? son(q.hajm);
    const narx = son(q.certified_unit_price) ?? son(q.narx);
    const summa = son(q.certified_amount) ?? son(q.summa);
    return {
      akt_id: akt.id, obyekt_id: akt.obyekt_id, kompaniya_id: akt.kompaniya_id, tur: 'f2', oy: akt.oy, akt_holat: akt.holat, raqam: akt.raqam,
      akt_kim: null, akt_sana: akt.yaratildi, akt_qator_id: q.id, qator_id: q.qator_id, kod: r?.kod ?? null, nom: r?.nom ?? null, birlik: r?.birlik ?? null,
      kat: r?.kat ?? null, qator_tur: r?.tur ?? null, hajm: hajm as number, narx, summa, izoh: null,
      certified_quantity: son(q.certified_quantity), certified_unit_price: son(q.certified_unit_price), certified_amount: son(q.certified_amount),
      gorunish_hajm: hajm, gorunish_narx: narx, gorunish_summa: summa,
    };
  });
}