/**
 * Obyekt tanlashda qavatlar: LOYIHA › SHARTNOMA › OBYEKT (egasi 2026-10-20: «hamma joyda obyektlarni tanlaydigan
 * dropdownlarda shartnomalar, ichidan obyektlar — loyiha ham qavatlarda bo'lsin»).
 * Bog'lanish: obyekt.loyiha_id, shartnoma.loyiha_id va t2_shartnoma_bog (faol). Ma'lumot o'qilmasa — oddiy ro'yxat.
 */
import { sbOqi } from '../api/supabase';

export type IerarxiyaManba = {
  loyihalar: ReadonlyArray<{ id: number; nom: string | null }>;
  shartnomalar: ReadonlyArray<{ id: number; nom: string | null; raqam: string | null; loyiha_id: number | null }>;
  boglar: ReadonlyArray<{ obyekt_id: number; shartnoma_id: number }>;
};
export type ObyektLike = { id: number; nom: string | null; loyiha_id?: number | null };
export type ObyektGuruh<O> = { kalit: string; loyiha: string; shartnoma: string | null; obyektlar: O[] };

const LOYIHASIZ = 'Loyihasiz';
const SHARTNOMASIZ = 'Shartnomasiz';

/** Obyektlarni «Loyiha › Shartnoma» guruhlariga ajratadi. Bir obyekt bir nechta shartnomada bo'lsa — loyihasi mos birinchisida. */
export function obyektGuruhla<O extends ObyektLike>(obyektlar: readonly O[], m: IerarxiyaManba | null): ObyektGuruh<O>[] {
  const loyiha = new Map((m?.loyihalar ?? []).map((l) => [l.id, l.nom ?? `Loyiha #${l.id}`]));
  const shartnoma = new Map((m?.shartnomalar ?? []).map((s) => [s.id, s]));
  const boglar = new Map<number, number[]>();
  for (const b of m?.boglar ?? []) { const a = boglar.get(b.obyekt_id); if (a) a.push(b.shartnoma_id); else boglar.set(b.obyekt_id, [b.shartnoma_id]); }
  const guruhlar = new Map<string, ObyektGuruh<O>>();
  for (const o of obyektlar) {
    const sIdlar = (boglar.get(o.id) ?? []).filter((id) => shartnoma.has(id)).sort((a, b) => a - b);
    const sId = sIdlar.find((id) => shartnoma.get(id)!.loyiha_id === o.loyiha_id) ?? sIdlar[0];
    const s = sId != null ? shartnoma.get(sId)! : undefined;
    const lId = o.loyiha_id ?? s?.loyiha_id ?? null;
    const lNom = lId != null ? (loyiha.get(lId) ?? `Loyiha #${lId}`) : LOYIHASIZ;
    const sNom = s ? `Shartnoma ${s.raqam ? `№${s.raqam}` : `#${s.id}`}${s.nom ? ` ${s.nom}` : ''}` : (m ? SHARTNOMASIZ : null);
    const kalit = `${lId ?? '-'}|${s?.id ?? '-'}`;
    const g = guruhlar.get(kalit) ?? { kalit, loyiha: lNom, shartnoma: sNom, obyektlar: [] };
    g.obyektlar.push(o); guruhlar.set(kalit, g);
  }
  const tartib = (g: ObyektGuruh<O>) => `${g.loyiha === LOYIHASIZ ? '￿' : g.loyiha}|${g.shartnoma === SHARTNOMASIZ ? '￿' : g.shartnoma ?? ''}`;
  return [...guruhlar.values()]
    .map((g) => ({ ...g, obyektlar: [...g.obyektlar].sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '')) }))
    .sort((a, b) => tartib(a).localeCompare(tartib(b)));
}

export const guruhYorligi = (g: { loyiha: string; shartnoma: string | null }) => (g.shartnoma ? `${g.loyiha} › ${g.shartnoma}` : g.loyiha);

// Kompaniya bo'yicha bitta o'qish (60 s kesh) — har sahifa va har ro'yxat qayta so'ramaydi.
const kesh = new Map<number, { vaqt: number; p: Promise<IerarxiyaManba | null> }>();
export function ierarxiyaOl(kompaniyaId: number): Promise<IerarxiyaManba | null> {
  const k = kesh.get(kompaniyaId);
  if (k && Date.now() - k.vaqt < 60_000) return k.p;
  const p = (async () => {
    try {
      const [l, s] = await Promise.all([
        sbOqi<{ id: number; nom: string | null }>({ jadval: 't2_loyiha_royxat', filtr: `kompaniya_id=eq.${kompaniyaId}`, ustunlar: 'id,nom', limit: 2000 }),
        sbOqi<{ id: number; nom: string | null; raqam: string | null; loyiha_id: number | null }>({ jadval: 't2_shartnoma', filtr: `kompaniya_id=eq.${kompaniyaId}&holat=eq.faol`, ustunlar: 'id,nom,raqam,loyiha_id', limit: 5000 }),
      ]);
      if (!l?.ok || !s?.ok) return null;
      const sIdlar = (s.qatorlar ?? []).map((x) => x.id);
      const b = sIdlar.length
        ? await sbOqi<{ obyekt_id: number; shartnoma_id: number }>({ jadval: 't2_shartnoma_bog', filtr: `shartnoma_id=in.(${sIdlar.slice(0, 1000).join(',')})&holat=eq.faol`, ustunlar: 'obyekt_id,shartnoma_id', limit: 20000 })
        : { ok: true, qatorlar: [] };
      if (!b?.ok) return null;
      return { loyihalar: l.qatorlar ?? [], shartnomalar: s.qatorlar ?? [], boglar: b.qatorlar ?? [] };
    } catch { return null; }
  })();
  kesh.set(kompaniyaId, { vaqt: Date.now(), p });
  return p;
}
export function ierarxiyaKeshTozala() { kesh.clear(); }
