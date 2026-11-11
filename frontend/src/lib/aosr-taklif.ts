/**
 * ESKI АОСР → smeta qatori TAKLIFLARI — sof mantiq (tarmoq/UI yo'q).
 *
 * Muammo: ESKI-REESTR dan import qilingan aktlar smeta qatoriga bog'lanmagan; akt nomlari erkin matn, smeta nomlari
 * normativ — ommaviy avto-bog'lash noaniq. Shuning uchun: har akt uchun 1–3 TAKLIF (ball + sabab), bog'lashni
 * FAQAT PTO bosish bilan tasdiqlaydi (bu modul hech narsa yozmaydi).
 *
 * Ball (0..1): idf-vaznli nom o'xshashligi + ish turi mosligi (armirovka, betonlash, gidroizolyatsiya …) + konstruktiv
 * element mosligi (poydevor, plita, ustun …) + akt matni ↔ razdel nomi o'xshashligi + fakt>0 ustunligi.
 * Ish turi zid bo'lsa (ikkalasida bor, kesishmaydi) ball tushiriladi. Noma'lum — taxmin qilinmaydi (taklif yo'q).
 */
import type { AosrV2 } from '../api/t2-ijro';
import type { QatorMeta } from './ijro-tayyorla';
import { razdelXaritasi } from './ijro-tayyorla';

export const ESKI_REESTR_BELGI = 'ESKI-REESTR';

/** Eski reestrdan kelgan, hali bekor qilinmagan va birorta ham smeta qatoriga bog'lanmagan aktlar. */
export function boglanmaganEskiAktlar(aktlar: ReadonlyArray<Pick<AosrV2, 'id' | 'izoh' | 'holat' | 'boglangan_ish_soni'>>): number[] {
  return aktlar
    .filter((a) => a.holat !== 'bekor' && String(a.izoh ?? '').trim().toUpperCase().startsWith(ESKI_REESTR_BELGI) && Number(a.boglangan_ish_soni ?? 0) === 0)
    .map((a) => a.id);
}

const TO_XTA = new Set(['для', 'при', 'под', 'над', 'без', 'или', 'как', 'все', 'вид', 'тип', 'ввод', 'акт', 'работ', 'работы', 'устройство', 'ustanovka', 'bilan', 'uchun', 'dan', 'va']);

/** Ildizga yaqinlashtirish: kichik harf, ё→е, birinchi 5 harf (rus/o'zbek qo'shimchalariga chidamli). */
export function ildizlar(matn: string | null | undefined): string[] {
  const t = String(matn ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[ʻʼ’‘`']/g, '');
  const sozlar = t.match(/[a-zа-яўқғҳ]{3,}/g) ?? [];
  const out: string[] = [];
  for (const s of sozlar) {
    if (TO_XTA.has(s)) continue;
    out.push(s.length > 5 ? s.slice(0, 5) : s);
  }
  return out;
}

/** Ish turi guruhlari (ildiz → guruh). Ikkala til: rus va o'zbek lotin. */
const ISH_TURI: Record<string, string[]> = {
  armatura: ['армир', 'арма', 'армат', 'armat', 'armir'],
  beton: ['бетон', 'beton', 'бетони'],
  opalubka: ['опал', 'opalu', 'щитов'],
  gidroizol: ['гидро', 'gidro', 'изоля', 'izola', 'оклее', 'обмаз', 'мастик'],
  kladka: ['кладк', 'klad', 'gisht', 'gʻish', 'кирпи'],
  zasipka: ['засып', 'zasip', 'уплот', 'уплотн', 'обрат', 'tuproq', 'грунт', 'котло', 'kotlo'],
  asos: ['подго', 'основ', 'osto', 'щебен', 'песча', 'tayan', 'tayyor'],
  montaj: ['монта', 'montaj', 'установ', 'укладк', 'ukladk'],
  shtukatur: ['штука', 'shtuk', 'стяжк', 'styaj'],
  isitish: ['утепл', 'утепи', 'izolyats', 'isitg'],
  dazmol: ['покра', 'окраск', 'rang', 'грунтов'],
  tom: ['кровл', 'krovl', 'tom'],
};
/** Konstruktiv element guruhlari. */
const ELEMENT: Record<string, string[]> = {
  poydevor: ['фунда', 'poyde', 'фундам', 'лента', 'lenta', 'ростве'],
  plita: ['плита', 'плит', 'plita', 'перек'],
  ustun: ['колон', 'ustun', 'колонн'],
  devor: ['стена', 'стен', 'devor', 'перег'],
  balka: ['балка', 'балк', 'riger', 'ригел', 'прогон'],
  zina: ['лестн', 'zina', 'марш', 'площа'],
  pol: ['пол', 'pol', 'полы', 'стяжк'],
  tom: ['кровл', 'крыша', 'tom', 'парап', 'кровли'],
  kanal: ['канал', 'труб', 'truba', 'колод', 'лоток'],
  asos: ['основ', 'osto', 'подго'],
};

function guruhla(stems: readonly string[], lugat: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const s of stems) for (const [g, ildiz] of Object.entries(lugat)) if (ildiz.some((k) => { const kk = k.slice(0, 5); return s === kk || (kk.length >= 4 && s.startsWith(kk)); })) out.add(g);
  return out;
}

export type Taklif = {
  qatorId: number; ball: number; nom: string; razdelId: number | null; razdelNom: string; faktBor: boolean;
  /** Ekranda ko'rsatiladigan qisqa sabablar («ish turi mos», «element mos», «fakt bor» …). */
  sabab: string[];
};

export type TaklifIsh = { id: number; nom: string; razdelId: number | null; razdelNom: string; faktBor: boolean; stems: string[]; ishTuri: Set<string>; element: Set<string> };

/** Smeta daraxtidan faol ISH (tur='bl') nomzodlari. Fakt>0 belgisi coverage dan (fakt hajmi bor qatorlar). */
export function ishNomzodlari(meta: readonly QatorMeta[], faktQatorlar: ReadonlySet<number>): TaklifIsh[] {
  const rz = razdelXaritasi(meta);
  return meta.filter((m) => m.tur === 'bl' && String(m.nom ?? '').trim()).map((m) => {
    const r = rz.get(m.id);
    const stems = ildizlar(m.nom);
    return { id: m.id, nom: String(m.nom), razdelId: r?.id ?? null, razdelNom: r?.nom ?? '', faktBor: faktQatorlar.has(m.id), stems, ishTuri: guruhla(stems, ISH_TURI), element: guruhla(stems, ELEMENT) };
  });
}

type AktKirish = Pick<AosrV2, 'id' | 'ish_nomi' | 'ish_tavsifi'>;

const sobit = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Har akt uchun eng ko'pi bilan `n` (3) ta taklif, ball kamayish tartibida; `minBall` dan past — taklif qilinmaydi.
 * Teng ballda fakt>0 qator oldin, keyin kichik id (barqaror tartib).
 */
export function takliflarQur(aktlar: readonly AktKirish[], ishlar: readonly TaklifIsh[], o: { n?: number; minBall?: number } = {}): Map<number, Taklif[]> {
  const n = o.n ?? 3; const minBall = o.minBall ?? 0.3;
  const natija = new Map<number, Taklif[]>();
  if (!ishlar.length) return natija;
  // idf: nom ildizlari bo'yicha hujjat chastotasi (barcha nomzod ishlar).
  const df = new Map<string, number>();
  for (const i of ishlar) for (const s of new Set(i.stems)) df.set(s, (df.get(s) ?? 0) + 1);
  const N = ishlar.length;
  const idf = (s: string) => Math.log(1 + N / (1 + (df.get(s) ?? 0)));
  const indeks = new Map<string, number[]>();
  ishlar.forEach((i, k) => { for (const s of new Set(i.stems)) { const a = indeks.get(s); if (a) a.push(k); else indeks.set(s, [k]); } });
  const ishNorma = ishlar.map((i) => Math.sqrt([...new Set(i.stems)].reduce((x, s) => x + idf(s) ** 2, 0)) || 1);
  const razdelIldiz = new Map<number | null, Set<string>>();
  for (const i of ishlar) if (!razdelIldiz.has(i.razdelId)) razdelIldiz.set(i.razdelId, new Set(ildizlar(i.razdelNom)));

  for (const a of aktlar) {
    const matn = `${a.ish_nomi ?? ''} ${a.ish_tavsifi ?? ''}`;
    const nomStems = ildizlar(a.ish_nomi);
    const hammaStems = ildizlar(matn);
    if (!hammaStems.length) continue;
    const aSet = new Set(nomStems.length ? nomStems : hammaStems);
    const aNorma = Math.sqrt([...aSet].reduce((x, s) => x + idf(s) ** 2, 0)) || 1;
    const aTuri = guruhla(hammaStems, ISH_TURI); const aElement = guruhla(hammaStems, ELEMENT);
    const nomzod = new Map<number, number>();
    for (const s of aSet) for (const k of indeks.get(s) ?? []) nomzod.set(k, (nomzod.get(k) ?? 0) + idf(s) ** 2);
    // Faqat ish turi/element mos bo'lgan qatorlar ham nomzod (so'zlar kesishmasa ham) — lekin faqat so'z kesishmasi bo'lsa ball oladi.
    const royxat: Taklif[] = [];
    for (const [k, kesish] of nomzod) {
      const i = ishlar[k];
      const sabab: string[] = [];
      let ball = kesish / (aNorma * ishNorma[k]);
      const turMos = [...aTuri].some((g) => i.ishTuri.has(g));
      const turZid = aTuri.size > 0 && i.ishTuri.size > 0 && !turMos;
      const elMos = [...aElement].some((g) => i.element.has(g));
      const elZid = aElement.size > 0 && i.element.size > 0 && !elMos;
      if (turMos) { ball += 0.25; sabab.push('ish turi mos'); }
      if (turZid) ball -= 0.3;
      if (elMos) { ball += 0.2; sabab.push('element mos'); }
      if (elZid) ball -= 0.1;
      const rIl = razdelIldiz.get(i.razdelId);
      if (rIl && rIl.size) {
        const hamma = new Set(hammaStems);
        const mos = [...rIl].filter((s) => hamma.has(s)).length;
        if (mos > 0) { ball += 0.15 * Math.min(1, mos / Math.min(3, rIl.size)); sabab.push('razdel nomi mos'); }
      }
      if (i.faktBor) { ball += 0.1; sabab.push('fakt bor'); }
      sabab.unshift('nom o‘xshash');
      ball = Math.max(0, Math.min(1, ball));
      if (ball < minBall) continue;
      royxat.push({ qatorId: i.id, ball: sobit(ball), nom: i.nom, razdelId: i.razdelId, razdelNom: i.razdelNom, faktBor: i.faktBor, sabab });
    }
    royxat.sort((x, y) => y.ball - x.ball || Number(y.faktBor) - Number(x.faktBor) || x.qatorId - y.qatorId);
    if (royxat.length) natija.set(a.id, royxat.slice(0, n));
  }
  return natija;
}

export type RazdelGuruhi = { razdelId: number | null; razdelNom: string; aktlar: number[] };

/** Aktlarni eng yuqori taklifining razdeli bo'yicha guruhlash; taklifsiz aktlar `razdelId: undefined` guruhiga emas — alohida qaytariladi. */
export function razdelBoyicha(aktIdlar: readonly number[], takliflar: ReadonlyMap<number, Taklif[]>): { guruhlar: RazdelGuruhi[]; taklifsiz: number[] } {
  const m = new Map<number | null, RazdelGuruhi>();
  const taklifsiz: number[] = [];
  for (const id of aktIdlar) {
    const t = takliflar.get(id)?.[0];
    if (!t) { taklifsiz.push(id); continue; }
    const g = m.get(t.razdelId) ?? { razdelId: t.razdelId, razdelNom: t.razdelNom, aktlar: [] };
    g.aktlar.push(id); m.set(t.razdelId, g);
  }
  return { guruhlar: [...m.values()].sort((a, b) => b.aktlar.length - a.aktlar.length || a.razdelNom.localeCompare(b.razdelNom)), taklifsiz };
}

/**
 * Tasdiqlangan juftliklar → RPC chaqiruvlari. `t2_aosr_bog_saqla(aosr_ids, qator_ids)` M:N (kesishma) bog'laydi, shuning
 * uchun har QATOR uchun alohida chaqiruv: aynan shu qatorni tanlagan aktlar bilan (boshqa akt/qator aralashmaydi).
 */
export function bogChaqiruvlari(juftlar: ReadonlyArray<{ aktId: number; qatorId: number }>): Array<{ aosrIds: number[]; qatorIds: number[] }> {
  const m = new Map<number, Set<number>>();
  for (const j of juftlar) { const s = m.get(j.qatorId) ?? new Set<number>(); s.add(j.aktId); m.set(j.qatorId, s); }
  return [...m.entries()].map(([q, s]) => ({ aosrIds: [...s].sort((a, b) => a - b), qatorIds: [q] })).sort((a, b) => a.qatorIds[0] - b.qatorIds[0]);
}
