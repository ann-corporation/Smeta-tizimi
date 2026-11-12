/**
 * Karta: TOMONLAR qatlami. Boshqa kompaniyalar (tomon aloqalari) va ularning ko‘rish huquqlari (grant) kartada tugun va chiziq
 * bo‘lib ko‘rinadi — mavjud `t2_tomon_aloqalar_v1` / `t2_tomon_aloqa_tafsilot_v1` dan (`api/t2-tomon`). Yangi o‘qish buyrug‘i yo‘q.
 * Oqim hisoblagichlari: faqat server son bergan va > 0 bo‘lsa (NULL/0 — hech narsa ko‘rsatilmaydi, hech qachon soxta 0).
 */
import { aloqalarOl, aloqaTafsilotOl, type Aloqa, type GrantQatori } from '../api/t2-tomon';
import type { MindmapBogich, MindmapTugun } from '../api/t2-mindmap';

export type OqimBelgisi = { matn: string; son: number };
export type TomonKarta = {
  tugunlar: MindmapTugun[];
  bogichlar: MindmapBogich[];
  /** `manba>maqsad` → shu chiziq ostidagi grant IDlari (o‘chirish uchun). */
  grantlar: Map<string, { aloqaId: number; grantIdlar: number[]; resurslar: string[] }>;
  /** `manba>maqsad` → oqim belgisi (kutayotgan hujjatlar). */
  oqim: Map<string, OqimBelgisi>;
};

export const BOS_TOMON_KARTA = (): TomonKarta => ({ tugunlar: [], bogichlar: [], grantlar: new Map(), oqim: new Map() });
export const chiziqKalit = (manba: string, maqsad: string) => manba + '>' + maqsad;

const ROL_NOM: Record<string, string> = {
  zakazchik: 'Buyurtmachi', texnadzor: 'Texnik nazorat', loyihachi: 'Loyihachi', laboratoriya: 'Laboratoriya',
  taminotchi: 'Yetkazuvchi', subpudratchi: 'Subpudratchi', pudratchi: 'Pudratchi', investor: 'Investor', bank: 'Bank',
};
export const rolNomi = (rol: string) => ROL_NOM[rol] ?? rol;

/** Sof qurish (testlanadi): aloqalar + grantlar → tugun/chiziq. */
export function tomonKartasiniQur(kompaniyaTugunId: string | null, aloqalar: Aloqa[], berilgan: Map<number, GrantQatori[]>): TomonKarta {
  const k = BOS_TOMON_KARTA();
  for (const a of aloqalar) {
    if (a.holat === 'rad' || a.holat === 'bekor' || a.holat === 'yopilgan') continue;
    const id = 'tomon:' + a.id;
    k.tugunlar.push({
      id, tur: 'tomon', nom: a.qarshi_nom || 'Tomon', x: null, y: null,
      meta: { versiya: 0, holat: a.holat, rol: a.qarshi_rol, inn: a.qarshi_inn, aloqa_id: a.id, berilgan_grant: a.berilgan_grant_soni, olingan_grant: a.olingan_grant_soni },
    } as MindmapTugun);
    if (kompaniyaTugunId) {
      k.bogichlar.push({ manba: kompaniyaTugunId, maqsad: id, tur: 'tomon_aloqa', uzsa_boladi: true, rol: a.qarshi_rol });
      const kutmoqda = (a.kelgan_ochiq_taqdim ?? 0) + (a.yuborilgan_ochiq_taqdim ?? 0);
      if (kutmoqda > 0) k.oqim.set(chiziqKalit(kompaniyaTugunId, id), { son: kutmoqda, matn: kutmoqda + ' hujjat qarorini kutmoqda' });
    }
    const doiralar = new Map<string, { grantIdlar: number[]; resurslar: string[] }>();
    for (const g of berilgan.get(a.id) ?? []) {
      const d = g.obyekt_id != null ? 'obyekt:' + g.obyekt_id : g.loyiha_id != null ? 'loyiha:' + g.loyiha_id : g.shartnoma_id != null ? 'shartnoma:' + g.shartnoma_id : null;
      if (!d) continue;
      const e = doiralar.get(d) ?? { grantIdlar: [], resurslar: [] };
      e.grantIdlar.push(g.id); e.resurslar.push(g.resurs);
      doiralar.set(d, e);
    }
    for (const [d, e] of doiralar) {
      k.bogichlar.push({ manba: id, maqsad: d, tur: 'tomon_grant', uzsa_boladi: true, rol: a.qarshi_rol });
      k.grantlar.set(chiziqKalit(id, d), { aloqaId: a.id, grantIdlar: e.grantIdlar, resurslar: e.resurslar });
    }
  }
  return k;
}

export async function tomonKartasiniOl(kompaniyaId: number, kompaniyaTugunId: string | null): Promise<TomonKarta> {
  const r = await aloqalarOl(kompaniyaId);
  if (!r.ok) return BOS_TOMON_KARTA();
  const faol = r.natija.filter((a) => a.holat === 'faol' || a.holat === 'toxtatilgan').slice(0, 40);
  const berilgan = new Map<number, GrantQatori[]>();
  await Promise.all(faol.map(async (a) => {
    if (!a.berilgan_grant_soni) return;
    const t = await aloqaTafsilotOl(kompaniyaId, a.id);
    if (t.ok) berilgan.set(a.id, t.natija.berilgan);
  }));
  return tomonKartasiniQur(kompaniyaTugunId, r.natija, berilgan);
}

/** «Tomonlar» linzasi: tanlangan obyekt/loyiha/shartnomani KIMLAR ko‘ra oladi va nimani. */
export function tomonlarLinzasi(k: TomonKarta, tanlanganId: string, ota: string[] = []): { tomon: MindmapTugun; resurslar: string[]; doira: string }[] {
  const natija: { tomon: MindmapTugun; resurslar: string[]; doira: string }[] = [];
  const idlar = new Set([tanlanganId, ...ota]);
  for (const b of k.bogichlar) {
    if (b.tur !== 'tomon_grant' || !idlar.has(b.maqsad)) continue;
    const tomon = k.tugunlar.find((t) => t.id === b.manba);
    const g = k.grantlar.get(chiziqKalit(b.manba, b.maqsad));
    if (tomon && g) natija.push({ tomon, resurslar: g.resurslar, doira: b.maqsad });
  }
  return natija;
}
