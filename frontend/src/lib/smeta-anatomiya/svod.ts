import { kalit, son, toliqUstunlar, xom } from './matn';
import { sarlavhaBlokiniTop, tartibRaqamlariQatorimi } from './ustun';
import { formulaHavolalari } from './erkin';
import type {
  KirishKitob, KirishVaraq, Manzil, ReviewBand, SvodQatori, SvodQatorTuri, SvodQiymat, SvodVaraq, VaraqAnatomiyasi,
} from './turlar';

/**
 * Svod (ABC4 `*_CB_DET2_*` "Сводный расчет по статьям затрат") — obyekt →
 * lokal smetalar ro'yxati. STR LRV da obyekt darajasi yo'q; u faqat shu yerda.
 *
 *   ИСКУССТВЕННАЯ ОЗЕРА                                  ← obyekt (faqat A)
 *   01-01 | 13.08.2026 | КОНСТРУКТИВНАЯ ЧАСТЬ-ОЗЕРА | 27663.16   ← lokal + чел-ч
 *   ИТОГО | 34126.28
 */
export interface SvodSmeta {
  obyekt: string;
  obyektManzil: Manzil;
  raqam: string;          // "01-01", asl matn
  nom: string;            // asl matn
  chelSoat: number | null;
  manzil: Manzil;
}

export function svodniOqi(fayl: string, varaq: KirishVaraq): SvodSmeta[] {
  const rows = varaq.rows;
  const blok = sarlavhaBlokiniTop(rows);
  if (!blok) return [];
  const s = blok.sarlavhalar;
  const nomU = s.findIndex((h) => /НАИМЕНОВАНИЕ ОБЪЕКТОВ И СМЕТ/.test(h));
  const trudU = s.findIndex((h) => /ЗАТРАТЫ ТРУДА/.test(h));
  if (nomU < 0) return [];
  const raqamU = 0;
  const chiq: SvodSmeta[] = [];
  let obyekt: { xom: string; manzil: Manzil } | null = null;
  for (let r = blok.malumotBoshi; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const toliq = toliqUstunlar(row);
    if (!toliq.length) continue;
    const birinchi = xom(row[toliq[0]]);
    if (/^(ИТОГО|ВСЕГО)/.test(kalit(birinchi)) || /^(ИТОГО|ВСЕГО)/.test(kalit(row[nomU]))) continue;
    const nom = xom(row[nomU]);
    if (toliq.length === 1 && toliq[0] < nomU) {
      obyekt = { xom: birinchi, manzil: { fayl, varaq: varaq.nom, qator: r + 1, ustun: toliq[0] + 1 } };
      continue;
    }
    if (!obyekt || !nom) continue;
    chiq.push({
      obyekt: obyekt.xom, obyektManzil: obyekt.manzil,
      raqam: xom(row[raqamU]), nom,
      chelSoat: trudU >= 0 ? son(row[trudU]) : null,
      manzil: { fayl, varaq: varaq.nom, qator: r + 1, ustun: nomU + 1 },
    });
  }
  return chiq;
}

// ─── Moddali svod (C4 PR-1, 2026-10-26) ──────────────────────────────────────

/**
 * Moddali svod: `сводн.`/`Лист1`/`Форма` (yo'l: «НАИМЕНОВАНИЕ ЗАТРАТ | Цена»), `_СТАРТ` (PTO-UZ, ko'p obyekt ustuni),
 * ekspertiza `свод` («Наименование смет | Трудозатраты | … | Всего с НДС (тыс.сум)») va `сводн` (bitta ustun, тыс. сум).
 *
 * Qoidalar: har qator asl matni va manzili bilan; bo'sh katak — qiymat emas (NULL ≠ 0); ming so'm masshtabi va НДС
 * holati ustun sarlavhasidan (yoki formula o'qigan boshqa svod ustunidan) olinadi — taxmin qilinmaydi. Svod qatorlari
 * smetaga AVTOMATIK qo'shilmaydi: `holat: 'kutmoqda'`, operator tanlaydi (egasi: «tashqi qoidani egasiz joriy qilma»).
 */
const SVOD_NOM = /НАИМЕНОВАНИЕ\s+(ЗАТРАТ|СМЕТ)|НАИМЕНОВАН/;
const IMZO_SVOD = /^(СОСТАВИЛ|ПРОВЕРИЛ|TUZDI|TEKSHIRDI|ГИП|ИСП\b|ИСПОЛНИТЕЛЬ|MP\b)/;
const XAT = /ПИСЬМ|\bХАТ(И|ИГА)?\b|\bXAT(I|IGA)?\b/;
const XAT_RAQAM = /№\s*([0-9][0-9\-/]*)/;
const SANA = /(\d{2}\.\d{2}\.\d{4})/;

function harfli(v: unknown): v is string {
  return typeof v === 'string' && /[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]{2,}/.test(v);
}

function ustunMasshtabi(sarlavha: string, varaqMingda: boolean): SvodQiymat['masshtab'] {
  if (/ЧЕЛ|ЧАС|%/.test(sarlavha) && !/СУМ/.test(sarlavha)) return null;
  if (/ТЫС/.test(sarlavha)) return 1000;
  if (/СУМ|ЦЕНА|СТОИМ|СУММА|ЗАТРАТ/.test(sarlavha)) return varaqMingda && !/\(СУМ\)/.test(sarlavha) ? 1000 : 1;
  return varaqMingda ? 1000 : null;
}

function ustunNds(sarlavha: string): boolean | null {
  if (/БЕЗ\s+НДС/.test(sarlavha)) return false;
  if (/С\s+НДС/.test(sarlavha)) return true;
  return null;
}

function svodQatorTuri(yorliq: string, svodSmetalar: boolean, foiz: boolean): SvodQatorTuri {
  const k = kalit(yorliq);
  if (XAT.test(k) && XAT_RAQAM.test(k)) return 'xat_lumpsum';
  if (/^(ЗАЯВЛЕН|СНИЖЕН|ЗАВЫШЕН|ЭКОНОМ|ФАРҚ|FARQ)/.test(k)) return 'snijenie';
  if (/^НДС/.test(k)) return 'nds';
  if (/^(ИТОГО|ВСЕГ|ЖАМИ|JAMI)/.test(k)) return 'jami';
  if (/ЗАКАЗЧИК|ШАФФОФ|КАДАСТР|ПРОЕКТН/.test(k)) return 'buyurtmachi_xarajati';
  if (foiz) return 'foiz';
  return svodSmetalar ? 'lokal' : 'modda';
}

/** «-18,0%», «0,4% С К=0,8», «НДС -12%», «0,35 %» → {foiz, koef}. */
function foizOl(yorliq: string, formula?: string): SvodQatori['foiz'] | undefined {
  const k = kalit(yorliq);
  const m = k.match(/(\d+(?:[.,]\d+)?)\s*%/);
  // `\b` kirill harfida ishlamaydi — chegara bo'sh joy / qavs / satr boshi bilan.
  const kf = k.match(/(?:^|[\s,(])[КK]\s*=\s*(\d+(?:[.,]\d+)?)/);
  if (m) {
    return {
      foiz: Number(m[1].replace(',', '.')), koef: kf ? Number(kf[1].replace(',', '.')) : null,
      dalil: `yorliqda «${m[0].trim()}»${kf ? ` va «${kf[0].trim()}»` : ''}`,
    };
  }
  const fm = formula?.match(/\*\s*(0[.,]\d+)\s*$/);
  if (fm) return { foiz: Math.round(Number(fm[1].replace(',', '.')) * 1e6) / 1e4, koef: null, dalil: `formula: ${formula!.slice(0, 40)}` };
  return undefined;
}

/** Varaq yoki kitob ichidagi НДС stavkasi: «НДС 12%» yorlig'i yoki «с НДС» qatori/ustunidagi `*1.12` formulasi. */
function ndsStavkasi(v: KirishVaraq, sarlavhalar: readonly string[]): SvodVaraq['nds'] {
  for (let r = 0; r < v.rows.length; r++) {
    const row = v.rows[r] ?? [];
    const yorliq = row.find(harfli);
    const k = kalit(yorliq ?? '');
    const m = /^НДС/.test(k) ? k.match(/(\d+(?:[.,]\d+)?)\s*%/) : null;
    if (m) return { stavka: Number(m[1].replace(',', '.')) / 100, dalil: `${v.nom}!${r + 1}: «${xom(yorliq)}»` };
    for (let c = 0; c < row.length; c++) {
      const f = v.formulalar?.[r]?.[c];
      if (!f) continue;
      const fm = f.match(/\*\s*1[.,](\d{1,2})\s*$/);
      if (fm && (/С\s+НДС/.test(k) || /С\s+НДС/.test(sarlavhalar[c] ?? ''))) {
        return { stavka: Number(`0.${fm[1]}`), dalil: `${v.nom}!${r + 1}: «с НДС» = ${f.slice(0, 30)}` };
      }
    }
  }
  return null;
}

/** Bitta moddali svod varag'i. Nom ustuni («Наименование затрат/смет») topilmasa — null. */
export function moddaliSvodniOqi(fayl: string, v: KirishVaraq): SvodVaraq | null {
  const blok = sarlavhaBlokiniTop(v.rows);
  if (!blok) return null;
  const s = [...blok.sarlavhalar];
  const nomU = s.findIndex((h) => SVOD_NOM.test(h));
  if (nomU < 0) return null;
  const tartibU = s.findIndex((h) => /^(№|N П|NN|№№)|^N$/.test(h));
  const titul = v.rows.slice(0, blok.bosh).flatMap((row) => row.map(kalit)).join(' ');
  const varaqMingda = /ТЫС/.test(titul) || s.some((h) => /ТЫС/.test(h) && /СТОИМ|СУММ|ЦЕНА/.test(h));
  const svodSmetalar = /СМЕТ/.test(s[nomU]) && !/ЗАТРАТ/.test(s[nomU]);
  // Asosiy summa ustuni: «Всего … с НДС» → «Цена/Стоимость/Сумма» → birinchi pul ustuni.
  const asosiyU = [/ВСЕГО.*С\s+НДС/, /ЦЕНА|СТОИМ|СУММА/].map((n) => s.findIndex((h, i) => i !== nomU && n.test(h))).find((i) => i >= 0) ?? -1;
  const review: ReviewBand[] = [];
  const qatorlar: SvodQatori[] = [];
  const manzil = (r: number, c?: number): Manzil => ({ fayl, varaq: v.nom, qator: r + 1, ...(c != null && c >= 0 ? { ustun: c + 1 } : {}) });
  for (let r = blok.malumotBoshi; r < v.rows.length; r++) {
    const row = v.rows[r] ?? [];
    const toliq = toliqUstunlar(row);
    if (!toliq.length || tartibRaqamlariQatorimi(row)) continue;
    // Ustun raqamlari qatori «1 | 2 | 3 | дор.ч | орош. | светоф.» (yo'l `Форма`): ma'lumot emas — o'ngdagi matnlar
    // o'sha ustunlarning sarlavhasi (bo'lim nomlari) sifatida qo'shiladi.
    const raqamlar = toliq.filter((i) => typeof row[i] === 'number');
    if (raqamlar.length >= 2 && raqamlar.every((i, k) => row[i] === k + 1) && !harfli(row[nomU])) {
      for (const i of toliq) if (harfli(row[i])) s[i] = [s[i], kalit(row[i])].filter(Boolean).join(' ');
      continue;
    }
    const yorliqU = harfli(row[nomU]) ? nomU : toliq.find((i) => harfli(row[i])) ?? -1;
    const sonliU = toliq.filter((i) => typeof row[i] === 'number' && i !== tartibU);
    if (yorliqU < 0) {
      if (sonliU.length) review.push({ kod: 'svod_yorliqsiz_qator', izoh: `svod qatorida yorliq yo'q, faqat sonlar — o'qilmadi`, manzil: manzil(r) });
      continue;
    }
    const yorliq = xom(row[yorliqU]);
    if (IMZO_SVOD.test(kalit(yorliq))) break;
    const qiymatlar: SvodQiymat[] = sonliU.filter((i) => i !== yorliqU).map((i) => {
      const sar = s[i] ?? '';
      const f = v.formulalar?.[r]?.[i] ?? undefined;
      return { ustun: i + 1, sarlavha: sar, qiymat: row[i] as number, masshtab: ustunMasshtabi(sar, varaqMingda), ndsBilan: ustunNds(sar), ...(f ? { formula: f } : {}) };
    });
    const pul = qiymatlar.filter((q) => q.masshtab != null);
    const summa = (asosiyU >= 0 ? qiymatlar.find((q) => q.ustun === asosiyU + 1) : undefined) ?? pul[0] ?? null;
    const tartibK = tartibU >= 0 && tartibU !== yorliqU ? xom(row[tartibU]) : '';
    const foiz = foizOl(yorliq, summa?.formula);
    const tur = svodQatorTuri(yorliq, svodSmetalar, !!foiz && !/^(ИТОГО|ВСЕГ)/.test(kalit(yorliq)));
    const q: SvodQatori = { tur, xom: yorliq, tartib: tartibK || null, manzil: manzil(r, yorliqU), qiymatlar, summa };
    if (foiz && (tur === 'foiz' || tur === 'nds' || tur === 'buyurtmachi_xarajati')) q.foiz = foiz;
    if (tur === 'xat_lumpsum') {
      const k = kalit(yorliq);
      q.xat = { raqam: k.match(XAT_RAQAM)![1], sana: k.match(SANA)?.[1] ?? null };
      if (!summa) review.push({ kod: 'svod_xat_summasiz', izoh: `«${yorliq.slice(0, 60)}» — xat qatori, lekin summasi yo'q`, manzil: manzil(r) });
    }
    const havola = summa?.formula ? formulaHavolalari(summa.formula)[0] : undefined;
    if (havola) q.bogLanish = havola;
    qatorlar.push(q);
  }
  return { fayl, varaq: v.nom, shakl: 'modda', qatorlar, nds: ndsStavkasi(v, s), review, holat: 'kutmoqda' };
}

function katakIndeks(katak: string): { r: number; c: number } | null {
  const m = katak.match(/^([A-Z]{1,3})(\d+)$/);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

/**
 * Kitobdagi barcha svod varaqlari. ABC4 CB_DET2 (obyekt → lokal ro'yxati) — `obyekt_royxati` (qatorlari `svodniOqi` da).
 * Kitob grafi (formula): `сводн!C16 = свод!O20` — НДС holati noma'lum qiymat o'qilgan svod ustunidan olinadi; НДС stavkasi
 * varaqda topilmasa — shu kitobning boshqa svod varag'idan (dalili bilan).
 */
export function svodVaraqlari(kitob: KirishKitob, anat: readonly VaraqAnatomiyasi[]): SvodVaraq[] {
  const chiq: SvodVaraq[] = [];
  kitob.varaqlar.forEach((v, j) => {
    if (anat[j]?.rol !== 'svod') return;
    if (svodniOqi(kitob.fayl, v).length) {
      chiq.push({ fayl: kitob.fayl, varaq: v.nom, shakl: 'obyekt_royxati', qatorlar: [], nds: null, review: [], holat: 'kutmoqda' });
      return;
    }
    const m = moddaliSvodniOqi(kitob.fayl, v);
    if (m) chiq.push(m);
  });
  const boyicha = new Map<string, SvodVaraq>(chiq.map((x): [string, SvodVaraq] => [x.varaq, x]));
  for (const sv of chiq) {
    for (const q of sv.qatorlar) {
      if (q.bogLanish && q.bogLanish.varaq !== sv.varaq && boyicha.has(q.bogLanish.varaq)) {
        const idx = katakIndeks(q.bogLanish.katak);
        const mq = idx ? boyicha.get(q.bogLanish.varaq)!.qatorlar.find((x) => x.manzil.qator === idx.r + 1) : undefined;
        if (mq) q.nusxa = { varaq: q.bogLanish.varaq, qator: mq.manzil.qator };
      }
      for (const qi of q.qiymatlar) {
        if (qi.ndsBilan != null || !qi.formula) continue;
        const h = formulaHavolalari(qi.formula);
        if (h.length !== 1) continue;
        const manba = boyicha.get(h[0].varaq);
        const idx = katakIndeks(h[0].katak);
        if (!manba || !idx) continue;
        const mq = manba.qatorlar.find((x) => x.manzil.qator === idx.r + 1);
        const mqi = mq?.qiymatlar.find((x) => x.ustun === idx.c + 1);
        if (mqi?.ndsBilan != null) qi.ndsBilan = mqi.ndsBilan;
      }
    }
  }
  const kitobNds = chiq.find((x) => x.nds)?.nds ?? null;
  for (const sv of chiq) if (!sv.nds && kitobNds && sv.shakl === 'modda') sv.nds = { stavka: kitobNds.stavka, dalil: `kitob: ${kitobNds.dalil}` };
  return chiq;
}
