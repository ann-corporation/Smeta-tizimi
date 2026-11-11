/**
 * FAKT oynasi uchun AI yordamchi vositalari (sof funksiyalar — test qilinadi).
 * Hammasi foydalanuvchi sessiyasida o'qilgan REAL ma'lumotdan (jurnal modeli, t2_qator_holat, «bajarilmaydi» qatlami):
 * raqam, shifr va narx to'qilmaydi; summa NDS siz, ustamasiz + ustamali (ustamali — SummaJuft bilan bir xil hisob).
 */
import type { BolimSumma, JurnalBolim, JurnalHolat, JurnalIsh, JurnalQator, SummaKesim } from '../fakt-jurnal';
import { qidiruvTayyorla } from '../qidiruv-normalizatsiya';
import { qoldiqHajmi } from '../zamena-qoldiq';
import type { OqishSorovi, SahifaAmal } from './protokol';

export type UstamaliFn = (s: SummaKesim) => { ustamali: number | null; taxminiy: boolean };
export type FaktMalumot = {
  obyektNomi?: string;
  bolimlar: readonly JurnalBolim[];
  bolimIshlari: ReadonlyMap<number, JurnalIsh[]>;
  holatMap: ReadonlyMap<number, JurnalHolat>;
  summalar: ReadonlyMap<number, BolimSumma>;
  bajHajm: ReadonlyMap<number, number>;
  ustamali?: UstamaliFn;
  /** Ishdan keyingi alohida materiallar taklifi soni (FaktJurnal hisobi). */
  materialTakliflari?: (ishId: number) => number;
  /** Kiritmadagi (saqlanmagan) qiymatlar soni — kontekst uchun. */
  kiritmaSoni?: number;
};

export type FaktQatorJoyi = { q: JurnalQator; ish: JurnalIsh | null; bolimId: number; avto: boolean };

const raqam = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d }));
const foiz = (u: number | null) => (u == null ? '—' : `${Math.round(u * 100)}%`);
const pul = (v: number | null | undefined) => (v == null ? '—' : `${raqam(v, 0)} so‘m`);

export function faktIndeks(m: Pick<FaktMalumot, 'bolimIshlari'>): Map<number, FaktQatorJoyi> {
  const out = new Map<number, FaktQatorJoyi>();
  for (const [bolimId, ishlar] of m.bolimIshlari) for (const ish of ishlar) {
    out.set(ish.id, { q: ish, ish: ish.tur === 'bl' ? ish : null, bolimId, avto: false });
    for (const r of ish.resurslar) out.set(r.id, { q: r, ish, bolimId, avto: false });
    for (const r of ish.avtomatik) out.set(r.id, { q: r, ish, bolimId, avto: true });
  }
  return out;
}

const bolimYoli = (m: Pick<FaktMalumot, 'bolimlar'>, id: number) => {
  const by = new Map(m.bolimlar.map((b) => [b.id, b]));
  const yol: string[] = []; let b = by.get(id); let n = 0;
  while (b && n++ < 20) { yol.unshift(b.nom); b = b.otaId != null ? by.get(b.otaId) : undefined; }
  return yol.join(' › ');
};

const TUR: Record<JurnalQator['tur'], string> = { bl: 'ISH', mat: 'MAT', ob: 'OB', rs: 'RES(avto)' };
/** Bitta qator — model o'qiydigan qisqa satr ([#id] — amal uchun yagona havola). */
export function qatorSatri(m: Pick<FaktMalumot, 'holatMap' | 'bajHajm'>, j: Pick<FaktQatorJoyi, 'q' | 'avto'>): string {
  const { q } = j; const h = m.holatMap.get(q.id);
  const f2 = h?.f2_hajm == null ? null : Number(h.f2_hajm);
  const qoldiq = h?.qoldiq_hajm != null ? Number(h.qoldiq_hajm) : qoldiqHajmi(q.smeta, f2, q.almashtirilgan);
  const narx = h?.smeta_narx == null ? null : Number(h.smeta_narx);
  const belgi = [q.zamena && `zamena${q.aslNom ? ` (asl: ${q.aslNom})` : ''}`, q.qoshimcha && 'smetadan tashqari', q.almashtirilgan && `almashtirilgan ${raqam(q.almashtirilgan)}`,
    (m.bajHajm.get(q.id) ?? 0) > 0 && `bajarilmaydi ${raqam(m.bajHajm.get(q.id))}`, q.holat === 'oshdi' && 'SMETADAN OSHDI', qoldiq != null && qoldiq < -1e-9 && (q.smeta ?? 0) >= 0 && 'QOLDIQDAN OSHDI',
    q.holat === 'smetasiz' && 'smetasiz fakt', (q.tur === 'mat' || q.tur === 'ob') && narx == null && 'narxsiz'].filter(Boolean).join(', ');
  return `[#${q.id}] ${TUR[q.tur]} ${q.kod ?? ''} ${q.nom} | ${q.birlik ?? '—'} | smeta ${raqam(q.smeta)} · F2 ${raqam(f2)} · fakt ${raqam(q.fakt)} · qoldiq ${raqam(qoldiq)} · ${foiz(q.ulush)}`
    + (narx != null ? ` · narx ${raqam(narx, 2)}` : '') + (q.norma != null && j.avto ? ` · norma ${raqam(q.norma, 6)}` : '') + (belgi ? ` | ${belgi}` : '');
}

const summaMatn = (m: FaktMalumot, s: SummaKesim | undefined) => {
  if (!s || s.ustamasiz == null) return 'noma’lum';
  const u = m.ustamali?.(s);
  const ust = u?.ustamali == null ? 'ustamali noma’lum' : `ustamali ${u.taxminiy ? '≈ ' : ''}${pul(u.ustamali)}`;
  return `ustamasiz ${pul(s.ustamasiz)}; ${ust}${s.kesim.summasizSoni ? `; ${s.kesim.summasizSoni} ta qator narxsiz (summaga kirmagan)` : ''}`;
};
export const summalarBloki = (m: FaktMalumot, id: number) => {
  const s = m.summalar.get(id);
  if (!s) return 'Summalar: noma’lum';
  return [`Smeta: ${summaMatn(m, s.smeta)}`, `F2: ${summaMatn(m, s.f2)}`, `Fakt: ${summaMatn(m, s.fakt)}`, `Qoldiq: ${summaMatn(m, s.qoldiq)}`].join('\n') + '\n(narxlar NDS siz; NDS faqat oxirida 12%)';
};

/** Kontekst xulosasi: obyekt, yuqori bo'limlar [#id] bilan, jami summalar. */
export function faktKontekst(m: FaktMalumot): string {
  const top = m.bolimlar.filter((b) => b.otaId == null);
  const ulush = top.filter((b) => b.ulush != null);
  const obUlush = ulush.length ? ulush.reduce((s, b) => s + (b.ulush ?? 0), 0) / ulush.length : null;
  const ishSoni = m.bolimlar.filter((b) => b.otaId == null).reduce((s, b) => s + b.ishSoni, 0);
  return [`Sahifa: Fakt jurnali${m.obyektNomi ? ` — obyekt «${m.obyektNomi}»` : ''}. Bajarilish ${foiz(obUlush)}; ${ishSoni} ish.`,
    `Saqlanmagan kiritmalar: ${m.kiritmaSoni ?? 0}.`,
    `Yuqori bo'limlar (${top.length}):`, ...top.slice(0, 60).map((b) => `- [#${b.id}] ${b.nom}: ${b.tugaganSoni}/${b.ishSoni} ish bajarilgan, ${foiz(b.ulush)}`),
    'Obyekt jami:', summalarBloki(m, 0)].join('\n');
}

/** Qidiruv: butun obyekt daraxti (ish + resurslar), shifr/nom; to'liq ibora topilmasa — so'zlar bo'yicha (ma'no yaqinligi). */
export function faktQidir(m: FaktMalumot, sorov: string, limit = 25): string {
  const q = sorov.trim();
  if (q.length < 2) return 'Qidiruv so‘zi juda qisqa.';
  const ind = faktIndeks(m);
  const matn = (j: FaktQatorJoyi) => `${j.q.kod ?? ''} ${j.q.nom}`;
  const toliq = qidiruvTayyorla(q);
  let topildi = [...ind.values()].filter((j) => toliq(matn(j)));
  let usul = 'aniq';
  if (!topildi.length) {
    const sozlar = q.split(/[\s,;.]+/).filter((s) => s.length >= 3).map((s) => qidiruvTayyorla(s));
    if (sozlar.length) {
      const ball = [...ind.values()].map((j) => ({ j, b: sozlar.filter((f) => f(matn(j))).length })).filter((x) => x.b > 0);
      ball.sort((a, b) => b.b - a.b);
      topildi = ball.map((x) => x.j); usul = 'so‘zlar bo‘yicha (yaqin)';
    }
  }
  if (!topildi.length) return `«${q}» bo‘yicha hech narsa topilmadi.`;
  const qism = topildi.slice(0, limit);
  return [`Topildi: ${topildi.length} (${usul})${topildi.length > limit ? `, birinchi ${limit} tasi` : ''}:`,
    ...qism.map((j) => `${qatorSatri(m, j)} | bo‘lim [#${j.bolimId}] ${bolimYoli(m, j.bolimId)}${j.ish && j.ish.id !== j.q.id ? ` | ishi [#${j.ish.id}]` : ''}`)].join('\n');
}

/** Bo'lim va barcha avlod bo'limlari id lari. */
function avlodlar(m: Pick<FaktMalumot, 'bolimlar'>, id: number): number[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const b of m.bolimlar) if (b.otaId === out[i]) out.push(b.id);
  return out;
}

/** Holat: obyekt yoki bo'lim — 0% bo'limlar, oshganlar, F2 > fakt, smetasiz fakt, bajarilmaydi, summalar. */
export function faktHolat(m: FaktMalumot, bolimArg: string | null): string {
  const id = bolimArg ? Number(String(bolimArg).replace(/\D/g, '')) : 0;
  const bolim = id ? m.bolimlar.find((b) => b.id === id) : undefined;
  if (id && !bolim) return `Bo‘lim [#${bolimArg}] topilmadi.`;
  const idlar = bolim ? avlodlar(m, bolim.id) : m.bolimlar.map((b) => b.id);
  const ind = faktIndeks(m);
  const joylar = [...ind.values()].filter((j) => idlar.includes(j.bolimId) && !j.avto);
  const ishlar = joylar.filter((j) => j.ish == null || j.ish.id === j.q.id);
  const oshgan = joylar.filter((j) => j.q.holat === 'oshdi');
  const qoldiqdan = joylar.filter((j) => { const h = m.holatMap.get(j.q.id); return h?.qoldiq_hajm != null && Number(h.qoldiq_hajm) < -1e-9 && (j.q.smeta ?? 0) >= 0; });
  const f2Kop = ishlar.filter((j) => Number(m.holatMap.get(j.q.id)?.f2_hajm ?? 0) - j.q.fakt > 1e-9);
  const smetasiz = joylar.filter((j) => j.q.holat === 'smetasiz');
  const baj = joylar.filter((j) => (m.bajHajm.get(j.q.id) ?? 0) > 0);
  const nol = m.bolimlar.filter((b) => idlar.includes(b.id) && b.ishSoni > 0 && (b.ulush ?? 0) === 0);
  const holatSoni = (h: JurnalQator['holat']) => ishlar.filter((j) => j.q.holat === h).length;
  const royxat = (sar: string, l: FaktQatorJoyi[], n = 15) => (l.length ? [`${sar} (${l.length}):`, ...l.slice(0, n).map((j) => `- ${qatorSatri(m, j)}`), ...(l.length > n ? [`… yana ${l.length - n} ta`] : [])] : [`${sar}: yo‘q`]);
  return [bolim ? `Bo‘lim [#${bolim.id}] ${bolimYoli(m, bolim.id)}: ${bolim.tugaganSoni}/${bolim.ishSoni} ish bajarilgan, ${foiz(bolim.ulush)}` : `Butun obyekt: ${ishlar.length} ish/alohida resurs`,
    `Holatlar: boshlanmagan ${holatSoni('yangi')}, jarayonda ${holatSoni('qisman')}, bajarilgan ${holatSoni('tugadi')}, smetadan oshgan ${holatSoni('oshdi')}, smetasiz ${holatSoni('smetasiz')}`,
    ...(nol.length ? [`Fakt 0% bo‘limlar (${nol.length}): ${nol.slice(0, 25).map((b) => `[#${b.id}] ${b.nom}`).join('; ')}`] : ['Fakt 0% bo‘lim yo‘q']),
    ...royxat('Smetadan oshgan', oshgan), ...royxat('Qoldiqdan oshgan (smeta − F2 − almashtirilgan dan ko‘p)', qoldiqdan),
    ...royxat('F2 hajmi faktdan ko‘p (Fakt = F2 bilan tenglash mumkin)', f2Kop), ...royxat('Smetasiz fakt', smetasiz, 10), ...royxat('Bajarilmaydi deb belgilangan', baj, 10),
    'Summalar:', summalarBloki(m, bolim ? bolim.id : 0)].join('\n');
}

/** Bo'lim (ichki bo'limlari bilan) ishlari va resurslari raqamlari. */
export function faktBolim(m: FaktMalumot, bolimArg: string | null, limit = 60): string {
  const id = Number(String(bolimArg ?? '').replace(/\D/g, ''));
  const bolim = m.bolimlar.find((b) => b.id === id);
  if (!bolim) return `Bo‘lim [#${bolimArg ?? ''}] topilmadi. Bo‘lim id sini xulosadan yoki holat/qidir natijasidan oling.`;
  const out: string[] = [`Bo‘lim [#${bolim.id}] ${bolimYoli(m, bolim.id)} — ${foiz(bolim.ulush)}`];
  let n = 0;
  for (const bid of avlodlar(m, bolim.id)) {
    const ishlar = m.bolimIshlari.get(bid) ?? [];
    if (!ishlar.length) continue;
    if (bid !== bolim.id) out.push(`## [#${bid}] ${bolimYoli(m, bid)}`);
    for (const ish of ishlar) {
      if (n++ >= limit) { out.push(`… (cheklov ${limit} ish; aniqroq bo‘lim yoki qidir dan foydalaning)`); return out.join('\n'); }
      out.push(qatorSatri(m, { q: ish, avto: false }) + (m.materialTakliflari && ish.tur === 'bl' && m.materialTakliflari(ish.id) ? ` | material taklifi: ${m.materialTakliflari(ish.id)} ta` : ''));
      for (const r of ish.resurslar) out.push('  └ ' + qatorSatri(m, { q: r, avto: false }));
      for (const r of ish.avtomatik.slice(0, 6)) out.push('  └ ' + qatorSatri(m, { q: r, avto: true }));
    }
  }
  return out.join('\n');
}

export const FAKT_AMAL_NOMI: Record<string, string> = {
  fakt_hajm: 'Fakt hajmi (kiritmaga)', material_ol: 'Materiallarni ham olish', zamena: 'Zamena oynasi', bajarilmaydi: '«Bajarilmaydi» oynasi', korsat: 'Jadvalda ko‘rsatish',
};

const HAJM = /^([+=])\s*(-?\d+(?:[.,]\d+)?)$/;
export function faktHajmOqi(qiymat: string | null): { rejim: '+' | '='; qiymat: string } | null {
  const x = HAJM.exec((qiymat ?? '').replace(/\s+/g, ''));
  return x ? { rejim: x[1] as '+' | '=', qiymat: x[2].replace(',', '.') } : null;
}

/** Amal taklifini tekshirish: null — bajarish mumkin; matn — nega mumkin emas. `normativlar` — normativ vositasi bergan id lar. */
export function faktAmalTekshir(m: FaktMalumot, a: SahifaAmal, normativlar: ReadonlySet<string>): string | null {
  const j = a.qator != null ? faktIndeks(m).get(a.qator) : undefined;
  if (!j) return 'Qator topilmadi (AI bergan id sahifada yo‘q)';
  const q = j.q;
  switch (a.tur) {
    case 'fakt_hajm': {
      if (j.avto) return 'Avtomatik resurs: fakti norma × ish faktidan hisoblanadi';
      const h = faktHajmOqi(a.qiymat);
      if (!h) return 'Hajm «+5» yoki «=40» ko‘rinishida emas';
      if (h.rejim === '+' && Number(h.qiymat) === 0) return '0 qo‘shilmaydi';
      return null;
    }
    case 'material_ol': return q.tur !== 'bl' ? 'Faqat ish qatori uchun' : (m.materialTakliflari?.(q.id) ?? 0) > 0 ? null : 'Bu ishdan keyin olinadigan material taklifi yo‘q';
    case 'zamena': {
      if (q.otaId == null || q.qoshimcha || q.zamena) return 'Bu qatorga zamena qilinmaydi (qo‘shilgan yoki zamena qatori)';
      if (q.tur === 'bl' && a.qiymat) { const id = a.qiymat.replace(/^N:/i, ''); if (!normativlar.has(id)) return 'Normativ pozitsiya katalog natijasida yo‘q'; }
      return null;
    }
    case 'bajarilmaydi': {
      if (j.avto) return 'Avtomatik resurs — ishning o‘ziga belgilang';
      if (a.qiymat != null && !Number.isFinite(Number(a.qiymat.replace(',', '.')))) return 'Hajm son bo‘lishi kerak (minus ham mumkin)';
      return null;
    }
    case 'korsat': return null;
    default: return 'Noma’lum amal';
  }
}

/** Amal yorlig'i: «Fakt hajmi · Е06-001 Beton · +5 (yangi fakt 17 / smeta 40)». */
export function faktAmalTafsiloti(m: FaktMalumot, a: SahifaAmal): string {
  const j = a.qator != null ? faktIndeks(m).get(a.qator) : undefined;
  const nom = j ? `${j.q.kod ? j.q.kod + ' ' : ''}${j.q.nom}` : `#${a.qator ?? '—'}`;
  let qiymat = a.qiymat ?? '';
  if (a.tur === 'fakt_hajm' && j) {
    const h = faktHajmOqi(a.qiymat);
    if (h) { const yangi = h.rejim === '+' ? j.q.fakt + Number(h.qiymat) : Number(h.qiymat); qiymat = `${a.qiymat} → ${raqam(yangi)}${j.q.smeta != null ? ` / ${raqam(j.q.smeta)}` : ''} ${j.q.birlik ?? ''}`.trim(); }
  }
  return ` · ${nom}${qiymat ? ` · ${qiymat}` : ''}`;
}

export type FaktOqishOpts = { normativ?: (tavsif: string) => Promise<Array<{ id: string; kod: string; nom: string; birlik: string | null; jadval?: string | null }>> };
/** O'qish vositalari dispetcheri. `normativlar` — topilgan normativ id lar shu to'plamga qo'shiladi (zamena tekshiruvi uchun). */
export async function faktOqi(m: FaktMalumot, s: OqishSorovi, normativlar: Set<string>, o: FaktOqishOpts = {}): Promise<string> {
  if (s.vosita === 'qidir') return faktQidir(m, s.arg ?? '');
  if (s.vosita === 'holat') return faktHolat(m, s.arg);
  if (s.vosita === 'bolim') return faktBolim(m, s.arg);
  if (s.vosita === 'normativ') {
    if (!o.normativ) return 'Normativ katalog mavjud emas.';
    const tavsif = (s.arg ?? '').trim();
    if (tavsif.length < 3) return 'Ish tavsifi kerak.';
    const l = await o.normativ(tavsif);
    for (const n of l) normativlar.add(n.id);
    return l.length ? [`Normativ katalog nomzodlari (${l.length}) — zamena qiymati "N:<id>":`, ...l.map((n) => `[N:${n.id}] ${n.kod} ${n.nom} | ${n.birlik ?? '—'}${n.jadval ? ` | ${n.jadval}` : ''}`)].join('\n')
      : `«${tavsif}» bo‘yicha normativ pozitsiya topilmadi — tavsifni ruscha normativ so‘zlar bilan aniqlashtiring.`;
  }
  return `Noma’lum vosita: ${s.vosita}`;
}
