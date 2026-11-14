/**
 * Yordamchi navigatsiyasi: tabiiy til (uz/ru/en) -> navReestr sahifasi. Ro'yxat REESTRDAN avtomatik quriladi (nom + sinonim),
 * shuning uchun yangi sahifa qo'shilganda ochish buyrug'i o'zi ishlaydi. Foydalanuvchi ruxsati: faqat `ruxsatli` ro'yxat
 * (AdminShell sidebar bilan BIR manba) ochiladi; reestrda bor, lekin ruxsatsiz sahifa — «ruxsat yo'q» deb aytiladi.
 */
import { NAV_SAHIFALAR, navSahifa, type NavSahifa } from '../nav/navReestr';
import { sozlar, sozMosligi, TOLDIRUVCHI } from './matn';
import { SAHIFA_SINONIM } from './sinonim';

export type YordamchiSahifa = { yol: string; nom: string; guruh?: string };
export type SahifaHavola = { yol: string; nom: string; url: string };

const ibora = (s: string): string[] => sozlar(s).filter((w) => !TOLDIRUVCHI.has(w));

/** Sahifaning barcha iboralari: ro'yxatdagi nom (qavssiz va to'liq) + sinonimlar. */
export function sahifaIboralari(yol: string, nom: string): string[][] {
  const qavssiz = nom.replace(/\([^)]*\)/g, ' ');
  const s = SAHIFA_SINONIM[yol];
  const xom = [qavssiz, nom, ...(s?.uz ?? []), ...(s?.ru ?? []), ...(s?.en ?? [])];
  const out: string[][] = []; const korilgan = new Set<string>();
  for (const x of xom) { const w = ibora(x); const k = w.join(' '); if (w.length && !korilgan.has(k)) { korilgan.add(k); out.push(w); } }
  return out;
}

type Ball = { yol: string; nom: string; ball: number; sozSoni: number };

/** Har sahifa uchun eng yaxshi ibora balli: ibora so'zlarining HAMMASI so'rovda bo'lishi shart (`toliq`) yoki ulushi (qisman). */
function ballla(tokenlar: readonly string[], sahifalar: readonly YordamchiSahifa[], toliq: boolean): Ball[] {
  const out: Ball[] = [];
  for (const s of sahifalar) {
    let eng: Ball | null = null;
    for (const w of sahifaIboralari(s.yol, s.nom)) {
      let yig = 0; let mos = 0;
      for (const aw of w) {
        let eb = 0; for (const q of tokenlar) eb = Math.max(eb, sozMosligi(q, aw));
        if (eb > 0) { yig += eb; mos++; }
      }
      if (!mos || (toliq && mos < w.length)) continue;
      const ball = toliq ? yig + 0.01 * w.length : yig / w.length + 0.001 * mos;
      if (!eng || ball > eng.ball) eng = { yol: s.yol, nom: s.nom, ball, sozSoni: mos };
    }
    if (eng) out.push(eng);
  }
  return out.sort((a, b) => b.ball - a.ball);
}

const reestrSahifalari = (): YordamchiSahifa[] => NAV_SAHIFALAR.map((s) => ({ yol: s.yol, nom: s.nom, guruh: s.guruh.nom }));

export type SahifaNatija =
  | { tur: 'aniq'; sahifa: YordamchiSahifa; qoplanish: number }
  | { tur: 'noaniq'; nomzodlar: YordamchiSahifa[] }
  | { tur: 'ruxsatYoq'; nom: string }
  | null;

/**
 * `tokenlar` — to'ldiruvchi so'zlarsiz, obyekt/oy so'zlarisiz normallashgan so'rov so'zlari.
 * Qaytadi: aniq sahifa; noaniq (bir nechta teng mos); ruxsatYoq (reestrda bor, foydalanuvchiga ochiq emas); yoki null.
 */
export function sahifaTopish(tokenlar: readonly string[], ruxsatli: readonly YordamchiSahifa[]): SahifaNatija {
  if (!tokenlar.length) return null;
  const mening = ballla(tokenlar, ruxsatli, true);
  const hammasi = ballla(tokenlar, reestrSahifalari(), true);
  const eng = mening[0]; const boshqa = hammasi[0];
  const ruxsatli_ = new Set(ruxsatli.map((s) => s.yol));
  if (boshqa && !ruxsatli_.has(boshqa.yol) && (!eng || boshqa.ball > eng.ball + 0.005)) return { tur: 'ruxsatYoq', nom: boshqa.nom };
  if (!eng) return null;
  const teng = mening.filter((b) => Math.abs(b.ball - eng.ball) < 0.005);
  if (teng.length > 1) return { tur: 'noaniq', nomzodlar: teng.slice(0, 4).map((b) => ({ yol: b.yol, nom: b.nom })) };
  return { tur: 'aniq', sahifa: { yol: eng.yol, nom: eng.nom }, qoplanish: eng.sozSoni / tokenlar.length };
}

/** Aniq topilmaganda: eng yaqin sahifalar (qisman moslik); hech narsa mos kelmasa — `sukut` (odatda eng ko'p ishlatiladiganlar). */
export function yaqinSahifalar(tokenlar: readonly string[], ruxsatli: readonly YordamchiSahifa[], n = 4): YordamchiSahifa[] {
  const q = ballla(tokenlar, ruxsatli, false).slice(0, n).map((b) => ({ yol: b.yol, nom: b.nom }));
  if (q.length) return q;
  const SUKUT = ['/admin/obyektlar', '/admin/fakt', '/admin/f2-tayyorlash', '/admin/documents', '/admin/f2-tarix'];
  return SUKUT.map((y) => ruxsatli.find((s) => s.yol === y)).filter((s): s is YordamchiSahifa => !!s).slice(0, n).map((s) => ({ yol: s.yol, nom: s.nom }));
}

/** Sahifaga URL: obyekt-kontekstli sahifa uchun `?obyekt=ID` (+ `&oy=YYYY-MM`); «Smeta va Fakt» — `/admin/holat/ID`. */
export function sahifaUrl(yol: string, ctx: { obyektId?: number | null; oy?: string | null } = {}): string {
  const meta: NavSahifa | null = navSahifa(yol);
  const id = ctx.obyektId != null && Number.isSafeInteger(ctx.obyektId) && ctx.obyektId > 0 ? ctx.obyektId : null;
  if (id == null || !meta || meta.scope !== 'OBJECT_SCOPED') return yol;
  if (yol === '/admin/holat') return `${yol}/${id}`;
  const p = new URLSearchParams({ obyekt: String(id) });
  if (ctx.oy && /^\d{4}-\d{2}$/.test(ctx.oy)) p.set('oy', ctx.oy);
  return `${yol}?${p.toString()}`;
}
