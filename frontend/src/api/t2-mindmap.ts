import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali } from './supabase';
import { t } from '../i18n/til';
import { sbSkladYarat, sbKadrYarat, sbTexnikaYarat } from './t2-resurs';
import { sbT2LoyihaYoz } from './t2-loyiha';
import { sbKontragentSaqla } from './t2-kontragent';
import { sbT2ShartnomaSaqla } from './t2-shartnoma';
import { entityIdFromResult, type EntityCommandResult } from './entity-consistency';

/* ⚡ 2026-08-28 (foydalanuvchi ko'rsatmasi): "shartnoma, sklad qo'shish,
 * shartnomalar bilan bog'lash, skladlar yaratish, avtopark qo'shish —
 * qurilishdagi hamma narsani bog'lash shu mindmapda bo'lishi kerak...
 * bog'lanishlar chiziqlar bilan tortib birlashtirilishi kerak."
 *
 * Avval mindmap FAQAT KO'RSATARDI: tugunlar boshqa sahifaga havola
 * edi, "Sklad"/"Shartnoma" tugunlari esa umuman DEKORATIV edi (hech
 * qanday haqiqiy yozuvga bog'lanmagan, shunchaki navigatsiya tugmasi).
 * Yagona haqiqiy amal — obyektni loyihaga biriktirish edi.
 *
 * Endi mindmap TAHRIRLASH MAYDONI: tugun yaratiladi, chiziq tortib
 * bog'lanadi, chiziq uziladi — hammasi haqiqiy jadvallarga yoziladi.
 * ⚠️ Yangi "universal edges" jadvali ATAYLAB yaratilmadi — har
 * bog'lanish o'z tabiiy jadvaliga boradi (t2_sklad_bog, t2_shartnoma_bog
 * va h.k.), aks holda mavjud FK/tekshiruvlar chetlab o'tilardi va
 * ikkinchi haqiqat manbai paydo bo'lardi. */

export type TugunTur =
  | 'kompaniya' | 'loyiha' | 'obyekt' | 'shartnoma'
  | 'sklad' | 'texnika' | 'kadr' | 'kontragent' | 'zayavka'
  /** v4: kompaniya a'zosi (odam). `id` = `foydalanuvchi:<t2_foydalanuvchi.id>`. */
  | 'foydalanuvchi'
  /** Karta: boshqa kompaniya (tomon aloqasi). Server grafida kelmaydi — 	2_tomon_aloqalar_v1 dan qo‘shiladi. */
  | 'tomon';

export type BogTur =
  | 'loyiha_kompaniya'   // tuzilmaviy — uzib bo'lmaydi
  | 'obyekt_loyiha'      // manba=loyiha,     maqsad=obyekt
  | 'shartnoma_loyiha'   // manba=loyiha,     maqsad=shartnoma
  | 'shartnoma_obyekt'   // manba=shartnoma,  maqsad=obyekt
  | 'sklad_obyekt'       // manba=sklad,      maqsad=obyekt
  | 'texnika_obyekt'     // manba=texnika,    maqsad=obyekt
  | 'kadr_obyekt'        // manba=kadr,       maqsad=obyekt
  | 'qatnashchi'         // manba=kontragent, maqsad=loyiha
  /* v4 (odamlar). Bular mindmapdan chiziq tortib o'zgartirilmaydi — `sbMindmapMasul` orqali. */
  | 'azo_kompaniya'      // manba=kompaniya,  maqsad=foydalanuvchi
  | 'masul_obyekt'       // manba=foydalanuvchi, maqsad=obyekt
  | 'masul_loyiha'       // manba=foydalanuvchi, maqsad=loyiha
  /* Karta (client): tomon aloqasi va ko‘rish huquqi (grant) chiziqlari. */
  | 'tomon_aloqa'        // manba=kompaniya,  maqsad=tomon
  | 'tomon_grant'        // manba=tomon,      maqsad=obyekt/loyiha/shartnoma
  | 'tomon_buyurtma';    // manba=tomon,      maqsad=obyekt (faqat oqim: akt/buyurtma hisoblagichi; uzib bo‘lmaydi)

/* ⚡ 2026-08-28 (Claude) — foydalanuvchi maqsadi (audit hujjatida):
 * «rahbar mindmapni ochsa butun tashkilot holatini ko'rsin; PTO
 * Amfiteatrga 90m parapet zayavka qilsa — o'sha obyektda tick/
 * bildirishnoma paydo bo'lsin».
 *
 * Avval tugunda faqat `lat/lng/versiya` bor edi — rahbar NOMLARNI
 * ko'rardi, AHVOLNI emas. Endi har tugun o'z holatini olib yuradi.
 *
 * ⚠️ Belgilar HAQIQIY manbadan hisoblanadi, to'qilmaydi:
 *     zayavka  → t2_erp_taminot (holat='kutilmoqda')
 *     narx_yoq → t2_qator (narx IS NULL)
 *     kozgu    → t2_kozgu (holat='farqli')
 *     smeta_yoq→ obyektda umuman resurs qatori yo'q
 * Manba bo'sh bo'lsa belgi CHIQMAYDI (bo'sh massiv), soxta 0 emas. */
export type BelgiTur = 'zayavka' | 'narx_yoq' | 'kozgu' | 'smeta_yoq'
  /** v3: smeta (rz) bor, lekin resurs qatorlari yo'q. */
  | 'resurs_yoq'
  /** v3: t2_overbilling_radar — F2 fakt yoki smetadan oshgan qatorlar. */
  | 'ortiqcha'
  /** Mijozda: obyektda F2 bor, lekin fakt umuman kiritilmagan — «F2 > fakt» bu holatda ortiqcha EMAS, fakt bo'shligi. */
  | 'fakt_yoq';

/** v3: obyektning ochiq signali (t2_mindmap_signal_summary.top_signals, eng og'ir 3 tasi). */
export type MindmapSignal = { title: string | null; severity: string | null; type?: string | null };

export type MindmapBelgi = {
  tur: BelgiTur;
  /** `info` — e'tibor talab qiladi; `ogoh` — muammo. */
  daraja: 'info' | 'ogoh';
  matn: string;
  soni?: number;
};

/** Obyekt tuguni metasi — rahbar ko'radigan holat. */
export type ObyektMeta = {
  lat: number | null; lng: number | null;
  versiya: number; loyiha_id: number | null;
  /** `rz` darajasidan (takror-hisobsiz). Smeta yuklanmagan bo'lsa `null`. */
  smeta: number | null;
  resurs_qatori: number;
  narxsiz: number;
  /** `false` — jami TO'LIQ EMAS, moliyaviy qaror uchun ishlatilmasin. */
  toliq: boolean;
  fakt: number;
  /** F2. v3 dan: FAQAT tasdiqlangan aktlar (`f2_asos === 'tasdiqlangan'`). Eski RPC qoralamani ham qo'shgan. */
  f2: number;
  /** v3: `'tasdiqlangan'`. Maydon yo'q — eski RPC shakli (F2 asosi noma'lum, qoralama aralash bo'lishi mumkin). */
  f2_asos?: string;
  /** v3: tasdiqlanmagan F2 qoralamalar summasi (f2 ga kirmaydi). Eski RPCda yo'q. */
  f2_qoralama?: number | null;
  /** v3: rz qatorlari soni. */
  rz_qatori?: number;
  /** v3: ochiq signallar. */
  signal_count?: number; critical_count?: number; top_signals?: MindmapSignal[];
  /** v3: overbilling radaridagi qatorlar soni (server belgisi). */
  ortiqcha_soni?: number;
  /** Smeta 0/`null` bo'lsa `null` — yolg'on «0%» ko'rsatilmaydi. */
  fakt_foiz: number | null; f2_foiz: number | null;
  /** Foiz maxraji: `joriy` — asl smeta + o'zgarishlar (`smeta_joriy`); `asl` — joriy noma'lum, asl smeta (belgi bilan). Eski RPCda yo'q. */
  foiz_maxraj?: 'joriy' | 'asl';
  /** Smeta + o'zgarishlar (ustamasiz); noma'lum bo'lsa `null` (0 emas). `smeta` — asl, o'zgarmaydi. */
  smeta_joriy?: number | null;
  zayavka: number;
  kozgu: string | null;
  belgi: MindmapBelgi[];
};

export type MindmapTugun = {
  /** "tur:id" ko'rinishida, masalan "obyekt:6" */
  id: string;
  /** Stable graph identity; `id` legacy renderer compatibility uchun qolgan. */
  node_key?: string;
  /** Module row ID bilan aynan teng bo'lgan canonical entity identity. */
  entity_type?: TugunTur;
  entity_id?: number;
  tur: TugunTur;
  nom: string;
  meta: (Record<string, any> & Partial<ObyektMeta>) | null;
  /** Saqlangan joylashuv. NULL — hali qo'lda terilmagan, avtomatik joylashtiriladi. */
  x: number | null;
  y: number | null;
};

export type MindmapBogich = {
  manba: string; maqsad: string; tur: BogTur; uzsa_boladi: boolean;
  /** `qatnashchi` chiziqlarida (v3 dan server yuboradi). */
  rol?: string;
  /** `qatnashchi` ishtirokchi qatorining ID si (v3). */
  id?: number;
  /** v4: `masul_obyekt` / `masul_loyiha` — `read` | `write` | `manage`. */
  ruxsat?: string;
};

/** v4: foydalanuvchi tuguni metasi. */
export type FoydalanuvchiMeta = { rol?: string | null; rollar?: string[]; login?: string | null };

/** v4: kim nimani ko'ryapti (server `korinish`). `toliq=false` — ba'zi obyektlar sizga yashirilgan; `pul=false` — summalar olib tashlangan. */
export type MindmapKorinish = { toliq: boolean; pul: boolean; rol: string; yashirin_obyekt?: number };

/** v3: shartnoma tuguni metasi (barcha maydon ixtiyoriy — eski RPCda yo'q). */
export type ShartnomaMeta = {
  nom?: string | null; taraf?: string | null; versiya?: number;
  /** NDS bilan. */
  summa?: number | null; summa_bez_nds?: number | null;
  holat?: string | null; loyiha_id?: number | null;
  obyekt_soni?: number; obyekt_idlar?: number[];
  tomonlar?: { rol: string | null; nom: string | null; kontragent_id?: number | null }[];
};

/** Butun tashkilot bo'yicha bir qarashda ko'riladigan jamlanma. */
export type MindmapJamlanma = {
  obyekt_soni: number;
  /** v4: moliyaviy ruxsat yo'q bo'lsa pul maydonlari umuman kelmaydi (0 emas, `undefined`). */
  smeta_jami?: number | null;
  fakt_jami?: number;
  f2_jami?: number;
  zayavka_kutilmoqda: number;
  /** Nechta obyektda narxsiz qator bor — ya'ni jami to'liq emas. */
  narxsiz_obyekt: number;
  smetasiz_obyekt: number;
  kozgu_eskirgan: number;
  /** v3 maydonlari (eski RPCda yo'q). */
  f2_asos?: string;
  f2_qoralama_jami?: number | null;
  resurssiz_obyekt?: number;
  ortiqcha_obyekt?: number;
};

export type MindmapGraf = {
  tugunlar: MindmapTugun[];
  bogichlar: MindmapBogich[];
  jamlanma?: MindmapJamlanma;
  /** v4 dan: ko'rish doirasi. Eski RPCda yo'q (`undefined` — cheklov noma'lum, butun graf). */
  korinish?: MindmapKorinish;
};

/** Mutation operation ID is created once by the caller and reused on retry. */
export function yangiOperationId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure UUID generator mavjud emas');
  }
  return crypto.randomUUID();
}

/** Tugundagi eng jiddiy belgi — tugun rangini shu belgilaydi. */
export function belgiDarajasi(t: MindmapTugun): 'ogoh' | 'info' | null {
  const b = t.meta?.belgi as MindmapBelgi[] | undefined;
  if (!b?.length) return null;
  return b.some((x) => x.daraja === 'ogoh') ? 'ogoh' : 'info';
}

/** v4 yo'q (migratsiya qo'llanmagan / eski worker) — faqat shu holatda v1 ga qaytiladi; ruxsat xatosida EMAS. */
export function v4YoqmiXato(xato: string | undefined | null): boolean {
  const x = xato || '';
  return /\(404\)/.test(x) || /So'rov ochiq emas/i.test(x) || /So‘rov ochiq emas/i.test(x);
}

/** Odamlar (v4) tugunlari va chiziqlarisiz graf — eski tahrir kanvasi va 2D/3D graf uchun (ular odamni bilmaydi). */
export function grafOdamsiz(g: MindmapGraf): MindmapGraf {
  const odam = new Set(g.tugunlar.filter((t) => t.tur === 'foydalanuvchi').map((t) => t.id));
  if (!odam.size) return g;
  return {
    ...g,
    tugunlar: g.tugunlar.filter((t) => !odam.has(t.id)),
    bogichlar: g.bogichlar.filter((b) => !odam.has(b.manba) && !odam.has(b.maqsad)),
  };
}

async function grafSorov(body: Record<string, unknown>): Promise<{ ok: true; graf: MindmapGraf } | { ok: false; error: string }> {
  const res = await vaqtliOqish('/api/sb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) return { ok: false, error: j.error || 'Graf o\'qilmadi' };
  const graf = (j.natija || {}) as MindmapGraf;
  return {
    ok: true,
    graf: {
      tugunlar: graf.tugunlar || [],
      bogichlar: graf.bogichlar || [],
      /* Rahbar paneli uchun kompaniya bo'yicha jamlanma ham shu
       * bitta javobda keladi. Uni tashlab yuborish API kontraktini
       * jimgina buzib, UI'ni yana soxta KPI qo'yishga undaydi. */
      jamlanma: graf.jamlanma,
      korinish: graf.korinish,
    },
  };
}

/** Butun kompaniya grafi — BITTA so'rovda (zero re-fetch).
 *  Avval v4 (odamlar + ko'rish doirasi, actor sessiyadan); v4 hali yo'q bo'lsa (404 / ochiq emas) — v1. */
export async function sbMindmapGrafOl(kompaniyaId: number, drilldown?: { mode: 'taminot' | 'obyekt'; obyektId: number }): Promise<
  { ok: true; graf: MindmapGraf } | { ok: false; error: string }
> {
  try {
    // Productionda V2 migration hali o'rnatilmagan bo'lishi mumkin. Asosiy
    // xarita mavjud, barqaror RPC bilan ochilishi shart; V2 faqat drilldown
    // uchun kerak bo'lganda chaqiriladi.
    if (drilldown) {
      return await grafSorov({ soro: 'mindmap_grafi_v2', kompaniya_id: kompaniyaId, mode: drilldown.mode, obyekt_id: drilldown.obyektId });
    }
    const v4 = await grafSorov({ soro: 'mindmap_grafi_v4', kompaniya_id: kompaniyaId });
    if (v4.ok || !v4YoqmiXato(v4.error)) return v4;
    return await grafSorov({ soro: 'mindmap_grafi', kompaniya_id: kompaniyaId });
  } catch (e: any) {
    return { ok: false, error: 'Tarmoq: ' + (e?.message || String(e)) };
  }
}

export type MasulRuxsat = 'read' | 'write' | 'manage';

/** Odamni obyekt YOKI loyihaga mas'ul qilib biriktiradi; `ruxsat: null` — olib tashlaydi. Actor sessiyadan. */
export async function sbMindmapMasul(
  kompaniyaId: number,
  a: { obyektId?: number; loyihaId?: number; foydalanuvchiId: number; ruxsat: MasulRuxsat | null },
): Promise<{ ok: boolean; error?: string }> {
  const r = await yozAmali({
    amal: 'mindmap_masul', kompaniya_id: kompaniyaId,
    obyekt_id: a.obyektId ?? null, loyiha_id: a.loyihaId ?? null,
    foydalanuvchi_id: a.foydalanuvchiId, ruxsat: a.ruxsat, operation_id: yangiOperationId(),
  });
  if (r.ok) return { ok: true };
  const kod = (r as { code?: string }).code;
  const KOD_MATNI: Record<string, string> = {
    AUTHORIZATION_DENIED: t('Mas‘ul biriktirish uchun «A’zolarni boshqarish» ruxsati kerak.'),
    TARGET_NOT_MEMBER: t('Bu odam kompaniyaning faol a’zosi emas.'),
    OBYEKT_NOT_FOUND: t('Obyekt topilmadi.'), LOYIHA_NOT_FOUND: t('Loyiha topilmadi.'),
  };
  return { ok: false, error: r.error || (kod && KOD_MATNI[kod]) || t('Mas‘ul saqlanmadi') };
}

/** Chiziq tortilganda — bog'lanish saqlanadi. */
export function sbMindmapBog(kompaniyaId: number, tur: BogTur, manbaId: number, maqsadId: number, expectedVersion: number, rol?: string) {
  return yozAmali({ amal: 'mindmap_bog', kompaniya_id: kompaniyaId, tur, manba_id: manbaId, maqsad_id: maqsadId,
    expected_version: expectedVersion, operation_id: yangiOperationId(), rol });
}

/** Chiziq o'chirilganda — bog'lanish uziladi (yozuvlar YO'QOLMAYDI). */
export function sbMindmapBogOchir(kompaniyaId: number, tur: BogTur, manbaId: number, maqsadId: number, expectedVersion: number, rol?: string) {
  return yozAmali({ amal: 'mindmap_bog_ochir', kompaniya_id: kompaniyaId, tur, manba_id: manbaId, maqsad_id: maqsadId,
    expected_version: expectedVersion, operation_id: yangiOperationId(), rol });
}

/** Sudrab ko'chirilgan tugun(lar) joylashuvini saqlaydi — bir so'rovda ko'pi.
 *  Bu bo'lmasa har ochilganda avtomatik qayta terilib, odam terib qo'ygan
 *  tartib yo'qolardi. */
export function sbMindmapJoylashuvSaqla(
  kompaniyaId: number, joylar: { tugun_id: string; x: number; y: number }[]
) {
  return yozAmali({ amal: 'mindmap_joylashuv_saqla', kompaniya_id: kompaniyaId, joylar, operation_id: yangiOperationId() });
}

/** Tugunni o'chiradi (QATTIQ emas — holat='bekor', tarix saqlanadi).
 *  Obyekt ATAYLAB o'chirilmaydi: unda smeta/F2/pul bor → Korzinka orqali. */
export function sbMindmapTugunOchir(kompaniyaId: number, tur: TugunTur, id: number, expectedVersion: number) {
  return yozAmali({ amal: 'mindmap_tugun_ochir', kompaniya_id: kompaniyaId, tur, id,
    expected_version: expectedVersion, operation_id: yangiOperationId() });
}

/** Mindmapdan o'chirsa bo'ladigan turlar */
export const OCHIRSA_BOLADI: TugunTur[] = ['loyiha', 'shartnoma', 'sklad', 'texnika', 'kadr', 'kontragent'];

/** Qaysi turdagi tugundan qaysi turga chiziq tortish MUMKIN. */
export const RUXSAT_BOGLANISH: { manba: TugunTur; maqsad: TugunTur; tur: BogTur; nom: string }[] = [
  { manba: 'loyiha',     maqsad: 'obyekt',    tur: 'obyekt_loyiha',    nom: 'Obyektni loyihaga biriktirish' },
  { manba: 'loyiha',     maqsad: 'shartnoma', tur: 'shartnoma_loyiha', nom: 'Shartnomani loyihaga biriktirish' },
  { manba: 'shartnoma',  maqsad: 'obyekt',    tur: 'shartnoma_obyekt', nom: 'Shartnomani obyektga biriktirish' },
  { manba: 'sklad',      maqsad: 'obyekt',    tur: 'sklad_obyekt',     nom: 'Skladni obyektga xizmat qildirish' },
  { manba: 'texnika',    maqsad: 'obyekt',    tur: 'texnika_obyekt',   nom: 'Texnikani obyektga biriktirish' },
  { manba: 'kadr',       maqsad: 'obyekt',    tur: 'kadr_obyekt',      nom: 'Xodimni obyektga biriktirish' },
  { manba: 'kontragent', maqsad: 'loyiha',    tur: 'qatnashchi',       nom: 'Kontragentni loyiha qatnashchisi qilish' },
];

export function bogTuriniTop(manba: TugunTur, maqsad: TugunTur) {
  return RUXSAT_BOGLANISH.find((r) => r.manba === manba && r.maqsad === maqsad) || null;
}

/** Mindmapdan yangi tugun yaratish — har tur o'z mavjud RPC'siga boradi. */
export async function sbMindmapTugunYarat(
  tur: TugunTur, kompaniyaId: number, maydonlar: Record<string, string>
): Promise<EntityCommandResult> {
  const nom = (maydonlar.nom || '').trim();
  if (!nom) return { ok: false, error: 'Nom bo\'sh bo\'lishi mumkin emas' };

  if (tur === 'loyiha') {
    const result = await sbT2LoyihaYoz(kompaniyaId, { nom, hudud: maydonlar.hudud || null });
    const entityId = entityIdFromResult(result, 'loyiha');
    return { ...(result as EntityCommandResult), entity_id: entityId };
  }
  if (tur === 'sklad') {
    const result = await sbSkladYarat({ kompaniyaId, nomi: nom, manzil: maydonlar.manzil, masulShaxs: maydonlar.masul });
    const entityId = entityIdFromResult(result, 'sklad');
    return { ...(result as EntityCommandResult), entity_id: entityId };
  }
  if (tur === 'texnika') {
    const result = await sbTexnikaYarat({ kompaniyaId, nomi: nom, davlatRaqami: maydonlar.davlat_raqami });
    const entityId = entityIdFromResult(result, 'texnika');
    return { ...(result as EntityCommandResult), entity_id: entityId };
  }
  if (tur === 'kadr') {
    if (!(maydonlar.lavozim || '').trim()) return { ok: false, error: 'Lavozim majburiy' };
    const result = await sbKadrYarat({ kompaniyaId, ismSharif: nom, lavozim: maydonlar.lavozim });
    const entityId = entityIdFromResult(result, 'kadr');
    return { ...(result as EntityCommandResult), entity_id: entityId };
  }
  if (tur === 'kontragent') {
    const result = await sbKontragentSaqla({ kompaniyaId, nom, inn: maydonlar.inn || undefined });
    const entityId = entityIdFromResult(result, 'kontragent');
    return { ...(result as EntityCommandResult), entity_id: entityId };
  }
  if (tur === 'shartnoma') {
    const result = await sbT2ShartnomaSaqla({
      kompaniyaId,
      raqam: nom, nom: maydonlar.izoh || nom, taraf: maydonlar.taraf || '',
    });
    const entityId = entityIdFromResult(result, 'shartnoma');
    return { ...(result as EntityCommandResult), entity_id: entityId };
  }
  /* Obyekt ATAYLAB bu yerda yaratilmaydi: unga Drive papka tuzilmasi
     ham kerak (`apiT2ObyektPapkaYarat`) — mindmapdan yarim yaratilgan
     obyekt keyin smeta yuklashda sinardi. Obyektlar sahifasidan. */
  return { ok: false, error: tur + ' turini mindmapdan yaratib bo\'lmaydi' };
}
