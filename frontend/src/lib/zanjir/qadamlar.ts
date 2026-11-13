/**
 * Pudratchi ish zanjiri — YAGONA sof model (React/tarmoq yo'q).
 *
 * Tartib (qurilish mantig'i): Smeta (yuklangan, narxlangan) → Fakt → АОСР (yashirin ishlar, F2 dan OLDIN) →
 * F2 (oylik akt) → Forma 3 / nakopitelniy → To'lov va akt-sverka.
 *
 * Kirish — sahifa allaqachon yuklagan ma'lumot. NULL ≠ 0: noma'lum (o'qilmadi) hech qachon «bajarildi» emas:
 * u `unknown` holat bo'ladi va taxmin qilinmaydi. Yangi hisob dvigateli yo'q — sonlar mavjud o'qishlardan (markazHolati).
 *
 * Holatlar: done — bajarilgan; current — hozir qilish mumkin va kerak; blocked — oldingi qadam (qattiq shart)
 * tugamagan; not_started — qilish mumkin, lekin navbat boshqa qadamda; unknown — ma'lumot yo'q.
 */
import { t } from '../../i18n/til';
import { markazHolati, type MarkazAkt } from '../pto-markazi/markaz';
import { bosqich } from '../f2-reestr/reestr';

export type ZanjirQadamId = 'smeta' | 'fakt' | 'aosr' | 'f2' | 'f3' | 'tolov' | 'slichitelniy';
export type QadamHolat = 'done' | 'current' | 'blocked' | 'not_started' | 'unknown';

/** Zanjir tartibi (testlar, UI va menyu uchun yagona manba). */
export const ZANJIR_TARTIB: readonly ZanjirQadamId[] = ['smeta', 'fakt', 'aosr', 'f2', 'f3', 'tolov', 'slichitelniy'];

/** Har qadam bajariladigan sahifa (obyekt/oy qidiruv qatori — chaqiruvchi qo'shadi). */
export const ZANJIR_YOL: Record<ZanjirQadamId, string> = {
  smeta: '/admin/holat',
  fakt: '/admin/fakt',
  aosr: '/admin/aosr',
  f2: '/admin/f2-tayyorlash',
  f3: '/admin/nakopitelniy',
  tolov: '/admin/moliya',
  /** Obyekt sahifasidagi «Slichitelniy» bo'limi (hash bilan ochiladi). */
  slichitelniy: '/admin/holat',
};

export type ZanjirKirish = {
  /** `bor`: smeta yuklanganmi (null — noma'lum). `narxsiz`: narxi topilmagan qatorlar (null — noma'lum). */
  smeta: { bor: boolean | null; narxsiz: number | null };
  /** Saqlangan (qoralamadan tashqari) fakt aktlari soni; null — akt reestri o'qilmadi. */
  faktSaqlangan: number | null;
  faktQoralama: number | null;
  /** АОСР qamrovi: yashirin ish qatorlari va ulardan АОСР siz qolgani; null — shu sahifada o'qilmagan. */
  aosr: { yashirin: number; aktsiz: number } | null;
  /** Ish oyida (bekor qilinmagan) F2 bormi; null — noma'lum. */
  f2BuOyda: boolean | null;
  f2TasdiqBuOyda: number | null;
  /** Shu oy uchun Forma 3 soni; null — noma'lum. */
  forma3: number | null;
  /** Obyekt bo'yicha yozilgan to'lovlar soni; null — noma'lum. */
  tolovYozilgan: number | null;
  /** Shartnoma darajasida: F3 jami / to'langan / qarz (so'm, QQS bilan); null/yo'q — shu sahifada o'qilmagan yoki shartnoma bog'lanmagan. */
  tolov?: { f3Jami: number; tolangan: number; qarz: number } | null;
  /** Smeta barg (ish) qatorlari soni — faqat obyekt sahifasi o'qigan bo'lsa; yo'q/null — son ko'rsatilmaydi. */
  smetaQator?: number | null;
  /** Fakt qamrovi, % (fakti bor ish qatorlari ulushi); yo'q/null — son ko'rsatilmaydi. */
  faktQamrov?: number | null;
  /** Holat ma'lumotida (t2_qator_holat) fakt_hajm/fakt_summa > 0 qator bor — fakt hujjatlari holatidan qat'i nazar (import/boshqa yo'l). Yo'q/null — noma'lum. */
  faktHolatda?: boolean | null;
  /** Slichitelniy: smetadan farqli (ortiq/kam) ish qatorlari; null/yo'q — shu sahifada hisoblanmagan (noma'lum). */
  slichitelniy?: { farqli: number; barglar: number } | null;
  /**
   * OBYEKT DARAJASI yig'ma (oyga bog'liq emas): obyektdagi tasdiqlangan F-2 lar soni va oxirgisining oyi.
   * Yo'q (undefined) — eski kelishuv: faqat joriy oy ma'lumoti. null — akt reestri o'qilmadi.
   */
  f2TasdiqJami?: number | null;
  f2OxirgiOy?: string | null;
  /** Obyektdagi АОСР reestri: bekor qilinmagan jami va ishga bog'lanmaganlar soni; null/yo'q — o'qilmagan. */
  aosrReestr?: { jami: number; boglanmagan: number } | null;
  /**«YYYY-MM». */
  oy: string;
};

export type ZanjirQadam = {
  id: ZanjirQadamId;
  nom: string;
  holat: QadamHolat;
  /** Qisqa holat izohi (nega shu holat). */
  izoh: string;
  /** Shu qadam tavsiya bo'lganda tugma/sarlavha matni. */
  amal: string;
};

export type ZanjirTavsiya = {
  id: ZanjirQadamId;
  amal: string;
  sabab: string;
  /** Tavsiyadan oldingi qadamlardan biri noma'lum bo'lsa — tekshirish eslatmasi. */
  eslatma: string | null;
  /** false — tavsiya noma'lum holatdagi qadamga (ma'lumot yo'q, tekshirish kerak). */
  aniq: boolean;
};

export type ZanjirNatija = {
  qadamlar: ZanjirQadam[];
  keyingi: ZanjirTavsiya | null;
  /** Hamma qadam ma'lum va bajarilgan. */
  tugallandi: boolean;
};

/** `idle` — oy darajasidagi qadam: bu oyda ish yo'q, lekin obyekt darajasida bajarilgan (zanjirni to'smaydi, tavsiya qilinmaydi). */
type Own = 'done' | 'todo' | 'unknown' | 'idle';
const musbat = (n: number | null | undefined): n is number => n != null && n > 0;
/** Obyektdagi tasdiqlangan F-2 lar soni: yig'ma bo'lsa u, bo'lmasa joriy oy soni; noma'lum — null. */
const f2Jami = (k: ZanjirKirish): number | null => (k.f2TasdiqJami !== undefined ? k.f2TasdiqJami : k.f2TasdiqBuOyda);
/** Bu oyda yo'q, lekin obyektda tasdiqlangan F-2 lar bor (yig'ma ma'lumot beriladi). */
const oydaYoq = (k: ZanjirKirish): boolean => !musbat(k.f2TasdiqBuOyda) && musbat(k.f2TasdiqJami);
const oydaYoqIzoh = (k: ZanjirKirish): string => k.f2OxirgiOy
  ? t('Bu oyda yo‘q · jami {n} ta tasdiqlangan F-2 (oxirgisi {oy})', { n: k.f2TasdiqJami as number, oy: k.f2OxirgiOy })
  : t('Bu oyda yo‘q · jami {n} ta tasdiqlangan F-2', { n: k.f2TasdiqJami as number });

const NOMLAR: Record<ZanjirQadamId, () => string> = {
  smeta: () => t('Smeta'), fakt: () => t('Fakt'), aosr: () => t('АОСР'), f2: () => t('F2'), slichitelniy: () => t('Slichitelniy'), f3: () => t('Forma 3'),tolov: () => t('To‘lov'),
};

/** Qadamning o'z ma'lumotidan holati + izoh + amal (oldingi qadamlarga bog'liq emas). */
function ozi(id: ZanjirQadamId, k: ZanjirKirish): { own: Own; izoh: string; amal: string } {
  const nomalum = t('Noma‘lum');
  switch (id) {
    case 'smeta': {
      if (k.smeta.bor == null) return { own: 'unknown', izoh: nomalum, amal: t('Smetani tekshiring') };
      if (!k.smeta.bor) return { own: 'todo', izoh: t('Smeta yuklanmagan'), amal: t('Smetani yuklang') };
      if (k.smeta.narxsiz == null) return { own: 'unknown', izoh: t('Narxsiz qatorlar soni noma‘lum'), amal: t('Smetani tekshiring') };
      if (k.smeta.narxsiz > 0) return { own: 'todo', izoh: t('{n} qator narxsiz', { n: k.smeta.narxsiz }), amal: t('Smetani narxlang') };
      return { own: 'done', izoh: musbat(k.smetaQator) ? t('{n} ish qatori, hammasi narxlangan', { n: k.smetaQator }) : t('Smeta yuklangan va narxlangan'), amal: t('Smetani ko‘ring') };
    }
    case 'fakt': {
      /* Fakt holatda bor (F-2 import va h.k.) — hujjat reestri qoralama/bo'sh bo'lsa ham u «bor»; faqat saqlangan fakt akti toza bo'lsa eski yo'l. */
      if (k.faktHolatda === true && !(musbat(k.faktSaqlangan) && !musbat(k.faktQoralama))) {
        return { own: 'done', izoh: k.faktQamrov != null ? t('Obyektda fakt bor, qamrov {p}%', { p: k.faktQamrov }) : t('Obyektda fakt bor'), amal: t('Faktni ko‘ring') };
      }
      if (k.faktSaqlangan == null) return { own: 'unknown', izoh: nomalum, amal: t('Faktni tekshiring') };
      if (musbat(k.faktQoralama)) {
        const izoh = k.faktSaqlangan > 0 ? t('{n} ta fakt qoralamada · {m} ta saqlangan', { n: k.faktQoralama, m: k.faktSaqlangan }) : t('{n} ta fakt qoralamada', { n: k.faktQoralama });
        return { own: 'todo', izoh, amal: t('Faktni yakunlang') };
      }
      if (k.faktSaqlangan === 0) return { own: 'todo', izoh: t('Bajarilgan ish kiritilmagan'), amal: t('Fakt kiriting') };
      return { own: 'done', izoh: k.faktQamrov != null ? t('{n} ta fakt akti, qamrov {p}%', { n: k.faktSaqlangan, p: k.faktQamrov }) : t('{n} ta fakt akti', { n: k.faktSaqlangan }), amal: t('Faktni ko‘ring') };
    }
    case 'aosr': {
      /* Obyekt darajasi: reestr (jami / ishga bog'lanmaganlar); aniqroq qamrov (yashirin ish) berilgan bo'lsa u ustun. */
      if (!k.aosr && k.aosrReestr) {
        const { jami, boglanmagan } = k.aosrReestr;
        if (jami <= 0) return { own: 'todo', izoh: t('Hali АОСР yo‘q'), amal: t('АОСР tayyorlang') };
        if (boglanmagan > 0) return { own: 'todo', izoh: t('{j} ta АОСР, {b} tasi ishga bog‘lanmagan', { j: jami, b: boglanmagan }), amal: t('АОСР ni bog‘lang') };
        return { own: 'done', izoh: t('{j} ta АОСР, hammasi ishga bog‘langan', { j: jami }), amal: t('АОСР ni ko‘ring') };
      }
      if (!k.aosr) return { own: 'unknown', izoh: nomalum, amal: t('АОСР ni tekshiring') };
      if (k.aosr.aktsiz > 0) return { own: 'todo', izoh: t('{n} ta yashirin ish АОСР siz', { n: k.aosr.aktsiz }), amal: t('АОСР tayyorlang') };
      return { own: 'done', izoh: k.aosr.yashirin > 0 ? t('{a}/{y} yashirin ish АОСР bilan yopilgan',{ a: k.aosr.yashirin - k.aosr.aktsiz, y: k.aosr.yashirin }) : t('Yashirin ish yo‘q'), amal: t('АОСР ni ko‘ring') };
    }
    case 'f2': {
      if (musbat(k.f2TasdiqBuOyda)) return { own: 'done', izoh: t('{oy} uchun F2 tasdiqlangan', { oy: k.oy }), amal: t('F2 ni ko‘ring') };
      if (k.f2BuOyda == null) return { own: 'unknown', izoh: nomalum, amal: t('F2 ni tekshiring') };
      if (k.f2BuOyda) return { own: 'todo', izoh: t('{oy} F2 qoralamada — tasdiqlang', { oy: k.oy }), amal: t('F2 ni tasdiqlang') };
      if (oydaYoq(k)) return { own: 'idle', izoh: oydaYoqIzoh(k), amal: t('F2 ni ko‘ring') };
      return { own: 'todo', izoh: t('{oy} uchun F2 hali yo‘q', { oy: k.oy }), amal: t('F2 tayyorlang') };
    }
    case 'f3': {
      if (musbat(k.forma3)) return { own: 'done', izoh: t('Forma 3 tuzilgan'), amal: t('Forma 3 ni ko‘ring') };
      if (!musbat(k.f2TasdiqBuOyda) && k.tolov && k.tolov.f3Jami > 0) return { own: 'done', izoh: t('Shartnoma bo‘yicha Forma 3 tuzilgan'), amal: t('Forma 3 ni ko‘ring') };
      if (oydaYoq(k)) return { own: 'idle', izoh: oydaYoqIzoh(k), amal: t('Forma 3 ni ko‘ring') };
      if (k.forma3 == null) return { own: 'unknown', izoh: nomalum, amal: t('Forma 3 ni tekshiring') };
      return { own: 'todo', izoh: t('Forma 3 hali yo‘q'), amal: t('Forma 3 tayyorlang') };
    }
    case 'slichitelniy': {
      if (!k.slichitelniy) return { own: 'unknown', izoh: nomalum, amal: t('Slichitelniyni tekshiring') };
      const f2n = musbat(k.f2TasdiqJami) ? t(' · {m} ta tasdiqlangan F-2', { m: k.f2TasdiqJami }) : '';
      if (k.slichitelniy.farqli > 0) return { own: 'todo', izoh: t('{n} qatorda farq bor', { n: k.slichitelniy.farqli }) + f2n, amal: t('Slichitelniyni oching') };
      return { own: 'done', izoh: t('Smetadan farq yo‘q') + f2n, amal: t('Slichitelniyni ko‘ring') };
    }
    case 'tolov': {
      /* Shartnoma darajasidagi son (faqat obyekt sahifasi o'qigan): F3 bo'yicha jami / to'langan / qarz, QQS bilan. */
      if (k.tolov && k.tolov.f3Jami > 0) {
        const s = (x: number) => Math.round(x).toLocaleString('ru-RU');
        const p = { t: s(k.tolov.tolangan), f: s(k.tolov.f3Jami), q: s(k.tolov.qarz) };
        if (k.tolov.qarz <= 0.005) return { own: 'done', izoh: t('To‘langan {t} / F3 {f} (QQS bilan)', p), amal: t('To‘lovni ko‘ring') };
        if (k.tolov.tolangan > 0) return { own: 'todo', izoh: t('To‘langan {t} / F3 {f}, qarz {q} (QQS bilan)', p), amal: t('To‘lov va akt-sverka') };
        return { own: 'todo', izoh: t('To‘lov yo‘q, F3 {f} (QQS bilan)', p), amal: t('To‘lov va akt-sverka') };
      }
      if (musbat(k.tolovYozilgan)) return { own: 'done', izoh: t('To‘lov yozilgan'), amal: t('To‘lovni ko‘ring') };
      if (k.tolovYozilgan == null) return { own: 'unknown', izoh: t('To‘lov holati noma‘lum'), amal: t('To‘lov va akt-sverkani tekshiring') };
      return { own: 'todo', izoh: t('To‘lov hali yozilmagan'), amal: t('To‘lov va akt-sverka') };
    }
  }
}

/**
 * Qattiq shart: oldingi qadam ANIQ bajarilmagan (todo yoki o'zi blocked) bo'lsa — bu qadam blocked.
 * Noma'lum — to'smaydi (taxmin qilinmaydi). АОСР F2 ning qattiq sharti emas (yumshoq: tavsiya tartibida F2 dan oldin).
 */
function bloklovchi(id: ZanjirQadamId, k: ZanjirKirish, tugamagan: ReadonlySet<ZanjirQadamId>): string | null {
  switch (id) {
    case 'fakt': return k.smeta.bor === false ? t('Avval smetani yuklang') : null;
    /* Obyekt darajasi: «Avval fakt kerak» faqat obyektda umuman (saqlangan) fakt bo'lmasa — qoralama yoki boshqa oy to'smaydi. */
    case 'aosr': case 'f2': return (k.faktSaqlangan === 0 && k.faktHolatda !== true) || k.smeta.bor === false ? t('Avval fakt kerak') : null;
    /* F3 va slichitelniy: obyektda tasdiqlangan F2 umuman bo'lmasa bloklanadi (oyga qarab emas). */
    case 'f3': return f2Jami(k) === 0 ? t('Avval F2 tasdiqlanishi kerak') : null;
    case 'slichitelniy': return f2Jami(k) === 0 ? t('Avval F2 tasdiqlanishi kerak') : null;
    case 'tolov': return tugamagan.has('f3') && !(k.tolov && k.tolov.f3Jami > 0) ? t('Avval Forma 3 kerak') : null;
    default: return null;
  }
}

export function zanjirHisobla(k: ZanjirKirish): ZanjirNatija {
  const hisob = ZANJIR_TARTIB.map((id) => ({ id, ...ozi(id, k) }));
  /** Aniq tugamagan (todo yoki blocked) qadamlar — keyingilar uchun qattiq shart. */
  const tugamagan = new Set<ZanjirQadamId>();
  let joriyBor = false;
  const qadamlar: ZanjirQadam[] = hisob.map((h) => {
    let holat: QadamHolat;
    let izoh = h.izoh;
    if (h.own === 'done') holat = 'done';
    else {
      const blok = bloklovchi(h.id, k, tugamagan);
      if (blok) { holat = 'blocked'; izoh = blok; }
      else if (h.own === 'unknown') holat = 'unknown';
      else if (h.own === 'idle') holat = 'not_started';
      else if (joriyBor) { holat = 'not_started'; }
      else { holat = 'current'; joriyBor = true; }
    }
    if (holat === 'blocked' || h.own === 'todo') tugamagan.add(h.id);
    return { id: h.id, nom: NOMLAR[h.id](), holat, izoh, amal: h.amal };
  });

  const nomalumOldin = (index: number): ZanjirQadam | undefined => qadamlar.slice(0, index).find((q) => q.holat === 'unknown');
  let ind = qadamlar.findIndex((q) => q.holat === 'current');
  let aniq = true;
  if (ind < 0) { ind = qadamlar.findIndex((q) => q.holat === 'unknown'); aniq = false; }
  const q = ind >= 0 ? qadamlar[ind] : null;
  const unk = q && aniq ? nomalumOldin(ind) : undefined;
  return {
    qadamlar,
    keyingi: q ? { id: q.id, amal: q.amal, sabab: q.izoh, eslatma: unk ? t('{nom} holati noma‘lum — tekshiring', { nom: unk.nom }) : null, aniq } : null,
    tugallandi: qadamlar.every((x) => x.holat === 'done'),
  };
}

/**
 * Sahifa ma'lumotidan kirish yasash: akt reestri (`t2_akt_reestr`) → markazHolati (mavjud hisob), obyekt jami (`t2_obyekt_jami`).
 * `obyekt` null — ro'yxatda topilmadi (smeta noma'lum). `jami == null` — obyektda smeta yo'q (mavjud kelishuv).
 */
export function zanjirKirishYasa(p: {
  obyekt: { jami?: number | null; narxsiz?: number | null } | null;
  aktlar: readonly MarkazAkt[] | null;
  oy: string;
  forma3?: number | null;
  aosr?: { yashirin: number; aktsiz: number } | null;
  tolovYozilgan?: number | null;
  smetaQator?: number | null;
  faktQamrov?: number | null;
  faktHolatda?: boolean | null;
  slichitelniy?: ZanjirKirish['slichitelniy'];
  tolov?: ZanjirKirish['tolov'];
  aosrReestr?: ZanjirKirish['aosrReestr'];
}): ZanjirKirish {
  /* Obyekt darajasidagi yig'ma: oxirgi tasdiqlangan F-2 oyi (oyga qarab emas). */
  let f2OxirgiOy: string | null = null;
  for (const a of p.aktlar ?? []) {
    if (a.tur !== 'f2' || bosqich({ holat: a.holat, lifecycle_status: a.lifecycle_status ?? null }) !== 'tasdiqlangan') continue;
    const o = String(a.oy ?? '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(o) && (f2OxirgiOy == null || o > f2OxirgiOy)) f2OxirgiOy = o;
  }
  const h = markazHolati({ smetaJami: p.obyekt?.jami ?? null, narxsiz: p.obyekt?.narxsiz ?? null, aktlar: p.aktlar, importQoralama: null, forma3: p.forma3 ?? null, oy: p.oy });
  return {
    smeta: { bor: p.obyekt == null ? null : p.obyekt.jami != null, narxsiz: p.obyekt == null || p.obyekt.jami == null ? null : p.obyekt.narxsiz ?? null },
    faktSaqlangan: h.faktSaqlangan,
    faktQoralama: h.faktQoralama,
    aosr: p.aosr ?? null,
    f2BuOyda: h.f2BuOyda,
    f2TasdiqBuOyda: h.f2TasdiqBuOyda,
    f2TasdiqJami: h.f2Tasdiq,
    f2OxirgiOy,
    aosrReestr: p.aosrReestr ?? null,
    forma3: p.forma3 ?? null,
    tolovYozilgan: p.tolovYozilgan ?? null,
    smetaQator: p.smetaQator ?? null,
    faktQamrov: p.faktQamrov ?? null,
    faktHolatda: p.faktHolatda ?? null,
    slichitelniy: p.slichitelniy ?? null,
    tolov: p.tolov ?? null,
    oy: p.oy,
  };
}

/** Obyekt sahifasi allaqachon yuklagan daraxt+holatdan zanjir sonlari (yangi so'rov yo'q). Bo'sh daraxt — hammasi null. */
export function zanjirDaraxtdan(
  rows: ReadonlyArray<{ id: number; tur: string | null }>,
  states: ReadonlyArray<{ qator_id: number; fakt_hajm: number; fakt_summa?: number | null }>,
  slichFarqli: number | null,
): { smetaQator: number | null; faktQamrov: number | null; slichitelniy: { farqli: number; barglar: number } | null; faktHolatda?: boolean } {
  const ishlar = rows.filter((r) => r.tur === 'bl');
  if (ishlar.length === 0) return { smetaQator: null, faktQamrov: null, slichitelniy: null };
  const fakt = new Map(states.map((s) => [s.qator_id, Number(s.fakt_hajm)]));
  const faktli = ishlar.filter((r) => (fakt.get(r.id) ?? 0) > 0).length;
  const faktHolatda = states.some((s) => Number(s.fakt_hajm) > 0 || Number(s.fakt_summa ?? 0) > 0);
  return {
    faktHolatda,
    smetaQator: ishlar.length,
    faktQamrov: Math.round((faktli / ishlar.length) * 100),
    slichitelniy: slichFarqli == null ? null : { farqli: slichFarqli, barglar: ishlar.length },
  };
}

/** Pudratchi tomon rollari — faqat shularga zanjir chizig'i ko'rinadi (texnadzor/buyurtmachi menyusi o'zgarmaydi). Rol noma'lum (null) — ko'rsatiladi. */
const ZANJIR_ROLLAR: ReadonlySet<string> = new Set(['pto', 'boss', 'prorab', 'rahbar', 'bugalter', 'admin', 'superadmin', 'owner']);
export const zanjirRolKoradi = (rol: string | null | undefined): boolean => rol == null || rol === '' || ZANJIR_ROLLAR.has(rol);
