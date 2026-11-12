/**
 * Karta qoidasini (lib/mindmap-boglanish) BAJARISH: har amal mavjud yozuvchiga boradi. Yozuvchilar `deps` orqali beriladi
 * (UI — haqiqiy API, test — soxta), shuning uchun «to‘g‘ri buyruq, to‘g‘ri argumentlar» sinovdan o‘tadi.
 */
import type { BogTur } from '../api/t2-mindmap';
import type { GrantKirish } from '../api/t2-tomon';
import type { Qoida, UzishAmal } from './mindmap-boglanish';

export type Natija = { ok: true; xabar: string } | { ok: false; error: string };
type Yoz = { ok: boolean; error?: string };

export interface BajarDeps {
  bog(tur: BogTur, manbaId: number, maqsadId: number, versiya: number, rol?: string): Promise<Yoz>;
  bogOchir(tur: BogTur, manbaId: number, maqsadId: number, versiya: number, rol?: string): Promise<Yoz>;
  taklif(p: { qabulInn: string; qabulNom: string; taklifRol: string; qabulRol: string }): Promise<Yoz>;
  grantSaqla(aloqaId: number, grantlar: GrantKirish[]): Promise<Yoz>;
  grantBekor(grantId: number): Promise<Yoz>;
  aloqaToxtat(aloqaId: number): Promise<Yoz>;
  masul(a: { obyektId?: number; loyihaId?: number; foydalanuvchiId: number; ruxsat: 'read' | 'write' | 'manage' | null }): Promise<Yoz>;
}

export type Kirish = { rol?: string; menRol?: string; grantlar?: { resurs: string; amallar: string[] }[] };
const idSon = (id: string) => Number(id.split(':')[1]);
const xato = (error: string): Natija => ({ ok: false, error });
const natija = (r: Yoz, xabar: string): Natija => (r.ok ? { ok: true, xabar } : xato(r.error || 'Bajarilmadi'));

export async function qoidaniBajar(q: Extract<Qoida, { holat: 'ishlaydi' }>, kirish: Kirish, deps: BajarDeps): Promise<Natija> {
  const m = idSon(q.manba.id), d = idSon(q.maqsad.id);
  if (q.amal === 'mindmap_bog' || q.amal === 'qatnashchi') {
    if (!q.bogTur) return xato('Bog‘lanish turi noma’lum.');
    const versiya = Number(q.maqsad.meta?.versiya);
    if (!Number.isInteger(versiya) || versiya < 0) return xato('Tugun versiyasi mavjud emas, qayta yuklang.');
    if (q.amal === 'qatnashchi') {
      if (!kirish.rol) return xato('Qatnashchi rolini tanlang.');
      return natija(await deps.bog(q.bogTur, m, d, versiya, kirish.rol), 'Qatnashchi biriktirildi · ' + kirish.rol);
    }
    return natija(await deps.bog(q.bogTur, m, d, versiya), q.sarlavha + ' — bajarildi');
  }
  if (q.amal === 'tomon_taklif') {
    if (!kirish.rol) return xato('Tomon rolini tanlang.');
    const inn = typeof q.maqsad.meta?.inn === 'string' ? q.maqsad.meta.inn.replace(/\D/g, '') : '';
    if (inn.length < 9) return xato('STIR (9 raqam) kerak.');
    return natija(await deps.taklif({ qabulInn: inn, qabulNom: q.maqsad.nom, taklifRol: kirish.menRol || 'pudratchi', qabulRol: kirish.rol }), 'Taklif yuborildi — javobni kuting');
  }
  if (q.amal === 'tomon_grant') {
    const tanlangan = (kirish.grantlar ?? []).filter((g) => g.amallar.length > 0);
    if (!tanlangan.length) return xato('Kamida bitta resurs va amalni tanlang.');
    const kalit = q.maqsad.tur === 'obyekt' ? 'obyekt_id' : q.maqsad.tur === 'loyiha' ? 'loyiha_id' : 'shartnoma_id';
    const grantlar = tanlangan.map((g) => ({ resurs: g.resurs, amallar: g.amallar, [kalit]: d }) as GrantKirish);
    return natija(await deps.grantSaqla(m, grantlar), 'Ko‘rish huquqi berildi');
  }
  if (q.amal === 'masul') {
    const ruxsat = 'write' as const;
    return natija(await deps.masul({ ...(q.maqsad.tur === 'obyekt' ? { obyektId: d } : { loyihaId: d }), foydalanuvchiId: m, ruxsat }), 'Mas’ul biriktirildi');
  }
  return xato('Bu amal bajarilmaydi.');
}

/** Chiziqni o‘chirish (tomon/mas’ul chiziqlari). Oddiy bog‘lanish chiziqlari mavjud `sbMindmapBogOchir` yo‘li bilan o‘chadi. */
export async function uzishniBajar(
  amal: Exclude<UzishAmal, 'mindmap_bog_ochir'>,
  p: { grantIdlar?: number[]; aloqaId?: number; obyektId?: number; loyihaId?: number; foydalanuvchiId?: number },
  deps: BajarDeps,
): Promise<Natija> {
  if (amal === 'tomon_grant_bekor') {
    if (!p.grantIdlar?.length) return xato('Huquq topilmadi.');
    for (const id of p.grantIdlar) { const r = await deps.grantBekor(id); if (!r.ok) return xato(r.error || 'Bekor qilinmadi'); }
    return { ok: true, xabar: 'Ko‘rish huquqi bekor qilindi' };
  }
  if (amal === 'tomon_aloqa_toxtat') {
    if (p.aloqaId == null) return xato('Aloqa topilmadi.');
    return natija(await deps.aloqaToxtat(p.aloqaId), 'Aloqa to‘xtatildi');
  }
  if (p.foydalanuvchiId == null) return xato('Odam topilmadi.');
  return natija(await deps.masul({ ...(p.obyektId != null ? { obyektId: p.obyektId } : { loyihaId: p.loyihaId }), foydalanuvchiId: p.foydalanuvchiId, ruxsat: null }), 'Mas’ul olib tashlandi');
}
