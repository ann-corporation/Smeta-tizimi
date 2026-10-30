/**
 * USTAMALI SUMMA — ekranlar uchun moslik qatlami (egasi 2026-10-24: «har qanday son uchun nakrutka bilan ham»).
 * Hisob `lib/hisob-yadro` da (kesim → podval → kaskad → yaxlit/kat noma'lum ustamasiz → QQS bir marta).
 * Bu fayl faqat eski tiplar/nomlarni (KatKesim, UstamaNatija, QiymatUchlik) yadro natijasiga o'giradi.
 *
 * Qoidalar: kat noma'lum summa ustamaga AYLANTIRILMAYDI (`nomalum` da alohida); koeffitsient/podval yo'q yoki
 * to'liq emas — `ustamali = null` (noma'lum, 0 emas).
 */
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import {
  bosKesim, hisob, kaskad, katSummalari, katJami, kesimgaQosh, kesimNomalumBilan, kesimYigish, podvalAniqla, qqsBilan as yadroQqsBilan,
  serverCatsdan, yaxlit2, type HisobNatija, type Kesim, type Podval,
} from './hisob-yadro';
import { kaskadCats, type SvodYaxlit } from './svod-yaxlit';
import type { NakrutkaHisobJS } from './nakrutka-podval';

/** Kategoriya kesimi (yadro `Kesim`). */
export type KatKesim = Kesim;

export const bosKatKesim = bosKesim;
export const katKesimgaQosh = kesimgaQosh;
export const katKesimNomalumBilan = kesimNomalumBilan;
export const katKesimYigish = kesimYigish;

/** Qatorlar kesimi + ko'rsatiladigan JAMI: farq «kat noma'lum» qismga o'tadi. `jami` null — farq qo'shilmaydi. */
export function katKesimJamiBilan<T>(qatorlar: Iterable<T>, kat: (x: T) => string | null | undefined, summa: (x: T) => number | null | undefined,
  jami: number | null | undefined, yaxlitmi?: (x: T) => boolean): KatKesim {
  const k = kesimYigish(qatorlar, kat, summa, yaxlitmi);
  const bor = katJami(k.summalar) + k.nomalum + (k.yaxlitQator ?? 0);
  return kesimNomalumBilan(k, jami == null ? null : jami - bor);
}

/** Serverdagi `cats` (mat — to'liq savat) → kesim. */
export function katKesimServerdan(c: { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number }, yaxlit?: SvodYaxlit | null): KatKesim {
  const k = bosKesim();
  k.summalar = serverCatsdan(c);
  if (yaxlit) k.yaxlit = { qqssiz: yaxlit.qqssiz, barglar: yaxlit.barglar };
  return k;
}

export type ZanjirKod = 'pryamye' | 'transport' | 'prochie' | 'sugurta' | 'itogo';
export type ZanjirQadam = { kod: ZanjirKod; summa: number; foiz?: number };

export type UstamaNatija = {
  /** ИТОГО-4 (aniq kategoriyalar + yaxlit), NDS SIZ. null — hisoblab bo'lmadi. */
  ustamali: number | null;
  /** QQS bilan (ВСЕГО). */
  ndsBilan: number | null;
  /** To'g'ri xarajat (aniq kategoriyalar + yaxlit tarkibi). */
  ustamasiz: number;
  /** Kat noma'lum summa — ustamaga KIRMAGAN. */
  nomalum: { summa: number; soni: number };
  qadamlar: NakrutkaHisobJS | null;
  zanjir: ZanjirQadam[];
  xato?: 'KOEF_YOQ' | 'PODVAL_TOLIQ_EMAS';
  /** QQS stavkasi, % — podvaldan; yo'q — null (taxmin yo'q). */
  ndsFoiz?: number | null;
  /** Yadro natijasi (kat noma'lum qism ham ИТОГО-4 ga ustamasiz qo'shilgan, QQS bir marta) — uchlik shundan. */
  yadro?: HisobNatija;
};

/** Kaskad zanjiri (ko'rsatish uchun). */
export function ustamaZanjiri(q: NakrutkaHisobJS, nk: Partial<NakrutkaKoeffitsientlar> | null | undefined): ZanjirQadam[] {
  const v = (kod: string) => (typeof q[kod] === 'number' ? q[kod] : 0);
  const out: ZanjirQadam[] = [{ kod: 'pryamye', summa: q.pryamye }];
  const tr = v('tr_mat') + v('skl_mat') + v('skl_mk') + v('tr_kab') + v('tr_ob') + v('zag_ob');
  if (tr) out.push({ kod: 'transport', summa: tr });
  if (v('prochie')) out.push({ kod: 'prochie', summa: v('prochie'), foiz: Number(nk?.ПРОЧИЕ_ПОДРЯДЧИК ?? 0) || undefined });
  if (v('strax') + v('risk')) out.push({ kod: 'sugurta', summa: v('strax') + v('risk'), foiz: (Number(nk?.СТРАХОВАНИЕ ?? 0) + Number(nk?.РИСК ?? 0)) || undefined });
  out.push({ kod: 'itogo', summa: q.itogo4 });
  return out;
}

/** Kesimdagi ustamasiz ИТОГО-4 ga qo'shiladigan summa (svod yaxlit + yaxlit bo'lim qatorlari). Yo'q — null. */
export function yaxlitQoshimcha(kesim: KatKesim): number | null {
  if (!kesim.yaxlit && kesim.yaxlitQator == null) return null;
  return (kesim.yaxlit?.qqssiz ?? 0) + (kesim.yaxlitQator ?? 0);
}

/** Kesim + koeffitsientlar (+ obyekt podvali) → ustamali summa (yadro). */
export function ustamaliHisobla(kesim: KatKesim, koef: Partial<NakrutkaKoeffitsientlar> | null | undefined, podval?: Podval | null): UstamaNatija {
  const nomalum = { summa: kesim.nomalum, soni: kesim.nomalumSoni };
  const s = katSummalari(kesim);
  const ustamasiz = katJami(s) + (kesim.yaxlit?.barglar ?? 0) + (kesim.yaxlitQator ?? 0);
  const bosh: UstamaNatija = { ustamali: null, ndsBilan: null, ustamasiz, nomalum, qadamlar: null, zanjir: [] };
  const p = podvalAniqla(podval, koef);
  if (!p || (!podval && (!koef || Object.keys(koef).length === 0))) return { ...bosh, xato: 'KOEF_YOQ' };
  const yadro = hisob(kesim, { podval: p });
  const r = kaskad(s, p, { ustamasizQism: yaxlitQoshimcha(kesim) });
  bosh.ndsFoiz = r.qqsFoiz;
  bosh.yadro = yadro;
  if (r.nomalumQatorlar.length || r.itogo4 == null || r.vsego == null) return { ...bosh, xato: 'PODVAL_TOLIQ_EMAS' };
  const qadamlar = { ...(r.qiymat as Record<string, number>), pryamye: r.pryamye, itogo4: r.itogo4, nds: r.qqs ?? 0, vsego: r.vsego } as NakrutkaHisobJS;
  const zanjir = ustamaZanjiri({ ...qadamlar, itogo4: r.kaskadItogo4 ?? r.itogo4 }, koef).map((z) => (z.kod === 'itogo' ? { ...z, summa: r.itogo4 as number } : z));
  return { ...bosh, ustamali: r.itogo4, ndsBilan: r.vsego, qadamlar, zanjir };
}

type ServerCats = { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number };
/** Server javobi → obyekt darajasidagi kesim: cats_kaskad (bo'lmasa cats) + svod yaxlit. */
export function obyektKesimi(r: { cats?: ServerCats; cats_kaskad?: ServerCats; svod_yaxlit?: SvodYaxlit | null }): KatKesim | null {
  const c = kaskadCats(r) ?? r.cats;
  return c ? katKesimServerdan(c, r.svod_yaxlit) : null;
}

/** OBYEKT darajasidagi ustamali / ВСЕГО — yagona yo'l. */
export function obyektUstamali(
  r: { cats?: ServerCats; cats_kaskad?: ServerCats; svod_yaxlit?: SvodYaxlit | null; koeffitsientlar?: Partial<NakrutkaKoeffitsientlar> | null },
  podval?: Podval | null, koef?: Partial<NakrutkaKoeffitsientlar> | null,
): UstamaNatija | null {
  const k = obyektKesimi(r);
  return k ? ustamaliHisobla(k, koef ?? r.koeffitsientlar ?? null, podval) : null;
}

/* ───────────── OBYEKT QIYMATI (egasi 2026-10-27: QQS bilan — ASOSIY) ───────────── */

export type UchlikSabab = 'SUMMA_YOQ' | 'HISOBLANMADI' | 'KOEF_YOQ' | 'PODVAL_TOLIQ_EMAS' | 'KAT_NOMALUM' | 'QQS_STAVKA_YOQ' | 'KESIM_YOQ';

/** Jami qiymat UCHLIGI: 1) QQS bilan — asosiy; 2) ustamali, QQS siz; 3) ustamasiz. null — noma'lum (0 emas). */
export type QiymatUchlik = {
  qqsBilan: number | null;
  ustamali: number | null;
  ustamasiz: number | null;
  taxminiy: boolean;
  nomalum: number;
  sabab: UchlikSabab | null;
};

/**
 * `ustamaliHisobla` natijasi + ko'rsatiladigan ustamasiz jami → uchlik. Kat noma'lum qism: yadro natijasidan
 * (ИТОГО-4 ga ustamasiz qo'shilgan, QQS bir marta — server `_t2_summa_paket_hisob_v1` bilan bir xil).
 */
export function qiymatUchligi(u: UstamaNatija | null | undefined, ustamasiz: number | null | undefined): QiymatUchlik {
  const asos = ustamasiz != null && Number.isFinite(ustamasiz) ? ustamasiz : null;
  const bosh: QiymatUchlik = { qqsBilan: null, ustamali: null, ustamasiz: asos, taxminiy: false, nomalum: 0, sabab: null };
  if (asos == null) return { ...bosh, sabab: 'SUMMA_YOQ' };
  if (!u) return { ...bosh, sabab: 'HISOBLANMADI' };
  if (u.xato) return { ...bosh, sabab: u.xato };
  if (u.ustamali == null) return { ...bosh, sabab: 'HISOBLANMADI' };
  const nomalumBor = u.nomalum.soni > 0 || u.nomalum.summa !== 0;
  if (nomalumBor && u.ustamasiz === 0) return { ...bosh, nomalum: u.nomalum.summa, sabab: 'KAT_NOMALUM' };
  if (!nomalumBor) return { ...bosh, ustamali: u.ustamali, qqsBilan: u.ndsBilan, sabab: u.ndsBilan == null ? 'HISOBLANMADI' : null };
  // Yadro natijasi bo'lsa — undan; yo'q bo'lsa (qo'lda yasalgan natija) — o'sha qadam: ИТОГО-4 + kat noma'lum, QQS bir marta.
  const y = u.yadro;
  const ustamali = y?.ustamali ?? yaxlit2(u.ustamali + u.nomalum.summa);
  const qqsBilan = y ? y.qqsBilan : yadroQqsBilan(ustamali, u.ndsFoiz);
  return { ...bosh, ustamali, qqsBilan, taxminiy: true, nomalum: u.nomalum.summa, sabab: qqsBilan == null ? 'QQS_STAVKA_YOQ' : null };
}

/** Portfel (bir nechta obyekt) uchligi. Ustamasi hisoblanmagan obyektlar ustamasiz qiymati bilan — taxminiy «≈». */
export function portfelUchligi(
  p: { ustamali: number | null; ndsBilan: number | null; nomalumSoni: number; hisoblanganUstamasiz: number },
  ustamasiz: number | null | undefined,
): QiymatUchlik {
  const asos = ustamasiz != null && Number.isFinite(ustamasiz) ? ustamasiz : null;
  const bosh: QiymatUchlik = { qqsBilan: null, ustamali: null, ustamasiz: asos, taxminiy: false, nomalum: 0, sabab: null };
  if (p.ustamali == null) return { ...bosh, sabab: asos == null ? 'SUMMA_YOQ' : 'HISOBLANMADI' };
  const qisman = p.nomalumSoni > 0;
  const qolgan = qisman && asos != null ? Math.max(0, asos - p.hisoblanganUstamasiz) : 0;
  const qqsBilan = p.ndsBilan == null ? null : yaxlit2(p.ndsBilan + qolgan);
  return { ...bosh, ustamali: yaxlit2(p.ustamali + qolgan), qqsBilan, taxminiy: qisman, nomalum: qolgan, sabab: qqsBilan == null ? 'HISOBLANMADI' : null };
}

/** Faqat to'g'ri xarajat ma'lum (kesim yo'q): QQS bilan va ustamali «—» (sababi bilan). */
export function ustamasizUchlik(ustamasiz: number | null | undefined, sabab: UchlikSabab = 'KESIM_YOQ'): QiymatUchlik {
  const asos = ustamasiz != null && Number.isFinite(ustamasiz) ? ustamasiz : null;
  return { qqsBilan: null, ustamali: null, ustamasiz: asos, taxminiy: false, nomalum: 0, sabab: asos == null ? 'SUMMA_YOQ' : sabab };
}

/** Server tayyor kaskad natijasi + to'g'ri xarajat → uchlik. Hisob yo'q. */
export function serverUchligi(n: { itogo4: number | null; vsego: number | null } | null | undefined, ustamasiz: number | null | undefined): QiymatUchlik {
  const asos = ustamasiz != null && Number.isFinite(ustamasiz) ? ustamasiz : null;
  const qqs = n?.vsego != null && Number.isFinite(n.vsego) ? n.vsego : null;
  const us = n?.itogo4 != null && Number.isFinite(n.itogo4) ? n.itogo4 : null;
  return { qqsBilan: qqs, ustamali: us, ustamasiz: asos, taxminiy: false, nomalum: 0, sabab: qqs != null ? null : asos == null && !n ? 'SUMMA_YOQ' : 'HISOBLANMADI' };
}

/** Ikki uchlik ayirmasi (plyus − minus): har qiymat ikkalasi ma'lum bo'lsagina. */
export function uchlikAyir(a: QiymatUchlik, b: QiymatUchlik): QiymatUchlik {
  const ay = (x: number | null, y: number | null) => (x == null || y == null ? null : yaxlit2(x - y));
  const qqsBilan = ay(a.qqsBilan, b.qqsBilan);
  return {
    qqsBilan, ustamali: ay(a.ustamali, b.ustamali), ustamasiz: ay(a.ustamasiz, b.ustamasiz),
    taxminiy: a.taxminiy || b.taxminiy, nomalum: yaxlit2(a.nomalum - b.nomalum),
    sabab: qqsBilan != null ? null : a.sabab ?? b.sabab ?? 'HISOBLANMADI',
  };
}
