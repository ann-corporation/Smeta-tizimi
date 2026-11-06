/**
 * Saqlangan (qoralama yoki TASDIQLANGAN) F2 aktini yangi Ф-2 shabloniga (`f2Hujjat`) tayyorlash
 * (egasi, 2026-10-02: "F2 tarixidagi tasdiqlangan akt ham yangi shablonda chiqsin").
 *
 * QONUN: tasdiqlangan hujjat — muzlatilgan tarix. Shablonga SERTIFIKATLANGAN qiymatlar (certified/gorunish)
 * aynan beriladi; hech narsa qayta hisoblanmaydi:
 *  • resurs hajmi "norma × ish hajmi" ga teng bo'lmasa — formula emas, qiymat (RESURS_CHEGARA) yoziladi;
 *  • summa "hajm × narx" dan farq qilsa — `f2Hujjat` qiymatni yozadi (ARIFMETIKA);
 *  • narxi yo'q resurs — narxsiz (ИТОГО bo'sh qoladi, 0 emas).
 *
 * Audit C (2026-11-06):
 *  • B1 — aktdagi HAR qator hujjat tuzilmasiga kiradi: minus (storno emas) qator ham, hajmi 0 summali qator ham
 *    (avval `f2Qur` «qoldig'i nol» deb tashlardi — Excel'dan yo'qolardi, yadro bahosi esa sanardi);
 *  • B3 — BARG ish (smetada bolasi yo'q bl: resurssiz ish, М/К) o'z summasi bilan qiymat qatori (server barg qoidasi
 *    `_t2_summa_paket_v1`: bolasi bor qator o'z summasini sanamaydi; F3 «bolalarsiz ish» bilan bir xil);
 *  • M13 — resursning ishi aktda bo'lmasa ham ish tuzilmaga kiradi (resurs `f2Hujjat` da mustaqil qator);
 *  • m4 — hajmi noma'lum (NULL) qator 0 deb ko'rsatilmaydi: `hajmNomalum` belgisi (hujjatda katak bo'sh).
 */
import type { T2Qator } from '../api/supabase';
import type { F2Tafsilot } from '../api/t2-narx';
import { f2Qur, y6, type F2Bolim, type F2Holat, type F2Qator } from './f2-tayyor';

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
/** Hajm: noma'lum bo'lsa null (NULL ≠ 0). */
const hajmi = (l: F2Tafsilot) => son(l.gorunish_hajm) ?? son(l.certified_quantity) ?? son(l.hajm);
const narxi = (l: F2Tafsilot) => son(l.gorunish_narx) ?? son(l.certified_unit_price) ?? son(l.narx);
const summasi = (l: F2Tafsilot) => son(l.gorunish_summa) ?? son(l.certified_amount) ?? son(l.summa);

/** Saqlangan akt qatori: `hajmNomalum` — hujjat hajmi NULL (hujjatda katak bo'sh, summa qiymat sifatida). */
export type F2AktQator = F2Qator & { hajmNomalum?: true };

export type F2AktKirish = { bolimlar: F2Bolim[]; qatorlar: F2AktQator[]; topilmagan: number };

/** Smetada bolasi bor qatorlar (ota id lari) — barg qoidasi uchun. */
export function otaIdlari(rows: Iterable<Pick<T2Qator, 'ota_id'>>): Set<number> {
  const s = new Set<number>();
  for (const r of rows) if (r.ota_id != null) s.add(r.ota_id);
  return s;
}

/** `rows` — obyekt smeta daraxti (norma, kat bilan; eski versiya qatorlari ham), `lines` — shu aktning tafsilot qatorlari. */
export function f2AktKirish(rows: readonly T2Qator[], lines: readonly F2Tafsilot[]): F2AktKirish {
  const qator = new Map(rows.map((r) => [r.id, r]));
  const otalar = otaIdlari(rows);
  const bor = lines.filter((l) => qator.has(l.qator_id));
  /* f2Qur faqat «olish mumkin» (qoldig'i nolga teng emas) qatorlarni tuzadi. Aktdagi har qatorni (va resursning ishini)
   * majburan belgilaymiz: minus qator — manfiy fakt (chegirma yo'li), qolgani — musbat belgi. Qiymat faqat tuzilma uchun:
   * hujjatdagi hajm/narx/summa pastda aktning o'z qatoridan olinadi. */
  const holat: F2Holat[] = [];
  const belgilangan = new Set<number>();
  const belgila = (id: number, minus: boolean) => {
    if (belgilangan.has(id)) return;
    belgilangan.add(id);
    holat.push(minus ? { qator_id: id, fakt_hajm: -1 } : { qator_id: id, f2_mumkin_hajm: 1 });
  };
  for (const l of bor) {
    const h = hajmi(l);
    belgila(l.qator_id, h != null && h < 0);
    const r = qator.get(l.qator_id)!;
    const ota = r.ota_id != null ? qator.get(r.ota_id) : undefined;
    if (ota?.tur === 'bl') belgila(ota.id, false);
  }
  const bolimlar = f2Qur(rows as T2Qator[], holat);
  const blHajm = new Map<number, number>();
  for (const l of bor) if (qator.get(l.qator_id)?.tur === 'bl') blHajm.set(l.qator_id, hajmi(l) ?? 0);

  const qatorlar: F2AktQator[] = bor.map((l) => {
    const r = qator.get(l.qator_id)!;
    const tur = (r.tur === 'bl' || r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob' ? r.tur : 'mat') as F2Qator['tur'];
    const ota = r.ota_id != null ? qator.get(r.ota_id) : undefined;
    const ishId = ota?.tur === 'bl' ? ota.id : null;
    const h0 = hajmi(l);
    const hajm = h0 ?? 0;
    const nomalum = h0 == null ? { hajmNomalum: true as const } : {};
    if (tur === 'bl') {
      const summa = summasi(l);
      // Barg ish (smetada bolasi yo'q) — o'z summasi pul qatori (server/F3 bilan bir xil). Bolasi bor ish — faqat hajm.
      if (!otalar.has(r.id) && summa != null) {
        const narx = narxi(l);
        return { id: r.id, ishId: null, tur, kat: l.kat ?? r.kat, nom: l.nom || r.nom || 'Nomsiz', birlik: l.birlik ?? r.birlik, hajm, narx, summa, manba: 'oldingi_f2', narxsiz: false, ...nomalum };
      }
      return { id: r.id, ishId: null, tur, kat: null, nom: l.nom || r.nom || 'Nomsiz', birlik: l.birlik ?? r.birlik, hajm, narx: null, summa: null, manba: 'oldingi_f2', narxsiz: false, ...nomalum };
    }
    const narx = narxi(l);
    const summa = summasi(l);
    const q: F2AktQator = { id: r.id, ishId, tur, kat: l.kat ?? r.kat, nom: l.nom || r.nom || 'Nomsiz', birlik: l.birlik ?? r.birlik, hajm, narx, summa, manba: 'oldingi_f2', narxsiz: narx == null && summa == null, ...nomalum };
    // Muzlatilgan hajm norma × ish hajmidan farq qilsa — formulaga bog'lanmaydi (Excel qayta hisoblab o'zgartirmasin).
    const norma = son((r as T2Qator & { norma?: number | null }).norma);
    const bh = ishId != null ? blHajm.get(ishId) : undefined;
    if (tur === 'rs' && (h0 == null || (norma != null && norma > 0 && (bh == null || Math.abs(y6(norma * bh) - hajm) > 1e-6)))) q.ogoh = 'RESURS_CHEGARA';
    return q;
  });
  return { bolimlar, qatorlar, topilmagan: lines.length - bor.length };
}
