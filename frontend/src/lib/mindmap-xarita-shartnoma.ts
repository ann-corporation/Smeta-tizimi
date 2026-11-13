/**
 * Vizual xarita uchun «Kompaniya → Loyiha → SHARTNOMA → Obyekt» daraxti (sof hisob, React yo‘q).
 *
 * Tuzilma — jadvaldagi (pult) bilan AYNAN bir xil: `pultDaraxtQur` (lib/mindmap-pult-daraxt). Bu yerda yangi hisob-kitob yo‘q:
 * obyekt ko‘rsatkichlari `daraxtQur` dan, shartnoma summasi (QQS bilan) server `meta.summa` dan. Shartnoma tugunida jamlanma
 * faqat ostidagi obyektlar yig‘indisi (null ni 0 qilmaydi).
 *
 * Qoida: loyihada kamida bitta shartnoma bo‘lsa, shartnomasiz obyektlar shu loyiha ostidagi «Shartnomasiz» guruh tuguniga
 * tushadi (id `shartnomasiz:<loyiha>`). Loyihada shartnoma bo‘lmasa — obyektlar to‘g‘ridan-to‘g‘ri loyiha ostida (eski ko‘rinish).
 */
import type { MindmapGraf } from '../api/t2-mindmap';
import { pultDaraxtQur, type PultTugun } from './mindmap-pult-daraxt';
import { bosHolat, bosTugun, ogirHolat, type XDaraxt, type XTugun } from './mindmap-korinish';

export const SHARTNOMASIZ_BOSH = 'shartnomasiz:';
export const shartnomasizmi = (id: string) => id.startsWith(SHARTNOMASIZ_BOSH);

const qosh = (a: number | null, b: number | null | undefined): number | null => (b == null ? a : (a ?? 0) + b);

/** Shartnoma/guruh tuguni: ostidagi obyektlardan jamlanma. */
function jamla(t: XTugun, obyektlar: XTugun[]): void {
  const s = bosHolat();
  let smeta: number | null = null, fakt: number | null = null, f2: number | null = null;
  let toliq = obyektlar.length > 0, signal: number | null = null, kritik: number | null = null;
  for (const o of obyektlar) {
    s[o.holat] += 1;
    smeta = qosh(smeta, o.smeta); fakt = qosh(fakt, o.fakt); f2 = qosh(f2, o.f2);
    if (o.smeta == null) toliq = false;
    if (o.signalSoni != null) signal = (signal ?? 0) + o.signalSoni;
    if (o.kritikSoni != null) kritik = (kritik ?? 0) + o.kritikSoni;
  }
  t.holatSanoq = s;
  t.obyektSoni = obyektlar.length;
  t.holat = obyektlar.length ? ogirHolat(s) : 'nomalum';
  t.smeta = smeta; t.smetaToliq = toliq; t.fakt = fakt; t.f2 = f2;
  t.faktFoiz = smeta ? (fakt == null ? null : (fakt / smeta) * 100) : null;
  t.f2Foiz = smeta ? (f2 == null ? null : (f2 / smeta) * 100) : null;
  t.signalSoni = signal; t.kritikSoni = kritik;
  t.oshgan = obyektlar.some((o) => o.oshgan);
}

/**
 * `daraxt` ning nusxasini qaytaradi: har loyiha (va «loyihasiz» guruh) bolalari — shartnoma tugunlari; obyektning otasi — shartnoma.
 * Asl daraxt o‘zgarmaydi. Shartnoma umuman yo‘q bo‘lsa — asl daraxtning o‘zi qaytadi.
 */
export function shartnomaliDaraxt(graf: MindmapGraf, daraxt: XDaraxt): XDaraxt {
  if (!graf.tugunlar.some((t) => t.tur === 'shartnoma')) return daraxt;
  const pult = pultDaraxtQur(graf, daraxt);
  const tugunlar = new Map<string, XTugun>();
  for (const [id, x] of daraxt.tugunlar) tugunlar.set(id, { ...x, bolalar: [...x.bolalar] });
  const otaOrni = new Map<string, string[]>(); // ota id -> qo‘shiladigan yangi tugun id lari (ota ostida, obyektlardan oldin)
  let ozgardi = false;

  for (const P of pult.bolalar) {
    const ota = tugunlar.get(P.id);
    if (!ota) continue;
    const shartnomalar = P.bolalar.filter((b) => b.tur === 'shartnoma');
    if (!shartnomalar.length) continue;
    const bolalar: string[] = [];
    const qur = (id: string, nom: string, obyektlar: PultTugun[], guruh: boolean) => {
      const manbaGraf = graf.tugunlar.find((g) => g.id === id) ?? null;
      const n = bosTugun(id, guruh ? 'guruh' : 'shartnoma', nom, manbaGraf, P.id, 2);
      const xlar = obyektlar.map((o) => tugunlar.get(o.id)).filter((x): x is XTugun => !!x);
      for (const x of xlar) x.ota = id;
      n.bolalar = xlar.map((x) => x.id);
      jamla(n, xlar);
      tugunlar.set(id, n);
      bolalar.push(id);
    };
    for (const S of shartnomalar) qur(S.id, S.nom, S.bolalar.filter((b) => b.tur === 'obyekt'), false);
    const yetim = P.bolalar.filter((b) => b.tur === 'obyekt');
    if (yetim.length) qur(SHARTNOMASIZ_BOSH + P.id, '', yetim, true);
    ota.bolalar = bolalar;
    otaOrni.set(P.id, bolalar);
    ozgardi = true;
  }
  if (!ozgardi) return daraxt;
  // Chizish tartibi: har loyihadan keyin uning shartnomalari, keyin obyektlar (asl tartib saqlanadi).
  const tartib: string[] = [];
  for (const id of daraxt.tartib) {
    tartib.push(id);
    for (const y of otaOrni.get(id) ?? []) tartib.push(y);
  }
  return { ...daraxt, tugunlar, tartib };
}
