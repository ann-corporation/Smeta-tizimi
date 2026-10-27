/**
 * 1C akt-sverka → import REJASI (preview): shartnomani topish, takrorni ajratish, yo'qolgan/o'zgargan yozuvlar, saldo solishtiruvi.
 * Sof funksiyalar — UI va testlar bir xil hisobni ishlatadi. Yozish faqat operator «Yozish» bosganda (api/t2-sverka-import).
 *
 * Takror kaliti: to'lov — (shartnoma, sana, bank hujjat №, summa, tur); sotuv — (shartnoma, sana, raqam, summa).
 * Bir xil bank № turli shartnomalarda turli summa bilan uchraydi — faqat № bo'yicha dedup QILINMAYDI.
 * operation_id — kalitdan barqaror UUID: qayta yuklash/qayta yuborish ikkinchi yozuv yaratmaydi.
 */
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { tolovTiyin, tiyin, type TolovTur } from '../nakopitelniy-svod';
import type { SverkaBlok, SverkaFayl, SverkaQator } from './tahlil';
import type { MoslashShartnoma, TizimShartnoma } from './turlar';

/* ───────────── barqaror UUID (idempotentlik) ───────────── */

/** Matndan deterministik 128-bit xesh → UUID (versiya 5 shaklida; kriptografik emas, faqat idempotentlik kaliti). */
export function barqarorUuid(kalit: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < kalit.length; i++) {
    const k = kalit.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  const hex = [h1, h2, h3, h4].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) & 3]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/* ───────────── shartnoma raqamini moslash ───────────── */

/** «№3 (28.05.2025)», «дог. №ЯНШСХК 1/1 от 18.04.2025 г.» → «3», «яншсхк1/1» (lotin/kirill, bo'shliq, «№», sana farqisiz). */
export function shartnomaKaliti(s: string | null | undefined): string {
  return qidiruvKaliti(String(s ?? '')
    .replace(/^\s*дог(овор)?\.?\s*/i, '')
    .replace(/\(\s*\d{1,2}\.\d{1,2}\.\d{2,4}\s*\)/g, '')
    .replace(/\s+от\s+\d{1,2}\.\d{1,2}\.\d{2,4}.*$/i, '')
    .replace(/№/g, ''))
    .replace(/[\s.,"«»'()-]/g, '');
}

export function blokKaliti(b: Pick<SverkaBlok, 'raqam' | 'sarlavha' | 'asosiyDogovor'>): string {
  if (b.asosiyDogovor) return 'asosiy-dogovor';
  return b.raqam ? shartnomaKaliti(b.raqam) : qidiruvKaliti(b.sarlavha).slice(0, 80);
}

/** Avtomatik topish: normallashgan raqam aynan teng bo'lgan YAGONA shartnoma. Bir nechta yoki yo'q — null (operator tanlaydi). */
export function shartnomaTop(b: Pick<SverkaBlok, 'raqam' | 'sarlavha' | 'asosiyDogovor'>, shartnomalar: readonly Pick<TizimShartnoma, 'id' | 'raqam'>[]): number | null {
  if (b.asosiyDogovor || !b.raqam) return null;
  const k = shartnomaKaliti(b.raqam);
  const mos = shartnomalar.filter((s) => shartnomaKaliti(s.raqam) === k);
  return mos.length === 1 ? mos[0].id : null;
}

/* ───────────── reja ───────────── */

export type ImportTur = 'sotuv' | 'tolov' | 'qaytarim';
export type ImportHolat = 'yangi' | 'tizimda_bor' | 'faylda_takror' | 'shartnoma_yoq' | 'tushunilmadi';
export type ImportYozuv = {
  kalit: string; operationId: string;
  tur: ImportTur | 'nomalum';
  blokKalit: string; shartnomaId: number | null;
  sana: string; summa: number; raqam: string | null; hujjat: string;
  fayl: string; qator: number; hujjatSanaXato: boolean;
  holat: ImportHolat; tizimId: number | null;
};
export type BlokReja = {
  kalit: string; sarlavha: string; raqam: string | null; shartnomaId: number | null; avto: boolean;
  /** Sarlavhadagi shartnoma summasi (fayllar ichida eng kattasi), tiyin. */
  sarlavhaSumma: number | null;
};
export type YoqolganYozuv = {
  tur: 'sotuv' | 'tolov'; id: number; shartnomaId: number; sana: string; summa: number; raqam: string | null; versiya: number; fayl: string;
};
export type SaldoQator = {
  fayl: string; blokKalit: string; sarlavha: string; shartnomaId: number | null; davrDan: string | null; davrGacha: string | null;
  /** Fayldagi (tiyin; «+» buyurtmachi qarzi). */
  faylBoshlangich: number; faylYakuniy: number | null; faylIchkiMos: boolean | null;
  /** Tizimda import qilingandan keyin (mavjud + yangi; yo'qolganlar hali bekor qilinmagan). Shartnoma topilmasa — null. */
  tizimBoshlangich: number | null; tizimYakuniy: number | null;
  mos: boolean | null;
  /** Fayl boshlang'ich − tizim boshlang'ich = yo'qolgan yozuvlar nettosi: 1C da sana oldingi davrga ko'chgan. */
  sanaKochganBolishiMumkin: boolean;
};
export type FaylJami = { fayl: string; davrDan: string | null; davrGacha: string | null; yakuniy: number | null; bloklarYakuniy: number; korsatilmagan: number | null };
export type ShartnomaOgoh = { shartnomaId: number; kod: 'TOLOV_SHARTNOMADAN_OSHDI'; tolangan: number; shartnoma: number; manba: 'sarlavha' | 'tizim' };
export type ImportReja = {
  bloklar: BlokReja[];
  yozuvlar: ImportYozuv[];
  yoqolgan: YoqolganYozuv[];
  saldo: SaldoQator[];
  faylJami: FaylJami[];
  ogohlantirishlar: ShartnomaOgoh[];
  ogohMatnlar: string[];
  soni: { yangiTolov: number; yangiSotuv: number; bor: number; takror: number; shartnomaYoq: number; tushunilmadi: number; yangiTolovSumma: number; yangiSotuvSumma: number };
};

export type YuklanganFayl = { nom: string; tahlil: SverkaFayl };

const ichida = (s: string, dan: string | null, gacha: string | null) => (!dan || s >= dan) && (!gacha || s <= gacha);

export function yozuvKaliti(shKalit: string, tur: ImportTur, sana: string, raqam: string | null, summa: number): string {
  return tur === 'sotuv' ? `${shKalit}|sotuv|${sana}|${raqam ?? ''}|${summa}` : `${shKalit}|${tur}|${sana}|${raqam ?? ''}|${summa}`;
}

/**
 * Reja: fayllar (bir yoki bir nechta, davrlari ustma-ust bo'lishi mumkin) + tizim holati + operator tanlovi (blokKalit → shartnoma).
 */
export function importReja(fayllar: readonly YuklanganFayl[], tizim: { shartnomalar: readonly TizimShartnoma[]; moslash: readonly MoslashShartnoma[] },
  tanlov: Readonly<Record<string, number | null>> = {}): ImportReja {
  const bloklar = new Map<string, BlokReja>();
  for (const f of fayllar) for (const b of f.tahlil.bloklar) {
    const k = blokKaliti(b);
    const avtoId = shartnomaTop(b, tizim.shartnomalar);
    const tanlangan = Object.prototype.hasOwnProperty.call(tanlov, k) ? tanlov[k] : undefined;
    const bor = bloklar.get(k);
    if (bor) { if (b.summa != null && (bor.sarlavhaSumma == null || b.summa > bor.sarlavhaSumma)) bor.sarlavhaSumma = b.summa; continue; }
    bloklar.set(k, { kalit: k, sarlavha: b.sarlavha, raqam: b.raqam, shartnomaId: tanlangan !== undefined ? tanlangan : avtoId, avto: tanlangan === undefined && avtoId != null, sarlavhaSumma: b.summa });
  }
  const moslash = new Map(tizim.moslash.map((m) => [m.id, m]));

  // Tizimdagi mavjud yozuvlar kalitlari
  const tizimKalit = new Map<string, number>();
  for (const m of tizim.moslash) {
    for (const t of m.tolovlar) tizimKalit.set(yozuvKaliti(String(m.id), t.tur === 'avans' ? 'tolov' : t.tur, t.sana.slice(0, 10), t.hujjat_raqam, tiyin(t.summa)), t.id);
    for (const f of m.f3) tizimKalit.set(yozuvKaliti(String(m.id), 'sotuv', f.sotuv_sana.slice(0, 10), f.raqam, tiyin(f.sotuv_summa)), f.id);
  }
  // Raqamsiz (qo'lda kiritilgan) to'lovlar: sana + summa + tur mos kelsa — tizimda bor deb hisoblanadi (ikki marta yozilmasin).
  const raqamsiz = new Map<string, number>();
  for (const m of tizim.moslash) for (const t of m.tolovlar) if (!t.hujjat_raqam) raqamsiz.set(`${m.id}|${t.tur === 'avans' ? 'tolov' : t.tur}|${t.sana.slice(0, 10)}|${tiyin(t.summa)}`, t.id);

  const yozuvlar: ImportYozuv[] = [];
  const korilgan = new Set<string>();
  const faylKalitlar = new Map<string, Set<string>>(); // fayl → shu fayldagi kalitlar (yo'qolganni topish uchun)
  for (const f of fayllar) {
    const fk = new Set<string>();
    faylKalitlar.set(f.nom, fk);
    for (const b of f.tahlil.bloklar) {
      const bk = blokKaliti(b);
      const shId = bloklar.get(bk)?.shartnomaId ?? null;
      const shKalit = shId != null ? String(shId) : `b:${bk}`;
      for (const q of b.qatorlar) {
        const tur: ImportTur | 'nomalum' = q.tur === 'nomalum' ? 'nomalum' : q.tur;
        const kalit = tur === 'nomalum' ? `${shKalit}|nomalum|${f.nom}|${q.qator}` : yozuvKaliti(shKalit, tur, q.sana, q.raqam, q.summa);
        fk.add(kalit);
        let holat: ImportHolat; let tizimId: number | null = null;
        if (tur === 'nomalum') holat = 'tushunilmadi';
        else if (korilgan.has(kalit)) holat = 'faylda_takror';
        else if (shId == null) holat = 'shartnoma_yoq';
        else {
          tizimId = tizimKalit.get(kalit) ?? (tur !== 'sotuv' ? raqamsiz.get(`${shId}|${tur}|${q.sana}|${q.summa}`) ?? null : null);
          holat = tizimId != null ? 'tizimda_bor' : 'yangi';
        }
        korilgan.add(kalit);
        yozuvlar.push({
          kalit, operationId: barqarorUuid(`sverka1c|${kalit}`), tur, blokKalit: bk, shartnomaId: shId, sana: q.sana, summa: q.summa,
          raqam: q.raqam, hujjat: q.hujjat, fayl: f.nom, qator: q.qator, hujjatSanaXato: q.hujjatSanaXato, holat, tizimId,
        });
      }
    }
  }

  // Yo'qolgan/o'zgargan: tizimdagi yozuv shu fayl davri ichida, shu shartnoma bloki faylda bor, lekin fayl qatorlarida yo'q.
  const yoqolgan: YoqolganYozuv[] = [];
  const yoqolganId = new Set<string>();
  for (const f of fayllar) {
    const fk = faylKalitlar.get(f.nom)!;
    const { davrDan, davrGacha } = f.tahlil;
    for (const b of f.tahlil.bloklar) {
      const shId = bloklar.get(blokKaliti(b))?.shartnomaId;
      const m = shId != null ? moslash.get(shId) : undefined;
      if (!m) continue;
      for (const s of m.f3) {
        const sana = s.sotuv_sana.slice(0, 10);
        if (!ichida(sana, davrDan, davrGacha) || fk.has(yozuvKaliti(String(m.id), 'sotuv', sana, s.raqam, tiyin(s.sotuv_summa)))) continue;
        if (yoqolganId.has(`s${s.id}`)) continue;
        yoqolganId.add(`s${s.id}`);
        yoqolgan.push({ tur: 'sotuv', id: s.id, shartnomaId: m.id, sana, summa: tiyin(s.sotuv_summa), raqam: s.raqam, versiya: s.versiya, fayl: f.nom });
      }
      for (const t of m.tolovlar) {
        const sana = t.sana.slice(0, 10);
        if (!t.hujjat_raqam || !ichida(sana, davrDan, davrGacha)) continue; // qo'lda kiritilgan raqamsiz to'lov — solishtirilmaydi
        if (fk.has(yozuvKaliti(String(m.id), t.tur === 'avans' ? 'tolov' : t.tur, sana, t.hujjat_raqam, tiyin(t.summa))) || yoqolganId.has(`t${t.id}`)) continue;
        yoqolganId.add(`t${t.id}`);
        yoqolgan.push({ tur: 'tolov', id: t.id, shartnomaId: m.id, sana, summa: tolovTiyin(t), raqam: t.hujjat_raqam, versiya: t.versiya, fayl: f.nom });
      }
    }
  }

  // Saldo: tizim (mavjud + yangi) shu davr bo'yicha
  type Hod = { sana: string; q: number };
  const hodisalar = new Map<number, Hod[]>();
  const qosh = (sh: number, h: Hod) => { const a = hodisalar.get(sh) ?? []; a.push(h); hodisalar.set(sh, a); };
  for (const m of tizim.moslash) {
    for (const s of m.f3) qosh(m.id, { sana: s.sotuv_sana.slice(0, 10), q: tiyin(s.sotuv_summa) });
    for (const t of m.tolovlar) qosh(m.id, { sana: t.sana.slice(0, 10), q: -tolovTiyin(t) });
  }
  for (const y of yozuvlar) if (y.holat === 'yangi' && y.shartnomaId != null && y.tur !== 'nomalum') {
    qosh(y.shartnomaId, { sana: y.sana, q: y.tur === 'sotuv' ? y.summa : y.tur === 'qaytarim' ? y.summa : -y.summa });
  }
  const qoldiqGacha = (sh: number, gacha: string | null, qatiy: boolean) =>
    (hodisalar.get(sh) ?? []).filter((h) => !gacha || (qatiy ? h.sana < gacha : h.sana <= gacha)).reduce((a, h) => a + h.q, 0);

  const saldo: SaldoQator[] = [];
  const faylJami: FaylJami[] = [];
  for (const f of fayllar) {
    const { davrDan, davrGacha } = f.tahlil;
    for (const b of f.tahlil.bloklar) {
      const bk = blokKaliti(b);
      const shId = bloklar.get(bk)?.shartnomaId ?? null;
      const tb = shId == null ? null : qoldiqGacha(shId, davrDan, true);
      const ty = shId == null ? null : qoldiqGacha(shId, davrGacha, false);
      const yoq = yoqolgan.filter((y) => y.shartnomaId === shId && y.fayl === f.nom).reduce((a, y) => a + (y.tur === 'sotuv' ? y.summa : -y.summa), 0);
      saldo.push({
        fayl: f.nom, blokKalit: bk, sarlavha: b.sarlavha, shartnomaId: shId, davrDan, davrGacha,
        faylBoshlangich: b.boshlangich, faylYakuniy: b.yakuniy, faylIchkiMos: b.ichkiMos,
        tizimBoshlangich: tb, tizimYakuniy: ty,
        mos: ty == null || b.yakuniy == null ? null : ty === b.yakuniy,
        sanaKochganBolishiMumkin: tb != null && yoq !== 0 && b.boshlangich - tb === yoq,
      });
    }
    const bloklarYakuniy = f.tahlil.bloklar.reduce((a, b) => a + (b.yakuniy ?? b.hisoblanganYakuniy), 0);
    faylJami.push({ fayl: f.nom, davrDan, davrGacha, yakuniy: f.tahlil.yakuniy, bloklarYakuniy, korsatilmagan: f.tahlil.korsatilmaganQoldiq });
  }

  // To'lov shartnoma summasidan oshdi (bloklamaydi — DS kiritilmagan bo'lishi mumkin)
  const ogoh: ShartnomaOgoh[] = [];
  const yangi0 = yozuvlar.filter((y) => y.holat === 'yangi');
  for (const b of bloklar.values()) {
    if (b.shartnomaId == null) continue;
    const shId = b.shartnomaId;
    const tolangan = (tizim.moslash.find((m) => m.id === shId)?.tolovlar ?? []).reduce((a, t) => a + tolovTiyin(t), 0)
      + yangi0.filter((y) => y.shartnomaId === shId).reduce((a, y) => a + (y.tur === 'tolov' ? y.summa : y.tur === 'qaytarim' ? -y.summa : 0), 0);
    const tz = tizim.shartnomalar.find((s) => s.id === b.shartnomaId);
    const tizimSumma = tz?.joriySumma != null ? tiyin(tz.joriySumma) : null;
    const chegaralar: [number | null, 'sarlavha' | 'tizim'][] = [[b.sarlavhaSumma, 'sarlavha'], [tizimSumma, 'tizim']];
    for (const [s, manba] of chegaralar) {
      if (s != null && tolangan > s) ogoh.push({ shartnomaId: b.shartnomaId, kod: 'TOLOV_SHARTNOMADAN_OSHDI', tolangan, shartnoma: s, manba });
    }
  }

  const ogohMatnlar = fayllar.flatMap((f) => f.tahlil.ogohlantirishlar.map((m) => `${f.nom}: ${m}`));
  const yangi = yozuvlar.filter((y) => y.holat === 'yangi');
  return {
    bloklar: [...bloklar.values()], yozuvlar, yoqolgan, saldo, faylJami, ogohlantirishlar: ogoh, ogohMatnlar,
    soni: {
      yangiTolov: yangi.filter((y) => y.tur !== 'sotuv').length, yangiSotuv: yangi.filter((y) => y.tur === 'sotuv').length,
      bor: yozuvlar.filter((y) => y.holat === 'tizimda_bor').length, takror: yozuvlar.filter((y) => y.holat === 'faylda_takror').length,
      shartnomaYoq: yozuvlar.filter((y) => y.holat === 'shartnoma_yoq').length, tushunilmadi: yozuvlar.filter((y) => y.holat === 'tushunilmadi').length,
      yangiTolovSumma: yangi.filter((y) => y.tur === 'tolov').reduce((a, y) => a + y.summa, 0),
      yangiSotuvSumma: yangi.filter((y) => y.tur === 'sotuv').reduce((a, y) => a + y.summa, 0),
    },
  };
}

/** Fayllardagi unikal to'lovlar (tur='tolov'; takrorsiz) — shartnoma topilmagan bloklar ham kiradi. Lokal tekshiruv va UI yig'masi uchun. */
export function unikalTolovlar(reja: Pick<ImportReja, 'yozuvlar'>): ImportYozuv[] {
  return reja.yozuvlar.filter((y) => y.tur === 'tolov' && y.holat !== 'faylda_takror');
}

export type { SverkaQator };
export type { TolovTur };
