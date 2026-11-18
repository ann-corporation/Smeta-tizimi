/**
 * Jarvis: «obyekt smeta qiymati — nakrutka/ustama va QQS bilan» savoliga ANIQ (modelsiz) javob.
 * Manba: t2_obyekt_nakrutka_v1 (podval → shartnoma → kompaniya → sukut kaskadi, QQS bir marta) — web va ilovada bir xil hisob.
 * Tartib: QQS bilan (asosiy) → ustamali QQS siz → ustamasiz (прямые). Podval yo'q bo'lsa nima yetishmayotgani aytiladi.
 */
import { jarvisMoney } from '../../src/lib/jarvis/answers';

export type PulObyekt = { id: number; nom: string };
export type PulTarix = Array<{ rol?: unknown; matn?: unknown }>;

const norm = (s: string) => s.toLocaleLowerCase('uz-UZ').replace(/[‘’ʻʼ'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

const USTAMA = /(nakrutk|ustama|накрутк|накладн|надбавк|overhead|markup)/;
const QQS = /(\bqqs\b|\bnds\b|\bqqc\b|ндс|ққс|\bkks\b)/;
const QIYMAT = /(smeta|qiymat|summa|qancha|narx|turadi|jami|смет|стоимост|сумм|сколько|итого)/;

/** Ustama/QQS bilan smeta qiymati so'ralganmi (sinonimlar: nakrutka, ustama, накладные, QQS, НДС, NDS). */
export function pulSorovi(savol: string): boolean {
  const s = norm(savol);
  return (USTAMA.test(s) || QQS.test(s)) && QIYMAT.test(s);
}

const sozlar = (s: string) => norm(s).split(' ').filter(Boolean);
/** Obyekt nomi matnda bormi: nomning har bir so'zi (≥3 belgi) matndagi biror so'zning boshi (qo'shimchalar: «amfiteatrda»). */
function nomMos(nom: string, matn: string): boolean {
  const t = sozlar(nom).filter((x) => x.length >= 3);
  if (!t.length) return false;
  const m = sozlar(matn);
  return t.every((a) => m.some((w) => w.startsWith(a)));
}
function topilgan(obyektlar: PulObyekt[], matn: string): PulObyekt[] {
  const mos = obyektlar.filter((o) => nomMos(o.nom, matn));
  if (mos.length <= 1) return mos;
  const eng = Math.max(...mos.map((o) => norm(o.nom).length));
  return mos.filter((o) => norm(o.nom).length === eng); // «Fast Food» «Fast Food 1-etaj» dan uzunrog'i aniqroq
}

export type ObyektTanlov = { tur: 'bor'; obyekt: PulObyekt } | { tur: 'noaniq'; variantlar: PulObyekt[] } | { tur: 'yoq' };

/** Savoldagi nom → ochiq obyekt (sahifadan) → suhbat tarixidagi eng oxirgi aniq obyekt («shu obyekt», «bu obyekt»). */
export function obyektTanla(savol: string, tarix: unknown, obyektlar: PulObyekt[], ochiqId: number | null): ObyektTanlov {
  const s = topilgan(obyektlar, savol);
  if (s.length === 1) return { tur: 'bor', obyekt: s[0] };
  if (s.length > 1) return { tur: 'noaniq', variantlar: s.slice(0, 5) };
  const ochiq = ochiqId != null ? obyektlar.find((o) => o.id === ochiqId) : undefined;
  if (ochiq) return { tur: 'bor', obyekt: ochiq };
  const t = Array.isArray(tarix) ? (tarix as PulTarix).slice(-6) : [];
  for (let i = t.length - 1; i >= 0; i--) {
    const m = typeof t[i]?.matn === 'string' ? (t[i].matn as string) : '';
    if (!m) continue;
    const h = topilgan(obyektlar, m);
    if (h.length === 1) return { tur: 'bor', obyekt: h[0] };
  }
  return { tur: 'yoq' };
}

type Kaskad = { pryamye?: unknown; itogo4?: unknown; nds?: unknown; vsego?: unknown; yaxlit?: unknown };
const son = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const MANBA_NOMI: Record<string, string> = { shartnoma: 'shartnoma foizlari', kompaniya: 'kompaniya foizlari', sukut: 'standart foizlar' };

/** t2_obyekt_nakrutka_v1 natijasidan javob matni. Raqam yo'q bo'lsa — nima yetishmayotgani aytiladi, taxmin qilinmaydi. */
export function pulJavobMatni(nom: string, r: Record<string, unknown>): string {
  const k = (r.nakrutka ?? null) as Kaskad | null;
  const cats = (r.cats ?? {}) as Record<string, unknown>;
  const kat = ['chel', 'mash', 'mat', 'ob'].reduce((a, x) => a + (son(cats[x]) ?? 0), 0);
  const vsego = k ? son(k.vsego) : null; const itogo4 = k ? son(k.itogo4) : null; const pryamye = k ? son(k.pryamye) : null;
  if (r.ok !== true || !k || vsego == null) {
    return `**${nom}**: smeta qiymatini ustama va QQS bilan hisoblab bo‘lmadi — ${r.ok !== true ? 'obyektning nakrutka hisobi javob bermadi' : 'nakrutka natijasi bo‘sh'}. Obyekt «Smeta» sahifasidan nakrutka (podval) qismini tekshiring.`;
  }
  if (kat <= 0 && (pryamye ?? 0) <= 0) {
    return `**${nom}**: smeta qatorlarida resurs summasi yo‘q (hammasi narxsiz yoki smeta yuklanmagan) — ustama va QQS bilan qiymatni hisoblab bo‘lmaydi. Avval narxlarni to‘ldiring.`;
  }
  const manba = String(r.nk_manba ?? 'sukut');
  const qatorlar = [
    `**${nom}** — smeta qiymati:`,
    `- **QQS bilan** (nakrutka/ustama bilan): **${jarvisMoney(vsego)}**`,
    `- Ustamali, QQS siz: ${jarvisMoney(itogo4)}`,
    `- Ustamasiz (прямые), QQS siz: ${jarvisMoney(pryamye)}`,
  ];
  if (manba !== 'smeta_podvali') {
    qatorlar.push(`\nDiqqat: obyektning smeta podvali (nakrutka foizlari) topilmadi — hisob ${MANBA_NOMI[manba] ?? 'standart foizlar'} bo‘yicha, taxminiy. Aniq qiymat uchun smeta podvalini yuklang.`);
  }
  return qatorlar.join('\n');
}

type Rpc = (nom: string, yuk: Record<string, unknown>) => Promise<{ ok: boolean; data: Record<string, unknown> }>;

/** To'liq oqim. null — bu savol emas (model davom etadi). Ruxsat: smeta_pul toifasi shu foydalanuvchiga ochiq bo'lishi shart. */
export async function pulJavobi(rpc: Rpc, o: { actor: number; kid: number; savol: string; tarix: unknown; obyektId: number | null; ruxsat: readonly string[] }): Promise<string | null> {
  if (!pulSorovi(o.savol) || !o.ruxsat.includes('smeta_pul')) return null;
  const f = await rpc('t2_agent_fakt_v1', { p_actor_id: o.actor, p_kompaniya_id: o.kid, p_kategoriyalar: ['obyektlar'], p_obyekt_id: null });
  const lst = f.ok && Array.isArray(f.data.fakt ? (f.data.fakt as Record<string, unknown>).obyektlar : f.data.obyektlar)
    ? ((f.data.fakt ? (f.data.fakt as Record<string, unknown>).obyektlar : f.data.obyektlar) as Array<Record<string, unknown>>) : [];
  const obyektlar: PulObyekt[] = lst.flatMap((x) => (typeof x.id === 'number' && typeof x.nom === 'string' ? [{ id: x.id, nom: x.nom }] : []));
  if (!obyektlar.length) return 'Kompaniyada faol obyekt topilmadi — ustama va QQS bilan smeta qiymatini hisoblash uchun avval obyekt kerak.';
  const t = obyektTanla(o.savol, o.tarix, obyektlar, o.obyektId);
  if (t.tur === 'noaniq') return 'Bir nechta obyekt mos keldi: ' + t.variantlar.map((v) => `«${v.nom}»`).join(', ') + '. Qaysi biri?';
  if (t.tur === 'yoq') return 'Qaysi obyekt uchun? Nomini ayting (masalan: ' + obyektlar.slice(0, 3).map((v) => `«${v.nom}»`).join(', ') + ').';
  const r = await rpc('t2_obyekt_nakrutka_v1', { p_obyekt_id: t.obyekt.id, p_actor_id: o.actor });
  return pulJavobMatni(t.obyekt.nom, r.ok ? r.data : { ok: false });
}
