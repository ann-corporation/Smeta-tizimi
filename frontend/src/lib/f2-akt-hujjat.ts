/**
 * Saqlangan (qoralama yoki TASDIQLANGAN) F2 aktini yangi Ф-2 shabloniga (`f2Hujjat`) tayyorlash
 * (egasi, 2026-10-02: "F2 tarixidagi tasdiqlangan akt ham yangi shablonda chiqsin").
 *
 * QONUN: tasdiqlangan hujjat — muzlatilgan tarix. Shablonga SERTIFIKATLANGAN qiymatlar (certified/gorunish)
 * aynan beriladi; hech narsa qayta hisoblanmaydi:
 *  • resurs hajmi "norma × ish hajmi" ga teng bo'lmasa — formula emas, qiymat (RESURS_CHEGARA) yoziladi;
 *  • summa "hajm × narx" dan farq qilsa — `f2Hujjat` qiymatni yozadi (ARIFMETIKA);
 *  • narxi yo'q resurs — narxsiz (ИТОГО bo'sh qoladi, 0 emas).
 */
import type { T2Qator } from '../api/supabase';
import type { F2Tafsilot } from '../api/t2-narx';
import { f2Qur, y6, type F2Bolim, type F2Holat, type F2Qator } from './f2-tayyor';

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const hajmi = (l: F2Tafsilot) => son(l.gorunish_hajm) ?? son(l.certified_quantity) ?? son(l.hajm) ?? 0;
const narxi = (l: F2Tafsilot) => son(l.gorunish_narx) ?? son(l.certified_unit_price) ?? son(l.narx);
const summasi = (l: F2Tafsilot) => son(l.gorunish_summa) ?? son(l.certified_amount) ?? son(l.summa);

export type F2AktKirish = { bolimlar: F2Bolim[]; qatorlar: F2Qator[]; topilmagan: number };

/** `rows` — obyekt smeta daraxti (norma, kat bilan), `lines` — shu aktning tafsilot qatorlari. */
export function f2AktKirish(rows: readonly T2Qator[], lines: readonly F2Tafsilot[]): F2AktKirish {
  const qator = new Map(rows.map((r) => [r.id, r]));
  const bor = lines.filter((l) => qator.has(l.qator_id));
  // f2Qur faqat "olish mumkin" qatorlarni tuzadi — aktdagi qatorlarni shunday belgilaymiz (qolganlari kirmaydi).
  const holat: F2Holat[] = bor.map((l) => ({ qator_id: l.qator_id, f2_mumkin_hajm: Math.max(hajmi(l), 1e-9) }));
  const bolimlar = f2Qur(rows as T2Qator[], holat);
  const blHajm = new Map<number, number>();
  for (const l of bor) if (qator.get(l.qator_id)?.tur === 'bl') blHajm.set(l.qator_id, hajmi(l));

  const qatorlar: F2Qator[] = bor.map((l) => {
    const r = qator.get(l.qator_id)!;
    const tur = (r.tur === 'bl' || r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob' ? r.tur : 'mat') as F2Qator['tur'];
    const ota = r.ota_id != null ? qator.get(r.ota_id) : undefined;
    const ishId = ota?.tur === 'bl' ? ota.id : null;
    const hajm = hajmi(l);
    if (tur === 'bl') return { id: r.id, ishId: null, tur, kat: null, nom: l.nom || r.nom || 'Nomsiz', birlik: l.birlik ?? r.birlik, hajm, narx: null, summa: null, manba: 'oldingi_f2', narxsiz: false };
    const narx = narxi(l);
    const summa = summasi(l);
    const q: F2Qator = { id: r.id, ishId, tur, kat: l.kat ?? r.kat, nom: l.nom || r.nom || 'Nomsiz', birlik: l.birlik ?? r.birlik, hajm, narx, summa, manba: 'oldingi_f2', narxsiz: narx == null };
    // Muzlatilgan hajm norma × ish hajmidan farq qilsa — formulaga bog'lanmaydi (Excel qayta hisoblab o'zgartirmasin).
    const norma = son((r as T2Qator & { norma?: number | null }).norma);
    const bh = ishId != null ? blHajm.get(ishId) : undefined;
    if (tur === 'rs' && norma != null && norma > 0 && (bh == null || Math.abs(y6(norma * bh) - hajm) > 1e-6)) q.ogoh = 'RESURS_CHEGARA';
    return q;
  });
  return { bolimlar, qatorlar, topilmagan: lines.length - bor.length };
}
