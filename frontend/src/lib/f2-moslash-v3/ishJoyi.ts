/**
 * F2 V3 ish joyi holati — ikki oynali moslashtirish ekranining TOZA (UI siz) mantig'i.
 * Kontrakt: docs/architecture/F2_IMPORT_V3.md §3–§4.
 *
 * Dvigatel (`f2MoslashV3`) bir marta taklif beradi; keyin operator qarorlari shu yerda
 * yashaydi: bog'lash (ish — resurslari bilan birga), uzish, ◐ taklifni tasdiqlash, qatorni
 * ongli ravishda o'tkazib yuborish. Yozish qatorlari ham shu yerda quriladi:
 *   - ish qatori (resurslari bor) — faqat HAJM (pul resurslarda);
 *   - resurs / resurssiz ish — hajm + hujjatning o'z narxi va summasi.
 * Hal qilinmagan (✕/◐) qator qolsa — yozish YO'Q, sababi ro'yxat bilan.
 */
import { kodKanon, normBir, normKod, normNom } from '../f2-match-engine';
import type { F2Akt, F2Tugun } from '../smeta-anatomiya/f2';
import type { F2ExactManbaTugun } from '../../test02/f2-exact-payload';
import { guruhRzTanla } from './guruh';
import { f2Imzo, gradeFarq, razdelResursiTop, resursNomKalit, rzKalit, yagonaResursMos, type F2MoslashNatija, type SmetaQator } from './index';

export type BogHolat = 'aniq' | 'xotira' | 'taklif' | 'qolda';
/** Taqsimlab bog'lashdagi bitta bo'lak: smeta qatori va unga tushadigan F2 hajmi (F2 birligida). */
export interface TaqsimQism { qatorId: number; hajm: number }
/**
 * `taqsim` — bitta F2 qatori BIR NECHTA smeta qatoriga bo'lib bog'langan (egasi 2026-10-24, Sun'iy ko'l «Канализация»:
 * F2 da 89 quduq bitta yig'ma qator, smetada har quduq alohida). `qatorId` — birinchi bo'lak (eski kod uchun), bo'laklar
 * yig'indisi = F2 hajmi. Yozishda har bo'lak alohida akt qatori bo'ladi; pul F2 summasidan shu nisbatda bo'linadi.
 */
export interface Bog { qatorId: number; holat: BogHolat; usul: string; taqsim?: readonly TaqsimQism[] }
export const TAQSIM_USUL = 'taqsim';
/** Yozish manbasida bo'lak tugunining uid i: `<asl uid>⇶<tartib>`. */
export const TAQSIM_AJRATGICH = '⇶';

/** Bog'lanishning barcha smeta qatorlari (taqsimda — har bo'lak; aks holda bitta). */
export function bogIdlari(b: Bog): number[] {
  return b.taqsim && b.taqsim.length > 1 ? [...new Set(b.taqsim.map((q) => q.qatorId))] : [b.qatorId];
}

/**
 * `jami` ni `ulushlar` nisbatida bo'ladi; har bo'lak `xona` kasr xonasigacha yaxlitlanadi, yaxlitlash qoldig'i OXIRGI bo'lakka —
 * bo'laklar yig'indisi aynan `jami` (pul to'qilmaydi va yo'qolmaydi). `jami` shu aniqlikda yozilgan bo'lsa butun sonlarda hisoblanadi.
 * Ulushlar yig'indisi 0 bo'lsa — hammasi oxirgi bo'lakka.
 */
export function bolakla(jami: number, ulushlar: readonly number[], xona: number): number[] {
  const n = ulushlar.length;
  if (!n) return [];
  const w = ulushlar.map((u) => (Number.isFinite(u) ? Math.abs(u) : 0));
  const W = w.reduce((a, b) => a + b, 0);
  const k = 10 ** xona;
  const J = Math.round(jami * k);
  const butun = Number.isSafeInteger(J) && Math.abs(J / k - jami) <= 1e-12 * Math.max(1, Math.abs(jami));
  const out: number[] = [];
  if (butun) {
    let yig = 0;
    for (let i = 0; i < n - 1; i++) { const x = W > 0 ? Math.round((J * w[i]) / W) + 0 : 0; out.push(x / k + 0); yig += x; }
    out.push((J - yig) / k + 0);
    return out;
  }
  let yig = 0;
  for (let i = 0; i < n - 1; i++) { const x = W > 0 ? Math.round(((jami * w[i]) / W) * k) / k + 0 : 0; out.push(x); yig += x; }
  out.push(jami - yig + 0);
  return out;
}

/** Ekranda ko'rinadigan holat: ✓ aniq/xotira/qo'lda · ◐ taklif · ✕ topilmadi · – o'tkazildi. */
export type KorinishHolat = BogHolat | 'topilmadi' | 'otkazildi';

export interface IshJoyi {
  bog: ReadonlyMap<string, Bog>;
  otkaz: ReadonlySet<string>;
}

// ─── Indekslar ───────────────────────────────────────────────────────────────

export interface F2Indeks {
  byUid: Map<string, F2Tugun>;
  ota: Map<string, F2Tugun | null>;
  /** Pul/hajm yoziladigan tugunlar (ish va resurslar), fayl tartibida. */
  qatorlar: F2Tugun[];
}

export function f2Indeks(daraxt: readonly F2Tugun[]): F2Indeks {
  const byUid = new Map<string, F2Tugun>();
  const ota = new Map<string, F2Tugun | null>();
  const qatorlar: F2Tugun[] = [];
  const yur = (list: readonly F2Tugun[], o: F2Tugun | null) => {
    for (const t of list) {
      byUid.set(t.uid, t);
      ota.set(t.uid, o);
      if (t.tur !== 'rz') qatorlar.push(t);
      yur(t.bolalar, t);
    }
  };
  yur(daraxt, null);
  return { byUid, ota, qatorlar };
}

export interface SmetaIndeks {
  byId: Map<number, SmetaQator>;
  bolalar: Map<number | null, SmetaQator[]>;
}

export function smetaIndeks(smeta: readonly SmetaQator[]): SmetaIndeks {
  const byId = new Map<number, SmetaQator>();
  const bolalar = new Map<number | null, SmetaQator[]>();
  for (const q of smeta) {
    byId.set(q.id, q);
    const k = q.otaId ?? null;
    const a = bolalar.get(k);
    if (a) a.push(q); else bolalar.set(k, [q]);
  }
  for (const a of bolalar.values()) a.sort((x, y) => (x.tartib ?? x.id) - (y.tartib ?? y.id));
  return { byId, bolalar };
}

// ─── Boshlang'ich holat ──────────────────────────────────────────────────────

export function boshlangich(n: F2MoslashNatija, avvalgi?: IshJoyi): IshJoyi {
  const bog = new Map<string, Bog>();
  for (const [uid, r] of n.natijalar) {
    if (r.qatorId == null || r.holat === 'topilmadi') continue;
    bog.set(uid, { qatorId: r.qatorId, holat: r.holat, usul: r.usul ?? r.holat });
  }
  // Operator qarorlari qayta hisoblashda (masalan razdel o'rgatilganda) yo'qolmaydi.
  if (avvalgi) for (const [uid, b] of avvalgi.bog) if (b.holat !== 'taklif') bog.set(uid, b);
  return { bog, otkaz: new Set(avvalgi?.otkaz ?? []) };
}

export function korinish(ij: IshJoyi, uid: string): KorinishHolat {
  if (ij.otkaz.has(uid)) return 'otkazildi';
  return ij.bog.get(uid)?.holat ?? 'topilmadi';
}

// ─── Ish narxi tarkibi (protokol ishlari) ───────────────────────────────────────────────────────────────
// Egasi 2026-10-24 (Stella, АХ УЗ №94/№95): F2 da ish ostida bitta «ЗАТРАТЫ ТРУДА МАСТЕРОВ» resursi bor, smetada esa shu ish BITTA qator
// (bolasi yo'q). Resurslar summasi ish summasiga teng bo'lsa — ular «ish narxi tarkibi»: alohida bog'lash talab qilinmaydi (✓),
// summa ikki marta sanalmaydi — pul ish qatorining o'zi bilan yoziladi.
export const TARKIB_USUL = 'ish_narxi_tarkibi';

/** Ish ostidagi resurslar summasi ish summasiga teng (±0,5%) va bog'langan smeta qatorida resurs bolalari yo'qmi. */
export function ishNarxiTarkibimi(f: F2Tugun, s: { id: number } | undefined | null, S: SmetaIndeks): boolean {
  if (f.tur !== 'bl' || !f.bolalar.length || !s) return false;
  if ((S.bolalar.get(s.id) ?? []).some((c) => c.tur !== 'rz')) return false;
  if (f.summa == null || !(Math.abs(f.summa) > 0)) return false;
  let jami = 0;
  for (const r of f.bolalar) { if (r.summa == null) return false; jami += r.summa; }
  return Math.abs(jami - f.summa) <= Math.abs(f.summa) * 0.005 + 0.005;
}

/**
 * Tarkib resurslari holatini ish bog'lanishiga moslaydi (idempotent: o'zgarish bo'lmasa AYNAN shu `ij` qaytadi):
 *  - ish bog'langan va tarkib sharti bajarilsa: bog'lanmagan/◐ resurslar ish qatoriga TARKIB_USUL bilan bog'lanadi (ish ◐ bo'lsa ◐);
 *  - sharti buzilsa (ish uzildi, boshqa qatorga o'tdi, smeta ishida resurs paydo bo'ldi) — avtomatik tarkib bog'lanishlari olib tashlanadi.
 * Operator qo'lda qilgan bog'lanish va ongli «kiritmaslik» qarorlariga tegilmaydi.
 */
export function tarkibniMosla(ij: IshJoyi, ind: F2Indeks, S: SmetaIndeks): IshJoyi {
  let ozgardi = false;
  const bog = new Map(ij.bog);
  for (const f of ind.qatorlar) {
    if (f.tur !== 'bl' || !f.bolalar.length) continue;
    const b = bog.get(f.uid);
    const tark = !!b && !ij.otkaz.has(f.uid) && ishNarxiTarkibimi(f, S.byId.get(b.qatorId), S);
    for (const r of f.bolalar) {
      const rb = bog.get(r.uid);
      if (tark && b) {
        if (ij.otkaz.has(r.uid)) continue;
        if (rb && rb.usul !== TARKIB_USUL && rb.holat !== 'taklif') continue;
        const holat: BogHolat = b.holat === 'taklif' ? 'taklif' : 'aniq';
        if (rb?.usul === TARKIB_USUL && rb.qatorId === b.qatorId && rb.holat === holat) continue;
        bog.set(r.uid, { qatorId: b.qatorId, holat, usul: TARKIB_USUL }); ozgardi = true;
      } else if (rb?.usul === TARKIB_USUL) { bog.delete(r.uid); ozgardi = true; }
    }
  }
  return ozgardi ? { bog, otkaz: ij.otkaz } : ij;
}

// ─── Amallar (har biri yangi IshJoyi qaytaradi) ─────────────────────────────

const nb = (nom: unknown, bir: unknown) => normNom(nom) + '||' + normBir(bir);
const birMos = (a: unknown, b: unknown) => { const x = normBir(a), y = normBir(b); return !x || !y || x === y; };

export function bogla(ij: IshJoyi, uid: string, qatorId: number): IshJoyi {
  const bog = new Map(ij.bog);
  bog.set(uid, { qatorId, holat: 'qolda', usul: 'qolda' });
  const otkaz = new Set(ij.otkaz); otkaz.delete(uid);
  return { bog, otkaz };
}

/**
 * Resurs uchun smeta havzasi: guruh sarlavhali («ДЕТАЛЬ -1») resurs — smetadagi shu nomli razdelning ichki qatorlari;
 * aks holda (yoki razdel topilmasa) — ishning o'z ichki qatorlari.
 */
function resursHavzasi(S: SmetaIndeks, sIshId: number, ichki: readonly SmetaQator[]) {
  const olingan = new Set<number>();
  const xotira = new Map<string, SmetaQator | null>();
  return (r: F2Tugun): readonly SmetaQator[] => {
    if (!r.guruh) return ichki;
    const ish = S.byId.get(sIshId);
    if (!ish) return ichki;
    const kalit = r.guruhUid ?? r.guruh;
    if (!xotira.has(kalit)) {
      const rz = guruhRzTanla<SmetaQator>(ish, (x) => (x.otaId != null ? S.byId.get(x.otaId) ?? null : null), (x) => S.bolalar.get(x.id) ?? [], r.guruh, rzKalit, olingan);
      if (rz) olingan.add(rz.id);
      xotira.set(kalit, rz);
    }
    const rz = xotira.get(kalit);
    return rz ? (S.bolalar.get(rz.id) ?? []).filter((t) => t.tur !== 'rz') : ichki;
  };
}

export interface IshBoglaNatija { ij: IshJoyi; boglandi: number; qoldi: number }

/**
 * Ishni RESURSLARI BILAN bog'lash (Tizim1 drag-drop: "o'sha ishga tashlansa — bog'lash + bolalar").
 * Resurslar faqat shu smeta ishi ichida: kod → kod-kanon → nom+birlik, yagona bo'lsa;
 * birlik yoki marka farqli bo'lsa bog'lanmaydi (zamena material bo'lishi mumkin — operator hal qiladi).
 */
export function ishniBogla(ij: IshJoyi, fIsh: F2Tugun, sIshId: number, S: SmetaIndeks): IshBoglaNatija {
  let yangi = bogla(ij, fIsh.uid, sIshId);
  const bog = new Map(yangi.bog);
  const ichki = (S.bolalar.get(sIshId) ?? []).filter((t) => t.tur !== 'rz');
  // «Band» — faqat SHU ishning boshqa resurslari egallagan smeta qatorlari (bir ish ichida ikki resurs bitta qatorga tushmasin).
  // Boshqa F2 qatorlari (masalan pereraschet minuslari, boshqa bo'limdagi takror ishlar) bog'lagan smeta resursi
  // TO'SIQ EMAS — bir smeta qatoriga bir necha F2 qatori normal (egasi 2026-10-24: «ish turini ulasam ichi qolib ketdi»).
  const band = new Set<number>();
  let boglandi = 0, qoldi = 0;
  const havza = resursHavzasi(S, sIshId, ichki);
  for (const r of fIsh.bolalar) {
    const joriy = bog.get(r.uid);
    const hv = havza(r);
    if (joriy?.holat === 'qolda' && hv.some((t) => t.id === joriy.qatorId)) { band.add(joriy.qatorId); boglandi++; continue; }
    bog.delete(r.uid);
    const bosh = hv.filter((t) => !band.has(t.id));
    const t = resursMosTop(r, bosh);
    if (t && birMos(r.birlik, t.birlik) && !gradeFarq(r.nom, t.nom)) {
      bog.set(r.uid, { qatorId: t.id, holat: 'qolda', usul: 'ish_ichida' });
      band.add(t.id);
      boglandi++;
      continue;
    }
    const tashqi = r.guruh ? null : razdelTashqi(r, S, sIshId, band);
    if (tashqi) { bog.set(r.uid, { qatorId: tashqi.qator.id, holat: tashqi.aniq ? 'qolda' : 'taklif', usul: tashqi.aniq ? 'razdel_ichida' : 'razdel_ichida_taklif' }); band.add(tashqi.qator.id); boglandi++; }
    else qoldi++;
  }
  yangi = { bog, otkaz: yangi.otkaz };
  return { ij: yangi, boglandi, qoldi };
}

/** Ish ichida topilmagan resurs — shu ishning razdelidagi mustaqil resurs qatori (`razdelResursiTop`, yagona dvigatel qoidasi). */
function razdelTashqi(r: F2Tugun, S: SmetaIndeks, sIshId: number, band: ReadonlySet<number>) {
  const ish = S.byId.get(sIshId);
  if (!ish) return null;
  return razdelResursiTop<SmetaQator>(r, ish, (x) => (x.otaId != null ? S.byId.get(x.otaId) : null), (x) => S.bolalar.get(x.id) ?? [], (x) => !band.has(x.id));
}

/** Ish ichidagi bo'sh smeta resurslari orasidan F2 resursiga mosi: kod → kod-kanon → nom+birlik, yagona bo'lsa. */
function resursMosTop(r: F2Tugun, bosh: readonly SmetaQator[]): SmetaQator | null {
  const rk = normKod(r.kod), rkan = kodKanon(r.kod), rnb = nb(r.nom, r.birlik);
  for (const c of [
    rk ? bosh.filter((x) => normKod(x.kod) === rk) : [],
    rkan ? bosh.filter((x) => kodKanon(x.kod) === rkan) : [],
    bosh.filter((x) => nb(x.nom, x.birlik) === rnb),
    bosh.filter((x) => resursNomKalit(x.nom, x.birlik) === resursNomKalit(r.nom, r.birlik)),
  ]) {
    const selected = yagonaResursMos(c, r);
    if (selected) return selected;
  }
  return null;
}

/** Nom so'zlari bo'yicha o'xshashlik (0..1) — faqat ◐ TAKLIF uchun, avtomatik ✓ uchun emas. */
function nomOxshash(a: string, b: string): number {
  const soz = (s: string) => new Set(String(s).toUpperCase().replace(/Ё/g, 'Е').split(/[^0-9A-ZА-Я]+/).filter((w) => w.length > 2));
  const x = soz(a), y = soz(b);
  if (!x.size || !y.size) return 0;
  let k = 0;
  for (const w of x) if (y.has(w)) k++;
  return (2 * k) / (x.size + y.size); // Dice
}

export interface IshlarResursNatija { ij: IshJoyi; boglandi: number; taklif: number; qoldi: number }

/**
 * Bog'langan HAR BIR F2 ishining bog'lanmagan resurslarini o'sha smeta ishi ichidan bog'lash (bitta tugma; egasi 2026-10-24:
 * «ish turi massiv bo'lib ichidagilarini ham olishi kerak; aynan mos nomlar uchun hech bo'lmasa taklif ham yo'q»).
 *  - kod → kod-kanon → nom+birlik, yagona va birlik/marka mos bo'lsa — ✓ (usul 'ish_ichida');
 *  - aks holda shu ish ichida nomi eng o'xshash (≥ 60%) va birligi mos resurs — ◐ taklif (operator tasdiqlaydi);
 *  - topilmasa — ✕ qoladi (qo'shimcha/zamena). Mavjud bog'lanishlar va aktga kiritilmaganlar o'zgarmaydi.
 */
export function ishlarResurslariniBogla(ij: IshJoyi, ind: F2Indeks, S: SmetaIndeks): IshlarResursNatija {
  const bog = new Map(ij.bog);
  let boglandi = 0, taklif = 0, qoldi = 0;
  for (const f of ind.qatorlar) {
    if (f.tur !== 'bl' || !f.bolalar.length || ij.otkaz.has(f.uid)) continue;
    const b0 = bog.get(f.uid);
    if (!b0 || b0.holat === 'taklif' || b0.taqsim) continue; // taqsimlangan ishning resurslari taqsimda bog'langan
    const ichki = (S.bolalar.get(b0.qatorId) ?? []).filter((t) => t.tur !== 'rz');
    const havza = resursHavzasi(S, b0.qatorId, ichki);
    const band = new Set<number>();
    for (const r of f.bolalar) { const rb = bog.get(r.uid); if (rb && rb.holat !== 'taklif') band.add(rb.qatorId); }
    for (const r of f.bolalar) {
      if (ij.otkaz.has(r.uid) || r.tur === 'rz') continue;
      const rb = bog.get(r.uid);
      if (rb && rb.holat !== 'taklif') continue;
      const hv = havza(r).filter((x) => !band.has(x.id));
      const t = resursMosTop(r, hv);
      if (t && birMos(r.birlik, t.birlik) && !gradeFarq(r.nom, t.nom)) {
        bog.set(r.uid, { qatorId: t.id, holat: 'qolda', usul: 'ish_ichida' }); band.add(t.id); boglandi++; continue;
      }
      if (rb) continue; // mavjud ◐ taklif o'z holicha qoladi
      const tashqi = r.guruh ? null : razdelTashqi(r, S, b0.qatorId, band);
      if (tashqi) {
        bog.set(r.uid, { qatorId: tashqi.qator.id, holat: tashqi.aniq ? 'qolda' : 'taklif', usul: tashqi.aniq ? 'razdel_ichida' : 'razdel_ichida_taklif' });
        band.add(tashqi.qator.id);
        if (tashqi.aniq) boglandi++; else taklif++;
        continue;
      }
      let eng: { s: SmetaQator; o: number } | null = null;
      for (const x of hv) {
        if (!birMos(r.birlik, x.birlik)) continue;
        const o = nomOxshash(r.nom, x.nom ?? '');
        if (o >= 0.6 && (!eng || o > eng.o)) eng = { s: x, o };
      }
      if (eng) { bog.set(r.uid, { qatorId: eng.s.id, holat: 'taklif', usul: 'ish_ichida_taklif' }); taklif++; }
      else qoldi++;
    }
  }
  return { ij: boglandi || taklif ? { bog, otkaz: ij.otkaz } : ij, boglandi, taklif, qoldi };
}

export interface IshTasdiqNatija { ij: IshJoyi; tasdiqlandi: number; boglandi: number; qoldi: number }

/**
 * Ishni RESURSLARI BILAN TASDIQLASH (egasi 2026-10-24: «ish va uning resurslari bitta guruh»): ish ◐ → ✓; resurslari — ◐ lari tasdiqlanadi,
 * bog'lanmaganlari ish ichida avtomatik bog'lanadi (kod → kanon → nom+birlik); mos topilmaganlar `qoldi` — ish ichida zamena/qo'shimcha taklifi bilan.
 * Mavjud bog'lanishlar (aniq/xotira/qo'lda) O'ZGARMAYDI. Aktga kiritilmagan resurslarga tegilmaydi. Ish bog'lanmagan bo'lsa — hech narsa.
 */
export function ishniTasdiqla(ij: IshJoyi, f: F2Tugun, S: SmetaIndeks): IshTasdiqNatija {
  const b0 = ij.bog.get(f.uid);
  if (!b0 || f.tur !== 'bl') return { ij: tasdiqla(ij, [f.uid]), tasdiqlandi: b0?.holat === 'taklif' ? 1 : 0, boglandi: 0, qoldi: 0 };
  const bog = new Map(ij.bog);
  let tasdiqlandi = 0, boglandi = 0, qoldi = 0;
  const tasdiq = (uid: string) => { const b = bog.get(uid); if (b?.holat === 'taklif') { bog.set(uid, { ...b, holat: 'qolda', usul: b.usul === TARKIB_USUL ? b.usul : 'taklif_tasdiq' }); tasdiqlandi++; } };
  tasdiq(f.uid);
  if (b0.taqsim) { // taqsimlangan ish: resurslari taqsimda bog'langan — faqat ◐ lar tasdiqlanadi
    for (const r of f.bolalar) if (!ij.otkaz.has(r.uid)) tasdiq(r.uid);
    return { ij: { bog, otkaz: ij.otkaz }, tasdiqlandi, boglandi, qoldi };
  }
  const ichki = (S.bolalar.get(b0.qatorId) ?? []).filter((t) => t.tur !== 'rz');
  // «Band» — faqat shu ishning o'z resurslari (ishniBogla dagi bilan bir xil qoida).
  const band = new Set<number>();
  const havza = resursHavzasi(S, b0.qatorId, ichki);
  for (const r of f.bolalar) {
    if (ij.otkaz.has(r.uid)) continue;
    const cb = bog.get(r.uid);
    if (cb) { tasdiq(r.uid); band.add(cb.qatorId); continue; }
    const t = resursMosTop(r, havza(r).filter((x) => !band.has(x.id)));
    if (t && birMos(r.birlik, t.birlik) && !gradeFarq(r.nom, t.nom)) { bog.set(r.uid, { qatorId: t.id, holat: 'qolda', usul: 'ish_ichida' }); band.add(t.id); boglandi++; continue; }
    // Operator ishni tasdiqladi — razdeldagi mustaqil resurs aynan yagona bo'lsa bog'lanadi, bir nechta bo'lsa ◐ qoladi.
    const tashqi = r.guruh ? null : razdelTashqi(r, S, b0.qatorId, band);
    if (tashqi) { bog.set(r.uid, { qatorId: tashqi.qator.id, holat: tashqi.aniq ? 'qolda' : 'taklif', usul: tashqi.aniq ? 'razdel_ichida' : 'razdel_ichida_taklif' }); band.add(tashqi.qator.id); boglandi++; }
    else qoldi++;
  }
  return { ij: { bog, otkaz: ij.otkaz }, tasdiqlandi, boglandi, qoldi };
}

// ─── Taqsimlab bog'lash (bitta F2 ishi → bir xil shifr+birlikdagi bir necha smeta qatori) ─────────────────

const TARTIB_KESH = new WeakMap<SmetaIndeks, Map<number, number>>();
/** Smeta qatorlarining daraxtdagi (chuqurlik bo'yicha) tartibi — «smeta tartibida» degani shu. */
function smetaTartibi(S: SmetaIndeks): Map<number, number> {
  let m = TARTIB_KESH.get(S);
  if (m) return m;
  m = new Map();
  const yur = (ota: number | null) => { for (const c of S.bolalar.get(ota) ?? []) { m!.set(c.id, m!.size); yur(c.id); } };
  yur(null);
  for (const id of S.byId.keys()) if (!m.has(id)) m.set(id, m.size); // otasi topilmagan qatorlar oxirida
  TARTIB_KESH.set(S, m);
  return m;
}
const ichidami = (S: SmetaIndeks, q: SmetaQator, rzId: number) => {
  for (let x = q.otaId != null ? S.byId.get(q.otaId) : undefined; x; x = x.otaId != null ? S.byId.get(x.otaId) : undefined) if (x.id === rzId) return true;
  return false;
};

/**
 * Taqsim nomzodlari: F2 ishi bilan bir xil shifr (kod yoki kod-kanon) va AYNAN bir xil birlikdagi smeta ishlari, smeta tartibida.
 * Doira — F2 bo'limi ulangan smeta bo'lim(lar)i; ichida 2 tadan kam bo'lsa bir pog'ona yuqoriga (ota bo'limga) kengayadi,
 * bo'lim ulanmagan bo'lsa — butun smeta. 2 tadan kam bo'lsa — bo'sh (taqsimlash shart emas).
 */
export function taqsimNomzodlari(f: F2Tugun, S: SmetaIndeks, doira: readonly number[] = []): SmetaQator[] {
  if (f.tur !== 'bl') return [];
  const k = kodKanon(f.kod) || normKod(f.kod);
  if (!k) return [];
  const fb = normBir(f.birlik);
  const hammasi = (ishKodIndeks(S).get(k) ?? []).filter((q) => q.tur === 'bl' && normBir(q.birlik) === fb);
  if (hammasi.length < 2) return [];
  const tartib = smetaTartibi(S);
  const saralangan = (a: SmetaQator[]) => a.sort((x, y) => (tartib.get(x.id) ?? 0) - (tartib.get(y.id) ?? 0));
  let rzlar = doira.filter((id) => S.byId.has(id));
  while (rzlar.length) {
    const ichida = hammasi.filter((q) => rzlar.some((rz) => ichidami(S, q, rz)));
    if (ichida.length >= 2) return saralangan(ichida);
    const otalar = new Set<number>();
    for (const rz of rzlar) { const o = engYaqinRz(S, S.byId.get(rz)); if (o) otalar.add(o.id); }
    rzlar = [...otalar];
  }
  return saralangan([...hammasi]);
}

export interface TaqsimNomzod { qatorId: number; qoldiq: number | null; smetaHajm: number | null }

/**
 * Standart taqsim (egasi qoidasi: hajm bloklanmaydi, oshish faqat ma'lumot):
 *  - musbat hajm — smeta tartibida har qator QOLDIG'IGACHA to'ldiriladi (quduq/ish yoki bajarilgan, yoki yo'q — pro-rata har
 *    quduqni «qisman bajarilgan» qilib qo'yardi); jami qoldiqdan ortigi OXIRGI qatorga (oshish jadvalda ko'rinadi);
 *  - manfiy hajm (pereraschet) — teskari tartibda, bajarilgan (smeta − qoldiq) hajmidan qaytariladi; ortigi BIRINCHI qatorga.
 * Bo'laklar yig'indisi aynan `jami` (6 xonagacha yaxlitlash, qoldig'i oxirgi bo'lakka). Nol bo'laklar ham qaytadi (oldindan ko'rish uchun).
 */
export function taqsimHisobla(jami: number, nomzodlar: readonly TaqsimNomzod[]): TaqsimQism[] {
  const n = nomzodlar.length;
  if (!n || !Number.isFinite(jami)) return [];
  const ulush = new Array<number>(n).fill(0);
  const EPS = 1e-12;
  if (jami >= 0) {
    let qoldi = jami;
    for (let i = 0; i < n && qoldi > EPS; i++) { const ol = Math.min(qoldi, Math.max(0, nomzodlar[i].qoldiq ?? 0)); ulush[i] = ol; qoldi -= ol; }
    if (qoldi > EPS) ulush[n - 1] += qoldi;
  } else {
    let qoldi = -jami;
    for (let i = n - 1; i >= 0 && qoldi > EPS; i--) {
      const s = nomzodlar[i];
      const bajarilgan = Math.max(0, (s.smetaHajm ?? 0) - (s.qoldiq ?? s.smetaHajm ?? 0));
      const ol = Math.min(qoldi, bajarilgan); ulush[i] = ol; qoldi -= ol;
    }
    if (qoldi > EPS) ulush[0] += qoldi;
  }
  const h = bolakla(jami, ulush, 6);
  return nomzodlar.map((s, i) => ({ qatorId: s.qatorId, hajm: h[i] }));
}

export interface TaqsimNatija extends IshBoglaNatija { /** Resurslar: necha tasi taqsimlandi (≥2 bo'lak). */ taqsimlandi: number }

/**
 * Ishni TAQSIMLAB bog'lash: ish bo'laklari `qismlar` (nol bo'laklar tashlanadi; bitta qolsa — oddiy `ishniBogla`).
 * Har resurs har bo'lak-ishning ichida (kod → kanon → nom+birlik, birlik/marka mos) qidiriladi va xuddi shu NISBATDA bo'linadi.
 * Biror ishda resurs topilmasa — o'sha bo'lak ulushi qo'shni (oldingi, bo'lmasa keyingi) topilgan bo'lakka qo'shiladi (pul yo'qolmaydi);
 * hech birida topilmasa — resurs ✕ qoladi. Asl smeta qatorlari o'zgarmaydi.
 */
export function taqsimlabBogla(ij: IshJoyi, fIsh: F2Tugun, qismlar: readonly TaqsimQism[], S: SmetaIndeks): TaqsimNatija {
  let qism = qismlar.filter((q) => q.hajm !== 0 && S.byId.has(q.qatorId));
  if (!qism.length) qism = qismlar.filter((q) => S.byId.has(q.qatorId)).slice(0, 1);
  if (qism.length < 2) {
    if (!qism.length) return { ij, boglandi: 0, qoldi: fIsh.bolalar.length, taqsimlandi: 0 };
    return { ...ishniBogla(ij, fIsh, qism[0].qatorId, S), taqsimlandi: 0 };
  }
  const bog = new Map(ij.bog);
  bog.set(fIsh.uid, { qatorId: qism[0].qatorId, holat: 'qolda', usul: TAQSIM_USUL, taqsim: qism.map((q) => ({ ...q })) });
  const otkaz = new Set(ij.otkaz); otkaz.delete(fIsh.uid);
  const havzalar = qism.map((q) => resursHavzasi(S, q.qatorId, (S.bolalar.get(q.qatorId) ?? []).filter((t) => t.tur !== 'rz')));
  const bandlar = qism.map(() => new Set<number>());
  let boglandi = 0, qoldi = 0, taqsimlandi = 0;
  for (const r of fIsh.bolalar) {
    if (otkaz.has(r.uid)) continue;
    bog.delete(r.uid);
    const topildi: Array<number | null> = qism.map((_, i) => {
      const t = resursMosTop(r, havzalar[i](r).filter((x) => !bandlar[i].has(x.id)));
      if (t && birMos(r.birlik, t.birlik) && !gradeFarq(r.nom, t.nom)) { bandlar[i].add(t.id); return t.id; }
      return null;
    });
    const idx = topildi.map((id, i) => (id != null ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) { qoldi++; continue; }
    // Topilmagan bo'lak ulushi — eng yaqin oldingi (bo'lmasa keyingi) topilgan bo'lakka.
    const ulush = new Map<number, number>(idx.map((i) => [i, 0]));
    qism.forEach((q, i) => {
      let j = i;
      if (topildi[i] == null) { j = -1; for (let x = i - 1; x >= 0; x--) if (topildi[x] != null) { j = x; break; } if (j < 0) j = idx[0]; }
      ulush.set(j, (ulush.get(j) ?? 0) + Math.abs(q.hajm));
    });
    if (idx.length === 1) { bog.set(r.uid, { qatorId: topildi[idx[0]]!, holat: 'qolda', usul: 'ish_ichida' }); boglandi++; continue; }
    const h = bolakla(r.hajm ?? 0, idx.map((i) => ulush.get(i) ?? 0), 6);
    bog.set(r.uid, { qatorId: topildi[idx[0]]!, holat: 'qolda', usul: TAQSIM_USUL, taqsim: idx.map((i, n) => ({ qatorId: topildi[i]!, hajm: h[n] })) });
    boglandi++; taqsimlandi++;
  }
  return { ij: { bog, otkaz }, boglandi, qoldi, taqsimlandi };
}

/**
 * Akt qatorlari snapshotidan (`raw_snapshot.qatorlar[]`) bog'lanishlarni tiklash: bir F2 uid bir necha smeta qatorida
 * uchrasa va har birida yozilgan bo'lak hajmi (`taqsimHajm`) bo'lsa — taqsim sifatida tiklanadi; aks holda oddiy bog'lanish.
 */
export function snapshotdanBog(yozuvlar: ReadonlyArray<{ uid: string; qatorId: number; taqsimHajm?: unknown }>): Map<string, Bog> {
  const guruh = new Map<string, Array<{ qatorId: number; hajm: number | null }>>();
  for (const y of yozuvlar) {
    const a = guruh.get(y.uid) ?? [];
    const h = y.taqsimHajm == null ? null : Number(y.taqsimHajm);
    a.push({ qatorId: y.qatorId, hajm: h != null && Number.isFinite(h) ? h : null });
    guruh.set(y.uid, a);
  }
  const bog = new Map<string, Bog>();
  for (const [uid, a] of guruh) {
    const qism = a.filter((x) => x.hajm != null) as TaqsimQism[];
    if (qism.length > 1) bog.set(uid, { qatorId: qism[0].qatorId, holat: 'qolda', usul: TAQSIM_USUL, taqsim: qism });
    else bog.set(uid, { qatorId: a[a.length - 1].qatorId, holat: 'qolda', usul: 'aktdan' });
  }
  return bog;
}

/** Saqlangan (qoralama/brauzer) taqsim to'g'ri tuzilganmi: ≥2 bo'lak, butun id, chekli hajm. Aks holda `undefined`. */
export function taqsimTekshir(x: unknown, idQabul: (id: number) => boolean = (id) => id > 0): TaqsimQism[] | undefined {
  if (!Array.isArray(x) || x.length < 2) return undefined;
  const out: TaqsimQism[] = [];
  for (const q of x as Array<{ qatorId?: unknown; hajm?: unknown }>) {
    const id = Number(q?.qatorId), h = Number(q?.hajm);
    if (!Number.isSafeInteger(id) || !idQabul(id) || !Number.isFinite(h)) return undefined;
    out.push({ qatorId: id, hajm: h });
  }
  return out;
}

/** Avtomatik (dvigatel) bog'lanishmi: ✓ aniq, xotira, ◐ taklif yoki ish narxi tarkibi. Operator qarorlari (qo'lda) — emas. */
export const avtoBogmi = (b: Bog) => b.holat === 'aniq' || b.holat === 'xotira' || b.holat === 'taklif' || b.usul === TARKIB_USUL;

/** Barcha avtomatik bog'lanishlarni uzish (egasi 2026-10-24). Qo'lda bog'langan/tasdiqlangan va aktga kiritilmaganlarga tegilmaydi. */
export function avtoBoglarniUz(ij: IshJoyi): { ij: IshJoyi; uzildi: number } {
  const bog = new Map(ij.bog);
  let uzildi = 0;
  for (const [uid, b] of ij.bog) if (avtoBogmi(b)) { bog.delete(uid); uzildi++; }
  return { ij: uzildi ? { bog, otkaz: ij.otkaz } : ij, uzildi };
}

export function uz(ij: IshJoyi, f: F2Tugun): IshJoyi {
  const bog = new Map(ij.bog);
  bog.delete(f.uid);
  if (f.tur === 'bl') for (const r of f.bolalar) bog.delete(r.uid);
  return { bog, otkaz: ij.otkaz };
}

/** ◐ taklif(lar)ni operator tasdiqlaydi → ✓ qo'lda. */
export function tasdiqla(ij: IshJoyi, uidlar: Iterable<string>): IshJoyi {
  const bog = new Map(ij.bog);
  for (const uid of uidlar) {
    const b = bog.get(uid);
    if (b?.holat === 'taklif') bog.set(uid, { ...b, holat: 'qolda', usul: b.usul === TARKIB_USUL ? b.usul : 'taklif_tasdiq' });
  }
  return { bog, otkaz: ij.otkaz };
}

/** Qatorni aktga KIRITMASLIK (ongli qaror: masalan #REF! katak yoki boshqa oyga tegishli).
 *  Ish o'tkazilsa — resurslari ham. */
export function otkazibYubor(ij: IshJoyi, f: F2Tugun, on: boolean): IshJoyi {
  const otkaz = new Set(ij.otkaz);
  const bog = new Map(ij.bog);
  const uidlar = [f.uid, ...(f.tur === 'bl' ? f.bolalar.map((r) => r.uid) : [])];
  for (const u of uidlar) {
    if (on) { otkaz.add(u); bog.delete(u); } else otkaz.delete(u);
  }
  return { bog, otkaz };
}

// ─── Hisob va yozish ─────────────────────────────────────────────────────────

// ─── Guruh (ish + resurslari) darajasidagi holat va hisoblagichlar ─────────

export type GuruhHolat = 'aniq' | 'xotira' | 'qolda' | 'taklif' | 'topilmadi' | 'otkazildi';

/** Ildiz qator: resursi bo'lgan ish ichidagi resurs EMAS (ish yoki mustaqil resurs). */
export function guruhIldizi(ind: F2Indeks, uid: string): F2Tugun | undefined {
  const o = ind.ota.get(uid);
  return o && o.tur === 'bl' ? o : ind.byUid.get(uid);
}

/**
 * Guruh holati: ish o'zi hal qilinmagan bo'lsa — o'sha; ish ✓ bo'lsa-yu resurslaridan biri ◐ yoki bog'lanmagan bo'lsa — ◐ (tekshirish kerak,
 * bitta ro'yxatda); aks holda ishning o'z holati. Resurslar navbatga bitta-bitta chiqmaydi.
 */
export function guruhHolati(ind: F2Indeks, ij: IshJoyi, ildiz: F2Tugun): GuruhHolat {
  const k = korinish(ij, ildiz.uid);
  if (k === 'otkazildi' || k === 'topilmadi' || k === 'taklif') return k;
  if (ildiz.tur === 'bl' && ildiz.bolalar.some((r) => { const rk = korinish(ij, r.uid); return rk === 'taklif' || rk === 'topilmadi'; })) return 'taklif';
  return k;
}

export interface GuruhHisob { tizimTopdi: number; avvalgiQaror: number; operatorTasdiqladi: number; taklif: number; topilmadi: number; otkazildi: number; hal: string[] }

/** Ish darajasidagi hisoblagichlar (egasi 2026-10-24): ✓/◐/✕ va «Keyingi tekshirilmagan» ildiz (ish/mustaqil resurs) bo'yicha. */
export function guruhHisobla(ind: F2Indeks, ij: IshJoyi): GuruhHisob {
  const h: GuruhHisob = { tizimTopdi: 0, avvalgiQaror: 0, operatorTasdiqladi: 0, taklif: 0, topilmadi: 0, otkazildi: 0, hal: [] };
  for (const t of ind.qatorlar) {
    const o = ind.ota.get(t.uid);
    if (o && o.tur === 'bl') continue;
    const g = guruhHolati(ind, ij, t);
    if (g === 'aniq') h.tizimTopdi++; else if (g === 'xotira') h.avvalgiQaror++; else if (g === 'qolda') h.operatorTasdiqladi++;
    else if (g === 'taklif') { h.taklif++; h.hal.push(t.uid); } else if (g === 'topilmadi') { h.topilmadi++; h.hal.push(t.uid); } else h.otkazildi++;
  }
  return h;
}

export interface IshJoyiHisob {
  jami: number;
  tayyor: number; // ✓ (aniq + xotira + qo'lda)
  tizimTopdi: number;
  avvalgiQaror: number;
  operatorTasdiqladi: number;
  taklif: number;
  topilmadi: number;
  otkazildi: number;
  /** Bog'langan barglar puli (o'tkazilganlarsiz). */
  boglanganSumma: number;
  /** Fayldagi barcha barglar puli. */
  hujjatSumma: number;
  otkazilganSumma: number;
  /** Bir smeta qatoriga bir nechta F2 qatori tushgan joylar (ogohlantirish, xato emas). */
  kopBog: Map<number, string[]>;
}

export interface F2Birlikda { hajm: number | null; narx: number | null; birlik: string | null; summaBoyicha: boolean; summa: number | null; smetaNarx: number | null }

/**
 * Faqat SUMMA bilan kelgan F2 qatori (subpudrat yig'ma summa: birlik yo'q, narx 1, hajm = summa so'mda — masalan
 * «ПЕРЕВОД В БРОНЗУ…» 5 803 571 428,99) smeta qatoriga boshqa birlikda (компл/шт…) bog'langanda: hajm = F2 summa / smeta narx
 * (0,356 компл), narx = smeta narx. F2 SUMMA o'zgarmaydi (summa ustun — yagona haqiqat; yaxlitlashda summa ustun). Aks holda — o'zgarishsiz.
 * Umumiy qoida: faqat shu qator uchun emas.
 */
export function f2HajmiSmetaBirligida(t: F2Tugun, s: SmetaQator | undefined | null): F2Birlikda {
  const asl: F2Birlikda = { hajm: t.hajm, narx: t.narx, birlik: t.birlik, summaBoyicha: false, summa: t.summa, smetaNarx: s?.narx ?? null };
  if (!s || t.hajm == null || t.summa == null) return asl;
  const sNarx = Number(s.narx);
  if (!(sNarx > 0) || !String(s.birlik ?? '').trim()) return asl;
  if (String(t.birlik ?? '').trim()) return asl;                                  // F2 da birlik bor — oddiy qator
  if (t.narx != null && Math.abs(t.narx - 1) > 1e-9) return asl;                  // narx 1 (yoki yo'q) — yig'ma summa
  const tol = Math.max(1, Math.abs(t.summa) * 1e-6);
  if (Math.abs(t.hajm - t.summa) > tol) return asl;                               // hajm ≈ summa
  const sb = String(s.birlik ?? '').toUpperCase().replace(/[\s.]/g, '');
  if (sb === 'СУМ' || sb === 'СЎМ' || sb === 'SUM' || sb === 'СУМЫ') return asl;  // smeta ham pul birligida
  return { hajm: t.summa / sNarx, narx: sNarx, birlik: s.birlik, summaBoyicha: true, summa: t.summa, smetaNarx: sNarx };
}

export function hisobla(ind: F2Indeks, ij: IshJoyi): IshJoyiHisob {
  const h: IshJoyiHisob = { jami: 0, tayyor: 0, tizimTopdi: 0, avvalgiQaror: 0, operatorTasdiqladi: 0, taklif: 0, topilmadi: 0, otkazildi: 0, boglanganSumma: 0, hujjatSumma: 0, otkazilganSumma: 0, kopBog: new Map() };
  const qayerga = new Map<number, string[]>();
  for (const t of ind.qatorlar) {
    h.jami++;
    const k = korinish(ij, t.uid);
    if (k === 'taklif') h.taklif++;
    else if (k === 'topilmadi') h.topilmadi++;
    else if (k === 'otkazildi') h.otkazildi++;
    else {
      h.tayyor++;
      if (k === 'aniq') h.tizimTopdi++;
      else if (k === 'xotira') h.avvalgiQaror++;
      else if (k === 'qolda') h.operatorTasdiqladi++;
    }
    const b = ij.bog.get(t.uid);
    if (b && b.usul !== TARKIB_USUL) for (const id of bogIdlari(b)) { const a = qayerga.get(id); if (a) a.push(t.uid); else qayerga.set(id, [t.uid]); }
    if (t.barg && t.summa != null) {
      h.hujjatSumma += t.summa;
      if (k === 'otkazildi') h.otkazilganSumma += t.summa;
      else if (b) h.boglanganSumma += t.summa;
    }
  }
  for (const [id, a] of qayerga) if (a.length > 1) h.kopBog.set(id, a);
  return h;
}

export interface RzTaklif { smetaRzId: number; nom: string; soni: number; jami: number; ulush: number }

/**
 * F2 bo'limi (sarlavha) hali smeta bo'limiga ulanmagan bo'lsa: uning ishlaridan kamida 60% i (kamida 2 ta) bog'langan
 * smeta qatorlarining eng yaqin bo'limi BITTA bo'lsa — shu bo'lim taklif qilinadi (bir bosishda tasdiqlanadi). Faqat taklif, majburiy emas.
 */
export function rzTaklifHisobla(rz: F2Tugun, ij: IshJoyi, S: SmetaIndeks): RzTaklif | null {
  const ishlar: F2Tugun[] = [];
  const yur = (list: readonly F2Tugun[]) => { for (const c of list) { if (c.tur === 'bl') ishlar.push(c); if (c.tur === 'rz') yur(c.bolalar); } };
  yur(rz.bolalar);
  const jami = ishlar.length;
  if (jami < 2) return null;
  const say = new Map<number, number>();
  for (const t of ishlar) {
    const b = ij.bog.get(t.uid);
    if (!b || ij.otkaz.has(t.uid) || b.holat === 'taklif') continue;
    let q = S.byId.get(b.qatorId);
    while (q && q.tur !== 'rz') q = q.otaId == null ? undefined : S.byId.get(q.otaId);
    if (q) say.set(q.id, (say.get(q.id) ?? 0) + 1);
  }
  let eng: [number, number] | null = null;
  for (const e of say) if (!eng || e[1] > eng[1]) eng = e;
  if (eng && eng[1] >= 2 && eng[1] / jami >= 0.6) { const id = rzKengaytir(eng[0], ishlar, S); return { smetaRzId: id, nom: S.byId.get(id)?.nom ?? '', soni: eng[1], jami, ulush: eng[1] / jami }; }
  const sh = rzTaklifShifrdan(rz, ishlar, S);
  if (!sh) return null;
  const id = rzKengaytir(sh.smetaRzId, ishlar, S);
  return id === sh.smetaRzId ? sh : { ...sh, smetaRzId: id, nom: S.byId.get(id)?.nom ?? '' };
}

/**
 * Yig'ma F2 bo'limi (egasi 2026-10-24 sinovi: F2 da 89 quduq bitta «КОЛОДЦЕВ Д 1 М» 5,09 qatori, smetada har quduq o'z bo'limida
 * 0,09 / 0,018 …): taklif qilingan bo'limdagi shu shifrli ishlar hajmi F2 hajmidan 2 baravardan ko'p kichik bo'lsa va xuddi shu
 * shifr qo'shni bo'limlarda ham bo'lsa — bitta quduq bo'limi emas, ularning umumiy OTA bo'limi taklif qilinadi
 * (hajmning yarmidan ko'pini qamragan birinchi ota yoki shu shifrning hammasini qamragan ota). Taqsimlab bog'lash shu doirada ishlaydi.
 */
function rzKengaytir(tanlov: number, ishlar: readonly F2Tugun[], S: SmetaIndeks): number {
  const idx = ishKodIndeks(S);
  let natija = tanlov;
  for (const t of ishlar) {
    const k = kodKanon(t.kod) || normKod(t.kod);
    const fh = Math.abs(Number(t.hajm ?? 0));
    if (!k || !(fh > 0)) continue;
    const qatorlar = (idx.get(k) ?? []).filter((q) => birMos(t.birlik, q.birlik));
    if (qatorlar.length < 2) continue;
    const yig = (rzId: number) => qatorlar.reduce((a, q) => a + (ichidami(S, q, rzId) ? Math.abs(Number(q.hajm ?? 0)) : 0), 0);
    if (!(fh > 2 * yig(natija))) continue;
    if (qatorlar.every((q) => ichidami(S, q, natija))) continue; // qo'shni bo'limlarda shu shifr yo'q
    const jamiH = qatorlar.reduce((a, q) => a + Math.abs(Number(q.hajm ?? 0)), 0);
    for (let o = engYaqinRz(S, S.byId.get(natija)); o; o = engYaqinRz(S, o)) {
      const ho = yig(o.id);
      if (2 * ho >= fh || ho >= jamiH - 1e-9 || qatorlar.every((q) => ichidami(S, q, o!.id))) { natija = o.id; break; }
    }
  }
  return natija;
}

const ISH_KOD_KESH = new WeakMap<SmetaIndeks, Map<string, SmetaQator[]>>();
/** Smetaning barcha ishlari shifr (kanon) bo'yicha — bir marta quriladi. */
function ishKodIndeks(S: SmetaIndeks): Map<string, SmetaQator[]> {
  let m = ISH_KOD_KESH.get(S);
  if (m) return m;
  m = new Map();
  for (const q of S.byId.values()) {
    if (q.tur !== 'bl') continue;
    const k = kodKanon(q.kod) || normKod(q.kod);
    if (!k) continue;
    const a = m.get(k);
    if (a) a.push(q); else m.set(k, [q]);
  }
  ISH_KOD_KESH.set(S, m);
  return m;
}
function engYaqinRz(S: SmetaIndeks, q: SmetaQator | undefined): SmetaQator | undefined {
  let x = q?.otaId != null ? S.byId.get(q.otaId) : undefined;
  while (x && x.tur !== 'rz') x = x.otaId != null ? S.byId.get(x.otaId) : undefined;
  return x;
}
/** Bo'lim nomlari o'xshashligi (0..1): «РАЗДЕЛ:», nuqta va «(ЛИСТ …)» kabi qo'shimchalarsiz; to'liq tenglik yoki biri ikkinchisining boshi — 1. */
function rzNomOxshash(a: string, b: string): number {
  const toza = (s: string) => String(s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/^\s*РАЗДЕЛ\s*:\s*/, '').replace(/\(.*?\)/g, ' ').replace(/[.\s]+/g, ' ').trim();
  const x = normNom(toza(a)), y = normNom(toza(b));
  if (!x || !y) return 0;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return 1;
  return nomOxshash(toza(a), toza(b));
}
/**
 * Bo'lim taklifi ISHLAR SHIFRI bo'yicha (egasi 2026-10-24 sinovi: Sun'iy ko'l «Канализация (Перерасчет)» — F2 dagi «КОЛОДЕЦ К-1М»,
 * «ГИДРОИЗОЛЯЦИЯ» bo'limlari smetaning boshqa joyida («СМЕТА № 01-04 НА КОЛОДЦЕВ → КОЛОДЕЦ К1 / ГИДРОИЗОЛЯЦИЯ»); ishlar bo'lim
 * ulanmaguncha bog'lanmaydi, bo'lim esa ishlar bog'lanmaguncha taklif qilinmasdi — berk aylana, hammasi ✕ edi).
 * F2 bo'limidagi ishlar shifrlari (birligi mos) eng ko'p tushadigan smeta bo'limi; teng bo'lsa — nomi o'xshashi; noaniq — taklif yo'q.
 */
function rzTaklifShifrdan(rz: F2Tugun, ishlar: readonly F2Tugun[], S: SmetaIndeks): RzTaklif | null {
  const jami = ishlar.length;
  if (!jami) return null;
  const idx = ishKodIndeks(S);
  // Har ish — uning shifri tushgan smeta qatorlarining BARCHA ota bo'limlariga bittadan ovoz (eng yaqiniga emas:
  // gidroizolyatsiya kabi shifrlar o'nlab bo'limda takrorlanadi; bir nechta ishni birga qamragan ota bo'lim yutadi).
  const say = new Map<number, number>();
  const ota = (r: SmetaQator) => engYaqinRz(S, r);
  for (const t of ishlar) {
    const k = kodKanon(t.kod) || normKod(t.kod);
    if (!k) continue;
    const rzlar = new Set<number>();
    for (const q of idx.get(k) ?? []) {
      if (!birMos(t.birlik, q.birlik)) continue;
      for (let r = engYaqinRz(S, q); r; r = ota(r)) rzlar.add(r.id);
    }
    for (const id of rzlar) say.set(id, (say.get(id) ?? 0) + 1);
  }
  let max = 0;
  for (const n of say.values()) if (n > max) max = n;
  if (!max) return null;
  // Teng ovozli bo'limlardan faqat eng ichkilari (biri ikkinchisining otasi bo'lsa — otasi tashlanadi).
  const maxlar = new Set([...say].filter(([, n]) => n === max).map(([id]) => id));
  const tenglar = [...maxlar].filter((id) => ![...maxlar].some((b) => {
    if (b === id) return false;
    for (let r = engYaqinRz(S, S.byId.get(b)); r; r = ota(r)) if (r.id === id) return true;
    return false;
  }));
  let tanlov: number | null = tenglar.length === 1 ? tenglar[0] : null;
  let nomO = tanlov != null ? rzNomOxshash(rz.nom, S.byId.get(tanlov)?.nom ?? '') : 0;
  if (tanlov == null) {
    const baho = tenglar.map((id) => ({ id, o: rzNomOxshash(rz.nom, S.byId.get(id)?.nom ?? '') })).sort((a, b) => b.o - a.o);
    if (baho[0].o >= 0.6 && (baho.length < 2 || baho[1].o < baho[0].o)) { tanlov = baho[0].id; nomO = baho[0].o; }
  }
  if (tanlov == null) return null;
  // Yetarlilik: ko'pchilik (≥60%) shifr; yoki bo'lim nomi ham mos bo'lsa — yarmi yetadi (qolgani odatda zamena).
  const yetarli = (max >= 2 && max / jami >= 0.6) || (max >= 2 && max / jami >= 0.5 && nomO >= 0.6) || (jami === 1 && max === 1 && nomO >= 0.6);
  if (!yetarli) return null;
  return { smetaRzId: tanlov, nom: S.byId.get(tanlov)?.nom ?? '', soni: max, jami, ulush: max / jami };
}

/** Narx farqi (%): F2 ish narxi smeta narxidan qancha farq qiladi. Faqat ko'rsatish uchun (bloklamaydi). */
export function narxFarqiFoiz(f2Narx: number | null | undefined, smetaNarx: number | null | undefined): number | null {
  if (f2Narx == null || smetaNarx == null || !(f2Narx > 0) || !(smetaNarx > 0)) return null;
  const f = (f2Narx / smetaNarx - 1) * 100;
  return Math.abs(f) < 0.5 ? null : f;
}

export interface YozishManbasi {
  nodes: F2ExactManbaTugun[];
  mapping: Map<string, number>;
  /** Yozishni to'xtatuvchi sabablar (bo'sh bo'lsa — yozish mumkin). */
  toxtatish: string[];
  /** Yozishni TO'XTATMAYDIGAN eslatmalar: hujjatda son yo'q qatorlar — hujjatdagidek (bo'sh) yoziladi. */
  ogohlantirish: string[];
  /** Har manba qatori uchun xotira imzosi (keyingi oylarda avtomatik bog'lash uchun). */
  imzolar: Map<string, string>;
  /** Taqsim bo'lagi tuguni uid → asl F2 uid (bo'laksiz qatorlar bu yerda yo'q — o'z uid i asl). */
  aslUid: Map<string, string>;
}

export function yozishManbasi(ind: F2Indeks, ij: IshJoyi, S?: SmetaIndeks): YozishManbasi {
  const nodes: F2ExactManbaTugun[] = [];
  const mapping = new Map<string, number>();
  const imzolar = new Map<string, string>();
  const aslUid = new Map<string, string>();
  const hal: string[] = [];
  const qiymatsiz: string[] = [];
  const summasiz: string[] = [];
  const qisqa = (t: F2Tugun) => `«${(t.kod ? t.kod + ' ' : '') + t.nom.slice(0, 60)}» (${t.manzil.varaq}!${t.manzil.qator})`;
  for (const t of ind.qatorlar) {
    const k = korinish(ij, t.uid);
    if (k === 'otkazildi') continue;
    // Ish narxi tarkibi: resurslar ishning o'z puli — alohida yozilmaydi (ikki marta sanalmasin).
    const ota0 = ind.ota.get(t.uid);
    if (t.tur === 'rs' && ij.bog.get(t.uid)?.usul === TARKIB_USUL && ota0 && ij.bog.get(ota0.uid)?.qatorId === ij.bog.get(t.uid)?.qatorId) continue;
    const tarkibIsh = t.tur === 'bl' && !t.barg && t.bolalar.length > 0 && k !== 'topilmadi' && k !== 'taklif'
      && t.bolalar.every((r) => ij.bog.get(r.uid)?.usul === TARKIB_USUL);
    // Podvaldagi qo'lda qator bog'lanmagan bo'lsa — jim o'tkaziladi (blok yo'q); ◐ taklif esa tasdiq/o'tkazishni kutadi.
    if (t.podval && k === 'topilmadi') continue;
    if (k === 'topilmadi' || k === 'taklif') { hal.push(qisqa(t)); continue; }
    const b = ij.bog.get(t.uid)!;
    // Hujjatda hajm yo'q (#REF! yoki bo'sh) — yoziladigan son yo'q: qator aktga kirmaydi, faqat eslatma (blok emas).
    if (t.hajm == null) { qiymatsiz.push(qisqa(t)); continue; }
    const qismlar = b.taqsim && b.taqsim.length > 1 ? b.taqsim : null;
    if (!qismlar) mapping.set(t.uid, b.qatorId);
    // Yig'ma summa (birliksiz, narx 1, hajm = so'm) smeta birligiga o'tkaziladi: hajm = summa / smeta narx; summa F2 dagi aniq summa.
    const bk = S && !qismlar ? f2HajmiSmetaBirligida(t, S.byId.get(b.qatorId)) : null;
    const ota = ind.ota.get(t.uid);
    // Taqsimlangan qator xotiraga yozilmaydi (bitta imzo — bitta smeta qatori; bo'laklar keyingi oyda boshqacha bo'lishi mumkin).
    if (!qismlar) imzolar.set(t.uid, t.tur === 'rs' && ota ? f2Imzo(t, f2Imzo(ota)) : f2Imzo(t, t.yol.map(rzKalit).join('/')));
    let nd: F2ExactManbaTugun;
    // Resurslari bor ish — faqat hajm; pul uning resurslarida (ikki marta sanalmaydi).
    if (tarkibIsh) {
      const narx = t.narx != null && t.narx > 0 ? t.narx : (t.summa != null && t.hajm > 0 ? t.summa / t.hajm : undefined);
      nd = { uid: t.uid, hajm: t.hajm, narx, summa: t.summa, tur: 'bl', summaYozilgan: t.summa != null };
    } else if (t.tur === 'bl' && !t.barg) nd = { uid: t.uid, hajm: t.hajm, narx: undefined, summa: undefined, tur: 'bl' };
    else {
      // Narxi bor-u hujjatda summasi bo'sh — pul to'qilmaydi: hajm yoziladi, summa hujjatdagidek bo'sh qoladi (blok emas).
      if (t.narx != null && t.narx > 0 && t.summa == null) summasiz.push(qisqa(t));
      nd = { uid: t.uid, hajm: bk?.summaBoyicha ? bk.hajm! : t.hajm, narx: bk?.summaBoyicha ? bk.narx : t.narx, summa: t.summa, tur: t.tur, summaYozilgan: t.summa != null };
    }
    if (!qismlar) { nodes.push(nd); continue; }
    // TAQSIM: har bo'lak — alohida manba tuguni (alohida akt qatori). Hajm va summa F2 dagi sonlardan bo'lak nisbatida;
    // bo'laklar yig'indisi AYNAN hujjatdagi hajm/summa (qoldiq oxirgi bo'lakka). Narx — hujjatdagi narx.
    const ulush = qismlar.map((q) => q.hajm);
    const hj = bolakla(nd.hajm, ulush, 6);
    const sm = nd.summa != null ? bolakla(Number(nd.summa), ulush, 2) : null;
    qismlar.forEach((q, i) => {
      const vuid = `${t.uid}${TAQSIM_AJRATGICH}${i}`;
      mapping.set(vuid, q.qatorId); aslUid.set(vuid, t.uid);
      let hajm = hj[i], narx = nd.narx;
      const summa = sm ? sm[i] : nd.summa;
      if (S && t.barg && summa != null) {
        const bq = f2HajmiSmetaBirligida({ ...t, hajm, summa }, S.byId.get(q.qatorId));
        if (bq.summaBoyicha) { hajm = bq.hajm!; narx = bq.narx; }
      }
      nodes.push({ ...nd, uid: vuid, hajm, narx, summa });
    });
  }
  const toxtatish: string[] = [];
  if (hal.length) toxtatish.push(`${hal.length} ta qator hal qilinmagan (✕ yoki ◐): ${hal.slice(0, 5).join('; ')}${hal.length > 5 ? ' …' : ''}`);
  const ogohlantirish: string[] = [];
  if (qiymatsiz.length) ogohlantirish.push(`${qiymatsiz.length} ta qatorda hujjatda hajm yo'q (#REF! yoki bo'sh) — aktga kirmaydi: ${qiymatsiz.slice(0, 5).join('; ')}${qiymatsiz.length > 5 ? ' …' : ''}`);
  if (summasiz.length) ogohlantirish.push(`${summasiz.length} ta qatorda hujjatda summa bo'sh — hajmi yoziladi, summasi hujjatdagidek bo'sh qoladi (to'qilmaydi): ${summasiz.slice(0, 5).join('; ')}${summasiz.length > 5 ? ' …' : ''}`);
  if (!nodes.length && !toxtatish.length) toxtatish.push('Aktga kiradigan qator yo‘q.');
  return { nodes, mapping, toxtatish, ogohlantirish, imzolar, aslUid };
}

/** F2 tuguni smeta qatoriga "o'sha ish"mi — tashlaganda to'g'ridan-to'g'ri bog'lash mumkinmi
 *  yoki operatordan so'rash kerak (Bog'lash / ⇄ Zamena / ＋ Qo'shimcha). */
export function oshaQatormi(f: F2Tugun, s: SmetaQator): boolean {
  if (!birMos(f.birlik, s.birlik) || gradeFarq(f.nom, s.nom)) return false;
  const fk = normKod(f.kod);
  if (fk && normKod(s.kod) === fk) return true;
  const fkan = kodKanon(f.kod);
  if (fkan && kodKanon(s.kod) === fkan) return true;
  return nb(f.nom, f.birlik) === nb(s.nom, s.birlik);
}

/** F2 akt jami: hujjatdagi ИТОГО ПРЯМЫЕ ↔ qatorlar (ekranda ko'rsatish uchun). */
export function aktJamiMatni(a: F2Akt): { hujjat: number | null; qatorlar: number; farq: number | null } {
  return { hujjat: a.jami.pryamye, qatorlar: a.qatorlarJami, farq: a.jami.pryamye == null ? null : a.qatorlarJami - a.jami.pryamye };
}
