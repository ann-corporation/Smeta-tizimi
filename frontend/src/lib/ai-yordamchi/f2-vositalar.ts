/**
 * F2 TAYYORLASH oynasi uchun AI yordamchi vositalari (sof funksiyalar — test qilinadi).
 * Manba — sahifadagi o'sha hisob (f2Qur / f2Qatorlar / f2Jami / f2Uchastkalar): yangi formula yo'q, raqam to'qilmaydi.
 * Narx faqat bazada borini (protokol → oldingi F2 → smeta, shuningdek mavjud `narxTakliflari` manbalari) ko'rsatadi;
 * narx amali faqat «narx» vositasi ko'rsatgan qiymatlardan biri bo'lishi mumkin. Summa NDS siz, ustamasiz + ustamali; NDS oxirida.
 */
import type { F2Bolim, F2Ish, F2Jami, F2Kiritma, F2Manba, F2Qator, F2Resurs } from '../f2-tayyor';
import { NARX_MANBA_NOMI, sonOqi } from '../f2-tayyor';
import type { Ierarxiya, UchastkaUlushi } from '../f2-bolim-daraxti';
import { avlodKalitlari } from '../f2-bolim-daraxti';
import type { KatKesim } from '../ustamali-summa';
import { qidiruvTayyorla } from '../qidiruv-normalizatsiya';
import type { OqishSorovi, SahifaAmal } from './protokol';

export type F2UstamaliFn = (k: KatKesim) => { ustamali: number | null; taxminiy: boolean };
export type F2NarxVarianti = { narx: number; manba: string; izoh?: string | null };
export type F2Malumot = {
  obyektNomi?: string; oy: string; manba: F2Manba; ndsFoiz: number | null;
  bolimlar: readonly F2Bolim[]; ier: Ierarxiya; qatorBolim: ReadonlyMap<number, number | null>;
  qatorlar: readonly F2Qator[]; jami: F2Jami; katKesim: KatKesim; uchastkalar: readonly UchastkaUlushi[];
  k: F2Kiritma; ustamali?: F2UstamaliFn;
};

type Joy = { tur: 'ish'; ish: F2Ish; bolimId: number | null } | { tur: 'resurs'; r: F2Resurs; ish: F2Ish | null; bolimId: number | null };
const raqam = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d }));
const pul = (v: number | null | undefined) => (v == null ? '—' : `${raqam(v, 2)} so‘m`);

export function f2Indeks(m: Pick<F2Malumot, 'bolimlar'>): Map<number, Joy> {
  const out = new Map<number, Joy>();
  for (const b of m.bolimlar) {
    for (const ish of b.ishlar) {
      out.set(ish.id, { tur: 'ish', ish, bolimId: b.id });
      for (const r of ish.resurslar) out.set(r.id, { tur: 'resurs', r, ish, bolimId: b.id });
    }
    for (const r of b.alohida) out.set(r.id, { tur: 'resurs', r, ish: null, bolimId: b.id });
  }
  return out;
}

const yol = (m: Pick<F2Malumot, 'ier'>, bolimId: number | null) => {
  const t = m.ier.byKalit.get(bolimId ?? -1);
  if (!t) return '—';
  const out: string[] = []; let x: typeof t | undefined = t; let n = 0;
  while (x && n++ < 20) { out.unshift(x.nom); x = x.ota != null ? m.ier.byKalit.get(x.ota) : undefined; }
  return `${out.join(' › ')} (uchastka [U${t.ildiz}] ${t.ildizNom})`;
};

const kiritma = (m: Pick<F2Malumot, 'k'>, id: number) => {
  const h = m.k.hajm[id]; const n = m.k.narx[id]; const ns = m.k.narxsiz[id];
  return [h != null && `kiritilgan hajm ${h}`, n != null && `qo‘lda narx ${n}`, ns && 'narxsiz belgilangan'].filter(Boolean).join(', ');
};

export function f2Satr(m: Pick<F2Malumot, 'k' | 'manba'>, j: Joy): string {
  if (j.tur === 'ish') {
    const i = j.ish; const k = kiritma(m, i.id);
    return `[#${i.id}] ISH ${i.kod ?? ''} ${i.nom} | ${i.birlik ?? '—'} | F2 ga mumkin ${raqam(i.mumkin)} (${m.manba === 'fakt' ? 'fakt qoldig‘i' : 'smeta qoldig‘i'}) · smeta ${raqam(i.smeta)} · avval F2 ${raqam(i.olingan)}`
      + (i.qoralama ? ` · qoralamada ${raqam(i.qoralama)}` : '') + (k ? ` | ${k}` : '');
  }
  const r = j.r; const k = kiritma(m, r.id);
  return `[#${r.id}] ${r.avto ? 'RES(avto)' : r.tur.toUpperCase()} ${r.kat ?? ''} ${r.kod ?? ''} ${r.nom} | ${r.birlik ?? '—'}`
    + (r.avto ? ` · norma ${raqam(r.norma, 6)}` : ` · mumkin ${raqam(r.mumkin)}`)
    + ` · taklif narx ${r.taklifNarx == null ? 'YO‘Q' : `${raqam(r.taklifNarx, 2)} (${NARX_MANBA_NOMI[r.taklifManba]}${r.protokol ? ` ${r.protokol}` : ''})`}` + (k ? ` | ${k}` : '');
}

const summaMatn = (m: F2Malumot) => {
  const u = m.ustamali?.(m.katKesim);
  const ust = u?.ustamali == null ? null : (u.taxminiy ? '≈ ' : '') + pul(u.ustamali);
  const nds = m.ndsFoiz != null && u?.ustamali != null ? `NDS ${m.ndsFoiz}% faqat oxirida: ${pul(u.ustamali * (1 + m.ndsFoiz / 100))}` : null;
  return [`F2 summasi (NDS siz): ustamasiz ${pul(m.jami.summa)}; ustamali ${ust ?? 'noma’lum'}`, ...(nds ? [nds] : []),
    `Kategoriya bo‘yicha (ustamasiz): ${Object.entries(m.jami.kat).map(([k, v]) => `${k} ${pul(v)}`).join('; ') || '—'}`].join('\n');
};

export function f2Kontekst(m: F2Malumot): string {
  const ishlar = m.bolimlar.reduce((s, b) => s + b.ishlar.length, 0);
  const mumkinIsh = m.bolimlar.reduce((s, b) => s + b.ishlar.filter((i) => i.mumkin > 0).length, 0);
  const ildizlar = m.ier.tugunlar.filter((t) => t.ota == null);
  return [`Sahifa: F2 tayyorlash${m.obyektNomi ? ` — obyekt «${m.obyektNomi}»` : ''}, davr ${m.oy}. Hajm manbai: ${m.manba === 'fakt' ? 'fakt qoldig‘i' : 'smeta (faktsiz)'}.`,
    `F2 ga olinadigan ishlar: ${mumkinIsh} / ${ishlar}.`,
    `Uchastkalar (eng yuqori razdel, ${ildizlar.length}):`,
    ...ildizlar.slice(0, 40).map((t) => `- [U${t.kalit}] ${t.nom}: F2 ga olinadigan ${t.mumkin} / ${t.jami} pozitsiya; mumkin hajm summasi ustamasiz ${pul(t.summa)}${(() => { const u = m.ustamali?.(t.katKesim); return u?.ustamali != null ? `, ustamali ${u.taxminiy ? '≈ ' : ''}${pul(u.ustamali)}` : ''; })()} (narxi bor resurslardan)`),
    `Joriy F2 kiritmasi: ${m.jami.ish} ish, ${m.jami.qator} qator, xato ${m.jami.xato}, ogohlantirish ${m.jami.ogoh}, narxsiz ${m.jami.narxsiz}.`,
    ...(m.uchastkalar.length > 1 ? [`DIQQAT: bitta F2 da ${m.uchastkalar.length} uchastka aralashgan: ${m.uchastkalar.map((u) => `${u.nom} (${u.soni})`).join('; ')}`] : []),
    summaMatn(m)].join('\n');
}

export function f2Qidir(m: F2Malumot, sorov: string, limit = 25): string {
  const q = sorov.trim();
  if (q.length < 2) return 'Qidiruv so‘zi juda qisqa.';
  const ind = [...f2Indeks(m).values()];
  const matn = (j: Joy) => (j.tur === 'ish' ? `${j.ish.kod ?? ''} ${j.ish.nom}` : `${j.r.kod ?? ''} ${j.r.nom}`);
  const f = qidiruvTayyorla(q);
  let topildi = ind.filter((j) => f(matn(j))); let usul = 'aniq';
  if (!topildi.length) {
    const sozlar = q.split(/[\s,;.]+/).filter((s) => s.length >= 3).map((s) => qidiruvTayyorla(s));
    topildi = ind.map((j) => ({ j, b: sozlar.filter((s) => s(matn(j))).length })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b).map((x) => x.j);
    usul = 'so‘zlar bo‘yicha (yaqin)';
  }
  if (!topildi.length) return `«${q}» bo‘yicha F2 ga olinadigan qator topilmadi.`;
  return [`Topildi: ${topildi.length} (${usul})${topildi.length > limit ? `, birinchi ${limit}` : ''}:`,
    ...topildi.slice(0, limit).map((j) => `${f2Satr(m, j)} | ${yol(m, j.bolimId)}`)].join('\n');
}

/** Uchastka/bo'lim kaliti: "U12", "12", "-1" (bo'limsiz). */
export function f2Kalit(arg: string | number | null | undefined): number | null {
  if (arg == null || arg === '') return null;
  const m = /^-?\d+$/.exec(String(arg).replace(/^U/i, '').replace(/^#/, '').trim());
  return m ? Number(m[0]) : null;
}

export function f2Bolim(m: F2Malumot, arg: string | null, limit = 60): string {
  const kalit = f2Kalit(arg);
  const t = kalit != null ? m.ier.byKalit.get(kalit) : undefined;
  if (!t) return `Bo‘lim/uchastka [${arg ?? ''}] topilmadi. Kalitni xulosadan ([U..]) yoki qidir natijasidan oling.`;
  const avlod = avlodKalitlari(m.ier, t.kalit);
  const out = [`[U${t.kalit}] ${yol(m, t.id)}`]; let n = 0;
  for (const b of m.bolimlar) {
    if (!avlod.has(b.id ?? -1)) continue;
    for (const i of b.ishlar) {
      if (n++ >= limit) { out.push(`… (cheklov ${limit})`); return out.join('\n'); }
      out.push(f2Satr(m, { tur: 'ish', ish: i, bolimId: b.id }));
      for (const r of i.resurslar.filter((x) => !x.avto)) out.push('  └ ' + f2Satr(m, { tur: 'resurs', r, ish: i, bolimId: b.id }));
    }
    for (const r of b.alohida) out.push(f2Satr(m, { tur: 'resurs', r, ish: null, bolimId: b.id }));
  }
  return out.join('\n');
}

const OGOH: Record<string, string> = { RESURS_CHEGARA: 'resurs fakt qoldig‘i bilan cheklandi', ARIFMETIKA: 'summa hajm × narxdan farq qiladi', SMETADAN_OSHDI: 'smeta hajmidan oshadi',
  AXBOROT_NARXSIZ: 'axborot qatori (narxsiz)', QOLDIQDAN_OSHDI: 'fakt qoldig‘idan oshadi', QORALAMA_TAKROR: 'qoralamadagi F2 bilan ikki marta olinadi' };
const XATO: Record<string, string> = { HAJM: 'hajm noto‘g‘ri', NARX: 'NARX YO‘Q (narx kiriting yoki «narxsiz» belgilang)', SUMMA: 'summa son emas' };

/** Holat/tekshiruv: joriy kiritma bo'yicha xatolar, ogohlantirishlar, narxsizlar, uchastka aralashuvi, summalar. */
export function f2Tekshir(m: F2Malumot): string {
  if (!m.qatorlar.length) return ['Hali hech qanday hajm kiritilmagan.', f2Kontekst(m)].join('\n');
  const xatolar = m.qatorlar.filter((q) => q.xato);
  const ogohlar = m.qatorlar.filter((q) => q.ogoh && q.ogoh !== 'AXBOROT_NARXSIZ');
  const narxsiz = m.qatorlar.filter((q) => q.tur !== 'bl' && q.narxsiz && q.ogoh !== 'AXBOROT_NARXSIZ');
  const satr = (q: F2Qator, sabab: string) => `- [#${q.id}] ${q.tur === 'bl' ? 'ISH' : q.kat ?? q.tur} ${q.nom} | hajm ${raqam(q.hajm)} ${q.birlik ?? ''} | narx ${q.narx == null ? '—' : raqam(q.narx, 2)} (${NARX_MANBA_NOMI[q.manba]}) | ${sabab}`;
  const royxat = (sar: string, l: F2Qator[], sabab: (q: F2Qator) => string) => (l.length ? [`${sar} (${l.length}):`, ...l.slice(0, 20).map((q) => satr(q, sabab(q))), ...(l.length > 20 ? [`… yana ${l.length - 20}`] : [])] : [`${sar}: yo‘q`]);
  const manba = Object.entries(m.jami.manba).filter(([, v]) => v > 0).map(([k, v]) => `${NARX_MANBA_NOMI[k as keyof typeof NARX_MANBA_NOMI]} ${v}`).join(', ');
  return [`Joriy F2: ${m.jami.ish} ish, ${m.jami.qator} qator. Narx manbalari: ${manba || '—'}.`,
    m.uchastkalar.length > 1 ? `UCHASTKA ARALASHUVI: ${m.uchastkalar.map((u) => `${u.nom} (${u.soni} qator)`).join('; ')} — odatda har uchastka alohida F2.` : `Uchastka: ${m.uchastkalar[0]?.nom ?? '—'} (aralashuv yo‘q)`,
    ...royxat('Xatolar (saqlashni to‘sadi)', xatolar, (q) => XATO[q.xato!] ?? q.xato!), ...royxat('Ogohlantirishlar', ogohlar, (q) => OGOH[q.ogoh!] ?? q.ogoh!),
    ...royxat('Ongli narxsiz', narxsiz, () => 'narxsiz'), summaMatn(m)].join('\n');
}

export const F2_AMAL_NOMI: Record<string, string> = { f2_hajm: 'F2 hajmi (kiritmaga)', faktdan_ol: 'Faktdan mumkin hajmni olish', narx: 'Narx (kiritmaga)', korsat: 'Jadvalda ko‘rsatish' };

/** Narx vositasi ko'rsatgan qiymatlar: qator id → ruxsat etilgan narxlar (to'qilgan narx bajarilmaydi). */
export type NarxRuxsat = Map<number, Set<number>>;
const narxKalit = (n: number) => Math.round(n * 100) / 100;

export function f2AmalTekshir(m: F2Malumot, a: SahifaAmal, narxlar: NarxRuxsat): string | null {
  if (a.tur === 'faktdan_ol') {
    if (a.qator == null && a.qiymat == null) return null;
    const kalit = f2Kalit(a.qiymat ?? a.qator);
    return kalit != null && m.ier.byKalit.has(kalit) ? null : 'Uchastka/bo‘lim topilmadi';
  }
  const j = a.qator != null ? f2Indeks(m).get(a.qator) : undefined;
  if (!j) return 'Qator topilmadi (AI bergan id sahifada yo‘q)';
  if (a.tur === 'korsat') return null;
  if (a.tur === 'f2_hajm') {
    if (j.tur === 'resurs' && j.r.avto) return 'Avtomatik resurs: hajmi ish hajmi × normadan';
    const v = sonOqi(a.qiymat ?? '');
    return typeof v === 'number' && v > 0 ? null : 'Hajm musbat son bo‘lishi kerak';
  }
  if (a.tur === 'narx') {
    if (j.tur !== 'resurs') return 'Ish qatorida narx yo‘q (narx resurslarda)';
    if ((a.qiymat ?? '').trim().toLowerCase() === 'narxsiz') return null;
    const v = sonOqi(a.qiymat ?? '');
    if (typeof v !== 'number' || v < 0) return 'Narx son emas';
    const ruxsat = narxlar.get(j.r.id);
    return ruxsat?.has(narxKalit(v)) ? null : 'Bu narx bazadagi manbalarda yo‘q (avval «narx» vositasi bilan manbani ko‘ring)';
  }
  return 'Noma’lum amal';
}

export function f2AmalTafsiloti(m: F2Malumot, a: SahifaAmal): string {
  if (a.tur === 'faktdan_ol') { const k = f2Kalit(a.qiymat ?? a.qator); const t = k != null ? m.ier.byKalit.get(k) : undefined; return ` · ${t ? t.nom : 'butun obyekt'}`; }
  const j = a.qator != null ? f2Indeks(m).get(a.qator) : undefined;
  const nom = !j ? `#${a.qator ?? '—'}` : j.tur === 'ish' ? `${j.ish.kod ? j.ish.kod + ' ' : ''}${j.ish.nom}` : `${j.r.kod ? j.r.kod + ' ' : ''}${j.r.nom}`;
  const birlik = j ? (j.tur === 'ish' ? j.ish.birlik : j.r.birlik) : null;
  return ` · ${nom}${a.qiymat ? ` · ${a.qiymat}${a.tur === 'f2_hajm' && birlik ? ` ${birlik}` : ''}` : ''}`;
}

export type F2OqishOpts = { narxManbalari?: (r: F2Resurs) => Promise<F2NarxVarianti[]> };
/** Narx manbalari: sahifadagi taklif (protokol → oldingi F2 → smeta) + mavjud narx takliflari xizmati; ko'rsatilganlar ruxsat ro'yxatiga. */
export async function f2Narx(m: F2Malumot, arg: string | null, narxlar: NarxRuxsat, o: F2OqishOpts): Promise<string> {
  const id = Number(String(arg ?? '').replace(/\D/g, ''));
  const j = f2Indeks(m).get(id);
  if (!j || j.tur !== 'resurs') return `Resurs [#${arg ?? ''}] topilmadi (narx faqat resurs qatorlarida).`;
  const r = j.r;
  const variantlar: F2NarxVarianti[] = [];
  if (r.taklifNarx != null) variantlar.push({ narx: r.taklifNarx, manba: `${NARX_MANBA_NOMI[r.taklifManba]} (sahifa taklifi)`, izoh: r.protokol ?? null });
  if (o.narxManbalari) for (const v of await o.narxManbalari(r).catch(() => [])) if (Number.isFinite(v.narx) && v.narx >= 0 && !variantlar.some((x) => x.narx === v.narx && x.manba === v.manba)) variantlar.push(v);
  const set = narxlar.get(r.id) ?? new Set<number>();
  for (const v of variantlar) set.add(narxKalit(v.narx));
  narxlar.set(r.id, set);
  if (!variantlar.length) return `${f2Satr(m, j)}\nBazada narx manbasi topilmadi. Narx to‘qilmaydi: foydalanuvchi hujjat bo‘yicha narx kiritadi yoki «narxsiz» belgilaydi (qiymat "narxsiz").`;
  const ortacha = variantlar.length > 1 ? variantlar.reduce((s, v) => s + v.narx, 0) / variantlar.length : null;
  return [f2Satr(m, j), `Narx manbalari (NDS siz, ${variantlar.length}):`, ...variantlar.map((v) => `- ${raqam(v.narx, 2)} — ${v.manba}${v.izoh ? ` (${v.izoh})` : ''}`),
    ...(ortacha != null ? [`(Ma’lumot uchun o‘rtacha: ${raqam(ortacha, 2)} — amalda faqat ro‘yxatdagi aniq qiymatlardan birini taklif qiling.)`] : [])].join('\n');
}

export async function f2Oqi(m: F2Malumot, s: OqishSorovi, narxlar: NarxRuxsat, o: F2OqishOpts = {}): Promise<string> {
  if (s.vosita === 'qidir') return f2Qidir(m, s.arg ?? '');
  if (s.vosita === 'holat') return s.arg ? f2Bolim(m, s.arg) : f2Kontekst(m);
  if (s.vosita === 'bolim') return f2Bolim(m, s.arg);
  if (s.vosita === 'tekshir') return f2Tekshir(m);
  if (s.vosita === 'narx') return f2Narx(m, s.arg, narxlar, o);
  return `Noma’lum vosita: ${s.vosita}`;
}

/** «Faktdan olish»: tanlangan uchastka/bo'lim (yoki butun obyekt) bo'limlari — sahifadagi `bolimniOl` ga beriladi. */
export function f2OlinadiganBolimlar(m: Pick<F2Malumot, 'bolimlar' | 'ier'>, kalit: number | null): F2Bolim[] {
  if (kalit == null) return [...m.bolimlar];
  const avlod = avlodKalitlari(m.ier, kalit);
  return m.bolimlar.filter((b) => avlod.has(b.id ?? -1));
}
