/**
 * YAXLIT AKT — «СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ» (subpudrat akti, varaq «ф-2»; T3, 2026-10-24).
 *
 * Bu F2 smeta shaklida emas: bitta (yoki bir necha) YAXLIT qator «сум» birligida, ustunlar: shartnoma qiymati,
 * bajarilish %% (boshidan / yil boshidan / shu davr), «ИТОГО БЕЗ НДС», НДС, «РАНЕЕ ОПЛАЧЕНО». Umumiy LRV o'quvchi bunday
 * varaqni noto'g'ri o'qirdi (shartnoma summasini shu davr summasi deb). Bu yerda:
 *   - davr ustunlari «в том числе за отчетный месяц» sarlavhasidan topiladi (% va сум);
 *   - qator hajmi = shu davr ULUSHI (0..1), narxi = shartnoma qiymati (QQSsiz), summa = ulush × narx = shu davr QQSsiz;
 *   - hujjat jami: ИТОГО БЕЗ НДС (pryamye), ИТОГО С НДС (vsego), НДС — shu davr ustunidan;
 *   - «РАНЕЕ ОПЛАЧЕНО (АВАНС)» to'lov, «ранее оформленным» emas — ranee ga yozilmaydi.
 * Hech narsa taxmin qilinmaydi: ustun yoki ИТОГО БЕЗ НДС qatori topilmasa — bu varaq bu yo'l bilan o'qilmaydi (null).
 */
import { kalit, son, xom } from './matn';
import type { F2Akt, F2Tugun } from './f2';
import type { Katak, KirishKitob, KirishVaraq, VaraqAnatomiyasi } from './turlar';

const SARLAVHA = /СПРАВКА[-\s]*СЧ[ЕЁ]Т[-\s]*ФАКТУРА/;
const SANA = /(\d{2})\.(\d{2})\.(20\d{2})/;

/** Varaq yaxlit akt shaklidami (sarlavhada «СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ»). */
export function yaxlitVaraqmi(v: KirishVaraq): boolean {
  return v.rows.slice(0, 8).some((row) => row.some((c) => SARLAVHA.test(kalit(c))));
}

const ol = (row: readonly Katak[], i: number): Katak => (i >= 0 ? row[i] ?? null : null);

export function yaxlitAkt(kitob: KirishKitob, v: KirishVaraq): F2Akt | null {
  const rows = v.rows;
  // Davr ustunlari: «в том числе за отчетный месяц» (sarlavha) + undagi pastki sarlavhalar (% va сум).
  let h = -1, c0 = -1;
  for (let r = 0; r < Math.min(rows.length, 60) && h < 0; r++) {
    const c = (rows[r] ?? []).findIndex((x) => /ЗА ОТЧ[ЕЁ]ТНЫЙ МЕСЯЦ/.test(kalit(x)));
    if (c >= 0) { h = r; c0 = c; }
  }
  if (h < 0) return null;
  const sub = rows[h + 1] ?? [];
  let pct = -1, sum = -1;
  for (let c = c0; c < c0 + 3; c++) {
    const t = kalit(sub[c]);
    if (/% К ОБЪЕМУ/.test(t)) pct = c;
    else if (/ТЕКУЩИХ ЦЕНАХ/.test(t)) sum = c;
  }
  // Shartnoma qiymati ustuni: «Стоимость в договорных текущих ценах» (Всего).
  const sarlRow = rows.slice(Math.max(0, h - 2), h + 1).find((row) => row.some((x) => /СТОИМОСТЬ В ДОГОВОРНЫХ/.test(kalit(x)))) ?? [];
  const shart = sarlRow.findIndex((x) => /СТОИМОСТЬ В ДОГОВОРНЫХ/.test(kalit(x)));
  if (pct < 0 || sum < 0 || shart < 0) return null;

  // Jami qatorlari (shu davr ustuni) va yaxlit qatorlar.
  let bez: { shart: number | null; pct: number | null; sum: number | null; qator: number } | null = null;
  let nds: number | null = null, vsego: number | null = null;
  const itemlar: Array<{ nom: string; birlik: string | null; shart: number; pct: number; qator: number }> = [];
  const nomUstun = 1;
  for (let r = h + 2; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const nom = xom(ol(row, nomUstun)).trim();
    const k = kalit(nom);
    if (/^ИТОГО БЕЗ НДС/.test(k)) { bez = { shart: son(ol(row, shart)), pct: son(ol(row, pct)), sum: son(ol(row, sum)), qator: r + 1 }; continue; }
    if (/^НДС/.test(k)) { nds = son(ol(row, sum)); continue; }
    if (/^ИТОГО С НДС/.test(k)) { vsego = son(ol(row, sum)); continue; }
    if (bez) continue;
    const tartib = ol(row, 0);
    const sh = son(ol(row, shart)), p = son(ol(row, pct));
    if (nom && typeof tartib === 'number' && Number.isInteger(tartib) && tartib > 0 && sh != null && p != null && !/^\d+$/.test(nom)) {
      itemlar.push({ nom, birlik: xom(ol(row, 2)).trim() || null, shart: sh, pct: p, qator: r + 1 });
    }
  }
  if (!bez || bez.sum == null || !itemlar.length) return null;

  // Qiymatlar: bitta yaxlit qator — ulush = shu davr QQSsiz / shartnoma QQSsiz (ИТОГО БЕЗ НДС qatoridan, aniq).
  // Bir necha qator — har birining o'z % i; narx QQSsiz shartnomaga moslab o'lchanadi (qator shartnomasi QQS bilan bo'lishi mumkin).
  const jamiShart = itemlar.reduce((s, x) => s + x.shart, 0);
  const olcham = bez.shart != null && jamiShart > 0 ? bez.shart / jamiShart : 1;
  const manzil = (qator: number, ustun: number) => ({ fayl: kitob.fayl, varaq: v.nom, qator, ustun: ustun + 1 });
  const tugunlar: F2Tugun[] = itemlar.map((x) => {
    const narx = itemlar.length === 1 && bez!.shart != null ? bez!.shart : x.shart * olcham;
    const hajm = itemlar.length === 1 && bez!.shart != null && bez!.shart > 0 ? bez!.sum! / bez!.shart : x.pct;
    return {
      uid: `${v.nom}!${x.qator}`, tur: 'bl', kod: null, nom: x.nom, birlik: x.birlik ?? 'сум', hajm, narx,
      summa: itemlar.length === 1 ? bez!.sum : Math.round(hajm * narx * 100) / 100,
      manzil: manzil(x.qator, sum), yol: [], bolalar: [], barg: true,
    };
  });
  const qatorlarJami = tugunlar.reduce((s, t) => s + (t.summa ?? 0), 0);

  // Davr: hujjatdagi sanalar ichidan oxirgisi («по» — hisobot davri tugashi).
  let davr: string | null = null, davrMatn: string | null = null;
  for (let r = 14; r < Math.min(rows.length, h); r++) {
    for (const c of rows[r] ?? []) {
      const m = xom(c).match(SANA);
      if (m) { davr = `${m[3]}-${m[2]}`; davrMatn = xom(c).trim(); }
    }
  }
  const hujjatSarlavhasi = rows.slice(0, 20).flatMap((row) => row.map((c) => xom(c).trim())).find((t) => /^ДОГОВОР/i.test(t)) ?? null;
  const anat: VaraqAnatomiyasi = {
    fayl: kitob.fayl, varaq: v.nom, rol: 'lrv',
    rolDalil: [{ qoida: 'spravka_schet_faktura', ishonch: 'yuqori', izoh: 'СПРАВКА-СЧЕТ-ФАКТУРА: yaxlit akt, davr ustuni «за отчетный месяц»' }],
    ustunlar: null, titul: [], sarlavhalar: [], ishlar: [], vedomost: [], jamilar: [], review: [],
  };
  return {
    fayl: kitob.fayl, varaq: v.nom, hujjatSarlavhasi, davr, davrMatn, daraxt: tugunlar,
    jami: { pryamye: bez.sum, vsego, ranee: null, raznica: null, nds },
    qatorlarJami, barglarSoni: tugunlar.length, ishlarSoni: tugunlar.length,
    ogohlantirishlar: davr ? [] : [{ kod: 'DAVR_YOQ', izoh: 'hisobot davri (oy, yil) fayldan topilmadi — qo‘lda tanlang' }],
    anatomiya: anat,
  };
}
