/**
 * Arxivlash / Korzinka (egasi 2026-11-12: «hech narsani UI orqali o'chirib bo'lmaydi»).
 * Yumshoq o'chirish: loyiha, obyekt, shartnoma, kontragent, АОСР qoralama, F2 qoralama → Korzinka (tiklanadi).
 * Server (t2_arxivla_v1) rol, kompaniya a'zoligi va «tasdiqlangan hujjat bor» blokini tekshiradi; UI faqat tushuntiradi.
 * Qattiq o'chirish faqat Korzinka sahifasida va faqat admin uchun.
 */
import { yozAmali } from './supabase';
import { obyektlarEskirdi } from './obyektlar-kesh-belgi';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';

export type ArxivTur = 'loyiha' | 'obyekt' | 'shartnoma' | 'kontragent' | 'aosr' | 'akt';
export type ArxivNatija = { ok: boolean; xabar?: string; code?: string };

/** Korzinka ko'rinishidagi `jadval` nomi ↔ arxiv turi (obyekt/smeta/sklad eski mexanizmda qoladi). */
export const ARXIV_JADVAL: Readonly<Record<string, Exclude<ArxivTur, 'obyekt'>>> = {
  t2_loyiha: 'loyiha', t2_shartnoma: 'shartnoma', t2_kontragent: 'kontragent', t2_aosr: 'aosr', t2_akt: 'akt',
};

export const ARXIV_NOM: Readonly<Record<ArxivTur, string>> = {
  loyiha: 'loyiha', obyekt: 'obyekt', shartnoma: 'shartnoma', kontragent: 'kontragent', aosr: 'АОСР qoralamasi', akt: 'F2 qoralamasi',
};

function natija(r: { ok: boolean; error?: string; xabar?: string; sabab?: string; code?: string }): ArxivNatija {
  return { ok: r.ok === true, code: r.code, xabar: r.ok ? undefined : (r.xabar || r.error || r.sabab || t('Bajarilmadi')) };
}

export async function sbArxivla(tur: ArxivTur, id: number): Promise<ArxivNatija> {
  const r = natija(await yozAmali({ amal: 'arxivla_v1', tur, id }));
  if (r.ok) obyektlarEskirdi();
  return r;
}

export async function sbArxivdanTiklash(tur: Exclude<ArxivTur, 'obyekt'>, id: number): Promise<ArxivNatija> {
  const r = natija(await yozAmali({ amal: 'arxivdan_tiklash_v1', tur, id }));
  if (r.ok) obyektlarEskirdi();
  return r;
}

export async function sbArxivButunlay(tur: Exclude<ArxivTur, 'obyekt'>, id: number): Promise<ArxivNatija> {
  const r = natija(await yozAmali({ amal: 'arxiv_butunlay_v1', tur, id }));
  if (r.ok) obyektlarEskirdi();
  return r;
}

/** Tasdiq so'raydi → arxivlaydi → natijani aytadi (rad etilsa — aniq sabab). Ommaviy: Jarvis ham shuni chaqiradi. */
export async function arxivlashJarayoni(tur: ArxivTur, id: number, nom: string): Promise<boolean> {
  const ha = await tasdiqSora({
    sarlavha: t('Korzinkaga yuborasizmi?'),
    matn: t('«{nom}» ({tur}) Korzinkaga o‘tadi va ro‘yxatlardan yo‘qoladi. Keyin Kompaniya → Korzinka bo‘limidan tiklash mumkin.', { nom, tur: t(ARXIV_NOM[tur]) }),
    tasdiqMatni: t('Korzinkaga yuborish'), xavfli: true,
  });
  if (!ha) return false;
  const r = await sbArxivla(tur, id);
  if (!r.ok) { toast(r.xabar || t('Arxivlanmadi'), 'danger'); return false; }
  toast(t('«{nom}» Korzinkaga yuborildi.', { nom }), 'ok');
  return true;
}
