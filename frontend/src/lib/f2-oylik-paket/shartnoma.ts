/**
 * SHARTNOMA OYLIK PAKETI (egasi 2026-11-03): bir shartnoma x bir oy = bitta paket. Shartnomaning HAMMA obyekti qamraladi;
 * ZIP da har obyektga alohida papka, shartnoma darajasidagi hujjatlar (reestr/svod, Forma-3, akt-sverka, ПАКЕТ_СОСТАВ.txt) ildizda.
 * Faqat toza funksiyalar: yig'ish, tayyorgarlik jadvali («Tayyorgarlik»), manifest va o'zgarish izi solishtirish. Pul hisobi yo'q
 * (summalar `oylik.ts` / hisob-yadrodan keladi); tayyorgarlik hech narsani BLOKLAMAYDI.
 */
import type { ReestrObyekt, ReestrShartnoma } from '../f2-reestr/reestr';
import { takrorsizYol, type FaylMeta, type PaketAkt, type PaketFayl, type PaketFaylTuri, type Tekshiruv } from './oylik';

export const MANIFEST_FORMAT = 't2-shartnoma-oylik-paket/1';
/** Kanonik fayl saqlashdagi hujjat turi (`/api/hujjat-yukla`, `turi`). */
export const PAKET_HUJJAT_TURI = 'shartnoma_oylik_paket';

/* ───────────── shartnoma -> obyektlar ───────────── */

/** Shartnomaga bog'langan obyektlar (reestr xaritasi: obyekt -> shartnomalar), nomi bo'yicha tartiblangan. */
export function shartnomaObyektlari(
  m: { obyektlar: readonly ReestrObyekt[]; shartnomalar: ReadonlyMap<number, readonly ReestrShartnoma[]> }, shartnomaId: number,
): ReestrObyekt[] {
  return m.obyektlar.filter((o) => (m.shartnomalar.get(o.id) ?? []).some((s) => s.id === shartnomaId))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'ru') || a.id - b.id);
}

/** Reestrdagi barcha shartnomalar (takrorsiz), raqam bo'yicha. */
export function barchaShartnomalar(m: { shartnomalar: ReadonlyMap<number, readonly ReestrShartnoma[]> }): ReestrShartnoma[] {
  const x = new Map<number, ReestrShartnoma>();
  for (const l of m.shartnomalar.values()) for (const s of l) x.set(s.id, s);
  return [...x.values()].sort((a, b) => a.raqam.localeCompare(b.raqam, 'ru', { numeric: true }) || a.id - b.id);
}

/* ───────────── ZIP tarkibi: obyekt papkalari ───────────── */

export type KirishFayl = { nom: string; bytes: Uint8Array; tur: PaketFaylTuri; obyektId?: number | null; meta?: FaylMeta };

/** ZIP papka nomi: taqiqlangan belgilar olib tashlanadi; bir xil nom bo'lsa obyekt id si qo'shiladi. */
export function obyektPapkaNomi(nom: string, id: number, band: ReadonlySet<string>): string {
  const toza = nom.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 60).trim() || `obyekt_${id}`;
  return band.has(toza.toLowerCase()) ? `${toza} (${id})` : toza;
}

/**
 * Paket fayllari: shartnoma darajasidagilar ILDIZDA, har obyektning hujjatlari o'z papkasida. Bir xil yo'l — «_2», «_3».
 * Obyekt papkalari nomi bo'yicha, ildiz fayllari kirish tartibida.
 */
export function shartnomaPaketYigish(i: {
  obyektlar: ReadonlyArray<{ id: number; nom: string }>;
  obyektFayllari: ReadonlyMap<number, readonly KirishFayl[]>;
  shartnomaFayllari: readonly KirishFayl[];
}): PaketFayl[] {
  const bandYol = new Set<string>();
  const out: PaketFayl[] = [];
  const qosh = (yol: string, f: KirishFayl, obyektId: number | null) => {
    const y = takrorsizYol(yol, bandYol);
    bandYol.add(y.toLowerCase());
    out.push({ yol: y, bytes: f.bytes, tur: f.tur, obyektId, ...(f.meta ? { meta: f.meta } : {}) });
  };
  for (const f of i.shartnomaFayllari) qosh(f.nom, f, null);
  const bandPapka = new Set<string>();
  for (const o of [...i.obyektlar].sort((a, b) => a.nom.localeCompare(b.nom, 'ru') || a.id - b.id)) {
    const fayllar = i.obyektFayllari.get(o.id) ?? [];
    if (!fayllar.length) continue;
    const papka = obyektPapkaNomi(o.nom, o.id, bandPapka);
    bandPapka.add(papka.toLowerCase());
    for (const f of fayllar) qosh(`${papka}/${f.nom}`, f, o.id);
  }
  return out;
}

/* ───────────── Tayyorgarlik (checklist) ───────────── */

/** ok = ✓, yoq = ✗, ogoh = ⚠, nom = hali noma'lum / o'qilmoqda, na = bu obyektga tegishli emas (—). */
export type KatakHolat = 'ok' | 'yoq' | 'ogoh' | 'nom' | 'na';
export type Katak = { holat: KatakHolat; izoh?: string };
export type TayyorgarlikQator = {
  obyektId: number; obyektNom: string;
  fakt: Katak; f2: Katak; forma3: Katak; nakopitelniy: Katak; m29: Katak; ostatka: Katak; slichitelniy: Katak; summa: Katak;
};
export type TayyorgarlikUstun = Exclude<keyof TayyorgarlikQator, 'obyektId' | 'obyektNom'>;
export const TAYYORGARLIK_USTUNLARI: readonly TayyorgarlikUstun[] = ['fakt', 'f2', 'forma3', 'nakopitelniy', 'm29', 'ostatka', 'slichitelniy', 'summa'];
export type M29Holat = 'bajarildi' | 'yoq' | 'nom';
export type Forma3Holat = { tayyor: number; qoralama: number };
/** Paketda HAQIQATAN yaratilgan (yoki yaratilmagan) obyekt hujjatlari: katak qiymati shu natijadan oladi. */
export type YaratilganTuri = 'nakopitelniy' | 'm29' | 'ostatka' | 'slichitelniy';
export type YaratilganHujjatlar = ReadonlyMap<number, Partial<Record<YaratilganTuri, Katak>>>;

export const KATAK_BELGI: Record<KatakHolat, string> = { ok: '✓', yoq: '✗', ogoh: '⚠', nom: '…', na: '—' };

/**
 * Har obyekt uchun tayyorgarlik. Hech narsa bloklanmaydi - faqat holat. Qoidalar:
 *  - fakt: shu oyda fakt akti bor ✓, yo'q ✗, o'qilmagan …;
 *  - F2: tasdiqlangan bor ✓ (qoralama ham bo'lsa ⚠), faqat qoralama/tekshiruvda ⚠, F2 yo'q ✗;
 *  - Forma-3: shartnoma darajasida (har qatorda bir xil): tayyor ✓, faqat qoralama ⚠, yo'q ✗;
 *  - nakopitelniy faqat TASDIQLANGAN F2 lardan hisoblanadi: tasdiqlangan bor ✓, faqat qoralama ⚠, F2 yo'q ✗;
 *  - M-29: shu oy bajarilgan ✓, yo'q ✗;
 *  - ostatka / slichitelniy: paket yig'ilgunga qadar noma'lum (…), F2 yo'q bo'lsa —; yig'ilgach yaratilgan natijasi (✓ fayl bor, ✗ yaratilmadi);
 *  - yaratilgan berilsa nakopitelniy / M-29 katagi ham haqiqiy fayl holatini ko'rsatadi (hisoblangan taxmin ustidan);
 *  - summa: narxsiz qator yoki noma'lum summa/NDS bor ⚠ (NULL != 0 - hech qachon 0 deb sanalmaydi), F2 yo'q —.
 */
export function tayyorgarlikHisobla(i: {
  obyektlar: ReadonlyArray<{ id: number; nom: string }>;
  aktlar: readonly PaketAkt[];
  faktSoni: ReadonlyMap<number, number | null>;
  m29: ReadonlyMap<number, M29Holat>;
  forma3: Forma3Holat | null;
  tekshiruvlar: readonly Tekshiruv[];
  yaratilgan?: YaratilganHujjatlar;
}): { qatorlar: TayyorgarlikQator[]; shartnoma: { forma3: Katak; sverka: Katak } } {
  const forma3 = forma3Katak(i.forma3);
  const qatorlar = i.obyektlar.map((o): TayyorgarlikQator => {
    const mening = i.aktlar.filter((r) => r.akt.obyekt_id === o.id);
    const tasdiq = mening.filter((r) => r.bosqich === 'tasdiqlangan').length;
    const boshqa = mening.length - tasdiq;
    const fs = i.faktSoni.get(o.id);
    const fakt: Katak = fs === undefined || fs === null ? { holat: 'nom' } : fs > 0 ? { holat: 'ok', izoh: String(fs) } : { holat: 'yoq' };
    const f2: Katak = !mening.length ? { holat: 'yoq' }
      : tasdiq && !boshqa ? { holat: 'ok', izoh: String(tasdiq) }
        : tasdiq ? { holat: 'ogoh', izoh: 'qoralama ham bor' } : { holat: 'ogoh', izoh: 'faqat qoralama' };
    const nakopitelniy: Katak = !mening.length ? { holat: 'yoq' } : tasdiq ? { holat: 'ok' } : { holat: 'ogoh', izoh: 'tasdiqlangan F2 yo‘q' };
    const mh = i.m29.get(o.id) ?? 'nom';
    const m29: Katak = mh === 'bajarildi' ? { holat: 'ok' } : mh === 'yoq' ? { holat: 'yoq' } : { holat: 'nom' };
    const ids = new Set(mening.map((r) => r.akt.id));
    const muammo = i.tekshiruvlar.filter((x) => ids.has(x.aktId) && x.kod === 'summa_nomalum');
    const hisoblanmagan = mening.some((r) => !r.moliya && !r.moliyaXato);
    const summa: Katak = !mening.length ? { holat: 'na' }
      : muammo.length ? { holat: 'ogoh', izoh: String(muammo.length) }
        : hisoblanmagan ? { holat: 'nom' } : { holat: 'ok' };
    const y = i.yaratilgan?.get(o.id);
    const ostatka: Katak = y?.ostatka ?? (mening.length ? { holat: 'nom' } : { holat: 'na' });
    const slichitelniy: Katak = y?.slichitelniy ?? (mening.length ? { holat: 'nom' } : { holat: 'na' });
    return { obyektId: o.id, obyektNom: o.nom, fakt, f2, forma3, nakopitelniy: y?.nakopitelniy ?? nakopitelniy, m29: y?.m29 ?? m29, ostatka, slichitelniy, summa };
  });
  return { qatorlar, shartnoma: { forma3, sverka: { holat: 'ok' } } };
}

function forma3Katak(f: Forma3Holat | null): Katak {
  if (!f) return { holat: 'nom' };
  if (f.tayyor > 0) return { holat: 'ok', izoh: String(f.tayyor) };
  return f.qoralama > 0 ? { holat: 'ogoh', izoh: 'faqat qoralama' } : { holat: 'yoq' };
}

/* ───────────── manifest ───────────── */

export type ManifestFayl = { yol: string; tur: PaketFaylTuri | 'tarkib'; obyekt_id: number | null; sha256: string; olcham: number };
export type ManifestAkt = { akt_id: number; obyekt_id: number; raqam: string | null; bosqich: string };
export type PaketManifest = {
  format: typeof MANIFEST_FORMAT;
  oy: string;
  shartnoma: { id: number; raqam: string; nom: string | null };
  fayllar: ManifestFayl[];
  aktlar: ManifestAkt[];
  obyektlar: Array<{ id: number; nom: string }>;
  tayyorgarlik: Array<{ obyekt_id: number } & Record<TayyorgarlikUstun, KatakHolat>>;
  kirmadi: string[];
  zip: { sha256: string; olcham: number; nom: string } | null;
};

/** SHA-256 (hex) - brauzer/Node `crypto.subtle`. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Manifest: har fayl (yo'l, sha256, hajm), ishlatilgan aktlar, tayyorgarlik. ZIP sha256 si keyin `zip` ga yoziladi. */
export async function manifestQur(i: {
  oy: string; shartnoma: { id: number; raqam: string; nom?: string | null };
  fayllar: readonly PaketFayl[]; tarkib: { yol: string; bytes: Uint8Array } | null;
  aktlar: readonly PaketAkt[]; obyektlar: ReadonlyArray<{ id: number; nom: string }>;
  tayyorgarlik: readonly TayyorgarlikQator[]; kirmadi: readonly string[];
}): Promise<PaketManifest> {
  const fayllar: ManifestFayl[] = [];
  for (const f of i.fayllar) fayllar.push({ yol: f.yol, tur: f.tur, obyekt_id: f.obyektId ?? null, sha256: await sha256Hex(f.bytes), olcham: f.bytes.byteLength });
  if (i.tarkib) fayllar.push({ yol: i.tarkib.yol, tur: 'tarkib', obyekt_id: null, sha256: await sha256Hex(i.tarkib.bytes), olcham: i.tarkib.bytes.byteLength });
  return {
    format: MANIFEST_FORMAT, oy: i.oy,
    shartnoma: { id: i.shartnoma.id, raqam: i.shartnoma.raqam, nom: i.shartnoma.nom ?? null },
    fayllar,
    aktlar: i.aktlar.map((r) => ({ akt_id: r.akt.id, obyekt_id: r.akt.obyekt_id, raqam: r.akt.raqam, bosqich: r.bosqich })),
    obyektlar: i.obyektlar.map((o) => ({ id: o.id, nom: o.nom })),
    tayyorgarlik: i.tayyorgarlik.map((q) => ({ obyekt_id: q.obyektId, fakt: q.fakt.holat, f2: q.f2.holat, forma3: q.forma3.holat, nakopitelniy: q.nakopitelniy.holat, m29: q.m29.holat, ostatka: q.ostatka.holat, slichitelniy: q.slichitelniy.holat, summa: q.summa.holat })),
    kirmadi: [...i.kirmadi], zip: null,
  };
}

/* ───────────── o'zgarish izi (topshirilgandan keyin) ───────────── */

export type IzAkt = { akt_id: number; raqam?: string | null; versiya: number | null; holat: string | null; lifecycle?: string | null };
export type IzFakt = { soni: number; maks_id: number | null; xesh: string };
export type OyIz = { obyekt_id: number; f2: IzAkt[]; fakt: IzFakt };
export type IzFarq = { obyektId: number; sabab: 'f2' | 'fakt' | 'obyekt_qoshildi' | 'obyekt_chiqdi' };

const f2Kalit = (a: IzAkt) => `${a.akt_id}:${a.versiya ?? ''}:${a.holat ?? ''}:${a.lifecycle ?? ''}`;

/**
 * Saqlangan iz (topshirish paytida server hisoblagan) bilan hozirgi izni solishtiradi: F2 akti qo'shildi / versiyasi yoki holati
 * o'zgardi / bekor qilindi; fakt akti qo'shildi yoki o'zgardi; obyekt shartnomaga qo'shildi yoki chiqdi. Bo'sh ro'yxat = o'zgarish yo'q.
 * Iz yo'q (eski/bo'sh) bo'lsa solishtirib bo'lmaydi -> bo'sh (yolg'on «o'zgargan» belgisi qo'yilmaydi).
 */
export function izFarqi(saqlangan: readonly OyIz[] | null | undefined, hozirgi: readonly OyIz[] | null | undefined): IzFarq[] {
  if (!saqlangan || !hozirgi) return [];
  const eski = new Map(saqlangan.map((x) => [x.obyekt_id, x]));
  const yangi = new Map(hozirgi.map((x) => [x.obyekt_id, x]));
  const out: IzFarq[] = [];
  for (const [id, y] of yangi) {
    const e = eski.get(id);
    if (!e) { out.push({ obyektId: id, sabab: 'obyekt_qoshildi' }); continue; }
    if ([...e.f2].map(f2Kalit).join('|') !== [...y.f2].map(f2Kalit).join('|')) out.push({ obyektId: id, sabab: 'f2' });
    else if (e.fakt.soni !== y.fakt.soni || e.fakt.maks_id !== y.fakt.maks_id || e.fakt.xesh !== y.fakt.xesh) out.push({ obyektId: id, sabab: 'fakt' });
  }
  for (const id of eski.keys()) if (!yangi.has(id)) out.push({ obyektId: id, sabab: 'obyekt_chiqdi' });
  return out.sort((a, b) => a.obyektId - b.obyektId);
}

export const topshirilganDanKeyinOzgargan = (saqlangan: readonly OyIz[] | null | undefined, hozirgi: readonly OyIz[] | null | undefined): boolean => izFarqi(saqlangan, hozirgi).length > 0;

/* ───────────── fayl nomlari va oy papkalari (egasi 2026-11-05) ───────────── */

/** Fayl nomi bo'lagi: taqiqlangan belgilar va bo'shliqlar «_», 40 belgigacha. */
export function nomBolagi(s: string | null | undefined, uzunlik = 40): string {
  return String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f№]/g, ' ').trim().replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^\.+/, '').slice(0, uzunlik).replace(/_+$/, '');
}

/** Ф-2 fayli: `<oy>_<shartnoma>_<obyekt>_F2_<raqam>.xlsx`; qoralama — `_QORALAMA` bilan. */
export function paketF2FaylNomi(i: { oy: string | null | undefined; shartnoma?: string | null; obyekt: string; raqam: string | null | undefined; aktId: number; qoralama?: boolean }): string {
  const oy = /^\d{4}-\d{2}/.exec(String(i.oy ?? ''))?.[0] ?? 'oy';
  const q = [oy, i.shartnoma ? nomBolagi(i.shartnoma, 20) : '', nomBolagi(i.obyekt, 40) || `obyekt`, 'F2', nomBolagi(i.raqam, 20) || `id${i.aktId}`].filter(Boolean);
  return `${q.join('_')}${i.qoralama ? '_QORALAMA' : ''}.xlsx`;
}

/** Oy papkasi bilan: har oyning fayllari `<oy>/…` ichida, ildiz fayllari (sverka, mundarija) yuqorida. Takror yo'l — «_2». */
export function oyPapkalarigaYigish(oylar: ReadonlyArray<{ oy: string; fayllar: readonly PaketFayl[] }>, ildiz: readonly KirishFayl[]): PaketFayl[] {
  const band = new Set<string>();
  const out: PaketFayl[] = [];
  const qosh = (yol: string, f: { bytes: Uint8Array; tur: PaketFaylTuri; obyektId?: number | null; meta?: FaylMeta }) => {
    const y = takrorsizYol(yol, band);
    band.add(y.toLowerCase());
    out.push({ yol: y, bytes: f.bytes, tur: f.tur, obyektId: f.obyektId ?? null, ...(f.meta ? { meta: f.meta } : {}) });
  };
  for (const f of ildiz) qosh(f.nom, f);
  for (const o of [...oylar].sort((a, b) => a.oy.localeCompare(b.oy))) for (const f of o.fayllar) qosh(`${o.oy}/${f.yol}`, f);
  return out;
}

/**
 * «Paket eskirgan»: shu shartnoma + oy uchun ENG SO'NGGI topshirilgan versiya va undan keyin manba F2/fakt o'zgarganmi
 * (server izi: akt versiyasi/holati, fakt). Topshirilmagan — null.
 */
export function paketEskirganmi<T extends { oy: string; versiya: number; manifest?: { iz?: OyIz[] } | null; hozirgi_iz?: OyIz[] | null }>(paketlar: readonly T[], oy: string): { paket: T; eskirgan: boolean; farq: IzFarq[] } | null {
  const shu = paketlar.filter((p) => p.oy === oy).sort((a, b) => b.versiya - a.versiya)[0];
  if (!shu) return null;
  const farq = izFarqi(shu.manifest?.iz, shu.hozirgi_iz);
  return { paket: shu, eskirgan: farq.length > 0, farq };
}