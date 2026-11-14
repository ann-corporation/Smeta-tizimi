/**
 * NAKOPITELNIY ведомость - yagona kontekst yuklagich + hujjat quruvchi (avval NakopitelniyVedomost sahifasi ichida edi).
 * Sahifa ham, shartnoma oylik paketi ham SHU funksiyalarni chaqiradi: bir xil kirishdan bir xil bayt.
 * Faqat TASDIQLANGAN F2 lardan hisoblanadi; ustama/podval o'qilmasa hujjat yasalmaydi.
 */
import { t2NakopitelniyToliq, type NakopitelniyDavr, type NakopitelniyJami, type NakopitelniyJavob, type NakopitelniyProgress, type NakopitelniyQator, type SmetaNakrutka } from '../../api/t2-nakopitelniy';
import { sbT2F2TafsilotOl } from '../../api/t2-narx';
import { t2ObyektNakrutka, type NakrutkaKaskad, type NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { obyektPodvaliOqi } from '../../api/t2-nakrutka-podval';
import { ozgarishIzohi, smetaModeliniYukla, tartibla, type SmetaModel } from '../smeta-model';
import { f2OyKesimi } from '../pto-document-lineage/f3-sources';
import { obyektSmetaKOplate } from '../ustamali-summa';
import { nakopitelniyVedomostHujjat, type NakopitelniyOylar } from '../nakopitelniy-vedomost-export';
import type { Podval } from '../hisob-yadro';
import type { SvodYaxlit } from '../svod-yaxlit';
import type { ImzoNomlar } from '../hujjat-yozuvchi';
import type { F3DavrAkt } from '../forma3-export';
import { aktlarBahosiOl } from './akt-baho';
import { bajarilmadiRoyxatOl, type BajarilmadiQator } from '../../api/t2-bajarilmadi';
import { f2AktUstunlari } from '../nakopitelniy-akt-ustun';

type OkJavob = Extract<NakopitelniyJavob, { ok: true }>;
export type NakopitelniyOyKesim = ReturnType<typeof f2OyKesimi>;

/** Nakopitelniy qatorlarini daraxt ma'lumotlari (ota/daraja), o'zgarish izohi va norma bilan boyitadi va DARAXT tartibiga soladi. */
export function nakopitelniyQatorlarniTayyorla(xom: readonly NakopitelniyQator[], model: SmetaModel | null, bajarilmadi: readonly BajarilmadiQator[] | null = null): NakopitelniyQator[] {
  const bj = new Map((bajarilmadi ?? []).filter((b) => b.holat === 'faol').map((b) => [b.qator_id, b] as const));
  const meta = new Map<number, { ota_id: number | null; daraja: number | null }>();
  if (model) for (const q of model.byId.values()) meta.set(q.id, { ota_id: q.ota_id, daraja: q.daraja });
  return tartibla(xom.map((q) => {
    const b = bj.get(q.qator_id);
    return { ...q, ...(meta.get(q.qator_id) ?? {}), ozgarish_izoh: ozgarishIzohi(q, model), norma: model?.byId.get(q.qator_id)?.norma ?? null,
      almashtirgan_id: model?.almashtiradi.get(q.qator_id) ?? null,
      ...(b ? { bajarilmadi_hajm: b.hajm == null ? null : Number(b.hajm), bajarilmadi_sabab: b.sabab_kod, bajarilmadi_izoh: b.sabab_izoh, bajarilmadi_zamena_id: b.zamena_qator_id } : {}) };
  }), model);
}

export type NakopitelniyYuklangan = {
  r: OkJavob; model: SmetaModel; qatorlar: NakopitelniyQator[];
  /** Tasdiqlangan F2 oyi kesimi (jadval ustunlari / grafik); F2 tafsiloti to'liq o'qilmasa - null. */
  oyKesim: NakopitelniyOyKesim | null;
  /** Har F-2 alohida ustun (podvalsiz — sahifa jadvali uchun); F2 tafsiloti to'liq o'qilmasa null. */
  aktUstun: ReturnType<typeof f2AktUstunlari> | null;
};

/** Obyekt nakopitelniy vedomosti: server sahifalari + yagona smeta modeli + F2 oy kesimi. Xato - sabab matni bilan. */
export async function nakopitelniyYukla(objId: number, davr: string | null, opts: { onProgress?: (p: NakopitelniyProgress) => void; kompaniyaId?: number | null } = {}): Promise<NakopitelniyYuklangan | { xato: string }> {
  const [r, model, taf, bj] = await Promise.all([
    t2NakopitelniyToliq(objId, davr || null, false, { onProgress: opts.onProgress }),
    smetaModeliniYukla(objId),
    sbT2F2TafsilotOl({ obyektId: objId, tur: 'f2' }).catch(() => null),
    // «Bajarilmadi» belgilari — qator hujjatdan yo'qolmaydi (egasi 2026-11-14); o'qilmasa hujjat belgisiz chiqadi (xato emas).
    opts.kompaniyaId ? bajarilmadiRoyxatOl(opts.kompaniyaId, objId).then((x) => (x.ok ? x.qatorlar : null)).catch(() => null) : Promise.resolve(null),
  ]);
  if (!r.ok) return { xato: r.xato || r.code || 'Yuklanmadi' };
  const oyKesim = taf?.ok && taf.toliq !== false && taf.qatorlar && r.davr ? f2OyKesimi(taf.qatorlar, String(r.davr).slice(0, 7)) : null;
  return { r, model, qatorlar: nakopitelniyQatorlarniTayyorla(r.qatorlar, model, bj), oyKesim,
    aktUstun: taf?.ok && taf.toliq !== false && taf.qatorlar && r.davr ? f2AktUstunlari(taf.qatorlar, String(r.davr).slice(0, 7), []) : null };
}

export type NakopitelniyUstama = {
  koeffitsientlar: Partial<NakrutkaKoeffitsientlar> | null; kaskad: NakrutkaKaskad | null;
  javob: Awaited<ReturnType<typeof t2ObyektNakrutka>> | null; podval: Podval | null;
  /** Podval o'qildi (null - standart kaskad); false - hali o'qilmadi / xato. */
  podvalOqildi: boolean; xato: string | null;
};

/** Ustama (nakrutka) + podval. «Podval yo'q» va «o'qilmadi» farqlanadi; xato jim yutilmaydi. */
export async function nakopitelniyUstamaOl(kompaniyaId: number, objId: number): Promise<NakopitelniyUstama> {
  const bosh: NakopitelniyUstama = { koeffitsientlar: null, kaskad: null, javob: null, podval: null, podvalOqildi: false, xato: null };
  try {
    const r = await t2ObyektNakrutka(objId);
    if (!r.ok) return { ...bosh, xato: r.error || r.code || 'Nakrutka o‘qilmadi' };
    const u: NakopitelniyUstama = { ...bosh, koeffitsientlar: r.koeffitsientlar ?? null, kaskad: r.nakrutka ?? null, javob: r.cats ? r : null };
    const p = await obyektPodvaliOqi(kompaniyaId, objId, r.shartnoma_id ?? null, r.nakrutka_podval_id ?? null);
    if (!p.ok) return { ...u, xato: p.xato };
    return { ...u, podval: p.podval, podvalOqildi: true };
  } catch { return { ...bosh, xato: 'Nakrutka o‘qilmadi (tarmoq xatosi)' }; }
}

/** Eksport darvozasi: ustama/podval o'qilmagan yoki xato - hujjat yasalmaydi (sababi bilan). */
export function nakopitelniyUstamaTayyorEmas(u: Pick<NakopitelniyUstama, 'xato' | 'podvalOqildi'>): string | null {
  return u.xato ? `Hujjat yasalmadi: ${u.xato}.` : !u.podvalOqildi ? 'Hujjat yasalmadi: ustama (nakrutka) va podval hali o‘qilmoqda — biroz kuting.' : null;
}

/** Smeta «к оплате» - BITTA yadro hisobi (`obyektUstamali`); sahifa KPI si va hujjat bir xil. */
export function nakopitelniySmetaNakrutka(u: NakopitelniyUstama, jami: Pick<NakopitelniyJami, 'smeta_summa'> | null): { qiymat: SmetaNakrutka | null; sabab: string | null } {
  if (u.xato) return { qiymat: null, sabab: u.xato };
  if (!u.podvalOqildi) return { qiymat: null, sabab: null }; // hali o'qilmoqda
  // Kategoriyasi ko'rsatilmagan smeta qismi (jami - kesim) tashlanmaydi - ИТОГО-4 ga ustamasiz, taxminiy (≈).
  return obyektSmetaKOplate(u.javob, u.podval, u.koeffitsientlar as NakrutkaKoeffitsientlar | null, jami?.smeta_summa ?? null);
}

/** Hujjat uchun oy kesimi (eksport paytida F2 tafsiloti qayta o'qiladi - F3 bilan bir xil certified manba). */
export async function nakopitelniyOylarOl(objId: number, davr: string): Promise<NakopitelniyOyKesim | null> {
  const taf = await sbT2F2TafsilotOl({ obyektId: objId, tur: 'f2' });
  return taf.ok && taf.toliq !== false && taf.qatorlar && davr ? f2OyKesimi(taf.qatorlar, davr.slice(0, 7)) : null;
}

/** Hisobot oyigacha hamma tasdiqlangan F2 — har biri O'Z podvali bilan (F-3 bilan bir xil manba). O'qilmasa null (hujjat qator hisobi bilan chiqadi). */
export async function nakopitelniyAktlarKOplate(kompaniyaId: number, objId: number, obyektNom: string, davr: string): Promise<F3DavrAkt[] | null> {
  try {
    const taf = await sbT2F2TafsilotOl({ obyektId: objId, tur: 'f2' });
    if (!taf.ok || taf.toliq === false || !taf.qatorlar) return null;
    return await aktlarBahosiOl({ kompaniyaId, obyektId: objId, obyektNom, qatorlar: taf.qatorlar, davr });
  } catch { return null; }
}
/** Har tasdiqlangan F-2 — alohida ustun, o'z podvali bilan (egasi 2026-11-14). O'qilmasa null — oy kesimi, bitta umumiy podval. */
export async function nakopitelniyAktUstunOl(kompaniyaId: number, objId: number, obyektNom: string, davr: string): Promise<NakopitelniyOylar | null> {
  try {
    const taf = await sbT2F2TafsilotOl({ obyektId: objId, tur: 'f2' });
    if (!taf.ok || taf.toliq === false || !taf.qatorlar || !davr) return null;
    const baho = await aktlarBahosiOl({ kompaniyaId, obyektId: objId, obyektNom, qatorlar: taf.qatorlar, davr });
    return f2AktUstunlari(taf.qatorlar, davr, baho);
  } catch { return null; }
}
export type NakopitelniyHujjatKirish = {
  qatorlar: readonly NakopitelniyQator[]; jami: Pick<NakopitelniyJami, 'smeta_summa'> | null; obyektNom: string; davr: string;
  ustama: NakopitelniyUstama; oylar: NakopitelniyOyKesim | null; imzo?: ImzoNomlar; ndsFoiz: number | null;
  /** Hisobot oyigacha hamma tasdiqlangan F2 (har biri o'z podvali bilan): «К ОПЛАТЕ» oy va «с начала» jami shulardan. null — o'qilmadi (qator hisobi). */
  aktlarKOplate?: ReadonlyArray<F3DavrAkt> | null;
  /** Har F-2 — alohida ustun (
akopitelniyAktUstunOl); berilsa oylar o'rniga shu. */
  aktUstun?: NakopitelniyOylar | null;
};

/** Nakopitelniy hujjati: sahifa ham, paket ham shu funksiyani chaqiradi. */
export function nakopitelniyHujjatQur(k: NakopitelniyHujjatKirish): { bytes: Uint8Array; faylNomi: string } {
  const smetaNakrutka = nakopitelniySmetaNakrutka(k.ustama, k.jami).qiymat;
  return nakopitelniyVedomostHujjat(k.qatorlar, {
    obyektNom: k.obyektNom, davr: k.davr, imzo: k.imzo, ndsFoiz: k.ndsFoiz, smetaNakrutka, nakrutka: k.ustama.koeffitsientlar, podval: k.ustama.podval,
    nkManba: k.ustama.javob?.nk_manba ?? null, oylar: (k.aktUstun?.oylar.length ? k.aktUstun : k.oylar) as NakopitelniyOylar | null, svodYaxlit: (k.ustama.javob?.svod_yaxlit ?? null) as SvodYaxlit | null, aktlarKOplate: k.aktlarKOplate,
  });
}

export type NakopitelniyPaketNatija = { ok: true; nom: string; bytes: Uint8Array } | { ok: false; bosh?: boolean; xato: string };

/** Paket yo'li: shartnoma oyi = hisobot davri. Shu oyda TASDIQLANGAN F2 bo'lmasa nakopitelniy yasalmaydi. */
export async function nakopitelniyPaketFayli(p: { kompaniyaId: number; obyektId: number; obyektNom: string; oy: string; imzo?: ImzoNomlar; ndsFoiz: number | null }): Promise<NakopitelniyPaketNatija> {
  const y = await nakopitelniyYukla(p.obyektId, `${p.oy}-01`, { kompaniyaId: p.kompaniyaId });
  if ('xato' in y) return { ok: false, xato: y.xato };
  const davr: NakopitelniyDavr | undefined = y.r.davrlar.find((d) => d.oy.slice(0, 7) === p.oy);
  if (!davr?.certified) return { ok: false, bosh: true, xato: 'shu oyda tasdiqlangan F2 yo‘q' };
  if (y.r.truncated) return { ok: false, xato: 'server ro‘yxatni to‘liq bermadi — chala hujjat chiqarilmaydi' };
  const ustama = await nakopitelniyUstamaOl(p.kompaniyaId, p.obyektId);
  const ux = nakopitelniyUstamaTayyorEmas(ustama);
  if (ux) return { ok: false, xato: ux };
  const davrQiymat = String(y.r.davr);
  let oylar: NakopitelniyOyKesim | null;
  try { oylar = await nakopitelniyOylarOl(p.obyektId, davrQiymat); } catch { oylar = null; }
  try {
    const aktUstun = await nakopitelniyAktUstunOl(p.kompaniyaId, p.obyektId, p.obyektNom, davrQiymat);
    const aktlarKOplate = aktUstun?.oylar.length ? undefined : await nakopitelniyAktlarKOplate(p.kompaniyaId, p.obyektId, p.obyektNom, davrQiymat);
    const h = nakopitelniyHujjatQur({ qatorlar: y.qatorlar, jami: y.r.jami ?? null, obyektNom: p.obyektNom, davr: davrQiymat, ustama, oylar, imzo: p.imzo, ndsFoiz: p.ndsFoiz, aktlarKOplate, aktUstun });
    return { ok: true, nom: h.faylNomi, bytes: h.bytes };
  } catch { return { ok: false, xato: 'Excel fayli tuzilmadi' }; }
}
