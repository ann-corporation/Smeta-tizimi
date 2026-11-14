/**
 * Mindmap «Boshqaruv pulti» amallari — YAGONA modul (UI va AI yordamchi bir xil interfeys orqali ishlaydi).
 *
 * Maqsad: xaritadan tuzilmani QURISH va bog‘lash (yaratish, biriktirish, uzish, nomlash). Hech bir yangi RPC yo‘q — har amal
 * MAVJUD buyruqqa boradi: `loyiha_yarat`, `obyekt_yarat`, `shartnoma_saqla`, `mindmap_bog` / `mindmap_bog_ochir`
 * (`t2_mindmap_bog_v2` / `…ochir_v2`), `loyiha_yangila`, `obyekt_yangila`. Ruxsat va audit SERVERDA (`/api/sb-yoz`
 * `mindmap_*` — actor sessiyadan, operation_id, kutilgan versiya); bu yerda UI faqat oldindan tushuntiradi.
 *
 * Qoida: HAR yozuv = oldindan ko‘rish (`PultReja`) + foydalanuvchi tasdig‘i. `tayyorla` HECH NARSA yozmaydi — faqat reja
 * qaytaradi; `reja.bajar()` ni faqat odam «Tasdiqlash» bosgach chaqirish kerak. Hujjat (F2/F3/АОСР) bu yerda hech qachon
 * tasdiqlanmaydi: «keyingi qadam» faqat sahifaga yo‘naltiradi.
 *
 * AI yordamchi (G oqimi) reestriga ulash: `pultAsboblar(ctx)` — {nom, tavsif, yozadi, parametrlar, tayyorla(args)} ro‘yxati.
 * AI faqat `tayyorla` ni chaqiradi va rejani foydalanuvchiga ko‘rsatadi; `bajar` — foydalanuvchi tasdig‘idan keyin.
 */
import { t } from '../i18n/til';
import { bogTuriniTop, type BogTur, type MindmapGraf, type MindmapTugun, type TugunTur } from '../api/t2-mindmap';
import { tahrirYopiqMatni, type TahrirRuxsati } from './mindmap-ruxsat';
import { pultMunosabatlari } from './mindmap-pult-daraxt';
import { MINDMAP_ROLE_KEYS } from '../test02/mindmap-create-ux';

export type PultNishonTur = 'kompaniya' | 'loyiha' | 'shartnoma' | 'obyekt';

/** Amal ob’ekti — graf tugunidan (hammasi serverdan kelgan faktlar; taxmin yo‘q). */
export type PultNishon = {
  id: string;
  tur: PultNishonTur;
  entityId: number | null;
  nom: string;
  /** `meta.versiya` (kutilgan versiya uchun); yo‘q — `null`. */
  versiya: number | null;
  loyihaId: number | null;
  shartnomaId: number | null;
};

export type PultNatija = { ok: boolean; error?: string; id?: number; versiya?: number };

/**
 * Muvaffaqiyatli yozuvdan keyin xaritani DARHOL yangilash (optimistik yamoq): serverdan butun grafni qayta o‘qish sekin
 * (bir necha soniya), shuning uchun ekran avval yamoq bilan yangilanadi, keyin fonda haqiqiy graf o‘qiladi.
 * Faqat bog‘lanish/nom o‘zgarishlari; yaratilgan yangi tugunlar yamoqsiz (ular fon yangilanishida keladi).
 */
export type PultYamoq = {
  qosh?: { tur: BogTur; manba: string; maqsad: string; rol?: string }[];
  ol?: { tur: BogTur; manba: string; maqsad: string; rol?: string }[];
  nom?: { id: string; nom: string };
  /** Server maqsad tugun versiyasini +1 qiladi (versiya = versiya + 1) — kutilgan versiya mos tursin. */
  versiyaOshir?: string[];
};

/** Yozuvchi interfeys: haqiqiy bajaruvchi `pultYozuvchi(kompaniyaId)`; testlarda soxta. */
export type PultYozuvchi = {
  loyihaYarat(nom: string, hudud: string): Promise<PultNatija>;
  obyektYarat(loyihaId: number | null, nom: string): Promise<PultNatija>;
  shartnomaYarat(raqam: string, taraf: string): Promise<PultNatija>;
  bog(tur: BogTur, manbaId: number, maqsadId: number, kutilganVersiya: number, rol?: string): Promise<PultNatija>;
  bogOchir(tur: BogTur, manbaId: number, maqsadId: number, kutilganVersiya: number, rol?: string): Promise<PultNatija>;
  loyihaNomla(id: number, kutilganVersiya: number, nom: string): Promise<PultNatija>;
  obyektNomla(id: number, nom: string): Promise<PultNatija>;
  /** Obyekt darajasidagi hujjat imzochisi (	2_obyekt_imzochi, /api/tomon imzochi_saqla). Uchala maydon bo'sh — qator o'chadi. */
  imzochiSaqla(obyektId: number, rol: string, m: { tashkilot: string; lavozim: string; fio: string }): Promise<PultNatija>;
};

export type PultKontekst = {
  /** Foydalanuvchi shu kompaniyada yoza oladimi (`mindmapTahrirRuxsati`). Yopiq — amallar ko‘rinadi, sabab bilan bosilmaydi. */
  tahrir: TahrirRuxsati;
  yozuvchi: PultYozuvchi;
};

export type PultMaydon = {
  kalit: string;
  nom: () => string;
  majburiy?: boolean;
  tur: 'matn' | 'tanlov';
  /** Tanlov variantlari (graf va nishondan). */
  tanlovlar?: (g: MindmapGraf, n: PultNishon) => { qiymat: string; nom: string }[];
};

/** Bajarishdan oldingi ko‘rinish: nima o‘zgaradi, qaysi buyruq(lar), nimadan ogohlantirish. */
export type PultReja = {
  amal: string;
  sarlavha: string;
  /** «Nima bo‘ladi» qatorlari (foydalanuvchiga). */
  oqibat: string[];
  ogoh: string[];
  /** Chaqiriladigan mavjud buyruqlar (shaffoflik va test uchun). */
  buyruqlar: string[];
  tasdiq: string;
  /** Muvaffaqiyatdan keyin ekranga darhol qo‘llanadigan yamoq (bo‘lmasa — faqat fon yangilash). */
  yamoq?: PultYamoq;
  /** Faqat foydalanuvchi tasdig‘idan keyin chaqiriladi. */
  bajar: () => Promise<PultNatija & { yangiTugunId?: string; ogoh?: string }>;
};

export type PultTayyor = { ok: true; reja: PultReja } | { ok: false; xato: string };

export type PultTarif = {
  kalit: string;
  tur: PultNishonTur;
  nom: () => string;
  /** Qisqa izoh (menyuda tooltip / AI tavsifi). */
  izoh: () => string;
  maydonlar: PultMaydon[];
  /** Amal shu nishonda mavjudmi (masalan, shartnomasi bor obyektda «shartnomaga biriktirish» yo‘q). */
  bor?: (g: MindmapGraf, n: PultNishon) => boolean;
  tayyorla: (g: MindmapGraf, n: PultNishon, q: Record<string, string>, k: PultKontekst) => PultTayyor;
};

export type PultAmal = {
  kalit: string;
  nom: string;
  izoh: string;
  maydonlar: PultMaydon[];
  mumkin: boolean;
  sabab: string | null;
};

/* ───────────── Nishon ───────────── */

const sonYoki = (v: unknown): number | null => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 && v != null && v !== '' ? n : null; };
const idSon = (id: string): number | null => { const n = Number(id.split(':')[1]); return Number.isSafeInteger(n) && n > 0 ? n : null; };

/** Graf tugunidan amal nishoni (`kompaniya`, `loyiha`, `shartnoma`, `obyekt`); boshqa tur — `null`. */
export function pultNishon(graf: MindmapGraf, id: string): PultNishon | null {
  const tg = graf.tugunlar.find((x) => x.id === id);
  if (!tg || !(['kompaniya', 'loyiha', 'shartnoma', 'obyekt'] as string[]).includes(tg.tur)) return null;
  const m = pultMunosabatlari(graf);
  const loyiha = tg.tur === 'obyekt' ? m.obyektLoyiha.get(id) : tg.tur === 'shartnoma' ? m.shartnomaLoyiha.get(id) : null;
  const shartnoma = tg.tur === 'obyekt' ? m.obyektShartnoma.get(id) : null;
  return {
    id, tur: tg.tur as PultNishonTur, entityId: idSon(id), nom: tg.nom, versiya: sonYoki(tg.meta?.versiya),
    loyihaId: loyiha ? idSon(loyiha) : null, shartnomaId: shartnoma ? idSon(shartnoma) : null,
  };
}

const tugunlar = (g: MindmapGraf, tur: TugunTur): MindmapTugun[] => g.tugunlar.filter((x) => x.tur === tur);
const bogliMi = (g: MindmapGraf, tur: BogTur, manba: string, maqsad: string) => g.bogichlar.some((b) => b.tur === tur && b.manba === manba && b.maqsad === maqsad);
const variantlar = (royxat: MindmapTugun[]) => [...royxat].sort((a, b) => a.nom.localeCompare(b.nom, 'uz-UZ')).map((x) => ({ qiymat: x.id, nom: x.nom }));
const tugunOl = (g: MindmapGraf, id: string) => g.tugunlar.find((x) => x.id === id) ?? null;
const xato = (matn: string): PultTayyor => ({ ok: false, xato: matn });

const ROL_NOMI: Record<string, () => string> = {
  zakazchik: () => t('Zakazchik (buyurtmachi)'),
  bosh_pudratchi: () => t('Bosh pudratchi'),
  subpudratchi: () => t('Subpudratchi'),
  loyihachi: () => t('Loyihachi'),
  taminotchi: () => t('Ta’minotchi'),
};
export const rolNomi = (r: string | null | undefined) => (r && ROL_NOMI[r] ? ROL_NOMI[r]() : r ?? '');

/** Server qaytargan xato yoki umumiy matn. */
const sabab = (r: PultNatija, zaxira: string) => r.error || zaxira;

/** Kutilgan versiya yo‘q — yozuv yuborilmaydi (jim ustidan yozish xavfi): foydalanuvchi qayta yuklashi kerak. */
const versiyaYoq = () => xato(t('Tugun versiyasi serverdan kelmadi — xaritani yangilab qayta urining.'));

function reja(r: Omit<PultReja, 'ogoh'> & { ogoh?: string[] }): PultTayyor {
  return { ok: true, reja: { ...r, ogoh: r.ogoh ?? [] } };
}

/* ───────────── Umumiy quruvchilar ───────────── */

/** `manba → maqsad` chizig‘ini bog‘lash rejasi (maqsad tugunining versiyasi bilan). */
function bogRejasi(g: MindmapGraf, k: PultKontekst, p: {
  amal: string; tur: BogTur; manba: MindmapTugun; maqsad: MindmapTugun; sarlavha: string; oqibat: string[]; ogoh?: string[]; rol?: string; tasdiq?: string;
}): PultTayyor {
  const qoida = bogTuriniTop(p.manba.tur, p.maqsad.tur);
  const mId = idSon(p.manba.id), qId = idSon(p.maqsad.id);
  const versiya = sonYoki(p.maqsad.meta?.versiya);
  if (!qoida || qoida.tur !== p.tur || mId == null || qId == null) return xato(t('Bu ikki tugunni bog‘lab bo‘lmaydi.'));
  if (versiya == null) return versiyaYoq();
  if (bogliMi(g, p.tur, p.manba.id, p.maqsad.id) && p.tur !== 'qatnashchi') return xato(t('Bu bog‘lanish allaqachon mavjud.'));
  return reja({
    amal: p.amal, sarlavha: p.sarlavha, oqibat: p.oqibat, ogoh: p.ogoh, buyruqlar: ['mindmap_bog'], tasdiq: p.tasdiq ?? t('Biriktirish'),
    yamoq: { qosh: [{ tur: p.tur, manba: p.manba.id, maqsad: p.maqsad.id, rol: p.rol }], versiyaOshir: [p.maqsad.id] },
    bajar: () => k.yozuvchi.bog(p.tur, mId, qId, versiya, p.rol),
  });
}

function uzishRejasi(k: PultKontekst, p: {
  amal: string; tur: BogTur; manba: MindmapTugun; maqsad: MindmapTugun; sarlavha: string; oqibat: string[]; rol?: string;
}): PultTayyor {
  const mId = idSon(p.manba.id), qId = idSon(p.maqsad.id);
  const versiya = sonYoki(p.maqsad.meta?.versiya);
  if (mId == null || qId == null) return xato(t('Tugun topilmadi.'));
  if (versiya == null) return versiyaYoq();
  return reja({
    amal: p.amal, sarlavha: p.sarlavha, oqibat: p.oqibat, buyruqlar: ['mindmap_bog_ochir'], tasdiq: t('Uzish'),
    yamoq: { ol: [{ tur: p.tur, manba: p.manba.id, maqsad: p.maqsad.id, rol: p.rol }], versiyaOshir: [p.maqsad.id] },
    ogoh: [t('Faqat bog‘lanish uziladi — yozuvlarning o‘zi (smeta, F2, fakt, hujjat) o‘chmaydi.')],
    bajar: () => k.yozuvchi.bogOchir(p.tur, mId, qId, versiya, p.rol),
  });
}

const nomMaydon = (nom: () => string): PultMaydon => ({ kalit: 'nom', nom, majburiy: true, tur: 'matn' });

/* ───────────── REESTR ───────────── */

export const PULT_AMALLAR: readonly PultTarif[] = [
  // ── Kompaniya ──
  {
    kalit: 'loyiha.yarat', tur: 'kompaniya', nom: () => t('Yangi loyiha'), izoh: () => t('Kompaniya ostida yangi loyiha yaratadi.'),
    maydonlar: [nomMaydon(() => t('Loyiha nomi')), { kalit: 'hudud', nom: () => t('Hudud'), tur: 'matn' }],
    tayyorla: (_g, _n, q, k) => {
      const nom = (q.nom ?? '').trim();
      if (!nom) return xato(t('Loyiha nomi majburiy.'));
      return reja({
        amal: 'loyiha.yarat', sarlavha: t('Yangi loyiha yaratish'), buyruqlar: ['loyiha_yarat'], tasdiq: t('Loyiha yaratish'),
        oqibat: [t('Yangi loyiha: «{nom}»', { nom }), ...((q.hudud ?? '').trim() ? [t('Hudud: {h}', { h: q.hudud.trim() })] : [])],
        bajar: async () => { const r = await k.yozuvchi.loyihaYarat(nom, (q.hudud ?? '').trim()); return { ...r, yangiTugunId: r.ok && r.id ? 'loyiha:' + r.id : undefined }; },
      });
    },
  },

  // ── Loyiha ──
  {
    kalit: 'obyekt.yarat', tur: 'loyiha', nom: () => t('Yangi obyekt'), izoh: () => t('Loyiha ichida yangi obyekt yaratadi (smeta keyin yuklanadi).'),
    maydonlar: [nomMaydon(() => t('Obyekt nomi'))],
    tayyorla: (_g, n, q, k) => {
      const nom = (q.nom ?? '').trim();
      if (!nom) return xato(t('Obyekt nomi majburiy.'));
      if (n.entityId == null) return xato(t('Loyiha topilmadi.'));
      const lid = n.entityId;
      return reja({
        amal: 'obyekt.yarat', sarlavha: t('Yangi obyekt yaratish'), buyruqlar: ['obyekt_yarat'], tasdiq: t('Obyekt yaratish'),
        oqibat: [t('Yangi obyekt: «{nom}»', { nom }), t('Loyiha: «{l}»', { l: n.nom }), t('Smeta bo‘sh bo‘ladi — «Smeta yuklash» keyingi qadam.')],
        bajar: async () => { const r = await k.yozuvchi.obyektYarat(lid, nom); return { ...r, yangiTugunId: r.ok && r.id ? 'obyekt:' + r.id : undefined }; },
      });
    },
  },
  {
    kalit: 'shartnoma.yarat', tur: 'loyiha', nom: () => t('Yangi shartnoma'), izoh: () => t('Shartnoma yaratib, shu loyihaga biriktiradi.'),
    maydonlar: [nomMaydon(() => t('Shartnoma raqami')), { kalit: 'taraf', nom: () => t('Taraf (kim bilan)'), tur: 'matn' }],
    tayyorla: (_g, n, q, k) => {
      const raqam = (q.nom ?? '').trim();
      if (!raqam) return xato(t('Shartnoma raqami majburiy.'));
      if (n.entityId == null) return xato(t('Loyiha topilmadi.'));
      const lid = n.entityId;
      return reja({
        amal: 'shartnoma.yarat', sarlavha: t('Yangi shartnoma yaratish'), buyruqlar: ['shartnoma_saqla', 'mindmap_bog'], tasdiq: t('Shartnoma yaratish'),
        oqibat: [t('Yangi shartnoma: №{r}', { r: raqam }), ...((q.taraf ?? '').trim() ? [t('Taraf: {x}', { x: q.taraf.trim() })] : []), t('Loyihaga biriktiriladi: «{l}»', { l: n.nom })],
        bajar: async () => {
          const r = await k.yozuvchi.shartnomaYarat(raqam, (q.taraf ?? '').trim());
          if (!r.ok || !r.id) return r;
          const yangi = 'shartnoma:' + r.id;
          if (r.versiya == null) return { ...r, yangiTugunId: yangi, ogoh: t('Shartnoma yaratildi, lekin loyihaga avtomatik biriktirilmadi (versiya kelmadi) — xaritani yangilab biriktiring.') };
          const b = await k.yozuvchi.bog('shartnoma_loyiha', lid, r.id, r.versiya);
          return b.ok ? { ...r, yangiTugunId: yangi } : { ...r, yangiTugunId: yangi, ogoh: t('Shartnoma yaratildi, lekin loyihaga biriktirilmadi: {x}', { x: sabab(b, '') }) };
        },
      });
    },
  },
  {
    kalit: 'obyekt.biriktir', tur: 'loyiha', nom: () => t('Mavjud obyektni biriktirish'), izoh: () => t('Loyihasiz obyektni shu loyihaga biriktiradi.'),
    bor: (g) => loyihasizObyektlar(g).length > 0,
    maydonlar: [{ kalit: 'obyekt', nom: () => t('Obyekt'), majburiy: true, tur: 'tanlov', tanlovlar: (g) => variantlar(loyihasizObyektlar(g)) }],
    tayyorla: (g, n, q, k) => {
      const loyiha = tugunOl(g, n.id), obyekt = tugunOl(g, q.obyekt ?? '');
      if (!loyiha || !obyekt || obyekt.tur !== 'obyekt') return xato(t('Obyekt tanlanmagan.'));
      return bogRejasi(g, k, { amal: 'obyekt.biriktir', tur: 'obyekt_loyiha', manba: loyiha, maqsad: obyekt, sarlavha: t('Obyektni loyihaga biriktirish'),
        oqibat: [t('Obyekt: «{o}»', { o: obyekt.nom }), t('Loyiha: «{l}»', { l: loyiha.nom })] });
    },
  },
  {
    kalit: 'tomon.biriktir', tur: 'loyiha', nom: () => t('Tomon / subpudratchi biriktirish'), izoh: () => t('Kontragentni loyiha qatnashchisi (zakazchik, pudratchi, subpudratchi …) qiladi.'),
    bor: (g) => tugunlar(g, 'kontragent').length > 0,
    maydonlar: [
      { kalit: 'kontragent', nom: () => t('Kontragent'), majburiy: true, tur: 'tanlov', tanlovlar: (g) => variantlar(tugunlar(g, 'kontragent')) },
      { kalit: 'rol', nom: () => t('Roli'), majburiy: true, tur: 'tanlov', tanlovlar: () => MINDMAP_ROLE_KEYS.map((r) => ({ qiymat: r, nom: rolNomi(r) })) },
    ],
    tayyorla: (g, n, q, k) => {
      const loyiha = tugunOl(g, n.id), kontragent = tugunOl(g, q.kontragent ?? '');
      if (!loyiha || !kontragent || kontragent.tur !== 'kontragent') return xato(t('Kontragent tanlanmagan.'));
      if (!(MINDMAP_ROLE_KEYS as readonly string[]).includes(q.rol ?? '')) return xato(t('Loyiha qatnashchisi roli tanlanishi kerak'));
      if (g.bogichlar.some((b) => b.tur === 'qatnashchi' && b.manba === kontragent.id && b.maqsad === loyiha.id && b.rol === q.rol)) return xato(t('Bu kontragent shu rolda allaqachon biriktirilgan.'));
      return bogRejasi(g, k, { amal: 'tomon.biriktir', tur: 'qatnashchi', manba: kontragent, maqsad: loyiha, rol: q.rol, sarlavha: t('Tomonni loyihaga biriktirish'),
        oqibat: [t('Kontragent: «{x}»', { x: kontragent.nom }), t('Roli: {r}', { r: rolNomi(q.rol) }), t('Loyiha: «{l}»', { l: loyiha.nom })] });
    },
  },
  {
    kalit: 'tomon.uz', tur: 'loyiha', nom: () => t('Tomonni uzish'), izoh: () => t('Loyiha qatnashchisi bog‘lanishini uzadi.'),
    bor: (g, n) => g.bogichlar.some((b) => b.tur === 'qatnashchi' && b.maqsad === n.id && !!b.rol),
    maydonlar: [{
      kalit: 'tomon', nom: () => t('Tomon'), majburiy: true, tur: 'tanlov',
      tanlovlar: (g, n) => g.bogichlar.filter((b) => b.tur === 'qatnashchi' && b.maqsad === n.id && !!b.rol)
        .map((b) => ({ qiymat: b.manba + '|' + b.rol, nom: (tugunOl(g, b.manba)?.nom ?? b.manba) + ' — ' + rolNomi(b.rol) })),
    }],
    tayyorla: (g, n, q, k) => {
      const [kid, rol] = (q.tomon ?? '').split('|');
      const kontragent = tugunOl(g, kid ?? ''), loyiha = tugunOl(g, n.id);
      if (!kontragent || !loyiha || !rol) return xato(t('Tomon tanlanmagan.'));
      return uzishRejasi(k, { amal: 'tomon.uz', tur: 'qatnashchi', manba: kontragent, maqsad: loyiha, rol, sarlavha: t('Tomonni loyihadan uzish'),
        oqibat: [t('Kontragent: «{x}»', { x: kontragent.nom }), t('Roli: {r}', { r: rolNomi(rol) }), t('Loyiha: «{l}»', { l: loyiha.nom })] });
    },
  },
  {
    kalit: 'loyiha.nomla', tur: 'loyiha', nom: () => t('Nomini o‘zgartirish'), izoh: () => t('Loyiha nomini o‘zgartiradi.'),
    maydonlar: [nomMaydon(() => t('Yangi nom'))],
    tayyorla: (_g, n, q, k) => {
      const nom = (q.nom ?? '').trim();
      if (!nom) return xato(t('Yangi nom majburiy.'));
      if (nom === n.nom) return xato(t('Nom o‘zgarmadi.'));
      if (n.entityId == null || n.versiya == null) return versiyaYoq();
      const id = n.entityId, v = n.versiya;
      return reja({
        amal: 'loyiha.nomla', sarlavha: t('Loyiha nomini o‘zgartirish'), buyruqlar: ['loyiha_yangila'], tasdiq: t('Nomini o‘zgartirish'),
        oqibat: [t('Eski nom: «{x}»', { x: n.nom }), t('Yangi nom: «{x}»', { x: nom })],
        yamoq: { nom: { id: n.id, nom }, versiyaOshir: [n.id] },
        bajar: () => k.yozuvchi.loyihaNomla(id, v, nom),
      });
    },
  },

  // ── Shartnoma ──
  {
    kalit: 'shartnoma.obyekt-biriktir', tur: 'shartnoma', nom: () => t('Obyekt biriktirish'), izoh: () => t('Shartnomasiz obyektni shu shartnomaga biriktiradi.'),
    bor: (g) => shartnomasizObyektlar(g).length > 0,
    maydonlar: [{ kalit: 'obyekt', nom: () => t('Obyekt'), majburiy: true, tur: 'tanlov', tanlovlar: (g) => variantlar(shartnomasizObyektlar(g)) }],
    tayyorla: (g, n, q, k) => {
      const shartnoma = tugunOl(g, n.id), obyekt = tugunOl(g, q.obyekt ?? '');
      if (!shartnoma || !obyekt || obyekt.tur !== 'obyekt') return xato(t('Obyekt tanlanmagan.'));
      return bogRejasi(g, k, { amal: 'shartnoma.obyekt-biriktir', tur: 'shartnoma_obyekt', manba: shartnoma, maqsad: obyekt, sarlavha: t('Obyektni shartnomaga biriktirish'),
        oqibat: [t('Obyekt: «{o}»', { o: obyekt.nom }), t('Shartnoma: «{s}»', { s: shartnoma.nom })],
        ogoh: [t('Bitta obyekt faqat bitta shartnomaga biriktiriladi.')] });
    },
  },

  // ── Obyekt ──
  {
    kalit: 'obyekt.shartnoma-biriktir', tur: 'obyekt', nom: () => t('Shartnomaga biriktirish'), izoh: () => t('Obyektni shartnomaga biriktiradi.'),
    bor: (g, n) => n.shartnomaId == null && tugunlar(g, 'shartnoma').length > 0,
    maydonlar: [{ kalit: 'shartnoma', nom: () => t('Shartnoma'), majburiy: true, tur: 'tanlov', tanlovlar: (g) => variantlar(tugunlar(g, 'shartnoma')) }],
    tayyorla: (g, n, q, k) => {
      const obyekt = tugunOl(g, n.id), shartnoma = tugunOl(g, q.shartnoma ?? '');
      if (!obyekt || !shartnoma || shartnoma.tur !== 'shartnoma') return xato(t('Shartnoma tanlanmagan.'));
      return bogRejasi(g, k, { amal: 'obyekt.shartnoma-biriktir', tur: 'shartnoma_obyekt', manba: shartnoma, maqsad: obyekt, sarlavha: t('Obyektni shartnomaga biriktirish'),
        oqibat: [t('Obyekt: «{o}»', { o: obyekt.nom }), t('Shartnoma: «{s}»', { s: shartnoma.nom })] });
    },
  },
  {
    kalit: 'obyekt.shartnoma-uz', tur: 'obyekt', nom: () => t('Shartnomadan ajratish'), izoh: () => t('Obyektni shartnomadan ajratadi.'),
    bor: (_g, n) => n.shartnomaId != null,
    maydonlar: [],
    tayyorla: (g, n, _q, k) => {
      const obyekt = tugunOl(g, n.id), shartnoma = n.shartnomaId != null ? tugunOl(g, 'shartnoma:' + n.shartnomaId) : null;
      if (!obyekt || !shartnoma) return xato(t('Shartnoma topilmadi.'));
      return uzishRejasi(k, { amal: 'obyekt.shartnoma-uz', tur: 'shartnoma_obyekt', manba: shartnoma, maqsad: obyekt, sarlavha: t('Obyektni shartnomadan ajratish'),
        oqibat: [t('Obyekt: «{o}»', { o: obyekt.nom }), t('Shartnoma: «{s}»', { s: shartnoma.nom })] });
    },
  },
  {
    kalit: 'obyekt.loyiha-biriktir', tur: 'obyekt', nom: () => t('Loyihaga biriktirish'), izoh: () => t('Loyihasiz obyektni loyihaga biriktiradi.'),
    bor: (g, n) => n.loyihaId == null && tugunlar(g, 'loyiha').length > 0,
    maydonlar: [{ kalit: 'loyiha', nom: () => t('Loyiha'), majburiy: true, tur: 'tanlov', tanlovlar: (g) => variantlar(tugunlar(g, 'loyiha')) }],
    tayyorla: (g, n, q, k) => {
      const obyekt = tugunOl(g, n.id), loyiha = tugunOl(g, q.loyiha ?? '');
      if (!obyekt || !loyiha || loyiha.tur !== 'loyiha') return xato(t('Loyiha tanlanmagan.'));
      return bogRejasi(g, k, { amal: 'obyekt.loyiha-biriktir', tur: 'obyekt_loyiha', manba: loyiha, maqsad: obyekt, sarlavha: t('Obyektni loyihaga biriktirish'),
        oqibat: [t('Obyekt: «{o}»', { o: obyekt.nom }), t('Loyiha: «{l}»', { l: loyiha.nom })] });
    },
  },
  {
    kalit: 'obyekt.loyiha-uz', tur: 'obyekt', nom: () => t('Loyihadan chiqarish'), izoh: () => t('Obyektni loyihadan chiqaradi (obyekt o‘chmaydi).'),
    bor: (g, n) => n.loyihaId != null && bogliMi(g, 'obyekt_loyiha', 'loyiha:' + n.loyihaId, n.id),
    maydonlar: [],
    tayyorla: (g, n, _q, k) => {
      const obyekt = tugunOl(g, n.id), loyiha = n.loyihaId != null ? tugunOl(g, 'loyiha:' + n.loyihaId) : null;
      if (!obyekt || !loyiha) return xato(t('Loyiha topilmadi.'));
      return uzishRejasi(k, { amal: 'obyekt.loyiha-uz', tur: 'obyekt_loyiha', manba: loyiha, maqsad: obyekt, sarlavha: t('Obyektni loyihadan chiqarish'),
        oqibat: [t('Obyekt: «{o}»', { o: obyekt.nom }), t('Loyiha: «{l}»', { l: loyiha.nom })] });
    },
  },
  {
    kalit: 'obyekt.resurs-biriktir', tur: 'obyekt', nom: () => t('Sklad / texnika / xodim (imzochi) biriktirish'), izoh: () => t('Skladni, texnikani yoki xodimni (masalan, imzo qo‘yuvchi) obyektga biriktiradi.'),
    bor: (g, n) => resursNomzodlari(g, n.id).length > 0,
    maydonlar: [{ kalit: 'resurs', nom: () => t('Resurs'), majburiy: true, tur: 'tanlov', tanlovlar: (g, n) => resursNomzodlari(g, n.id).map((x) => ({ qiymat: x.id, nom: resursTurNomi(x.tur) + ': ' + x.nom })) }],
    tayyorla: (g, n, q, k) => {
      const obyekt = tugunOl(g, n.id), resurs = tugunOl(g, q.resurs ?? '');
      const qoida = obyekt && resurs ? bogTuriniTop(resurs.tur, 'obyekt') : null;
      if (!obyekt || !resurs || !qoida || !RESURS_TURLARI.includes(resurs.tur)) return xato(t('Resurs tanlanmagan.'));
      return bogRejasi(g, k, { amal: 'obyekt.resurs-biriktir', tur: qoida.tur, manba: resurs, maqsad: obyekt, sarlavha: t('Resursni obyektga biriktirish'),
        oqibat: [t('{tur}: «{x}»', { tur: resursTurNomi(resurs.tur), x: resurs.nom }), t('Obyekt: «{o}»', { o: obyekt.nom })] });
    },
  },
  {
    kalit: 'obyekt.resurs-uz', tur: 'obyekt', nom: () => t('Resursni obyektdan uzish'), izoh: () => t('Biriktirilgan sklad/texnika/xodimni uzadi.'),
    bor: (g, n) => biriktirilganResurslar(g, n.id).length > 0,
    maydonlar: [{ kalit: 'resurs', nom: () => t('Resurs'), majburiy: true, tur: 'tanlov', tanlovlar: (g, n) => biriktirilganResurslar(g, n.id).map((x) => ({ qiymat: x.id, nom: resursTurNomi(x.tur) + ': ' + x.nom })) }],
    tayyorla: (g, n, q, k) => {
      const obyekt = tugunOl(g, n.id), resurs = tugunOl(g, q.resurs ?? '');
      const qoida = obyekt && resurs ? bogTuriniTop(resurs.tur, 'obyekt') : null;
      if (!obyekt || !resurs || !qoida || !bogliMi(g, qoida.tur, resurs.id, obyekt.id)) return xato(t('Resurs tanlanmagan.'));
      return uzishRejasi(k, { amal: 'obyekt.resurs-uz', tur: qoida.tur, manba: resurs, maqsad: obyekt, sarlavha: t('Resursni obyektdan uzish'),
        oqibat: [t('{tur}: «{x}»', { tur: resursTurNomi(resurs.tur), x: resurs.nom }), t('Obyekt: «{o}»', { o: obyekt.nom })] });
    },
  },
  {
    kalit: 'obyekt.nomla', tur: 'obyekt', nom: () => t('Nomini o‘zgartirish'), izoh: () => t('Obyekt nomini o‘zgartiradi.'),
    maydonlar: [nomMaydon(() => t('Yangi nom'))],
    tayyorla: (_g, n, q, k) => {
      const nom = (q.nom ?? '').trim();
      if (!nom) return xato(t('Yangi nom majburiy.'));
      if (nom === n.nom) return xato(t('Nom o‘zgarmadi.'));
      if (n.entityId == null) return xato(t('Obyekt topilmadi.'));
      const id = n.entityId;
      return reja({
        amal: 'obyekt.nomla', sarlavha: t('Obyekt nomini o‘zgartirish'), buyruqlar: ['obyekt_yangila'], tasdiq: t('Nomini o‘zgartirish'),
        oqibat: [t('Eski nom: «{x}»', { x: n.nom }), t('Yangi nom: «{x}»', { x: nom })],
        yamoq: { nom: { id: n.id, nom } },
        bajar: () => k.yozuvchi.obyektNomla(id, nom),
      });
    },
  },
  {
    kalit: 'obyekt.imzochi-biriktir', tur: 'obyekt', nom: () => t('Imzochi tayinlash'), izoh: () => t('Obyekt darajasida hujjat imzochisini (F2, F3, АОСР) tayinlaydi yoki almashtiradi.'),
    maydonlar: [
      { kalit: 'rol', nom: () => t('Tomon'), majburiy: true, tur: 'tanlov', tanlovlar: () => IMZO_ROLLAR.map((r) => ({ qiymat: r, nom: imzoRolNomi(r) })) },
      { kalit: 'fio', nom: () => t('F.I.Sh.'), majburiy: true, tur: 'matn' },
      { kalit: 'lavozim', nom: () => t('Lavozim'), tur: 'matn' },
      { kalit: 'tashkilot', nom: () => t('Tashkilot'), tur: 'matn' },
    ],
    tayyorla: (_g, n, q, k) => {
      const fio = (q.fio ?? '').trim();
      if (!(IMZO_ROLLAR as readonly string[]).includes(q.rol ?? '')) return xato(t('Imzochi tomoni tanlanmagan.'));
      if (!fio) return xato(t('Imzochining F.I.Sh. majburiy.'));
      if (n.entityId == null) return xato(t('Obyekt topilmadi.'));
      const id = n.entityId, rol = q.rol, m = { tashkilot: (q.tashkilot ?? '').trim(), lavozim: (q.lavozim ?? '').trim(), fio };
      return reja({
        amal: 'obyekt.imzochi-biriktir', sarlavha: t('Obyektga imzochi tayinlash'), buyruqlar: ['imzochi_saqla'], tasdiq: t('Tayinlash'),
        oqibat: [t('Obyekt: «{o}»', { o: n.nom }), t('Tomon: {r}', { r: imzoRolNomi(rol) }), t('Imzochi: {f}', { f: [fio, m.lavozim, m.tashkilot].filter(Boolean).join(', ') })],
        ogoh: [t('Hujjatlar (F2, F3, АОСР) shu imzochini chiqaradi; hujjatlarning o‘zi qayta tasdiqlanmaydi.')],
        bajar: () => k.yozuvchi.imzochiSaqla(id, rol, m),
      });
    },
  },
  {
    kalit: 'obyekt.imzochi-uz', tur: 'obyekt', nom: () => t('Imzochini olib tashlash'), izoh: () => t('Obyekt darajasidagi imzochini o‘chiradi (loyiha darajasidagi imzochi qaytadi).'),
    maydonlar: [{ kalit: 'rol', nom: () => t('Tomon'), majburiy: true, tur: 'tanlov', tanlovlar: () => IMZO_ROLLAR.map((r) => ({ qiymat: r, nom: imzoRolNomi(r) })) }],
    tayyorla: (_g, n, q, k) => {
      if (!(IMZO_ROLLAR as readonly string[]).includes(q.rol ?? '')) return xato(t('Imzochi tomoni tanlanmagan.'));
      if (n.entityId == null) return xato(t('Obyekt topilmadi.'));
      const id = n.entityId, rol = q.rol;
      return reja({
        amal: 'obyekt.imzochi-uz', sarlavha: t('Obyektdan imzochini olib tashlash'), buyruqlar: ['imzochi_saqla'], tasdiq: t('Olib tashlash'),
        oqibat: [t('Obyekt: «{o}»', { o: n.nom }), t('Tomon: {r}', { r: imzoRolNomi(rol) })],
        ogoh: [t('Faqat obyekt darajasidagi qator o‘chadi; loyiha darajasidagi imzochi (bo‘lsa) qaytadi.')],
        bajar: () => k.yozuvchi.imzochiSaqla(id, rol, { tashkilot: '', lavozim: '', fio: '' }),
      });
    },
  },
];

const IMZO_ROLLAR = ['zakazchik', 'pudratchi', 'subpudratchi', 'texnadzor', 'loyihachi'] as const;
const IMZO_NOMI: Record<(typeof IMZO_ROLLAR)[number], () => string> = {
  zakazchik: () => t('Buyurtmachi'), pudratchi: () => t('Pudratchi'), subpudratchi: () => t('Subpudratchi'), texnadzor: () => t('Texnadzor'), loyihachi: () => t('Loyihachi'),
};
const imzoRolNomi = (r: string) => (IMZO_NOMI as Record<string, () => string>)[r]?.() ?? r;

/* ───────────── Nomzodlar ───────────── */

const RESURS_TURLARI: TugunTur[] = ['sklad', 'texnika', 'kadr'];
const resursTurNomi = (tur: TugunTur) => (tur === 'sklad' ? t('Sklad') : tur === 'texnika' ? t('Texnika') : t('Xodim'));
const RESURS_BOG: Partial<Record<TugunTur, BogTur>> = { sklad: 'sklad_obyekt', texnika: 'texnika_obyekt', kadr: 'kadr_obyekt' };

function loyihasizObyektlar(g: MindmapGraf): MindmapTugun[] {
  const m = pultMunosabatlari(g);
  return tugunlar(g, 'obyekt').filter((o) => !m.obyektLoyiha.has(o.id));
}
function shartnomasizObyektlar(g: MindmapGraf): MindmapTugun[] {
  const m = pultMunosabatlari(g);
  return tugunlar(g, 'obyekt').filter((o) => !m.obyektShartnoma.has(o.id));
}
function biriktirilganResurslar(g: MindmapGraf, obyektId: string): MindmapTugun[] {
  return RESURS_TURLARI.flatMap((tur) => tugunlar(g, tur).filter((r) => bogliMi(g, RESURS_BOG[tur]!, r.id, obyektId)));
}
function resursNomzodlari(g: MindmapGraf, obyektId: string): MindmapTugun[] {
  return RESURS_TURLARI.flatMap((tur) => tugunlar(g, tur).filter((r) => !bogliMi(g, RESURS_BOG[tur]!, r.id, obyektId)));
}

/* ───────────── Ko‘ruvchiga ko‘rinadigan amallar ───────────── */

/**
 * Nishon uchun amallar (reestr tartibida). Mavjud bo‘lmagan (`bor` — false) amal chiqmaydi.
 * Yozish ruxsati yo‘q bo‘lsa — amallar KO‘RINADI, lekin `mumkin=false` + sabab bilan (oddiy menyu qoidasi bilan bir xil).
 */
export function pultAmallari(g: MindmapGraf, n: PultNishon | null, tahrir: TahrirRuxsati): PultAmal[] {
  if (!n) return [];
  const yopiq = tahrirYopiqMatni(tahrir);
  const natija: PultAmal[] = [];
  for (const a of PULT_AMALLAR) {
    if (a.tur !== n.tur) continue;
    if (a.bor && !a.bor(g, n)) continue;
    natija.push({ kalit: a.kalit, nom: a.nom(), izoh: a.izoh(), maydonlar: a.maydonlar, mumkin: tahrir.mumkin, sabab: tahrir.mumkin ? null : yopiq });
  }
  return natija;
}

/** Amalni tayyorlaydi (HECH NARSA yozmaydi). Ruxsat yo‘q — xato. */
export function pultTayyorla(g: MindmapGraf, nishonId: string, kalit: string, qiymatlar: Record<string, string>, k: PultKontekst): PultTayyor {
  const n = pultNishon(g, nishonId);
  const a = PULT_AMALLAR.find((x) => x.kalit === kalit);
  if (!n || !a || a.tur !== n.tur || (a.bor && !a.bor(g, n))) return xato(t('Bu amal bu tugunda mavjud emas.'));
  if (!k.tahrir.mumkin) return xato(tahrirYopiqMatni(k.tahrir) ?? t('Faqat ko‘rish rejimi'));
  return a.tayyorla(g, n, qiymatlar, k);
}

/* ───────────── AI yordamchi reestri uchun interfeys ───────────── */

export type PultAsbob = {
  /** Yagona nom: `mindmap.<amal>`. */
  nom: string;
  tavsif: string;
  /** Yozuvchi amal — AI uni faqat REJA sifatida qaytaradi, bajarish foydalanuvchi tasdig‘idan keyin. */
  yozadi: true;
  nishonTuri: PultNishonTur;
  parametrlar: { kalit: string; tavsif: string; majburiy: boolean; variantlar?: string[] }[];
  tayyorla: (g: MindmapGraf, nishonId: string, qiymatlar: Record<string, string>, k: PultKontekst) => PultTayyor;
};

export function pultAsboblar(): PultAsbob[] {
  return PULT_AMALLAR.map((a) => ({
    nom: 'mindmap.' + a.kalit, tavsif: a.nom() + ' — ' + a.izoh(), yozadi: true as const, nishonTuri: a.tur,
    parametrlar: [{ kalit: 'tugun_id', tavsif: t('Nishon tugun id (masalan loyiha:3)'), majburiy: true }, ...a.maydonlar.map((m) => ({ kalit: m.kalit, tavsif: m.nom(), majburiy: !!m.majburiy }))],
    tayyorla: (g, nishonId, q, k) => pultTayyorla(g, nishonId, a.kalit, q, k),
  }));
}

/**
 * Yamoqni grafga qo‘llaydi (sof; yangi graf qaytaradi). Qo‘shilayotgan chiziq allaqachon bo‘lsa — takrorlanmaydi;
 * qatnashchi uchun (manba, maqsad, rol) uchligi bo‘yicha.
 */
export function grafgaYamoq(g: MindmapGraf, y: PultYamoq | undefined): MindmapGraf {
  if (!y) return g;
  const bir = (a: { tur: string; manba: string; maqsad: string; rol?: string }, b: { tur: string; manba: string; maqsad: string; rol?: string }) =>
    a.tur === b.tur && a.manba === b.manba && a.maqsad === b.maqsad && (a.tur !== 'qatnashchi' || (a.rol ?? '') === (b.rol ?? ''));
  let bogichlar = g.bogichlar;
  // Bitta obyekt — bitta shartnoma/loyiha: yangi ota bog‘lansa, eskisi chiqadi.
  for (const q of y.qosh ?? []) {
    if (q.tur === 'shartnoma_obyekt' || q.tur === 'obyekt_loyiha') bogichlar = bogichlar.filter((b) => !(b.tur === q.tur && b.maqsad === q.maqsad));
    if (!bogichlar.some((b) => bir(b, q))) bogichlar = [...bogichlar, { manba: q.manba, maqsad: q.maqsad, tur: q.tur, uzsa_boladi: true, ...(q.rol ? { rol: q.rol } : {}) }];
  }
  for (const o of y.ol ?? []) bogichlar = bogichlar.filter((b) => !bir(b, o));
  const oshir = new Set(y.versiyaOshir ?? []);
  const tugunlar = g.tugunlar.map((x) => {
    const nom = y.nom && y.nom.id === x.id ? y.nom.nom : x.nom;
    const v = oshir.has(x.id) && typeof x.meta?.versiya === 'number' ? { ...x.meta, versiya: x.meta.versiya + 1 } : x.meta;
    return nom === x.nom && v === x.meta ? x : { ...x, nom, meta: v };
  });
  return { ...g, tugunlar, bogichlar };
}