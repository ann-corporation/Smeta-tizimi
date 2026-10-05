/**
 * supabase.ts — SUPABASE KO'ZGUSIDAN O'QISH
 * ═══════════════════════════════════════════════════════════════════
 *
 * NIMA UCHUN. Hozir saytdagi HAR BIR o'qish Google Sheets'ga boradi:
 * GAS faylni ochadi, varaqni skanlaydi, daraxtni quradi va qaytaradi.
 * Katta obyektda bu soniyalar oladi va Cloudflare'ning 100 soniyalik
 * chegarasiga urilishi mumkin.
 *
 * `70_Supabase.js` esa AYNI ma'lumotni Postgres'ga ko'chirib turadi
 * (soatlik + kunlik sinx). Ya'ni ko'zgu ALLAQACHON to'lib turibdi —
 * lekin hech kim undan O'QIMASDI. Bu modul o'sha bo'shliqni yopadi.
 *
 * ⚠️ ARXITEKTURA QOIDASI: yagona HAQIQAT MANBAI — Google Sheets.
 * Supabase faqat TEZ O'QISH uchun ko'zgu. Bu yerdan hech qachon
 * YOZILMAYDI va ko'zgu «haqiqat» sifatida ishlatilmaydi: yozish, F2,
 * hisob-kitob — hammasi avvalgidek GAS orqali.
 *
 * ⚠️ IKKINCHI QOIDA: ko'zgu bo'sh bo'lsa SOXTA JAVOB QAYTARMAYMIZ.
 * `null` qaytadi va chaqiruvchi buni ochiq ko'rsatadi. Eskirgan yoki
 * yarim ma'lumotni «haqiqat» deb ko'rsatish — bu tizimda eng qimmat
 * xato turi.
 */

export type SbJavob<T> = {
  ok: boolean;
  qatorlar?: T[];
  soni?: number;
  ms?: number;
  error?: string;
  sozlanmagan?: boolean;
  /* ⚠️ 2026-08-17: Supabase REST da SERVER TOMONDA 1000 qator chegarasi
     bor («Max rows»). Darcha endi sahifalab o'qiydi, lekin natija baribir
     to'liq bo'lmasligi mumkin (juda katta jadval, xavfsizlik chegarasi).
     `toliq:false` bo'lsa ustiga HISOB-KITOB QILMASLIK kerak — yarim
     ma'lumot ustidagi summa yolg'on bo'ladi va uni haqiqat deb
     ko'rsatish bu tizimdagi eng qimmat xato turi. */
  jamiServerda?: number | null;
  toliq?: boolean;
  soro?: number;
  msBirinchi?: number;
  msQolgan?: number;
};

export type SbSoro = {
  jadval: string;
  filtr?: string;
  ustunlar?: string;
  tartib?: string;
  limit?: number;
};

/* Egasi (2026-10-02): fakt saqlashda tugma 10 daqiqa «Saqlanmoqda…» da qotdi — server yozib bo'lgan, javob esa yo'lda
 * yo'qolgan; fetch'da vaqt chegarasi yo'q edi. Endi har so'rovga chegara: o'qish 60 s, yozish 90 s. Yozish amallari
 * operation_id bilan idempotent — chegaradan keyin qayta bosish ikkinchi hujjat yaratmaydi. */
export const OQISH_CHEGARA_MS = 60_000;
export const YOZISH_CHEGARA_MS = 90_000;
export function vaqtliFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...init, signal: c.signal }).finally(() => clearTimeout(t));
}
const chegaraOtdimi = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Supabase ko'zgusidan o'qiydi. Xato bo'lsa TASHLAMAYDI — javobda aytadi. */
export async function sbOqi<T = Record<string, unknown>>(s: SbSoro): Promise<SbJavob<T>> {
  const t0 = performance.now();
  try {
    const r = await vaqtliFetch('/api/sb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    }, OQISH_CHEGARA_MS);
    const j = (await r.json()) as SbJavob<T>;
    /* Server o'z ms ini beradi (Supabase gacha), biz TO'LIQ yo'lni
       o'lchaymiz — foydalanuvchi kutadigan vaqt aynan shu. */
    return { ...j, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, error: chegaraOtdimi(e) ? 'Server 60 soniyada javob bermadi. Sahifani yangilab qayta urinib ko‘ring.' : 'Ma’lumotni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.',
             ms: Math.round(performance.now() - t0) };
  }
}

/* ── HOLAT (smeta daraxti) qatori — `holat` jadvali ustunlari ───── */
export type SbHolatQator = {
  obyekt: string; varaq: string | null; qator: number | null;
  tur: string | null; kod: string | null; nom: string | null;
  birlik: string | null;
  smeta_hajm: number | null; narx: number | null;
  fakt: number | null; f2ol: number | null; qoldiq: number | null;
  smeta_pul: number | null; st_fakt: number | null; st_f2: number | null;
  kategoriya: string | null; razdel: string | null;
  updated_at: string | null;
};

/** 2026-10-06: TIZIM_01 ko'zgusi (`holat`, `obyektlar`) bazadan o'chirildi (egasi: "tizim1 ga tegishli hech narsa
 *  kerak emas"; oxirgi yozuv 2026-08-19). Tezlik sinovi Supabase tomonida aniq sababni ko'rsatadi. */
export async function sbHolatOl(_obyekt: string): Promise<SbJavob<SbHolatQator>> {
  return { ok: false, error: "TIZIM_01 ko'zgusi (holat) 2026-10-06 da bazadan o'chirildi — solishtirish uchun ma'lumot yo'q" } as SbJavob<SbHolatQator>;
}

/**
 * Tekis qatorlardan daraxt quradi.
 *
 * ⚠️ MUHIM CHEKLOV — HALOL AYTILADI: `holat` jadvalida ota-bola
 * bog'lanishi SAQLANMAYDI. Har qatorda faqat `razdel` (matn) va
 * `varaq`+`qator` bor. Shuning uchun daraxt VARAQDAGI TARTIB bo'yicha
 * tiklanadi: har `bl` (ish) qatoridan keyingi `rs`/`mat` qatorlar —
 * o'sha ishning resurslari, keyingi `bl` uchraguncha.
 *
 * Bu jadvalning haqiqiy tuzilishiga mos (dvigatel ham shunday yozadi),
 * lekin bu TAXMIN — shuning uchun tekshiruv sahifasi GAS bilan
 * solishtirib, mos kelmasa DARHOL ko'rsatadi.
 */
export type SbTugun = {
  kalit: string; tur: string; nom: string; birlik: string;
  varaq: string; qator: number; razdel: string;
  smetaHajm: number; fakt: number; f2ol: number; qoldiq: number;
  smeta: number; stFakt: number; stF2: number; kat: string;
  bolalar: SbTugun[];
};

export function sbDaraxtQur(qatorlar: SbHolatQator[]): SbTugun[] {
  const son = (v: unknown) => Number(v) || 0;
  const yasa = (r: SbHolatQator): SbTugun => ({
    kalit: `${r.varaq}#${r.qator}`,
    tur: r.tur || '', nom: r.nom || '', birlik: r.birlik || '',
    varaq: r.varaq || '', qator: son(r.qator), razdel: r.razdel || '',
    smetaHajm: son(r.smeta_hajm), fakt: son(r.fakt), f2ol: son(r.f2ol),
    qoldiq: son(r.qoldiq), smeta: son(r.smeta_pul),
    stFakt: son(r.st_fakt), stF2: son(r.st_f2), kat: r.kategoriya || '',
    bolalar: [],
  });

  /* Razdel → ish → resurs. Razdel tugunlari jadvalda YO'Q (dvigatel
     ularni yozmaydi), shuning uchun razdel nomidan yasaymiz. */
  const razdellar = new Map<string, SbTugun>();
  let joriyIsh: SbTugun | null = null;

  for (const r of qatorlar) {
    const rzNom = r.razdel || '(razdelsiz)';
    let rz = razdellar.get(rzNom);
    if (!rz) {
      rz = { kalit: 'rz#' + rzNom, tur: 'rz', nom: rzNom, birlik: '',
             varaq: r.varaq || '', qator: 0, razdel: rzNom,
             smetaHajm: 0, fakt: 0, f2ol: 0, qoldiq: 0, smeta: 0,
             stFakt: 0, stF2: 0, kat: '', bolalar: [] };
      razdellar.set(rzNom, rz);
      joriyIsh = null;
    }

    const t = yasa(r);
    if (r.tur === 'bl') {
      rz.bolalar.push(t);
      joriyIsh = t;
    } else if (joriyIsh) {
      joriyIsh.bolalar.push(t);       // resurs — oxirgi ishning bolasi
    } else {
      rz.bolalar.push(t);             // ishsiz turgan material/ob
    }
  }
  return [...razdellar.values()];
}

/* ══════════════════════════════════════════════════════════════════
 * SUPABASE QATORLARI → MAVJUD `TreeNode` SHAKLI
 *
 * Nima uchun: saytda daraxtni chizadigan tayyor komponent bor
 * (`umumiy/daraxt/SmetaTree`) — virtual ro'yxat, qidiruv, ranglar,
 * yoyish/yig'ish hammasi ishlaydi. Uni qaytadan yozish xato bo'lardi:
 * ikkita daraxt ikki xil ko'rinadi va ikki xil buziladi.
 *
 * Shuning uchun Supabase javobini o'sha komponent kutgan shaklga
 * o'giramiz — chizish mantig'i BITTA joyda qoladi.
 *
 * ⚠️ Ota-bola bog'lanishi jadvalda YO'Q (yuqoridagi izohga qara):
 * daraxt varaq/qator TARTIBI bo'yicha tiklanadi.
 * ══════════════════════════════════════════════════════════════════ */
import type { TreeNode } from './types';

export function sbTreeQur(qatorlar: SbHolatQator[]): TreeNode[] {
  const son = (v: unknown) => Number(v) || 0;

  const yasa = (r: SbHolatQator): TreeNode => ({
    type: (r.tur as TreeNode['type']) || 'rs',
    nom: r.nom || '',
    varaq: r.varaq || '',
    row: son(r.qator),
    kat: r.kategoriya || '',
    kod: r.kod || '',
    birlik: r.birlik || '',
    smetaHajm: son(r.smeta_hajm),
    smeta: son(r.smeta_pul),
    narx: son(r.narx),
    fakt: son(r.fakt),
    qoldiq: son(r.qoldiq),
    f2ol: son(r.f2ol),
    /* ⚠️ `f2mum` (F2 mumkin = fakt − f2ol) jadvalda SAQLANMAYDI.
       O'zimiz to'qib chiqarmaymiz — mavjud ikki ustundan hisoblaymiz,
       bu GAS dagi ta'rif bilan bir xil. */
    f2mum: Math.max(0, son(r.fakt) - son(r.f2ol)),
    stFakt: son(r.st_fakt),
    stF2: son(r.st_f2),
    children: [],
  });

  const razdellar = new Map<string, TreeNode>();
  const tartib: TreeNode[] = [];
  let joriyIsh: TreeNode | null = null;

  for (const r of qatorlar) {
    const rzNom = r.razdel || '(razdelsiz)';
    let rz = razdellar.get(rzNom);
    if (!rz) {
      rz = { type: 'rz', nom: rzNom, varaq: r.varaq || '', row: 0,
             smetaHajm: 0, smeta: 0, narx: 0, fakt: 0, qoldiq: 0,
             f2ol: 0, f2mum: 0, children: [] };
      razdellar.set(rzNom, rz);
      tartib.push(rz);
      joriyIsh = null;
    }
    const t = yasa(r);
    if (r.tur === 'bl') { rz.children!.push(t); joriyIsh = t; }
    else if (joriyIsh)  { joriyIsh.children!.push(t); }
    else                { rz.children!.push(t); }
  }

  /* Razdel jamlanmasi — ishlar yig'indisi. Jadvalda razdel qatori yo'q,
     shuning uchun bu yerda hisoblanadi (soxta emas: bolalardan). */
  for (const rz of tartib) {
    for (const bl of rz.children || []) {
      rz.smeta = (rz.smeta ?? 0) + (bl.smeta ?? 0);
      rz.fakt = (rz.fakt ?? 0) + (bl.fakt ?? 0);
      rz.f2ol += bl.f2ol; rz.qoldiq = (rz.qoldiq ?? 0) + (bl.qoldiq ?? 0);
      rz.stFakt = (rz.stFakt || 0) + (bl.stFakt || 0);
      rz.stF2 = (rz.stF2 || 0) + (bl.stF2 || 0);
    }
  }
  return tartib;
}

/* ═══════════════════════════════════════════════════════════════════
 * TIZIM_02 (t2_) — BAZA HAQIQAT MANBAI
 * ═══════════════════════════════════════════════════════════════════
 *
 * Yuqoridagi funksiyalar Tizim_01 ning KO'ZGUSINI o'qiydi (`obyektlar`,
 * `holat`). Bu yerdagilar esa BOSHQA tizim — Tizim_02 — jadvallarini
 * o'qiydi (`t2_*`), u yerda baza ko'zgu emas, HAQIQAT MANBAI.
 *
 * ⚠️ IKKISI ARALASHTIRILMAYDI. Tizim_02 sahifalari faqat `t2_` ni
 * o'qiydi. Aks holda qaysi raqam qaysi tizimdan kelgani bilinmay
 * qoladi va bu tizimda eng qimmat xato turi aynan shu.
 *
 * MUHIM FARQ: `t2_daraxt` da HAQIQIY ota-bola bog'lanishi bor
 * (`ota_id`, `daraja`, `tartib`). Eski `holat` da u yo'q edi va daraxt
 * varaq tartibi bo'yicha TAXMIN bilan tiklanardi. Bu yerda taxmin
 * kerak emas.
 * ═══════════════════════════════════════════════════════════════════ */

/** `t2_obyekt_jami` — obyekt + jamlanma raqamlar (view). */
export type T2Obyekt = {
  id: number; nom: string; tur: string | null;
  kompaniya_id: number;
  qator_soni: number | null; razdel: number | null;
  ish: number | null; resurs: number | null;
  jami: number | null;
  /** ⚠️ Narx TOPILMAGAN qatorlar soni. >0 bo'lsa `jami` TO'LIQ EMAS. */
  narxsiz: number | null;
  chel: number | null; mash: number | null; mat: number | null; ob: number | null;
  yangilandi: string | null;
  /** ⚡ 2026-08-28: kartadan belgilangan lokatsiya (bo'lmasa NULL — hali belgilanmagan). */
  lat: number | null; lng: number | null;
  versiya: number; loyiha_id: number | null;
};

export function sbT2ObyektlarOl(kompaniyaId: number) {
  if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0) {
    return Promise.resolve({ ok: false, qatorlar: [] as T2Obyekt[],
      error: 'kompaniya_id majburiy' });
  }
  return sbOqi<T2Obyekt>({
    jadval: 't2_obyekt_jami', filtr: 'kompaniya_id=eq.' + kompaniyaId,
    tartib: 'nom.asc', limit: 5000,
  });
}

/** `t2_daraxt` — hisoblangan daraxt qatorlari (view). */
export type T2QatorHolat = {
  id: number;
  qator_id: number;
  obyekt_id: number;
  /** `t2_qator.tur`: 'rz' (razdel), 'bl' (ish), 'rs'/'mat'/'ob' (resurs bargi). */
  tur: string | null;
  kod: string | null;
  nom: string | null;
  birlik: string | null;
  /** ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М-К biznes kategoriyasi. */
  kat: string | null;
  smeta_hajm: number | null;
  smeta_summa: number | null;
  /** ⚠️ FAKT — barcha `tur='fakt'` hujjatlarning yig'indisi. */
  fakt_hajm: number;
  fakt_summa: number;
  /** F2 — barcha `tur='f2'` hujjatlarning yig'indisi (fakt bilan
   *  ARALASHTIRILMAYDI: invariant f2≤fakt≤smeta shu ikkisini alohida
   *  talab qiladi). */
  f2_hajm: number;
  f2_summa: number;
  /** Qoldiq — smeta dan F2 orqali OLINMAGAN qism (hali hisob-fakturaga
   *  chiqmagan). */
  qoldiq_hajm: number | null;
  qoldiq_summa: number | null;
  f2_mumkin_hajm?: number;
  f2_mumkin_summa?: number;
  f2_narx?: number | null;
  fakt_narx?: number | null;
  f2_narx_farq_foiz?: number | null;
};
export type T2Qator = {
  id: number; obyekt_id: number; obyekt: string | null;
  kompaniya_id: number;
  ota_id: number | null; daraja: number | null; tartib: number | null;
  tur: string | null; kod: string | null; nom: string | null;
  birlik: string | null;
  hajm: number | null; narx: number | null; summa: number | null;
  kat: string | null; narx_usul: string | null;
  qoshimcha: boolean | null; zamena: boolean | null;
  d1: string | null; d2: string | null; d3: string | null;
  xom_qator: number | null; yangilandi: string | null;
  /** Ko'p fayldan yig'ilgan obyektda qaysi manba (lokalka) faylidan
   *  kelgani. `apiHolatOlLokalka` ning o'rnini bosadi — daraxt
   *  ALLAQACHON birlashgan, filtrlash shu maydon bilan bo'ladi. */
  manba_id: number | null;
  /** Optimistic-lock versiyasi (`t2_addrepl_execute_v1`/`t2_qator_tahrir`
   *  kabi RPC'lar `kutilgan_versiya`ni shu bilan solishtiradi). */
  versiya: number;
  raqam: string | null;
  norma: number | null;
};

export function sbT2QatorHolatOl(obyektId: number, ustunlar?: string) {
  return sbOqi<T2QatorHolat>({
    jadval: 't2_qator_holat',
    filtr: 'obyekt_id=eq.' + obyektId,
    limit: 200000,
    ...(ustunlar ? { ustunlar } : {}),
  });
}

/** `t2_akt_reestr` — «qancha kirdi = qancha tushdi» kafolat reestri
 *  (Tizim_01 dagi `apiF2ReestrOl` ning o'rnini bosadi — bazada VIEW
 *  sifatida jonli hisoblanadi, alohida yozish/tiklash kerak emas). */
export type T2AktReestr = {
  lifecycle_status?: import('./t2-akt-lifecycle').PtoLifecycleStatus;
  id: number; obyekt_id: number; kompaniya_id: number; obyekt: string | null;
  tur: string; raqam: string | null; oy: string; holat: string;
  fayl_id: string | null; izoh: string | null; yaratildi: string;
  hujjat_jami: number | null; yozilgan_jami: number; qator_soni: number | null;
  narxsiz_qator: number | null; manfiy_qator: number | null;
  farq: number | null; reestr_holat: string; versiya: number;
};

export function sbT2AktReestrOl(obyektId: number) {
  return sbOqi<T2AktReestr>({
    jadval: 't2_akt_reestr',
    filtr: 'obyekt_id=eq.' + obyektId,
    tartib: 'oy.desc',
    limit: 500,
  });
}
export function sbT2DaraxtOl(obyektId: number, ustunlar?: string) {
  return sbOqi<T2Qator>({
    jadval: 't2_daraxt',
    filtr: 'obyekt_id=eq.' + obyektId,
    // Teng tartibda id: qo'shimcha/zamena langar qatoridan keyin (t2_addrepl joylash qoidasi).
    tartib: 'tartib.asc,id.asc',
    limit: 200000,
    ...(ustunlar ? { ustunlar } : {}),
  });
}

/**
 * `ota_id` bo'yicha HAQIQIY daraxt quradi va mavjud `TreeNode` shakliga
 * o'giradi (chizish komponenti bir xil qolsin).
 *
 * Bu yerda TAXMIN YO'Q: bog'lanish bazadan keladi.
 */
export function sbT2TreeQur(qatorlar: T2Qator[], holatlar?: T2QatorHolat[]): TreeNode[] {
  const son = (v: unknown): number | null => {
    if (v == null || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const xarita = new Map<number, TreeNode>();
  const ildiz: TreeNode[] = [];
  
  const hMap = new Map<number, T2QatorHolat>();
  if (holatlar) {
    for (const h of holatlar) {
      hMap.set(h.qator_id, h);
    }
  }

  /* 1-o'tish: har qator uchun tugun */
  for (const r of qatorlar) {
    const h = hMap.get(r.id);
    xarita.set(r.id, {
      id: r.id,
      versiya: r.versiya,
      type: (r.tur as TreeNode['type']) || 'rs',
      nom: r.nom || '',
      varaq: r.obyekt || '',
      row: son(r.xom_qator) ?? 0,
      kat: r.kat || '',
      kod: r.kod || '',
      birlik: r.birlik || '',
      smetaHajm: son(r.hajm),
      smeta: son(r.summa),
      narx: son(r.narx),
      /* Fakt va qoldiq daraxtning HAJM ustunlari. Pul qiymatlari alohida
         stFakt/stF2/stOst maydonlariga boradi. */
      fakt: h ? h.fakt_hajm : 0,
      qoldiq: h ? h.qoldiq_hajm : son(r.hajm),
      /* `t2_qator_holat`dagi F2 faqat tasdiqlangan kanonik aktlardan
         yig'iladi. Uni nolga tushirish native LRVda "F2 olish mumkin"
         qiymatini noto'g'ri kattalashtirib yuborardi. */
      f2ol: h ? h.f2_hajm : 0,
      f2mum: h ? (h.f2_mumkin_hajm ?? Math.max(0, h.fakt_hajm - h.f2_hajm)) : 0,
      stFakt: h ? h.fakt_summa : 0,
      stF2: h ? h.f2_summa : 0,
      stOst: h ? h.qoldiq_summa : son(r.summa),
      /* `f2mum` hajm ustuni bilan bir xil qoida — bazadagi tayyor
         `f2_mumkin_summa`, u bo'lmasa fakt-f2 (manfiy bo'lmasin). */
      stF2Mum: h ? (h.f2_mumkin_summa ?? Math.max(0, h.fakt_summa - h.f2_summa)) : 0,
      faktHajm: h ? h.fakt_hajm : 0,
      qoldiqHajm: h ? h.qoldiq_hajm : son(r.hajm),
      qoldiqSumma: h ? h.qoldiq_summa : son(r.summa),
      narx_usul: r.narx_usul || '',
      qoshimcha: Boolean(r.qoshimcha),
      zamena: Boolean(r.zamena),
      children: [],
    });
  }

  /* 2-o'tish: ota-bola bog'lash */
  for (const r of qatorlar) {
    const tugun = xarita.get(r.id)!;
    const ota = r.ota_id != null ? xarita.get(r.ota_id) : null;
    if (ota) ota.children!.push(tugun);
    else ildiz.push(tugun);
  }

  /* 3-o'tish: ichma-ich RZ smeta jamisi (SMETA_ANATOMIYA_V1).
   * `t2_rollup` RZ summasini faqat bevosita bl/mat/ob/rs bolalardan yig'adi —
   * obyekt jamilari (`t2_obyekt_jami` va b.) BARCHA RZ larni qo'shgani uchun
   * bu to'g'ri va o'zgarmaydi. Ota RZ ko'rinishi uchun esa bola RZ larning
   * jamisi qo'shiladi (pastdan yuqoriga). SQL `sum()` kabi: null tashlanadi,
   * hammasi null bo'lsa — null (0 emas). */
  const rzJami = (n: TreeNode): number | null => {
    let jami: number | null = n.smeta ?? null;
    for (const b of n.children ?? []) {
      if (b.type !== 'rz') continue;
      const bj = rzJami(b);
      if (bj != null) jami = (jami ?? 0) + bj;
    }
    n.smeta = jami;
    return jami;
  };
  for (const n of ildiz) if (n.type === 'rz') rzJami(n);

  /* 4-o'tish: Fakt / F2 / F2-mumkin PUL qiymatlari. `t2_qator_holat` ularni faqat
   * barglarda (rs/mat/ob, resurssiz bl) saqlaydi — ish (bl) va bo'lim (rz) da 0.
   * Egasi 2026-09-30 (Yevropa oshxonasi): "F2 summa yuqorida 0, ichkariga kirsa bor".
   * Bolasi bor tugunda qiymat = bolalar yig'indisi (pastdan yuqoriga); bolasizda — o'zi. */
  const pulJami = (n: TreeNode): void => {
    const b = n.children ?? [];
    if (!b.length) return;
    let fakt = 0, f2 = 0, mum = 0;
    for (const c of b) {
      pulJami(c);
      fakt += c.stFakt ?? 0; f2 += c.stF2 ?? 0; mum += c.stF2Mum ?? 0;
    }
    n.stFakt = fakt; n.stF2 = f2; n.stF2Mum = mum;
  };
  for (const n of ildiz) pulJami(n);
  return ildiz;
}

/* ══════════════════════════════════════════════════════════════════
 * TIZIM_02 — KOMPANIYA VA YOZISH
 *
 * `kompaniya_id` 2026-08-19 da qo'shildi. Sabab: keyin qo'shish butun
 * ma'lumotni ko'chirish va har so'rovni qayta yozish demak edi; o'shanda
 * `t2_` jadvallarda atigi 13 qator bor edi — ya'ni deyarli tekin.
 * ══════════════════════════════════════════════════════════════════ */

/* ⚡ 2026-08-27 (Claude, foydalanuvchi ko'rsatmasi — "sayt 3 xil rejimda
 * ishlasin: zakazchik, pudratchi, loyihachi"): bu rol DB da allaqachon
 * bor edi (`mavqe` ustuni), lekin frontend TYPE'ida yo'q edi — ya'ni
 * hech bir sahifa buni bila olmasdi. Qiymatlari: 'zakazchik' |
 * 'pudratchi' | 'loyihachi' (erkin matn — DB da CHECK yo'q, lekin
 * amalda shu uchtasi ishlatiladi). */
export type KompaniyaMavqe = 'zakazchik' | 'pudratchi' | 'loyihachi' | string;

export type T2Kompaniya = {
  id: number; nom: string; kod: string; faol: boolean; izoh: string | null;
  mavqe: KompaniyaMavqe | null; versiya: number;
  toliq_nom: string | null; inn: string | null; manzil: string | null;
  rahbar: string | null; telefon: string | null; bank: string | null;
  hisob_raqam: string | null; mfo: string | null; oked: string | null;
  yaratildi: string;
};

export function sbT2KompaniyalarOl() {
  return sbOqi<T2Kompaniya>({
    jadval: 't2_kompaniya', filtr: 'faol=is.true', tartib: 'nom.asc', limit: 200,
  });
}

/** Obyektlar — kompaniya berilsa faqat o'shaniki. */
export function sbT2ObyektlarOlKomp(kompaniyaId: number) {
  return sbT2ObyektlarOl(kompaniyaId);
}

/* ── YOZISH ─────────────────────────────────────────────────────── */

export type T2TahrirNatija = {
  ok: boolean;
  qator_id?: number; maydon?: string; versiya?: number;
  /** `ziddiyat` — boshqa klient shu qatorni allaqachon o'zgartirgan */
  sabab?: 'ziddiyat' | 'topilmadi' | 'maydon_ruxsat_yoq' | string;
  xabar?: string;
  sizning_versiya?: number; bazadagi_versiya?: number;
  joriy?: { nom?: string; hajm?: number; narx?: number; birlik?: string; kat?: string };
  error?: string; ms?: number;
};

/**
 * Bitta maydonni tahrirlaydi.
 *
 * ⚠️ `kutilganVersiya` MAJBURIY — bu ziddiyat nazoratining o'zagi.
 * Klient o'zi KO'RGAN versiyani yuboradi; baza versiyasi undan farq
 * qilsa yozuv RAD ETILADI va `sabab:'ziddiyat'` qaytadi.
 * Bu «xato» emas — normal holat, foydalanuvchiga tushuntiriladi.
 */
export async function sbT2QatorTahrir(
  qatorId: number, maydon: 'nom' | 'hajm' | 'narx' | 'birlik' | 'kat',
  qiymat: string, kutilganVersiya: number,
): Promise<T2TahrirNatija> {
  const t0 = performance.now();
  try {
    const r = await fetch('/api/sb-yoz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qator_id: qatorId, maydon, qiymat,
                             kutilgan_versiya: kutilganVersiya }),
    });
    const j = (await r.json()) as T2TahrirNatija;
    return { ...j, ms: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, error: 'O‘zgarishni saqlab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.',
             ms: Math.round(performance.now() - t0) };
  }
}

/* ═══════════════════ FAKT / F2 HUJJATLARI ═══════════════════════════
 *
 * Hammasi `/api/sb-yoz` ning NOMLANGAN amallari orqali. Ixtiyoriy RPC
 * chaqirish yo'q — reja «generic write endpoint ochmaslik» deydi.
 */

export type AktBuzilish = {
  qator_id: number; nom: string;
  bor?: number; qoshilmoqda?: number; jami?: number; chegara: number;
};

export type AktNatija = {
  ok: boolean; error?: string; sabab?: string; xabar?: string; izoh?: string;
  operation_id?: string;
  akt_id?: number; qator_id?: number; takror?: boolean; holat?: string; tur?: string; oy?: string;
  qator_soni?: number; narxsiz?: number; jami?: number | null; toliq?: boolean;
  buzilish?: AktBuzilish[] | null; maslahat?: string;
  sizning_versiya?: number; bazadagi_versiya?: number;
  ms?: number;
};

/* ⚠️ 2026-08-25 (Claude): `export` qo'shildi. Ko'p yangi t2-*.ts fayllari
 * (t2-birja, t2-erp, t2-grafik, t2-hisobot, t2-invite, t2-kirish,
 * t2-kuzatuv, t2-sozlama, t2-tizim) buni import qilardi, lekin u shu
 * yerda PRIVATE edi — butun loyiha build bo'lmasdi (TS2459).
 * Mening domenimga tegishli emas, lekin BUTUN qurilishni bloklardi. */
export async function yozAmali(yuk: Record<string, unknown>): Promise<AktNatija> {
  const t0 = performance.now();
  try {
    const r = await vaqtliFetch('/api/sb-yoz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    }, YOZISH_CHEGARA_MS);
    const matn = await r.text();
    let j: AktNatija;
    try { j = JSON.parse(matn) as AktNatija; }
    catch { return { ok: false, error: r.status >= 500
      ? 'Server vaqtincha javob bermadi. Birozdan so‘ng qayta urinib ko‘ring.'
      : 'So‘rovni bajarib bo‘lmadi. Kiritilgan ma’lumotlarni tekshiring.',
      ms: Math.round(performance.now() - t0) }; }
    if (!r.ok && !j.error) j.error = `HTTP ${r.status}: yozish so'rovi rad etildi`;
    return { ...j, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, error: chegaraOtdimi(e)
      ? 'Server 90 soniyada javob bermadi — amal serverda bajarilgan bo‘lishi mumkin. Sahifani yangilab tekshiring; qayta saqlash xavfsiz (bir xil amal ID, ikkinchi hujjat yaratilmaydi).'
      : 'O‘zgarishni saqlab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.',
             ms: Math.round(performance.now() - t0) };
  }
}

/**
 * Fakt yoki F2 hujjatini yaratadi.
 *
 * ⚠️ `operation_id` HAR CHAQIRUVDA YANGI bo'lishi kerak, lekin QAYTA
 * URINISHDA O'SHA-O'SHA qolishi kerak. Shuning uchun uni chaqiruvchi
 * beradi — bu yerda generatsiya qilsak, qayta urinish yangi UUID bilan
 * ketib IKKINCHI hujjat yaratardi va idempotentlik ma'nosini yo'qotardi.
 */
export function sbT2AktYarat(p: {
  obyektId: number; tur: 'fakt' | 'f2'; oy: string;
  qatorlar: Array<{ qator_id: number; hajm: number | string; narx?: number; narx_yoq?: boolean; izoh?: string }>;
  operationId: string; raqam?: string; majburiy?: boolean;
}): Promise<AktNatija> {
  return yozAmali({
    amal: 'akt_yarat', obyekt_id: p.obyektId, tur: p.tur, oy: p.oy,
    qatorlar: p.qatorlar, operation_id: p.operationId,
    raqam: p.raqam, majburiy: p.majburiy === true,
  });
}

/**
 * T2-REAL-PARK-LRV-CLOSURE-005: F2 hujjatini EXACT SOURCE bilan yaratadi
 * (`t2_akt_yarat_v2`). FAQAT F2 uchun (`fakt` — draft, "certified" emas,
 * eski `sbT2AktYarat`da qoladi).
 *
 * Har qatorda `certified_quantity` MAJBURIY; `certified_unit_price` VA
 * `certified_amount` — F2 HUJJATINING O'ZIDAN (masalan Excel'ning
 * H/СУММА ustuni), HECH QACHON `hajm*narx`dan hisoblanmaydi. Narx
 * hujjatda yo'q bo'lsa — `priceIntentionallyAbsent: true` (`narx_yoq`
 * o'rnini bosadi); aks holda backend `MISSING_CERTIFIED_PRICE`/
 * `MISSING_CERTIFIED_AMOUNT` bilan BUTUN partiyani rad etadi — smeta
 * narxiga jim qaytish YO'Q.
 */
export function sbT2AktYaratV2(p: {
  obyektId: number; oy: string;
  qatorlar: Array<{
    qatorId: number; certifiedQuantity: number;
    certifiedUnitPrice?: number; certifiedAmount?: number;
    priceIntentionallyAbsent?: boolean;
    certifiedSourceHash?: string; rawSnapshot?: unknown; izoh?: string;
  }>;
  operationId: string; raqam?: string;
}): Promise<AktNatija> {
  return yozAmali({
    amal: 'akt_yarat_v2', obyekt_id: p.obyektId, oy: p.oy,
    qatorlar: p.qatorlar.map((q) => ({
      qator_id: q.qatorId,
      certified_quantity: q.certifiedQuantity,
      certified_unit_price: q.certifiedUnitPrice,
      certified_amount: q.certifiedAmount,
      price_intentionally_absent: q.priceIntentionallyAbsent === true,
      certified_source_hash: q.certifiedSourceHash,
      raw_snapshot: q.rawSnapshot,
      izoh: q.izoh,
    })),
    operation_id: p.operationId, raqam: p.raqam,
  });
}

/* ── F2 RESUMABLE IMPORT JOB (T2-GAS-EXIT-001 §5/§6) ──────────────────────
 * `t2_f2_import_job` (checkpointed progress) + `t2_f2_import_draft_qator`
 * (durable per-row match/mapping draft) so a crashed tab, refresh, or lost
 * network mid-review does not lose the work: the canonical state lives in
 * Supabase, not in memory/localStorage. See ops/handoff/
 * T2_PTO_CLOSURE_007_CODEX_F2_RESUMABLE_IMPORT.md and its _REPORT.md. */

export type T2F2ImportJobHolat = {
  ok: boolean;
  job_id: number; obyekt_id: number; status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  cursor: Record<string, unknown>; total_rows: number | null;
  processed_rows: number; matched_rows: number; unmatched_rows: number;
  last_error: string | null; versiya: number;
  started_at: string; updated_at: string; completed_at: string | null;
};
export type T2F2ImportJobNatija = { ok: boolean; error?: string; code?: string; job_id?: number; takror?: boolean; versiya?: number };

/** ⚠️ `operationId` chaqiruvchidan keladi va QAYTA URINISHDA O'ZGARMAYDI — aks holda tarmoq uzilib qayta yuborilganda ikkinchi job yaraladi. */
export function sbT2F2ImportJobYarat(p: {
  obyektId: number; operationId: string; totalRows: number; sourceDocumentId?: number;
}): Promise<T2F2ImportJobNatija> {
  return yozAmali({
    amal: 'f2_import_job_yarat', obyekt_id: p.obyektId,
    operation_id: p.operationId, total_rows: p.totalRows,
    source_document_id: p.sourceDocumentId ?? null,
  });
}

/** `code:'STALE_VERSION'` — optimistic-lock normal holati, xato emas: chaqiruvchi joriy holatni qayta o'qib qayta urinishi kerak. */
export function sbT2F2ImportJobIlgarilash(p: {
  jobId: number; expectedVersiya: number;
  processedDelta: number; matchedDelta: number; unmatchedDelta: number;
  cursor?: unknown; status?: T2F2ImportJobHolat['status']; lastError?: string;
}): Promise<T2F2ImportJobNatija> {
  return yozAmali({
    amal: 'f2_import_job_ilgarilash', job_id: p.jobId, expected_versiya: p.expectedVersiya,
    processed_delta: p.processedDelta, matched_delta: p.matchedDelta, unmatched_delta: p.unmatchedDelta,
    cursor: p.cursor ?? null, status: p.status ?? null, last_error: p.lastError ?? null,
  });
}

export type T2F2ImportDraftHolat = 'avto_moslashti' | 'qolda_moslashtirildi' | 'otkazib_yuborildi' | 'hal_qilinmagan';
export type T2F2ImportDraftQator = {
  uid: string; holat: T2F2ImportDraftHolat; lrv_varaq: string | null; lrv_row: number | null;
  kod: string | null; hajm: number | null; narx: number | null; summa: number | null;
  sabab: string | null;
  /** T2-F2-IMPORT-TUR-CASCADE-001: asl qator turi (rz/bl/rs/mat/ob) --
   *  eski (bu maydon qo'shilishidan oldingi) qoralamalarda null. */
  tur: string | null;
  versiya: number; yangilandi: string;
};

/** Bir chaqiruvda eng ko'p 5000 qator (RPC o'zi shuni majburlaydi) — kattaroq to'plam chaqiruvchi tomonidan bo'laklarga bo'linadi. */
export function sbT2F2ImportDraftSaqla(p: {
  jobId: number;
  qatorlar: Array<{
    uid: string; holat: T2F2ImportDraftHolat; expectedVersiya?: number;
    lrvVaraq?: string; lrvRow?: number; kod?: string;
    hajm?: number; narx?: number; summa?: number; sabab?: string; tur?: string;
  }>;
}): Promise<{ ok: boolean; error?: string; code?: string; job_id?: number; saqlandi?: number }> {
  return yozAmali({
    amal: 'f2_import_draft_saqla', job_id: p.jobId,
    qatorlar: p.qatorlar.map((q) => ({
      uid: q.uid, holat: q.holat, expected_versiya: q.expectedVersiya,
      lrv_varaq: q.lrvVaraq ?? null, lrv_row: q.lrvRow ?? null, kod: q.kod ?? null,
      hajm: q.hajm ?? null, narx: q.narx ?? null, summa: q.summa ?? null, sabab: q.sabab ?? null,
      tur: q.tur ?? null,
    })),
  });
}

/** `/api/sb` orqali — RPC `stable` (o'qish), GET bilan chaqiriladi, actor sessiyadan. */
async function soroOqi<T>(soro: string, params: Record<string, unknown>): Promise<{ ok: boolean; natija?: T; error?: string }> {
  const r = await fetch('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soro, ...params }),
  });
  return r.json();
}

export async function sbT2F2ImportJobHolat(jobId: number): Promise<{ ok: boolean; error?: string } & Partial<T2F2ImportJobHolat>> {
  const r = await soroOqi<T2F2ImportJobHolat>('f2_import_job_holat_v1', { job_id: jobId });
  if (!r.ok || !r.natija || r.natija.ok !== true) return { ok: false, error: r.error || 'Job holati o\'qilmadi' };
  return r.natija;
}

export async function sbT2F2ImportDraftRoyxat(jobId: number): Promise<{ ok: boolean; qatorlar: T2F2ImportDraftQator[]; error?: string }> {
  const r = await soroOqi<{ ok: boolean; qatorlar: T2F2ImportDraftQator[] }>('f2_import_draft_royxat_v1', { job_id: jobId });
  if (!r.ok || !r.natija || r.natija.ok !== true) return { ok: false, qatorlar: [], error: r.error || 'Qoralama o\'qilmadi' };
  return { ok: true, qatorlar: r.natija.qatorlar || [] };
}

/**
 * Smetaga yangi qator qo'shadi (`t2_qator_qosh`).
 *
 * Tizim_01 dagi `apiRzQosh` / `apiBlQosh` / `apiRsQosh` ning o'rnini
 * bosadi. ⚠️ Hisob-kitob shu yerda EMAS, bazada:
 *
 *  • `norma` ≠ `hajm`. `eObyom` berilmasa `rs` da hajm = ota.hajm × norma.
 *    Frontendda ko'paytirsak ikki xil hisob paydo bo'lardi.
 *  • `norma` MANFIY bo'lishi mumkin — ПЕРЕРАСЧЁТ haqiqiy hujjat.
 *  • `kat` yubormang: ЧЕЛ/МАШ birlikdan aniqlanadi va tanlov uni
 *    bosib o'tolmaydi. `kat` faqat МАТ/ОБ/М-К/КАБ ajratish uchun.
 *  • `narx` yubormasangiz narxlar bazasidan qidiriladi; topilmasa
 *    BO'SH qoladi. 0 yozilmaydi — 0 «bepul» degani.
 */
export function sbT2QatorQosh(p: {
  obyektId: number;
  tur: 'rz' | 'bl' | 'rs' | 'mat' | 'ob';
  nom: string;
  otaId?: number | null;
  kod?: string;
  birlik?: string;
  norma?: number;
  narx?: number;
  /** true → hajm AYNAN norma (E ustuni butun hajm). Aks holda ko'paytiriladi. */
  eObyom?: boolean;
  kat?: string;
  /** Shu qatordan KEYIN joylashadi; berilmasa oxiriga. */
  keyinId?: number;
  /** ⚠️ Qayta urinishda O'ZGARMASIN — aks holda ikkinchi qator yaraladi. */
  operationId: string;
}): Promise<AktNatija> {
  return yozAmali({
    amal: 'qator_qosh', obyekt_id: p.obyektId, tur: p.tur, nom: p.nom,
    ota_id: p.otaId ?? null, kod: p.kod, birlik: p.birlik,
    norma: p.norma, narx: p.narx, e_obyom: p.eObyom, kat: p.kat,
    keyin_id: p.keyinId, operation_id: p.operationId,
  });
}

export function sbT2AktTasdiqlash(aktId: number, kutilganVersiya?: number,
                                  operationId: string = yangiOperationId()): Promise<AktNatija> {
  return yozAmali({ amal: 'akt_tasdiqlash', akt_id: aktId,
                    kutilgan_versiya: kutilganVersiya, operation_id: operationId });
}

export function sbT2AktBekor(aktId: number, sabab: string,
                             kutilganVersiya?: number): Promise<AktNatija> {
  return yozAmali({ amal: 'akt_bekor', akt_id: aktId, sabab,
                    kutilgan_versiya: kutilganVersiya });
}

/** Brauzerda ishonchli UUID (eski brauzerlar uchun zaxira bilan). */
export function yangiOperationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}




// SKLAD DOMENI
export type T2SkladHarakat = {
  id?: number;
  obyekt_id: number;
  operatsiya: 'prixod' | 'rasxod';
  turi: string;
  sana: string;
  nomi: string;
  birligi: string;
  obyomi: number;
  postavshik?: string;
  qabul_qiluvchi?: string;
  qabul_turi?: string;
  izoh?: string;
  operation_id?: string;
};

export type T2SkladQoldiq = {
  id: number;
  kompaniya_id: number;
  obyekt_id: number;
  turi: string;
  nomi: string;
  birligi: string;
  qoldiq: number;
  versiya: number;
  oxirgi_harakat: string;
};

export function sbSkladQoldiqOl(obyektId: number) {
  return sbOqi<T2SkladQoldiq>({
    jadval: 't2_sklad_qoldiq',
    filtr: 'obyekt_id=eq.' + obyektId
  });
}

/** ⚠️ `operation_id` MAJBURIY — sklad qoldig'iga ta'sir qiladi, qayta
 *  urinishda ikkinchi harakat yaratmasligi kerak. */
export function sbSkladgaYozish(kompaniya_id: number, operatsiya: 'prixod' | 'rasxod', item: T2SkladHarakat) {
  return yozAmali({
    amal: 'skladga_yozish',
    kompaniya_id,
    operatsiya,
    obyekt_id: item.obyekt_id,
    turi: item.turi,
    sana: item.sana,
    nomi: item.nomi,
    birligi: item.birligi,
    obyomi: item.obyomi,
    postavshik: item.postavshik || null,
    qabul_qiluvchi: item.qabul_qiluvchi || null,
    qabul_turi: item.qabul_turi || null,
    izoh: item.izoh || null,
    operation_id: item.operation_id || yangiOperationId(),
  });
}

export async function sbSkladNomTaklifOl(nom: string, limit = 5): Promise<{ok: boolean, qatorlar?: any[], error?: string}> {
  if (!nom || nom.length < 2) return { ok: true, qatorlar: [] };
  const filtr = 'nomi.ilike.%' + nom + '%';
  const res = await fetch('/api/sb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jadval: 'v_sklad_nomlar', filtr, limit })
  });
  return await res.json();
}

// --- FAKTURA (EHF / Didox) ---

export interface T2Faktura {
  id?: number;
  kompaniya_id: number;
  raqam: string;
  sana: string;
  kontragent: string;
  inn: string;
  summa: number;
  pdf_url?: string;
  holat: 'yangi' | 'tasdiqlangan' | 'bekor_qilingan';
  items?: any[];
  /** Faqat yaratishda — qayta urinishda o'sha-o'sha bo'lishi kerak. */
  operation_id?: string;
  versiya?: number;
  kim?: string | null;
  yaratildi?: string;
  yangilandi?: string;
}

export function sbFakturalarOl(kompaniya_id: number) {
  return sbOqi<T2Faktura>({
    jadval: 't2_faktura',
    filtr: 'kompaniya_id=eq.' + kompaniya_id,
    tartib: 'sana.desc',
    limit: 1000,
  });
}

/** ⚠️ Yangi faktura yaratishda `operation_id` avtomatik biriktiriladi
 *  (idempotentlik). Tahrirlashda (`item.id` bor) kerak emas — bazada
 *  `id` + `kompaniya_id` + versiya bilan himoyalangan. */
export function sbFakturaYoz(item: T2Faktura) {
  return yozAmali({
    amal: 'faktura_yoz',
    ...item,
    operation_id: item.id ? undefined : (item.operation_id || yangiOperationId()),
  });
}

/* T2-PTO-P0A-UNAUTH-ENDPOINTS-001: `sbFakturaFaylYoz` shu yerdan olib
 * tashlandi. U authsiz `/api/upload` ga yozardi (endpoint o'chirildi) va
 * butun kodda birorta chaqiruvchisi yo'q edi. Faktura fayli kerak bo'lsa
 * kanonik `/api/hujjat-yukla` yo'li ishlatilsin (`t2-hujjat.ts`
 * `uploadFayl` kabi) — u a'zolikni tekshiradi va hash bilan yozadi. */

// --- SPRAVOCHNIK (Ish turlari va Shaxsiy smetalar) ---

export interface T2IshTuri {
  id?: number;
  kompaniya_id: number;
  kod: string;
  nomi: string;
  birligi: string;
  norma: number;
  narx: number;
  kategoriya: string;
  versiya?: number;
  yaratilgan_vaqt?: string;
}

export function sbIshTurlariOl(kompaniya_id: number) {
  return sbOqi<T2IshTuri>({
    jadval: 't2_ish_turi',
    filtr: 'kompaniya_id=eq.' + kompaniya_id,
    tartib: 'kod.asc',
    limit: 5000,
  });
}

export function sbIshTuriYoz(item: T2IshTuri) {
  return yozAmali({
    amal: 'ish_turi_yoz',
    ...item
  });
}

export function sbShaxsiySmetalarOl(kompaniya_id: number) {
  return sbOqi<{id: number; kompaniya_id: number; nom: string; qatorlar: any[]; yaratildi: string}>({
    jadval: 't2_shaxsiy_smeta',
    filtr: 'kompaniya_id=eq.' + kompaniya_id,
    tartib: 'nom.asc',
    limit: 1000,
  });
}

export function sbShaxsiySmetaYarat(kompaniya_id: number, nom: string, qatorlar: any[]) {
  return yozAmali({
    amal: 'shaxsiy_smeta_yarat',
    kompaniya_id,
    nom,
    qatorlar,
  });
}


// ==========================================
// KORZINKA VA TAHRIRLASH (TIZIM_02)
// ==========================================

export async function sbObyektOchirish(id: number, nomi: string): Promise<any> {
  // 1. Supabase da korzinkaga tashlash
  const res = await fetch('/api/sb-yoz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amal: 'korzinkaga_tashlash', jadval: 't2_obyekt', id })
  });
  const data = await res.json();

  // 2. Drive'da trash qutisiga ko'chirish
  fetch('/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn: 'apiT2DriveTrash', args: [{ type: 'obyekt', id, nomi }] })
  }).catch(console.error);

  return data;
}

/* ⚡ 2026-08-28 (foydalanuvchi ko'rsatmasi — "har obyektga lokatsiyasini
 * kartadan belgilash"): `t2_obyekt.lat`/`lng` — kartadan (masalan Leaflet/
 * Google Maps klik) tanlangan koordinata. `kutilganVersiya` MAJBURIY —
 * ikki admin bir vaqtda tahrirlasa jimgina ustidan yozilmasin. */
export async function sbObyektLokatsiyaBelgila(id: number, lat: number, lng: number, kutilganVersiya: number): Promise<any> {
  const res = await fetch('/api/sb-yoz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amal: 'obyekt_yangila', id, nomi: '', kutilgan_versiya: kutilganVersiya, lat, lng })
  });
  return await res.json();
}

/** T2-PTO-OWNER-CRITICAL-CLOSURE P0-1: native obyekt yaratish -- Drive
 *  storage-provisioning zanjiridan (t2_object_create_v1) mustaqil, T1 GAS'ga
 *  hech qanday chaqiruv yo'q. */
export async function sbT2ObyektYarat(p: { kompaniyaId: number; loyihaId?: number | null; nom: string; operationId?: string }): Promise<{ ok: boolean; obyekt_id?: number; code?: string; error?: string; xato?: string }> {
  const res = await fetch('/api/sb-yoz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amal: 'obyekt_yarat', kompaniya_id: p.kompaniyaId, loyiha_id: p.loyihaId ?? null,
      nom: p.nom, operation_id: p.operationId || yangiOperationId(),
    }),
  });
  return await res.json();
}

/** T2-PTO-OWNER-CRITICAL-CLOSURE: resurs kategoriya (ЧЕЛ/МАШ/МАТ/ОБ/М/К/КАБ/БЕЗСКЛАД)
 *  registrini belgilash -- T1 GAS "NARXLAR" registri bilan bir xil mexanizm
 *  (nom+birlik bo'yicha bir marta tasdiqlansa, keyingi importlar eslaydi). */
export type T2ResursKategoriya = 'ЧЕЛ' | 'МАШ' | 'МАТ' | 'ОБ' | 'М/К' | 'КАБ' | 'БЕЗСКЛАД';
export async function sbT2ResursKategoriyaBelgila(p: { kompaniyaId: number; nom: string; birlik: string; kategoriya: T2ResursKategoriya; operationId?: string }): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/sb-yoz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amal: 'resurs_kategoriya_belgila', kompaniya_id: p.kompaniyaId,
      nom: p.nom, birlik: p.birlik, kategoriya: p.kategoriya,
      operation_id: p.operationId || yangiOperationId(),
    }),
  });
  return await res.json();
}

export async function sbObyektTahrirlash(id: number, nomi: string, tur: string): Promise<any> {
  const res = await fetch('/api/sb-yoz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amal: 'obyekt_yangila', id, nomi, tur })
  });
  
  // Drive'da nomini yangilash
  fetch('/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn: 'apiT2DriveRename', args: [{ type: 'obyekt', id, yangiNom: nomi }] })
  }).catch(console.error);

  return await res.json();
}

export async function sbKorzinkadanTiklash(jadval: string, id: number, nomi: string): Promise<any> {
  const res = await fetch('/api/sb-yoz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amal: 'korzinkadan_tiklash', jadval, id })
  });
  
  fetch('/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn: 'apiT2DriveRestore', args: [{ type: jadval, id, nomi }] })
  }).catch(console.error);

  return await res.json();
}

export async function sbButunlayOchirish(jadval: string, id: number, nomi: string): Promise<any> {
  const res = await fetch('/api/sb-yoz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amal: 'butunlay_ochirish', jadval, id })
  });
  
  fetch('/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn: 'apiT2DriveHardDelete', args: [{ type: jadval, id, nomi }] })
  }).catch(console.error);

  return await res.json();
}

/* ⚠️ 2026-08-27 (Claude): BU FUNKSIYA IKKI MARTA BUZILGAN EDI — avval
   `t2_obyekt.is_deleted` (bunday ustun UMUMAN yo'q, `holat='bekor'`
   ishlatiladi), keyin bu izoh to'g'ri yozilgandan keyin ham kimdir
   qayta xato versiyaga qaytargan. Natija: PostgREST "column does not
   exist" xatosi bilan so'rov muvaffaqiyatsiz bo'lardi va Korzinka
   sahifasi HAR DOIM bo'sh ko'rinardi — biror narsa o'chirilganidan
   keyin ham. Endi `t2_korzinka` VIEW orqali (3 jadval — t2_obyekt/
   t2_shaxsiy_smeta/t2_sklad_harakat — birlashgan, `jadval` ustuni
   bilan) va kompaniya bo'yicha filtrlangan holda o'qiydi. */
export function sbKorzinkaOqish(kompaniyaId?: number | null) {
  return sbOqi<{ id: number; nomi: string; jadval: string; kompaniya_id: number; ochirilgan_vaqt: string }>({
    jadval: 't2_korzinka',
    filtr: kompaniyaId ? 'kompaniya_id=eq.' + kompaniyaId : undefined,
    tartib: 'ochirilgan_vaqt.desc',
    limit: 500,
  });
}

/* ⚡ 2026-08-27 (Claude): `t2_kompaniya` avvalgacha FAQAT o'qilardi —
 * Sozlamalar "Umumiy Akkaunt" formasi (Antigravity) tashkilot
 * rekvizitlarini saqlay olmasdi. Har maydon ixtiyoriy: faqat
 * o'zgartirilgani yuboriladi (`undefined` — teginmaydi), boshqalar
 * o'z holicha qoladi. `kutilganVersiya` MAJBURIY (optimistik qulf —
 * ikki foydalanuvchi bir vaqtda tahrirlasa, ikkinchisi "versiya"
 * sababi bilan rad etiladi, jimgina ustidan yozilmaydi). */
export function sbKompaniyaYangila(id: number, kutilganVersiya: number, maydonlar: {
  toliqNom?: string; inn?: string; manzil?: string; rahbar?: string;
  telefon?: string; bank?: string; hisobRaqam?: string; mfo?: string; oked?: string;
  mavqe?: 'zakazchik' | 'pudratchi' | 'loyihachi';
}) {
  return yozAmali({
    amal: 'kompaniya_yangila', id, kutilgan_versiya: kutilganVersiya,
    toliq_nom: maydonlar.toliqNom, inn: maydonlar.inn, manzil: maydonlar.manzil,
    rahbar: maydonlar.rahbar, telefon: maydonlar.telefon, bank: maydonlar.bank,
    hisob_raqam: maydonlar.hisobRaqam, mfo: maydonlar.mfo, oked: maydonlar.oked, mavqe: maydonlar.mavqe,
  });
}
