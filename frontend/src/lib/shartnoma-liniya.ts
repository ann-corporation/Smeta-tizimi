/**
 * Shartnoma liniyasi — sof mantiq (UI dan mustaqil, test qilinadi).
 * Egasi: rollar va turlar ERKIN matn — bu yerdagi ro'yxatlar faqat taklif, majburiy emas.
 */
import type { Liniya, LiniyaObyekt, LiniyaShartnoma, LiniyaTomon } from '../api/t2-shartnoma-liniya';

export const ROL_TAKLIF = ['Buyurtmachi', 'Bosh pudratchi', 'Pudratchi', 'Subpudratchi', 'Loyihachi', 'Texnik nazorat', 'Mualliflik nazorati', 'Laboratoriya', 'Yetkazib beruvchi'];
export const TUR_TAKLIF = ['Bosh shartnoma', 'Pudrat', 'Subpudrat', 'Laboratoriya', 'Loyiha ishlari', 'Texnik nazorat', 'Yetkazib berish', 'Ijara (texnika)'];

/** Taklif ro'yxati: sukut + kompaniyada ishlatilganlar, takrorsiz (registr farqisiz), tartib saqlanadi. */
export function takliflar(sukut: string[], ishlatilgan: string[]): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of [...ishlatilgan, ...sukut]) {
    const t = (x ?? '').trim(); const k = t.toLocaleLowerCase('ru');
    if (t && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
}

export type LoyihaTuguni = { id: number | null; nom: string; asosiy: LiniyaShartnoma[]; qoshimcha: LiniyaShartnoma[]; obyektSoni: number };

/** Loyiha → shartnomalar daraxti. Loyihasiz shartnomalar (eski) — oxirida alohida tugun (id null). */
export function liniyaDaraxt(l: Liniya): LoyihaTuguni[] {
  const tugun = new Map<number | null, LoyihaTuguni>();
  for (const p of l.loyihalar) tugun.set(p.id, { id: p.id, nom: p.nom, asosiy: [], qoshimcha: [], obyektSoni: 0 });
  for (const s of l.shartnomalar) {
    const k = s.loyiha_id != null && tugun.has(s.loyiha_id) ? s.loyiha_id : null;
    if (!tugun.has(k)) tugun.set(k, { id: null, nom: 'Loyihasiz shartnomalar', asosiy: [], qoshimcha: [], obyektSoni: 0 });
    (s.asosiy ? tugun.get(k)!.asosiy : tugun.get(k)!.qoshimcha).push(s);
  }
  for (const o of l.obyektlar) if (o.loyiha_id != null && tugun.has(o.loyiha_id)) tugun.get(o.loyiha_id)!.obyektSoni++;
  const arr = [...tugun.values()];
  return [...arr.filter((t) => t.id != null), ...arr.filter((t) => t.id == null)];
}

/** Asosiy shartnomasi yo'q obyektlar — egasi o'zi biriktiradi. */
export function shartnomasizObyektlar(l: Liniya): LiniyaObyekt[] {
  return l.obyektlar.filter((o) => o.asosiy_shartnoma_id == null);
}

/**
 * Shartnomaga tanlash mumkin bo'lgan obyektlar: loyihasi yo'q yoki shu loyihada;
 * asosiy shartnoma uchun — boshqa asosiy shartnomaga bog'lanmagan.
 */
export function tanlashMumkin(l: Liniya, sh: { id?: number | null; loyiha_id: number | null; asosiy: boolean }): LiniyaObyekt[] {
  return l.obyektlar.filter((o) =>
    (o.loyiha_id == null || sh.loyiha_id == null || o.loyiha_id === sh.loyiha_id)
    && (!sh.asosiy || o.asosiy_shartnoma_id == null || o.asosiy_shartnoma_id === sh.id));
}

export type Shakl = {
  id: number | null; versiya: number | null; loyiha_id: number | null; raqam: string; nom: string; turi: string; asosiy: boolean;
  summa_bez_nds: string; nds: string; jami_nds_bilan: string; izoh: string; tomonlar: LiniyaTomon[]; obyektlar: number[];
};

const son = (x: number | null | undefined) => (x == null ? '' : String(x));

export function shaklQur(s: LiniyaShartnoma | null, loyihaId: number | null = null): Shakl {
  if (!s) return { id: null, versiya: null, loyiha_id: loyihaId, raqam: '', nom: '', turi: '', asosiy: true, summa_bez_nds: '', nds: '', jami_nds_bilan: '', izoh: '', tomonlar: [{ rol: 'Buyurtmachi', nom: '', inn: null }, { rol: 'Pudratchi', nom: '', inn: null }], obyektlar: [] };
  return {
    id: s.id, versiya: s.versiya, loyiha_id: s.loyiha_id, raqam: s.raqam, nom: s.nom ?? '', turi: s.turi ?? '', asosiy: s.asosiy,
    summa_bez_nds: son(s.summa_bez_nds), nds: son(s.nds), jami_nds_bilan: son(s.jami_nds_bilan), izoh: s.izoh ?? '',
    tomonlar: s.tomonlar.map((t) => ({ ...t })), obyektlar: [...s.obyektlar],
  };
}

const sonOqi = (x: string): number | null | 'xato' => {
  const t = x.replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 'xato';
};

export type ShaklXato = { joy: string; matn: string };

export function shaklTekshir(s: Shakl): ShaklXato[] {
  const x: ShaklXato[] = [];
  if (s.loyiha_id == null) x.push({ joy: 'loyiha', matn: 'Loyihani tanlang' });
  if (!s.raqam.trim()) x.push({ joy: 'raqam', matn: 'Raqam kiritilmagan' });
  for (const k of ['summa_bez_nds', 'nds', 'jami_nds_bilan'] as const) if (sonOqi(s[k]) === 'xato') x.push({ joy: k, matn: 'Son emas' });
  s.tomonlar.forEach((t, i) => {
    // Nomi bo'sh qator (masalan, sukut «Pudratchi») saqlanmaydi — xato emas.
    if (t.nom.trim() && !t.rol.trim()) x.push({ joy: `t${i}`, matn: 'Rolni kiriting' });
  });
  return x;
}

/** Saqlash yuki: nomi bo'sh tomon qatorlari tashlab yuboriladi. */
export function shaklYuk(s: Shakl) {
  const n = (k: 'summa_bez_nds' | 'nds' | 'jami_nds_bilan') => { const v = sonOqi(s[k]); return v === 'xato' ? null : v; };
  return {
    malumot: {
      loyiha_id: s.loyiha_id as number, raqam: s.raqam.trim(), nom: s.nom.trim() || null, turi: s.turi.trim() || null, asosiy: s.asosiy,
      summa_bez_nds: n('summa_bez_nds'), nds: n('nds'), jami_nds_bilan: n('jami_nds_bilan'), izoh: s.izoh.trim() || null,
    },
    tomonlar: s.tomonlar.filter((t) => t.nom.trim()).map((t) => ({ ...t, rol: t.rol.trim(), nom: t.nom.trim(), inn: t.inn?.trim() || null })),
    obyektlar: [...new Set(s.obyektlar)].sort((a, b) => a - b),
  };
}

/**
 * Hujjat imzolovchilari shartnoma tomonlaridan (egasi, 2026-10-02: "imzolovchilarni tizim qo'yadi — zakazchik va
 * pudratchi aniq; 3 tomonlama bo'lsa sub ham"). Rollar erkin matn — kalit so'zlar bo'yicha aniqlanadi.
 * Topilmasa — bo'sh (hujjatda chiziq), hech qachon o'ylab topilmaydi. Operator panelda tahrirlay oladi (yumshoq rejim).
 */
export function imzoNomlariTomonlardan(tomonlar: ReadonlyArray<Pick<LiniyaTomon, 'rol' | 'nom'>>): { zakazchik?: string; pudratchi?: string; subpudratchi?: string; texnadzor?: string } {
  const out: { zakazchik?: string; pudratchi?: string; subpudratchi?: string; texnadzor?: string } = {};
  for (const t of tomonlar) {
    const r = (t.rol || '').toLocaleLowerCase('ru').replace(/[ʻ'’‘]/g, '');
    const nom = (t.nom || '').trim();
    if (!nom) continue;
    if (/sub|суб/.test(r)) { out.subpudratchi ??= nom; continue; }
    if (/buyurtmachi|заказчик|zakazchik/.test(r)) { out.zakazchik ??= nom; continue; }
    if (/pudratchi|подрядчик|pudrat/.test(r)) { out.pudratchi ??= nom; continue; }
    if (/nazorat|надзор|texnadzor/.test(r)) { out.texnadzor ??= nom; continue; }
  }
  return out;
}

/** Hujjatdagi imzo tartibi: ЗАКАЗЧИК, ПОДРЯДЧИК, (СУБПОДРЯДЧИК — 3 tomonlama bo'lsa), ТЕХНАДЗОР. */
export function imzoRollari(n: { subpudratchi?: string }): Array<'ЗАКАЗЧИК' | 'ПОДРЯДЧИК' | 'СУБПОДРЯДЧИК' | 'ТЕХНАДЗОР'> {
  return n.subpudratchi ? ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СУБПОДРЯДЧИК', 'ТЕХНАДЗОР'] : ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР'];
}
