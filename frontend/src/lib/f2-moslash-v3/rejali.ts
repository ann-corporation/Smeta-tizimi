/**
 * F2 import — REJALI (kutilayotgan) qo'shimcha/zamena/resurslar (egasi 2026-10-20: «har birini bittalab qo'shib,
 * 5-6 soniya kutib o'tirmasdan — oxirida F2 ni yozishni bosganda bittada yozsin»).
 *
 * Operator modalda tasdiqlagan har amal DARHOL serverga ketmaydi: vaqtinchalik (manfiy id) smeta qatori sifatida
 * daraxtda ko'rinadi va F2 qatoriga bog'lanadi. «Saqlash» bosilganda buyruqlar ketma-ket, har biri o'zining barqaror
 * operation_id si bilan (qayta urinishda dublikat yo'q) mavjud nomlangan RPC lar orqali yoziladi, vaqtinchalik id lar
 * haqiqiy id larga almashtiriladi va shundan keyin akt tuziladi. Bekor qilingan buyruq hech qachon kanonik qator
 * yaratmaydi. Kanonik qonun o'zgarmaydi: zamena eski qatorni o'zgartirmaydi (OLD+NEW).
 */
import type { T2Qator } from '../../api/supabase';
import type { IshJoyi } from './ishJoyi';

export type RejaliResurs = { tur: 'rs' | 'mat' | 'ob'; nom: string; birlik: string; hajm?: number | null; kod?: string | null };

export interface RejaliBuyruq {
  /** Vaqtinchalik smeta qatori id si (manfiy). */
  tempId: number;
  /** Ish bilan birga yaratiladigan resurslarning vaqtinchalik id lari (resurslar tartibida). */
  resursTempIds: number[];
  f2Uid: string;
  /** F2 ishining resurslari uid lari (resursTempIds bilan bir tartibda) — bog'lash uchun. */
  f2ResursUidlar: string[];
  /** resurs_ish — smeta RESURSI o'rniga ish (masalan ГПС ni buyurtmachi bergan: qazib olish va tashish). */
  /** smetasiz — smetasi yo'q obyekt: ish «СМЕТАДАН ТАШҚАРИ ИШЛАР» bo'limiga qo'shimcha bo'lib yoziladi (server bo'limni o'zi yaratadi). */
  /** abc — siz qo'shgan qatorning TAHRIRI: eskisi o'chiriladi (OchirishBuyruq), yangisi ish_abc orqali yoziladi. */
  /** bolim — yangi smeta bo'limi (razdel); otaQatorId = BOLIM_ILDIZ bo'lsa smetaning yuqori darajasida. */
  kind: 'replacement' | 'additional' | 'resource' | 'resurs_ish' | 'smetasiz' | 'abc' | 'bolim';
  /** Qo'shimcha pozitsiya turi (ish yoki razdel ostidagi material/uskuna) yoki resurs turi. */
  tur: 'bl' | 'rs' | 'mat' | 'ob' | 'rz';
  otaQatorId: number;
  almashtirilayotganQatorId?: number;
  keyinQatorId?: number;
  nom: string; birlik: string; hajm?: number; kod?: string; sabab: string;
  resurslar: RejaliResurs[];
  /** Qayta urinishda ayni operatsiya — dublikat yaratilmaydi. */
  operationId: string;
  /** resurs_ish: almashtirilayotgan smeta resursi va server uchun aynan resurslar ro'yxati. */
  resursQatorId?: number;
  ishResurslari?: unknown[];
  /** abc: ish_abc buyrug'i va server uchun aynan ish/resurslar. */
  abcCommand?: 'additional' | 'replacement' | 'resurs_zamena' | 'resurs_ish';
  abcIsh?: unknown;
  abcResurslar?: unknown[];
}

/** Avval saqlangan (siz qo'shgan) qatorni O'CHIRISH — ham qoralamada, «F2 ni yozish» da bajariladi. */
export interface OchirishBuyruq {
  qatorId: number;
  versiya: number;
  /** Qator va uning ichidagi (resurs) qatorlar — daraxtdan yashiriladi, ularga bog'langan F2 qatorlari bo'shaydi. */
  eskiIdlar: number[];
  nom: string;
  sabab: string;
  operationId: string;
}

/** Smetasiz obyektdagi virtual bo'lim (server «Saqlash»da haqiqiy «СМЕТАДАН ТАШҚАРИ ИШЛАР» ni yaratadi yoki topadi). */
export const SMETASIZ_RZ = -1_000_000_000;
export const SMETASIZ_RZ_NOM = 'СМЕТАДАН ТАШҚАРИ ИШЛАР';

/** Bo'lim buyrug'ida «ota yo'q» (smetaning yuqori darajasi). Haqiqiy qator id si hech qachon 0 bo'lmaydi. */
export const BOLIM_ILDIZ = 0;

export const vaqtinchami = (id: number | null | undefined) => id != null && id < 0;

/** Yangi vaqtinchalik id lar: mavjud eng kichik manfiydan pastga. */
export function yangiTempIdlar(mavjud: Iterable<number>, soni: number): number[] {
  let min = -1;
  for (const id of mavjud) if (id <= min) min = id - 1;
  return Array.from({ length: soni }, (_, i) => min - i);
}

/** Rejali buyruqlarni daraxtda ko'rsatish uchun vaqtinchalik qatorlar (tartib — joylashuv qonuni bo'yicha). */
export function rejaliQatorlar(buyruqlar: readonly RejaliBuyruq[], rows: readonly T2Qator[]): T2Qator[] {
  const byId = new Map<number, T2Qator>(rows.map((r) => [r.id, r]));
  const out: T2Qator[] = [];
  if (buyruqlar.some((b) => b.otaQatorId === SMETASIZ_RZ)) {
    const rz = { id: SMETASIZ_RZ, ota_id: null, tur: 'rz', nom: SMETASIZ_RZ_NOM, kod: null, birlik: null, hajm: null, narx: null, summa: null,
      norma: null, qoshimcha: true, zamena: false, versiya: 0, tartib: Math.max(0, ...rows.filter((r) => r.ota_id == null).map((r) => Number(r.tartib ?? 0))) + 1 } as unknown as T2Qator;
    out.push(rz); byId.set(rz.id, rz);
  }
  const guruhSoni = new Map<string, number>();
  for (const b of buyruqlar) {
    const keyin = b.kind === 'replacement' ? b.almashtirilayotganQatorId : b.keyinQatorId;
    const otaId = b.kind === 'bolim' && b.otaQatorId === BOLIM_ILDIZ ? null : b.otaQatorId;
    const aka = rows.filter((r) => (r.ota_id ?? null) === otaId).concat(out.filter((r) => (r.ota_id ?? null) === otaId));
    const keyinTartib = keyin != null && keyin !== b.otaQatorId ? (byId.get(keyin)?.tartib ?? null) : null;
    // Bir langardan keyin turgan rejali qatorlar (ota+langar bir xil) buyruqlar tartibida: yozilganda ham shu tartibda yaratiladi.
    const guruhKalit = `${b.otaQatorId}|${keyin ?? ''}`;
    const guruhIdx = guruhSoni.get(guruhKalit) ?? 0;
    guruhSoni.set(guruhKalit, guruhIdx + 1);
    const siljish = guruhIdx * 1e-4;
    const tartib = keyin === b.otaQatorId
      ? Math.min(0, ...aka.map((r) => Number(r.tartib ?? 0))) - 0.5 + siljish
      : keyinTartib != null ? Number(keyinTartib) + (vaqtinchami(keyin) ? 0.001 : 0.5) + siljish
        : Math.max(0, ...aka.map((r) => Number(r.tartib ?? 0))) + 1;
    const ish = { id: b.tempId, ota_id: otaId, tur: b.tur, nom: b.nom, kod: b.kod ?? null, birlik: b.birlik, hajm: b.hajm ?? null,
      narx: null, summa: null, norma: null, qoshimcha: true, zamena: b.kind === 'replacement' || b.kind === 'resurs_ish' || (b.kind === 'abc' && b.abcCommand !== 'additional'), versiya: 0, tartib } as unknown as T2Qator;
    out.push(ish); byId.set(ish.id, ish);
    b.resurslar.forEach((r, i) => {
      const rid = b.resursTempIds[i];
      if (rid == null) return;
      const q = { id: rid, ota_id: b.tempId, tur: r.tur, nom: r.nom, kod: r.kod ?? null, birlik: r.birlik, hajm: r.hajm ?? null,
        narx: null, summa: null, norma: null, qoshimcha: true, zamena: false, versiya: 0, tartib: i + 1 } as unknown as T2Qator;
      out.push(q); byId.set(rid, q);
    });
  }
  return out;
}

/** Buyruq va unga tayangan (ota/langar/almashtirilayotgan) keyingi buyruqlar — birga ko'chadi. */
function rejaliBlok(buyruqlar: readonly RejaliBuyruq[], tempId: number): Set<number> {
  const b = buyruqlar.find((x) => x.tempId === tempId);
  const blok = new Set<number>(b ? [b.tempId] : []);
  if (!b) return blok;
  let ozgardi = true;
  while (ozgardi) {
    ozgardi = false;
    for (const x of buyruqlar) {
      if (blok.has(x.tempId)) continue;
      const tayanch = [x.otaQatorId, x.keyinQatorId, x.almashtirilayotganQatorId];
      if (tayanch.some((id) => id != null && (blok.has(id) || buyruqlar.some((y) => blok.has(y.tempId) && y.resursTempIds.includes(id))))) { blok.add(x.tempId); ozgardi = true; }
    }
  }
  return blok;
}

/** Tengdosh: shu buyruq bilan bir ota va bir langardan keyin turgan (o'z blokidan tashqari) eng yaqin buyruq. */
function rejaliTengdosh(buyruqlar: readonly RejaliBuyruq[], tempId: number, yon: -1 | 1): number {
  const i = buyruqlar.findIndex((x) => x.tempId === tempId);
  if (i < 0) return -1;
  const b = buyruqlar[i], blok = rejaliBlok(buyruqlar, tempId);
  for (let j = i + yon; j >= 0 && j < buyruqlar.length; j += yon) {
    const x = buyruqlar[j];
    if (!blok.has(x.tempId) && x.otaQatorId === b.otaQatorId && x.keyinQatorId === b.keyinQatorId && x.kind !== 'replacement' && b.kind !== 'replacement') return j;
  }
  return -1;
}

/** ▲/▼ mumkinmi: faqat bir joyga (ota + langar) qo'yilgan rejali qatorlar o'zaro o'rin almashadi. */
export const rejaliSurishMumkin = (buyruqlar: readonly RejaliBuyruq[], tempId: number, yon: -1 | 1): boolean => rejaliTengdosh(buyruqlar, tempId, yon) >= 0;

/**
 * Hali yozilmagan qatorni ▲/▼ — faqat lokal navbat tartibi (RPC yo'q): «Saqlash» da buyruqlar shu tartibda yaratiladi,
 * bir langardan keyingi qatorlar yaratilish tartibida turadi. Qator o'z tayanganlari (resurs, keyingi buyruqlar) bilan birga ko'chadi.
 */
export function rejaliSurish(buyruqlar: readonly RejaliBuyruq[], tempId: number, yon: -1 | 1): RejaliBuyruq[] {
  const j = rejaliTengdosh(buyruqlar, tempId, yon);
  if (j < 0) return [...buyruqlar];
  const blok = rejaliBlok(buyruqlar, tempId);
  const tengdoshBlok = rejaliBlok(buyruqlar, buyruqlar[j].tempId);
  const mine = buyruqlar.filter((x) => blok.has(x.tempId));
  const rest = buyruqlar.filter((x) => !blok.has(x.tempId));
  const target = buyruqlar[j].tempId;
  if (yon < 0) {
    const at = rest.findIndex((x) => x.tempId === target);
    return [...rest.slice(0, at), ...mine, ...rest.slice(at)];
  }
  let at = rest.findIndex((x) => x.tempId === target);
  while (at + 1 < rest.length && tengdoshBlok.has(rest[at + 1].tempId)) at++;
  return [...rest.slice(0, at + 1), ...mine, ...rest.slice(at + 1)];
}

/** Bog'lanishlardagi vaqtinchalik id larni haqiqiysiga almashtiradi. */
export function ijniAlmashtir(ij: IshJoyi, map: ReadonlyMap<number, number>): IshJoyi {
  const bog = new Map(ij.bog);
  for (const [uid, b] of bog) { const real = map.get(b.qatorId); if (real != null) bog.set(uid, { ...b, qatorId: real }); }
  return { bog, otkaz: ij.otkaz };
}

/** Buyruqni olib tashlash: uning vaqtinchalik qatorlariga bog'langan F2 qatorlari bo'shaydi. */
export function rejaliOchir(buyruqlar: readonly RejaliBuyruq[], ij: IshJoyi, tempId: number): { buyruqlar: RejaliBuyruq[]; ij: IshJoyi } {
  const b = buyruqlar.find((x) => x.tempId === tempId);
  if (!b) return { buyruqlar: [...buyruqlar], ij };
  // Shu buyruqqa tayangan keyingi buyruqlar ham olinadi (ota yoki joylashuvi shu vaqtinchalik qator).
  const olinadi = new Set<number>([b.tempId, ...b.resursTempIds]);
  let ozgardi = true;
  while (ozgardi) {
    ozgardi = false;
    for (const x of buyruqlar) {
      if (olinadi.has(x.tempId)) continue;
      if ([x.otaQatorId, x.keyinQatorId, x.almashtirilayotganQatorId].some((id) => id != null && olinadi.has(id))) {
        olinadi.add(x.tempId); x.resursTempIds.forEach((r) => olinadi.add(r)); ozgardi = true;
      }
    }
  }
  const bog = new Map([...ij.bog].filter(([, v]) => !olinadi.has(v.qatorId)));
  return { buyruqlar: buyruqlar.filter((x) => !olinadi.has(x.tempId)), ij: { bog, otkaz: ij.otkaz } };
}

export type RejaliYaratish = (b: RejaliBuyruq, real: { otaQatorId: number; almashtirilayotganQatorId?: number; keyinQatorId?: number; otaVersiya: number })
  => Promise<{ qatorId: number; resursIdlar: number[]; otaVersiya?: number | null }>;

/**
 * Buyruqlarni ketma-ket yozadi. Xato bo'lsa to'xtaydi: yozilganlari `map` da, qolganlari `qolgan` da (ish yo'qolmaydi).
 * `versiyalar` — ota qatorlarning joriy versiyasi (bitta o'qish bilan), har yozuvdan keyin shu ota uchun versiya +1 qilinmaydi:
 * keyingi buyruq oldidan `versiya` qayta so'raladi (server ota versiyasini oshiradi).
 */
export async function rejaliniYoz(
  buyruqlar: readonly RejaliBuyruq[],
  d: { yarat: RejaliYaratish; versiya: (id: number) => Promise<number>; progress?: (bajarildi: number, jami: number) => void },
): Promise<{ map: Map<number, number>; qolgan: RejaliBuyruq[]; xato?: string }> {
  const map = new Map<number, number>();
  // Server javobida ota versiyasi bo'lsa keyingi buyruq uni qayta o'qimaydi (har buyruqqa bitta so'rov).
  const versiyalar = new Map<number, number>();
  const real = (id: number | undefined) => (id == null ? undefined : vaqtinchami(id) ? map.get(id) : id);
  for (let i = 0; i < buyruqlar.length; i++) {
    const b = buyruqlar[i];
    d.progress?.(i, buyruqlar.length);
    try {
      if (b.kind === 'bolim') {
        const ota = b.otaQatorId === BOLIM_ILDIZ ? BOLIM_ILDIZ : real(b.otaQatorId);
        if (ota == null) throw new Error('Ota bo‘lim hali yozilmagan.');
        const r = await d.yarat(b, { otaQatorId: ota, keyinQatorId: real(b.keyinQatorId), otaVersiya: 0 });
        // Ota bo'limning versiyasi oshdi — keyingi buyruq uni qayta o'qisin.
        if (ota !== BOLIM_ILDIZ) versiyalar.delete(ota);
        map.set(b.tempId, r.qatorId);
        continue;
      }
      if (b.kind === 'smetasiz') {
        const r = await d.yarat(b, { otaQatorId: SMETASIZ_RZ, otaVersiya: 0 });
        map.set(b.tempId, r.qatorId);
        b.resursTempIds.forEach((t, j) => { if (r.resursIdlar[j] != null) map.set(t, r.resursIdlar[j]); });
        continue;
      }
      const ota = real(b.otaQatorId);
      if (ota == null) throw new Error('Ota qator hali yozilmagan.');
      const r = await d.yarat(b, { otaQatorId: ota, almashtirilayotganQatorId: real(b.almashtirilayotganQatorId),
        keyinQatorId: real(b.keyinQatorId), otaVersiya: versiyalar.get(ota) ?? await d.versiya(ota) });
      if (r.otaVersiya != null) versiyalar.set(ota, r.otaVersiya); else versiyalar.delete(ota);
      map.set(b.tempId, r.qatorId);
      b.resursTempIds.forEach((t, j) => { if (r.resursIdlar[j] != null) map.set(t, r.resursIdlar[j]); });
    } catch (e) {
      return { map, qolgan: buyruqlar.slice(i), xato: `«${b.nom.slice(0, 60)}»: ${e instanceof Error ? e.message : 'yozilmadi'}` };
    }
  }
  d.progress?.(buyruqlar.length, buyruqlar.length);
  return { map, qolgan: [] };
}
