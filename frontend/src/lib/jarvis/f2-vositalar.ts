/**
 * f2-vositalar.ts — Jarvis uchun F2 / FAKT vositalari (server tool registry). Smeta MCP (mcp/smeta-mcp) ning shu ish doirasidagi
 * toollari: o'qish (f2, f2_royxat, fakt_jurnal, obyekt_holat, qator_qidir, nakopitelniy, ostatka) va yozish (fakt_yoz,
 * f2_qoralama_tahrir, zamena_qosh, bajarilmadi, narx_tuzat). Sof mantiq: tarmoq/DB yo'q, to'liq testlanadi.
 *
 * Shartnoma (ombor-vositalar.ts «Tool contract» naqshi): nom + versiya, o'zbekcha tavsif, kirish sxemasi, ruxsat (capability),
 * o'qish/yozish belgisi. Hammasi `/api/f2-buyruq` ning `vosita` amali orqali ishlaydi: aktor/kompaniya sessiyadan, mijoz id yubormaydi
 * (kirishda `actor_id`/`p_actor_id` maydoni YO'Q — qat'iy rad etiladi).
 *
 * YOZISH QOIDASI (egasi 2026-11-18): yozuvchi vosita HECH QACHON darhol yozmaydi. 1) vosita chaqiruvi serverda dry_run (preview + ROLLBACK)
 * qiladi va «Tasdiqlash» tokenini qaytaradi; 2) yozish faqat `f2_tasdiq` (token + aniq `tasdiqlayman: true`) bilan, o'sha operation_id bilan.
 */
import { belgilaKirish, kirishXatomi, yoyKirish } from '../transport-yoy/kirish';

export type OqishNomi = 'f2_royxat' | 'f2' | 'fakt_jurnal' | 'obyekt_holat' | 'qator_qidir' | 'nakopitelniy' | 'ostatka' | 'transport_tekshir';
export type YozishNomi = 'fakt_yoz' | 'f2_qoralama_tahrir' | 'zamena_qosh' | 'bajarilmadi' | 'narx_tuzat' | 'transport_taqsimla' | 'transport_belgila';
export type VositaNomi = OqishNomi | YozishNomi | 'f2_tasdiq';

export type Vosita = {
  nom: VositaNomi; versiya: 1; tavsif: string;
  /** Baza/hujjatga YOZADIMI (faqat f2_tasdiq). Yozuvchi vositalar (fakt_yoz...) preview qaytaradi — yozmaydi. */
  yozadi: boolean; tasdiqKerak: boolean;
  /** Hammasi kerak (capability). Yozuvchi vositalarda `write-command-policy` dagi shu amal ruxsati bilan bir xil. */
  ruxsat: readonly string[];
  kirish: Record<string, string>;
};

export const F2_VOSITALAR: readonly Vosita[] = [
  { nom: 'f2_royxat', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: ['f2.read'],
    tavsif: 'Obyektning F2 (yoki fakt) hujjatlari ro\'yxati: raqam, oy, holat, lifecycle, hujjat jami.',
    kirish: { obyekt_id: 'obyekt id (majburiy)', tur: 'f2 | fakt (sukut f2)', holat: 'ixtiyoriy holat filtri', limit: '1..200' } },
  { nom: 'f2', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: ['f2.read'],
    tavsif: 'Bitta akt (F2 yoki fakt): sarlavha, qatorlar (kod, nom, birlik, hajm, narx, summa) va yagona summa paketi (QQS bilan / ustamali / ustamasiz).',
    kirish: { akt_id: 'akt id (majburiy)', limit: '1..300', offset: 'sahifalash' } },
  { nom: 'fakt_jurnal', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: ['fakt.read'],
    tavsif: 'Fakt tarixi: har yozuv (akt, sana, hajm delta, summa, izoh) va har qator bo\'yicha sof fakt.',
    kirish: { obyekt_id: 'obyekt id (majburiy)', qator_idlar: 'ixtiyoriy qator idlar', sana_dan: 'YYYY-MM-DD', sana_gacha: 'YYYY-MM-DD', limit: '1..500' } },
  { nom: 'obyekt_holat', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: ['smeta.read'],
    tavsif: 'Obyekt holati: smeta / fakt / F2 / F2 qoralama — har biri QQS bilan, ustamali va ustamasiz (server yadrosidan; qayta hisoblanmaydi).',
    kirish: { obyekt_id: 'obyekt id (majburiy)' } },
  { nom: 'qator_qidir', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: ['smeta.read'],
    tavsif: 'Obyekt (faol smeta versiyasi) ichida qator qidirish: nom so\'zlari, kod, tur; holat (fakt, F2, qoldiq) bilan.',
    kirish: { obyekt_id: 'obyekt id (majburiy)', matn: 'nom so\'zlari', kod: 'kod bo\'lagi', tur: 'rz | bl | rs | mat | ob', limit: '1..100' } },
  { nom: 'nakopitelniy', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: ['f2.read'],
    tavsif: 'Nakopitelniy vedomost jami (server): smeta, fakt, oldingi/joriy/jami F2, qoldiq va davrlar. Manba t2_nakopitelniy_v2 (ekran bilan bir xil).',
    kirish: { obyekt_id: 'obyekt id (majburiy)', davr: 'YYYY-MM (sukut joriy)' } },
  { nom: 'ostatka', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: ['smeta.read'],
    tavsif: 'Ostatka (qoldiq): har qator bo\'yicha smeta, F2, fakt, almashtirilgan va qoldiq hajm/summa; filtr: qoldiq | ortiqcha | almashtirilgan.',
    kirish: { obyekt_id: 'obyekt id (majburiy)', faqat: 'qoldiq | ortiqcha | almashtirilgan', qator_idlar: 'ixtiyoriy', limit: '1..200' } },
  { nom: 'fakt_yoz', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: ['fakt.write'],
    tavsif: 'Fakt yozish (t2_fakt_yoz_v2) QORALAMASI: qatorlar [{qator_id, hajm}] — DELTA (minus = kamaytirish). dry_run preview (qator oldin→keyin, jami) + tasdiq tokeni qaytaradi; yozmaydi.',
    kirish: { obyekt_id: 'majburiy', sana: 'YYYY-MM-DD (sukut bugun)', qatorlar: '[{qator_id, hajm≠0}] (1..200)', izoh: 'ixtiyoriy', raqam: 'ixtiyoriy' } },
  { nom: 'f2_qoralama_tahrir', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: ['f2.prepare'],
    tavsif: 'F2 QORALAMA qatorlarini tahrirlash (t2_f2_qoralama_yangila_v1, versiya bilan): ozgartir [{qator_id, hajm?, narx?, narxsiz?}], olib_tashla [qator_id]. Faqat qoralama/rad etilgan F2. Preview + token; yozmaydi.',
    kirish: { akt_id: 'majburiy', ozgartir: '[{qator_id, hajm?, narx?, narxsiz?}] (≤100)', olib_tashla: '[qator_id] (≤200)', kutilgan_versiya: 'ixtiyoriy' } },
  { nom: 'zamena_qosh', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: ['smeta.write'],
    tavsif: 'ZAMENA: asl qator o\'rniga yangi ish/resurs (t2_ish_abc_saqla_v1). Asl smeta qatori o\'zgarmaydi. Mavjud qator/normaga avval qarang (qator_qidir). Preview + token; yozmaydi.',
    kirish: { obyekt_id: 'majburiy', almashtirilayotgan_qator_id: 'majburiy', rejim: 'ish | resurs', ish: '{nom, birlik, hajm, kod?}', resurslar: '[{nom, birlik, kat?, norma?, hajm?, narx?, narx_manba?, kod?}] (≤60)', fakt_hajm: 'ixtiyoriy', sana: 'YYYY-MM-DD', sabab: 'majburiy (≥3 belgi)' } },
  { nom: 'bajarilmadi', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: ['fakt.write'],
    tavsif: '«Bajarilmadi» belgisi (asl smetaga tegmaydigan qoplama): belgila yoki bekor. Preview + token; yozmaydi.',
    kirish: { obyekt_id: 'majburiy', amal: 'belgila | bekor', qatorlar: '[{qator_id, hajm?}] yoki qator_idlar', sabab_kod: 'buyurtmachi_chiqardi|loyiha_ozgardi|boshqa_pudratchi|texnik_sabab|zamena|material_yoq|boshqa', sabab_izoh: 'boshqa uchun majburiy', sana: 'YYYY-MM-DD', bekor_idlar: 'bekor uchun belgi idlar' } },
  { nom: 'narx_tuzat', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: ['smeta.write', 'narx.write'],
    tavsif: 'Smeta qatori(lar)i narxini tuzatish (t2_qator_tahrir, versiya bilan; narx QQS siz). Faqat rs/mat/ob. Asl smeta qatori narxi o\'zgarishi ogohlantiriladi. Preview + token; yozmaydi.',
    kirish: { obyekt_id: 'majburiy', narxlar: '[{qator_id, narx≥0}] (1..100)', sabab: 'majburiy (≥3 belgi)' } },
  { nom: 'transport_tekshir', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: ['smeta.read'],
    tavsif: 'Transport auditi (faqat o\'qish): har material qaysi usulda transport oladi (foiz | tkm | narx_ichida) va XATOLAR — t·km qatorisiz tkm material, materialsiz t·km qatori, ikki marta olinayotgan transport. xato_soni = 0 bo\'lmasa F-2 tasdiqlanmaydi.',
    kirish: { obyekt_id: 'obyekt id (majburiy)' } },
  { nom: 'transport_taqsimla', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: ['smeta.write'],
    tavsif: 'Hisob aktidan («Расчёт затрат транспорта» varag\'i) t·km transportini TAQSIMLASH QORALAMASI: har material tagiga bitta t·km qatori, materialga usul=tkm (podval transport-% bazasidan chiqadi — transport IKKI MARTA olinmaydi). Preview: guruhlar (topilgan qator, miqdor/t·km tizim vs hisob, so\'m farqi, holat). Bloklangan (farq/topilmadi/qisman) bo\'lsa `majburiy:true` faqat foydalanuvchi aniq qabul qilsa. Preview + token; yozmaydi.',
    kirish: { obyekt_id: 'majburiy', rz_id: 'bo\'lim/uchastka qator id (majburiy)', tkm_narx: '1 t·km narxi, so\'m QQS siz (majburiy)', qatorlar: '[{material, zichlik>0, km≥0, miqdor?, hisob_tkm?, kodlar?|nom_pattern?}] (1..40)', majburiy: 'true — bloklangan guruhlarni ham yozish (foydalanuvchi qabul qilgandan keyin)' } },
  { nom: 'transport_belgila', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: ['smeta.write'],
    tavsif: 'Material qatorlariga transport usulini belgilash QORALAMASI: foiz (podvaldagi transport %, sukut) | tkm (alohida t·km qatori) | narx_ichida (yetkazish narxda). Faqat faol material qatorlari; t·km qatori bor materialni foiz/narx_ichida ga o\'tkazib bo\'lmaydi. Preview + token; yozmaydi.',
    kirish: { obyekt_id: 'majburiy', qator_idlar: '[material qator id] (1..200)', usul: 'foiz | tkm | narx_ichida' } },
  { nom: 'f2_tasdiq', versiya: 1, yozadi: true, tasdiqKerak: true, ruxsat: [],
    tavsif: 'Preview tokenini tasdiqlab YOZADI (har yozuv token yechadi). Faqat foydalanuvchi «Tasdiqlash» bosgandan keyin (tasdiqlayman: true). Ma\'lumot preview dan keyin o\'zgargan bo\'lsa — rad.',
    kirish: { token: 'preview tokeni (majburiy)', tasdiqlayman: 'true (majburiy)' } },
];

export const vositaTop = (nom: unknown): Vosita | null => F2_VOSITALAR.find((v) => v.nom === nom) ?? null;
export const OQISH_NOMLARI: readonly OqishNomi[] = ['f2_royxat', 'f2', 'fakt_jurnal', 'obyekt_holat', 'qator_qidir', 'nakopitelniy', 'ostatka', 'transport_tekshir'];
export const YOZISH_NOMLARI: readonly YozishNomi[] = ['fakt_yoz', 'f2_qoralama_tahrir', 'zamena_qosh', 'bajarilmadi', 'narx_tuzat', 'transport_taqsimla', 'transport_belgila'];
/** Transport vositalari: token ichida argumentlar (≤ ~11 KB JSON) — shuning uchun Jarvis yo'lida guruh/qator soni cheklangan (UI `/api/transport` da to'liq). */
export const TRANSPORT_JARVIS_GURUH = 40;
export const TRANSPORT_JARVIS_QATOR = 200;
export const SABAB_KODLAR = ['buyurtmachi_chiqardi', 'loyiha_ozgardi', 'boshqa_pudratchi', 'texnik_sabab', 'zamena', 'material_yoq', 'boshqa'] as const;
export const KATEGORIYALAR = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'М/К', 'КАБ', 'БЕЗСКЛАД'] as const;

/* ───────── kirishni tekshirish (qo'lda; tashqi sxema kutubxonasi yo'q) ───────── */
const butun = (v: unknown): number | null => { const n = typeof v === 'string' && v.trim() ? Number(v) : v; return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null; };
const son = (v: unknown): number | null => { const n = typeof v === 'string' && v.trim() ? Number(v.replace(',', '.').replace(/\s/g, '')) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const matn = (v: unknown, n = 500): string | undefined => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s ? s.slice(0, n) : undefined; };
const sana = (v: unknown): string | undefined => { const s = matn(v, 10); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && sanaTogri(s) ? s : undefined; };
const sanaTogri = (s: string): boolean => { const d = new Date(s + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
const oy = (v: unknown): string | undefined => { const s = matn(v, 7); return s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : undefined; };
const idlar = (v: unknown, max: number): number[] | null => {
  if (!Array.isArray(v) || v.length > max) return null;
  const o = v.map(butun);
  return o.every((x): x is number => x != null) ? [...new Set(o)] : null;
};

export type Normal = Record<string, unknown>;
export type VositaSorov =
  | { amal: 'oqish' | 'taklif' | 'tasdiq'; vosita: Vosita; a: Normal }
  | { xato: string; tafsilot?: string };
const xato = (kod: string, tafsilot?: string): { xato: string; tafsilot?: string } => ({ xato: kod, ...(tafsilot ? { tafsilot } : {}) });
const TAQIQ_MAYDON = /^(actor_?id|p_actor_id|aktor|kim|kompaniya_id)$/i;

/** Vosita chaqiruvi -> ichki amal va TOZALANGAN kirish. Aktor/kompaniya maydonlari rad etiladi (faqat sessiyadan). */
export function vositaSorov(nom: unknown, args: unknown): VositaSorov {
  const v = vositaTop(nom);
  if (!v) return xato('VOSITA_NOMALUM');
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) return xato('ARGUMENT_NOTOGRI');
  const x = (args ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(x)) if (TAQIQ_MAYDON.test(k)) return xato('ARGUMENT_TAQIQLANGAN', `«${k}» yuborilmaydi: aktor va kompaniya sessiyadan olinadi`);
  const ok = (amal: 'oqish' | 'taklif' | 'tasdiq', a: Normal): VositaSorov => ({ amal, vosita: v, a });
  const obyektId = butun(x.obyekt_id);
  const lim = (def: number, max: number) => Math.min(max, Math.max(1, Math.trunc(son(x.limit) ?? def)));

  switch (v.nom) {
    case 'f2_royxat':
      if (!obyektId) return xato('OBYEKT_KERAK');
      return ok('oqish', { obyekt_id: obyektId, tur: x.tur === 'fakt' ? 'fakt' : 'f2', holat: matn(x.holat, 30), limit: lim(50, 200) });
    case 'f2': {
      const akt = butun(x.akt_id);
      if (!akt) return xato('AKT_KERAK');
      return ok('oqish', { akt_id: akt, limit: lim(100, 300), offset: Math.min(1_000_000, Math.max(0, Math.trunc(son(x.offset) ?? 0))) });
    }
    case 'fakt_jurnal': {
      if (!obyektId) return xato('OBYEKT_KERAK');
      let q: number[] | null = null;
      if (x.qator_idlar != null) { q = idlar(x.qator_idlar, 500); if (!q) return xato('QATOR_IDLAR_NOTOGRI'); }
      if ((x.sana_dan != null && !sana(x.sana_dan)) || (x.sana_gacha != null && !sana(x.sana_gacha))) return xato('SANA_NOTOGRI');
      return ok('oqish', { obyekt_id: obyektId, qator_idlar: q, sana_dan: sana(x.sana_dan), sana_gacha: sana(x.sana_gacha), limit: lim(100, 500) });
    }
    case 'obyekt_holat':
      return obyektId ? ok('oqish', { obyekt_id: obyektId }) : xato('OBYEKT_KERAK');
    case 'qator_qidir': {
      if (!obyektId) return xato('OBYEKT_KERAK');
      const t = typeof x.tur === 'string' && ['rz', 'bl', 'rs', 'mat', 'ob'].includes(x.tur) ? x.tur : undefined;
      if (x.tur != null && !t) return xato('TUR_NOTOGRI');
      const sozlar = (matn(x.matn, 200) ?? '').split(' ').filter((s) => s.length >= 2).slice(0, 6);
      const kod = matn(x.kod, 60);
      if (!sozlar.length && !kod && !t) return xato('QIDIRUV_BOSH', 'matn, kod yoki tur bering');
      return ok('oqish', { obyekt_id: obyektId, sozlar, kod, tur: t, limit: lim(30, 100) });
    }
    case 'nakopitelniy': {
      if (!obyektId) return xato('OBYEKT_KERAK');
      if (x.davr != null && !oy(x.davr)) return xato('DAVR_NOTOGRI');
      return ok('oqish', { obyekt_id: obyektId, davr: oy(x.davr) ?? null });
    }
    case 'ostatka': {
      if (!obyektId) return xato('OBYEKT_KERAK');
      const f = typeof x.faqat === 'string' && ['qoldiq', 'ortiqcha', 'almashtirilgan'].includes(x.faqat) ? x.faqat : undefined;
      if (x.faqat != null && !f) return xato('FILTR_NOTOGRI');
      let q: number[] | null = null;
      if (x.qator_idlar != null) { q = idlar(x.qator_idlar, 500); if (!q) return xato('QATOR_IDLAR_NOTOGRI'); }
      return ok('oqish', { obyekt_id: obyektId, faqat: f, qator_idlar: q, limit: lim(40, 200) });
    }
    case 'fakt_yoz': {
      if (!obyektId) return xato('OBYEKT_KERAK');
      if (!Array.isArray(x.qatorlar) || x.qatorlar.length < 1 || x.qatorlar.length > 200) return xato('QATORLAR_NOTOGRI', '1..200 qator');
      const seen = new Set<number>(); const qatorlar: Array<{ qator_id: number; hajm: number }> = [];
      for (const r of x.qatorlar as unknown[]) {
        const o = (r ?? {}) as Record<string, unknown>; const id = butun(o.qator_id); const h = son(o.hajm);
        if (!id || h == null || Math.abs(h) < 1e-6 || Math.abs(h) > 1e9) return xato('QATOR_NOTOGRI', 'qator_id va hajm (≠0) kerak');
        if (seen.has(id)) return xato('QATOR_TAKROR', `#${id} ikki marta`);
        seen.add(id); qatorlar.push({ qator_id: id, hajm: h });
      }
      if (x.sana != null && !sana(x.sana)) return xato('SANA_NOTOGRI');
      return ok('taklif', { obyekt_id: obyektId, sana: sana(x.sana) ?? null, qatorlar, izoh: matn(x.izoh, 500), raqam: matn(x.raqam, 50) });
    }
    case 'f2_qoralama_tahrir': {
      const akt = butun(x.akt_id);
      if (!akt) return xato('AKT_KERAK');
      const oz: Array<{ qator_id: number; hajm?: number; narx?: number; narxsiz?: boolean }> = [];
      if (x.ozgartir != null) {
        if (!Array.isArray(x.ozgartir) || x.ozgartir.length > 100) return xato('OZGARTIR_NOTOGRI', '≤100 qator');
        for (const r of x.ozgartir as unknown[]) {
          const o = (r ?? {}) as Record<string, unknown>; const id = butun(o.qator_id);
          const h = o.hajm == null ? undefined : son(o.hajm); const n = o.narx == null ? undefined : son(o.narx);
          if (!id || h === null || n === null || (h != null && Math.abs(h) < 1e-6) || (n != null && n < 0) || (h == null && n == null && o.narxsiz !== true)) return xato('OZGARTIR_QATOR_NOTOGRI', 'qator_id va hajm/narx/narxsiz kerak');
          if (n != null && o.narxsiz === true) return xato('OZGARTIR_QATOR_NOTOGRI', 'narx va narxsiz birga bo\'lmaydi');
          oz.push({ qator_id: id, ...(h != null ? { hajm: h } : {}), ...(n != null ? { narx: n } : {}), ...(o.narxsiz === true ? { narxsiz: true } : {}) });
        }
      }
      let ol: number[] = [];
      if (x.olib_tashla != null) { const t = idlar(x.olib_tashla, 200); if (!t) return xato('OLIB_TASHLA_NOTOGRI'); ol = t; }
      if (!oz.length && !ol.length) return xato('OZGARISH_YOQ', 'ozgartir yoki olib_tashla bering');
      const kv = x.kutilgan_versiya == null ? null : son(x.kutilgan_versiya);
      if (x.kutilgan_versiya != null && (kv == null || !Number.isInteger(kv) || kv < 0)) return xato('VERSIYA_NOTOGRI');
      return ok('taklif', { akt_id: akt, ozgartir: oz, olib_tashla: ol, kutilgan_versiya: kv });
    }
    case 'zamena_qosh': {
      const asl = butun(x.almashtirilayotgan_qator_id);
      if (!obyektId || !asl) return xato('OBYEKT_VA_QATOR_KERAK');
      const sabab = matn(x.sabab, 1000);
      if (!sabab || sabab.length < 3) return xato('SABAB_KERAK');
      const rejim = x.rejim === 'ish' || x.rejim === 'resurs' ? x.rejim : null;
      if (x.rejim != null && !rejim) return xato('REJIM_NOTOGRI');
      let ish: Normal | null = null;
      if (x.ish != null) {
        const i = (x.ish ?? {}) as Record<string, unknown>; const h = son(i.hajm);
        if (!matn(i.nom, 1000) || !matn(i.birlik, 50) || h == null || Math.abs(h) < 1e-6) return xato('ISH_NOTOGRI', 'nom, birlik, hajm (≠0)');
        ish = { nom: matn(i.nom, 1000), birlik: matn(i.birlik, 50), hajm: h, ...(matn(i.kod, 100) ? { kod: matn(i.kod, 100) } : {}) };
      }
      const resurslar: Normal[] = [];
      if (x.resurslar != null) {
        if (!Array.isArray(x.resurslar) || x.resurslar.length > 60) return xato('RESURSLAR_NOTOGRI', '≤60');
        for (const r of x.resurslar as unknown[]) {
          const o = (r ?? {}) as Record<string, unknown>; const norma = o.norma == null ? undefined : son(o.norma); const h = o.hajm == null ? undefined : son(o.hajm); const narx = o.narx == null ? undefined : son(o.narx);
          if (!matn(o.nom, 1000) || !matn(o.birlik, 50) || norma === null || h === null || narx === null || (norma != null && norma <= 0) || (narx != null && narx < 0) || (norma == null && (h == null || h === 0))) return xato('RESURS_NOTOGRI', 'nom, birlik, norma>0 yoki hajm≠0, narx≥0');
          const kat = typeof o.kat === 'string' && (KATEGORIYALAR as readonly string[]).includes(o.kat) ? o.kat : undefined;
          if (o.kat != null && !kat) return xato('RESURS_KAT_NOTOGRI');
          resurslar.push({ nom: matn(o.nom, 1000), birlik: matn(o.birlik, 50), ...(kat ? { kat } : {}), ...(norma != null ? { norma } : {}), ...(h != null ? { hajm: h } : {}), ...(narx != null ? { narx } : {}),
            ...(matn(o.narx_manba, 40) ? { narx_manba: matn(o.narx_manba, 40) } : {}), ...(matn(o.kod, 100) ? { kod: matn(o.kod, 100) } : {}) });
        }
      }
      const fh = x.fakt_hajm == null ? null : son(x.fakt_hajm);
      if (x.fakt_hajm != null && (fh == null || fh <= 0)) return xato('FAKT_HAJM_NOTOGRI');
      if (x.sana != null && !sana(x.sana)) return xato('SANA_NOTOGRI');
      return ok('taklif', { obyekt_id: obyektId, almashtirilayotgan_qator_id: asl, rejim, ish, resurslar, fakt_hajm: fh, sana: sana(x.sana) ?? null, sabab });
    }
    case 'bajarilmadi': {
      if (!obyektId) return xato('OBYEKT_KERAK');
      const amal = x.amal === 'bekor' ? 'bekor' : x.amal == null || x.amal === 'belgila' ? 'belgila' : null;
      if (!amal) return xato('AMAL_NOTOGRI');
      if (x.sana != null && !sana(x.sana)) return xato('SANA_NOTOGRI');
      if (amal === 'bekor') {
        const b = idlar(x.bekor_idlar ?? x.qator_idlar, 200);
        if (!b || !b.length) return xato('BEKOR_IDLAR_KERAK');
        return ok('taklif', { obyekt_id: obyektId, amal, bekor_idlar: b, sabab_izoh: matn(x.sabab_izoh, 1000) ?? null });
      }
      let qatorlar: Array<{ qator_id: number; hajm?: number }> = [];
      if (Array.isArray(x.qatorlar)) {
        if (x.qatorlar.length < 1 || x.qatorlar.length > 200) return xato('QATORLAR_NOTOGRI');
        for (const r of x.qatorlar as unknown[]) {
          const o = (r ?? {}) as Record<string, unknown>; const id = butun(o.qator_id); const h = o.hajm == null ? undefined : son(o.hajm);
          if (!id || h === null || (h != null && h < 0)) return xato('QATOR_NOTOGRI');
          qatorlar.push({ qator_id: id, ...(h != null ? { hajm: h } : {}) });
        }
      } else { const q = idlar(x.qator_idlar, 200); if (!q || !q.length) return xato('QATORLAR_KERAK'); qatorlar = q.map((qator_id) => ({ qator_id })); }
      const kod = typeof x.sabab_kod === 'string' && (SABAB_KODLAR as readonly string[]).includes(x.sabab_kod) ? x.sabab_kod : null;
      if (!kod) return xato('SABAB_KOD_NOTOGRI', SABAB_KODLAR.join('|'));
      if (kod === 'boshqa' && !matn(x.sabab_izoh, 1000)) return xato('SABAB_IZOH_MAJBURIY');
      const h = x.hujjat_id == null ? null : butun(x.hujjat_id); const z = x.zamena_qator_id == null ? null : butun(x.zamena_qator_id);
      if ((x.hujjat_id != null && !h) || (x.zamena_qator_id != null && !z)) return xato('ID_NOTOGRI');
      return ok('taklif', { obyekt_id: obyektId, amal, qatorlar, sabab_kod: kod, sabab_izoh: matn(x.sabab_izoh, 1000) ?? null, sana: sana(x.sana) ?? null, hujjat_id: h, zamena_qator_id: z });
    }
    case 'narx_tuzat': {
      if (!obyektId) return xato('OBYEKT_KERAK');
      const sabab = matn(x.sabab, 500);
      if (!sabab || sabab.length < 3) return xato('SABAB_KERAK');
      if (!Array.isArray(x.narxlar) || x.narxlar.length < 1 || x.narxlar.length > 100) return xato('NARXLAR_NOTOGRI', '1..100');
      const seen = new Set<number>(); const narxlar: Array<{ qator_id: number; narx: number }> = [];
      for (const r of x.narxlar as unknown[]) {
        const o = (r ?? {}) as Record<string, unknown>; const id = butun(o.qator_id); const n = son(o.narx);
        if (!id || n == null || n < 0 || n > 1e12) return xato('NARX_NOTOGRI', 'narx ≥ 0 (QQS siz); bo\'sh narx 0 deb olinmaydi');
        if (seen.has(id)) return xato('QATOR_TAKROR', `#${id} ikki marta`);
        seen.add(id); narxlar.push({ qator_id: id, narx: n });
      }
      return ok('taklif', { obyekt_id: obyektId, narxlar, sabab });
    }
    case 'transport_tekshir':
      return obyektId ? ok('oqish', { obyekt_id: obyektId }) : xato('OBYEKT_KERAK');
    case 'transport_taqsimla': {
      const k = yoyKirish(x, { maxGuruh: TRANSPORT_JARVIS_GURUH, yoz: false });
      if (kirishXatomi(k)) return xato(k.xato, k.tafsilot);
      if (JSON.stringify(k.qatorlar).length > 11_000) return xato('ARGUMENT_KATTA', 'Guruhlar juda katta — bo\'lib yuboring yoki Transport panelidan foydalaning');
      return ok('taklif', { obyekt_id: k.obyekt_id, rz_id: k.rz_id, tkm_narx: k.tkm_narx, qatorlar: k.qatorlar, majburiy: k.majburiy });
    }
    case 'transport_belgila': {
      const k = belgilaKirish(x, TRANSPORT_JARVIS_QATOR);
      if (kirishXatomi(k)) return xato(k.xato, k.tafsilot);
      return ok('taklif', { obyekt_id: k.obyekt_id, qator_idlar: k.qator_idlar, usul: k.usul });
    }
    case 'f2_tasdiq':
      if (x.tasdiqlayman !== true) return xato('TASDIQ_KERAK');
      if (typeof x.token !== 'string' || !x.token) return xato('TOKEN_KERAK');
      return ok('tasdiq', { token: x.token });
  }
}
