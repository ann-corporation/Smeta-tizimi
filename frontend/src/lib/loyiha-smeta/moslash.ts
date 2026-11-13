/**
 * moslash.ts — loyiha miqdorini smeta qatoriga moslash. Birlamchi kalit: smeta BO'LIM nomidagi varaq belgisi (masalan «…(КР-5)»);
 * bo'lim ichida tur / birlik / kalit raqamlar (beton sinfi, Ø, qalinlik) bo'yicha ball. Hech qachon avtomatik qabul qilinmaydi:
 * har nomzod ball va oddiy sabab bilan «taklif», odam tasdiqlaydi. Uskunalar -> faqat «odam tasdiqlashi kerak».
 */
import { birlikMosmi, birlikTahlil } from './birlik';
import { varaqKalit } from './tahlil';

export type SmetaQator = { id: number; ota_id: number | null; tur: string; kod?: string | null; nom: string; birlik: string | null; hajm: number | null; narx: number | null; kat?: string | null; tartib?: number | null };
export type MoslashSozlama = {
  /** Kompaniya bo'yicha sozlanadigan regex manbai: varaq belgisini bo'lim nomidan oladi (1-guruh yoki butun moslik). */
  belgiRegex: string;
  /** Shu balldan past nomzod ko'rsatilmaydi. */
  minBall: number;
  /** «Ishonchli» belgisi chegarasi (baribir odam tasdiqlaydi). */
  ishonchliBall: number;
  ishonchliFarq: number;
};
export const MOSLASH_STANDART: MoslashSozlama = {
  belgiRegex: '(?:^|[^A-Za-zА-Яа-я])((?:КЖ|КР|КМ|КД|АР|АС|ГП|ЭО|ЭМ|ЭС|ВК|ОВ|ТХ|KJ|KR|KM|AR|AS)[-\\s]?\\d+(?:[.,]\\d+)*)(?![0-9A-Za-zА-Яа-я])',
  minBall: 0.35, ishonchliBall: 0.75, ishonchliFarq: 0.15,
};

export type MoslashSababi = 'bolim_belgi' | 'bolim_yoq' | 'birlik_mos' | 'birlik_farq' | 'tur_mos' | 'sinf_mos' | 'sinf_farq' | 'sinf_daraja' | 'sinf_daraja_farq' | 'diametr_mos' | 'qalinlik_mos' | 'soz_mos';
export type Nomzod = { qatorId: number; ball: number; sabab: MoslashSababi[]; bolimNomi: string | null };
export type MoslashNatija = { odamKerak: boolean; ishonchli: boolean; nomzodlar: Nomzod[] };

export type LoyihaElement = { nom: string; belgi?: string | null; birlik: string; tur: string; varaq: string | null };

/** Qator nomidan varaq belgilarini oladi (bir nomda bir nechta bo'lishi mumkin). */
export function nomdanBelgilar(nom: string, regexManba: string = MOSLASH_STANDART.belgiRegex): Set<string> {
  const out = new Set<string>();
  let re: RegExp;
  try { re = new RegExp(regexManba, 'gi'); } catch { return out; }
  for (const m of nom.matchAll(re)) {
    const t = m[1] ?? m[0];
    // «КР-2,87» = 2-varaq va 87-varaq (vergul ro'yxat, nuqta — kichik raqam)
    const pre = /^([A-Za-zА-Яа-я]+)[-\s]?/.exec(t)?.[1];
    const qism = t.split(',');
    if (pre && qism.length > 1 && qism.every((x, i) => i === 0 || /^\d+(?:\.\d+)?$/.test(x.trim()))) for (let i = 0; i < qism.length; i++) out.add(varaqKalit(i === 0 ? qism[0] : pre + '-' + qism[i].trim()));
    else out.add(varaqKalit(t));
  }
  return out;
}

/** Bargni (ish qatori) o'z bo'limlari zanjiri bilan: bo'lim nomlari va ulardan olingan belgilar. */
export function bolimXaritasi(qatorlar: SmetaQator[], regexManba?: string, qolda?: ReadonlyMap<string, ReadonlySet<number>>): Map<number, { belgilar: Set<string>; bolimNomi: string | null }> {
  const byId = new Map(qatorlar.map((q) => [q.id, q] as const));
  const keshlar = new Map<number, { belgilar: Set<string>; bolimNomi: string | null }>();
  const yech = (id: number, chuqurlik = 0): { belgilar: Set<string>; bolimNomi: string | null } => {
    const k = keshlar.get(id); if (k) return k;
    const q = byId.get(id);
    if (!q || chuqurlik > 12) return { belgilar: new Set(), bolimNomi: null };
    const ota = q.ota_id != null ? yech(q.ota_id, chuqurlik + 1) : { belgilar: new Set<string>(), bolimNomi: null };
    const bolim = q.tur === 'rz' || q.tur === 'bl';
    const joriy = bolim ? nomdanBelgilar(q.nom, regexManba) : new Set<string>();
    if (bolim && qolda) for (const [v, ids] of qolda) if (ids.has(q.id)) joriy.add(v);   // PTO qo'lda (yoki tasdiqlangan taklif) bog'lagan varaq
    const r = { belgilar: new Set([...ota.belgilar, ...joriy]), bolimNomi: bolim && joriy.size ? q.nom : ota.bolimNomi };
    keshlar.set(id, r);
    return r;
  };
  for (const q of qatorlar) yech(q.id);
  return keshlar;
}

const TUR_SOZ: Record<string, RegExp> = {
  beton: /бетон|железобетон|б\/б/i,
  armatura: /арматур|сетк|каркас/i,
  pardoz: /штукатур|окраск|облицов|покрас|шпатл|плитк|обои|затирк/i,
  eshik_oyna: /двер|окн|окон|витраж|блок/i,
};

/** Kalit raqamlar: beton sinfi (B25/M300), diametr (Ø12), qalinlik (150 мм). */
export function kalitRaqamlar(nom: string): { sinf: string | null; diametr: string | null; qalinlik: string | null } {
  const t = nom.replace(/,/g, '.');
  const sinf = /(?:^|[^A-Za-zА-Яа-я])([BВ]\s?\d{1,2}(?:[.,]\d)?|[MМ]\s?\d{2,3})(?![0-9])/i.exec(t);
  const diam = /(?:[ØøФф∅]|d=?)\s?(\d{1,2})(?![0-9])/.exec(t);
  const qal = /(\d{2,4})\s?мм/i.exec(t);
  const kanon = (s: string) => s.toUpperCase().replace(/\s/g, '').replace('В', 'B').replace('М', 'M');
  return { sinf: sinf ? kanon(sinf[1]) : null, diametr: diam ? diam[1] : null, qalinlik: qal ? qal[1] : null };
}

const sozlar = (s: string) => new Set(s.toLowerCase().replace(/[^a-zа-я0-9]+/g, ' ').split(' ').filter((w) => w.length > 3));

/** Bitta loyiha elementi uchun nomzodlar. Hech qachon avto-qabul emas. */
export function moslash(el: LoyihaElement, qatorlar: SmetaQator[], xarita: ReturnType<typeof bolimXaritasi>, soz: MoslashSozlama = MOSLASH_STANDART): MoslashNatija {
  if (el.tur === 'uskuna') return { odamKerak: true, ishonchli: false, nomzodlar: [] };
  const belgi = el.varaq ? varaqKalit(el.varaq) : null;
  const barglar = qatorlar.filter((q) => q.tur === 'bl');
  const bolimda = belgi ? barglar.filter((q) => xarita.get(q.id)?.belgilar.has(belgi)) : [];
  const nomzodHavzasi = bolimda.length > 0 ? bolimda : barglar;
  const bolimBor = bolimda.length > 0;
  const el_k = kalitRaqamlar(`${el.nom} ${el.belgi ?? ''}`);
  const el_soz = sozlar(el.nom);
  const turRe = TUR_SOZ[el.tur];
  const out: Nomzod[] = [];
  for (const q of nomzodHavzasi) {
    const sabab: MoslashSababi[] = [];
    let ball = 0;
    if (bolimBor) { ball += 0.3; sabab.push('bolim_belgi'); } else sabab.push('bolim_yoq');
    const q_b = birlikTahlil(q.birlik).baza; const e_b = birlikTahlil(el.birlik).baza;
    if (q_b && e_b) {
      if (birlikMosmi(q.birlik, el.birlik)) { ball += 0.25; sabab.push('birlik_mos'); } else { sabab.push('birlik_farq'); continue; }
    }
    if (turRe) { if (turRe.test(q.nom)) { ball += 0.2; sabab.push('tur_mos'); } else if (el.tur !== 'boshqa') continue; }
    const qk = kalitRaqamlar(q.nom);
    if (el.tur === 'beton' && el_k.sinf) {
      const n = Number(el_k.sinf.replace(/[^0-9.]/g, ''));
      const tayyorgarlik = /подготовк/i.test(q.nom);
      if (n <= 12.5 && tayyorgarlik) { ball += 0.15; sabab.push('sinf_daraja'); }
      else if (n >= 20 && tayyorgarlik) { ball -= 0.2; sabab.push('sinf_daraja_farq'); }
      else if (n >= 20) { ball += 0.1; sabab.push('sinf_daraja'); }
    }
    if (el_k.sinf && qk.sinf) { if (el_k.sinf === qk.sinf) { ball += 0.2; sabab.push('sinf_mos'); } else { ball -= 0.1; sabab.push('sinf_farq'); } }
    if (el_k.diametr && qk.diametr && el_k.diametr === qk.diametr) { ball += 0.15; sabab.push('diametr_mos'); }
    if (el_k.qalinlik && qk.qalinlik && el_k.qalinlik === qk.qalinlik) { ball += 0.1; sabab.push('qalinlik_mos'); }
    const q_soz = sozlar(q.nom);
    const umum = [...el_soz].filter((w) => q_soz.has(w)).length;
    if (umum > 0) { ball += Math.min(0.15, umum * 0.05); sabab.push('soz_mos'); }
    ball = Math.max(0, Math.min(1, ball));
    // Bo'lim kaliti bo'lmasa — ball yuqori chegaradan past qoladi (qo'lda tanlov kerak).
    if (!bolimBor) ball = Math.min(ball, 0.5);
    if (ball >= soz.minBall) out.push({ qatorId: q.id, ball: Math.round(ball * 1000) / 1000, sabab, bolimNomi: xarita.get(q.id)?.bolimNomi ?? null });
  }
  out.sort((a, b) => b.ball - a.ball || a.qatorId - b.qatorId);
  const top = out.slice(0, 3);
  const ishonchli = top.length > 0 && top[0].ball >= soz.ishonchliBall && (top.length === 1 || top[0].ball - top[1].ball >= soz.ishonchliFarq);
  return { odamKerak: top.length === 0, ishonchli, nomzodlar: top };
}
