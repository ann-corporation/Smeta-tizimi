/**
 * Omborchiga aqlli takliflar (kirim/chiqim): shu omborning O'Z tarixidan — material, taxminiy birlik, odatiy miqdor, oxirgi va o'rtacha narx (QQS siz va QQS bilan),
 * eng ko'p/oxirgi yetkazuvchi; teskari yo'nalish ham: yetkazuvchi -> uning odatiy materiallari. Sof funksiyalar (DB/tarmoq yo'q) — web, Android, Telegram va Jarvis uchun bir xil.
 *
 * Tartib: so'rov mosligi + ishlatilish chastotasi + yangilik (yarim umr 45 kun). Hech narsa o'ylab topilmaydi: tarixda bo'lmagan maydon null.
 */
import { NDS_SUKUT_FOIZ, qqsBilan } from '../hisob-yadro/nds';
import { birlikKaliti, nomKaliti, nomTokenlari, nomTokenlariXom } from './moslash';
import { mosmi } from './eslatma';
import { matnMosmi } from './hisobot';

export type TaklifYozuv = {
  id?: number; nomi: string | null; birligi: string | null; sana: string | null; operatsiya: string | null; obyomi?: number | string | null;
  postavshik?: string | null; qabul_qiluvchi?: string | null; narx?: number | string | null;
};
export type Tur = 'prixod' | 'chiqim';
export type KontragentSoni = { nomi: string; soni: number };
export type MaterialTaklif = {
  nomi: string; birligi: string; soni: number; oxirgi_sana: string | null;
  miqdor_oxirgi: number | null; miqdor_median: number | null;
  narx_oxirgi: number | null; narx_ortacha: number | null; narx_oxirgi_qqs: number | null; narx_ortacha_qqs: number | null;
  kontragent: string | null; kontragent_oxirgi: string | null; kontragentlar: KontragentSoni[]; ball: number;
};
export type KontragentTaklif = {
  nomi: string; soni: number; oxirgi_sana: string | null;
  materiallar: { nomi: string; birligi: string; soni: number; miqdor_median: number | null; narx_oxirgi: number | null }[];
};

const toza = (v: unknown): string | null => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s || null; };
const musbat = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };
const yaxlit = (n: number) => Math.round(n * 10000) / 10000;
const pul = (n: number) => Math.round(n * 100) / 100;
const kunFarq = (a: string, b: string) => Math.max(0, Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400_000));

export function median(x: readonly number[]): number | null {
  if (!x.length) return null;
  const s = [...x].sort((a, b) => a - b), m = s.length >> 1;
  return yaxlit(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

type Guruh = { nomi: string; birligi: string; tok: Set<string>; yozuvlar: { sana: string; id: number; miqdor: number | null; narx: number | null; kontragent: string | null }[] };

/** Tarixni (material, birlik) bo'yicha guruhlaydi. Faqat tanlangan yo'nalish yozuvlari. `kontragent` berilsa — faqat shu kontragent yozuvlari. */
function guruhla(yozuvlar: readonly TaklifYozuv[], tur: Tur, kontragent: string | null): Map<string, Guruh> {
  const op = tur === 'prixod' ? 'prixod' : 'rasxod';
  const g = new Map<string, Guruh>();
  yozuvlar.forEach((y, i) => {
    if (y.operatsiya !== op) return;
    const nomi = toza(y.nomi), birligi = toza(y.birligi); if (!nomi || !birligi) return;
    const k = tur === 'prixod' ? toza(y.postavshik) : toza(y.qabul_qiluvchi);
    if (kontragent && !matnMosmi(kontragent, k)) return;
    const kalit = nomKaliti(nomi) + '|' + birlikKaliti(birligi);
    let x = g.get(kalit);
    if (!x) { x = { nomi, birligi, tok: new Set([...nomTokenlari(nomi), ...nomTokenlariXom(nomi)]), yozuvlar: [] }; g.set(kalit, x); }
    x.yozuvlar.push({ sana: toza(y.sana) ?? '', id: y.id ?? -i, miqdor: musbat(y.obyomi), narx: tur === 'prixod' ? musbat(y.narx) : null, kontragent: k });
  });
  // eng yangisi birinchi (sana, so'ng id)
  for (const x of g.values()) x.yozuvlar.sort((a, b) => (a.sana < b.sana ? 1 : a.sana > b.sana ? -1 : b.id - a.id));
  return g;
}

function kontragentSoni(yoz: Guruh['yozuvlar']): KontragentSoni[] {
  const m = new Map<string, KontragentSoni & { oxirgi: string }>();
  for (const y of yoz) {
    if (!y.kontragent) continue;
    const k = nomKaliti(y.kontragent); const x = m.get(k);
    if (x) x.soni += 1; else m.set(k, { nomi: y.kontragent, soni: 1, oxirgi: y.sana });
  }
  return [...m.values()].sort((a, b) => b.soni - a.soni || (a.oxirgi < b.oxirgi ? 1 : -1)).map(({ nomi, soni }) => ({ nomi, soni }));
}

/**
 * Material takliflari. `sorov` bo'sh bo'lsa — eng odatiy (chastota + yangilik). `kontragent` berilsa (kirimda yetkazuvchi) — faqat shu yetkazuvchi
 * olib kelgan materiallar, miqdor/narx ham shu yetkazuvchi tarixidan (yetkazuvchi -> odatiy materiallar).
 */
export function materialTaklif(yozuvlar: readonly TaklifYozuv[], sorov: string, tur: Tur, opts: { bugun: string; limit?: number; kontragent?: string | null; qqsFoiz?: number } = { bugun: '1970-01-01' }): MaterialTaklif[] {
  const q = toza(sorov) ?? ''; const bugun = opts.bugun; const qqs = opts.qqsFoiz ?? NDS_SUKUT_FOIZ;
  const qSyn = q ? nomTokenlari(q) : [], qXom = q ? nomTokenlariXom(q) : [];
  const guruhlar = guruhla(yozuvlar, tur, toza(opts.kontragent));
  const eng = Math.max(1, ...[...guruhlar.values()].map((x) => x.yozuvlar.length));
  const nat: MaterialTaklif[] = [];
  for (const x of guruhlar.values()) {
    if (q && !(mosmi(qSyn, x.tok) || mosmi(qXom, x.tok))) continue;
    const yoz = x.yozuvlar; const oxirgi = yoz[0];
    const birinchi = qSyn[0] ?? qXom[0];
    const boshi = !q || (!!birinchi && (nomTokenlari(x.nomi)[0]?.startsWith(birinchi) || nomTokenlariXom(x.nomi)[0]?.startsWith(qXom[0] ?? birinchi))) ? 1 : 0.6;
    const chastota = Math.log(1 + yoz.length) / Math.log(1 + eng);
    const yangilik = oxirgi.sana ? Math.pow(0.5, kunFarq(bugun, oxirgi.sana) / 45) : 0;
    const ball = Math.round((q ? boshi * 0.5 : 0) * 1000) / 1000 + (q ? 0.3 : 0.55) * chastota + (q ? 0.2 : 0.45) * yangilik;
    const miqdorlar = yoz.map((y) => y.miqdor).filter((m): m is number => m != null).slice(0, 10);
    const narxlar = yoz.map((y) => y.narx).filter((m): m is number => m != null);
    const oxirgiNarx = narxlar[0] ?? null; const orta5 = narxlar.slice(0, 10);
    const ortacha = orta5.length ? pul(orta5.reduce((a, b) => a + b, 0) / orta5.length) : null;
    const kon = kontragentSoni(yoz);
    nat.push({
      nomi: x.nomi, birligi: x.birligi, soni: yoz.length, oxirgi_sana: oxirgi.sana || null,
      miqdor_oxirgi: yoz.find((y) => y.miqdor != null)?.miqdor ?? null, miqdor_median: median(miqdorlar),
      narx_oxirgi: oxirgiNarx, narx_ortacha: ortacha, narx_oxirgi_qqs: oxirgiNarx == null ? null : qqsBilan(oxirgiNarx, qqs), narx_ortacha_qqs: ortacha == null ? null : qqsBilan(ortacha, qqs),
      kontragent: kon[0]?.nomi ?? null, kontragent_oxirgi: yoz.find((y) => y.kontragent)?.kontragent ?? null, kontragentlar: kon.slice(0, 3), ball: Math.round(ball * 1000) / 1000,
    });
  }
  nat.sort((a, b) => b.ball - a.ball || b.soni - a.soni || a.nomi.localeCompare(b.nomi));
  return nat.slice(0, Math.max(1, Math.min(20, opts.limit ?? 6)));
}

/** Kontragent takliflari (kirimda yetkazuvchi, chiqimda qabul qiluvchi) va har birining odatiy materiallari. */
export function kontragentTaklif(yozuvlar: readonly TaklifYozuv[], sorov: string, tur: Tur, opts: { limit?: number; materialLimit?: number } = {}): KontragentTaklif[] {
  const q = toza(sorov); const op = tur === 'prixod' ? 'prixod' : 'rasxod';
  const m = new Map<string, { nomi: string; soni: number; sana: string; mat: Map<string, { nomi: string; birligi: string; yoz: { sana: string; miqdor: number | null; narx: number | null }[] }> }>();
  for (const y of yozuvlar) {
    if (y.operatsiya !== op) continue;
    const k = toza(tur === 'prixod' ? y.postavshik : y.qabul_qiluvchi); const nomi = toza(y.nomi), birligi = toza(y.birligi);
    if (!k || !nomi || !birligi || (q && !matnMosmi(q, k))) continue;
    const kk = nomKaliti(k); const sana = toza(y.sana) ?? '';
    let x = m.get(kk); if (!x) { x = { nomi: k, soni: 0, sana: '', mat: new Map() }; m.set(kk, x); }
    x.soni += 1; if (sana > x.sana) { x.sana = sana; x.nomi = k; }
    const mk = nomKaliti(nomi) + '|' + birlikKaliti(birligi); let mm = x.mat.get(mk);
    if (!mm) { mm = { nomi, birligi, yoz: [] }; x.mat.set(mk, mm); }
    mm.yoz.push({ sana, miqdor: musbat(y.obyomi), narx: tur === 'prixod' ? musbat(y.narx) : null });
  }
  const nat: KontragentTaklif[] = [...m.values()].map((x) => ({
    nomi: x.nomi, soni: x.soni, oxirgi_sana: x.sana || null,
    materiallar: [...x.mat.values()].map((mm) => {
      mm.yoz.sort((a, b) => (a.sana < b.sana ? 1 : -1));
      return { nomi: mm.nomi, birligi: mm.birligi, soni: mm.yoz.length, miqdor_median: median(mm.yoz.map((z) => z.miqdor).filter((v): v is number => v != null).slice(0, 10)), narx_oxirgi: mm.yoz.find((z) => z.narx != null)?.narx ?? null };
    }).sort((a, b) => b.soni - a.soni || a.nomi.localeCompare(b.nomi)).slice(0, Math.max(1, opts.materialLimit ?? 5)),
  }));
  nat.sort((a, b) => b.soni - a.soni || ((a.oxirgi_sana ?? '') < (b.oxirgi_sana ?? '') ? 1 : -1) || a.nomi.localeCompare(b.nomi));
  return nat.slice(0, Math.max(1, Math.min(20, opts.limit ?? 5)));
}
