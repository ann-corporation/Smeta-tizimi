/**
 * Narx izohi — narx QAYERDAN olingani bir qatorda (egasi 2026-10-02): "katalog 2026 2-kvartal Toshkent shahar
 * narxlaridan TTZ zavodidan NDS siz narxi olindi yoki taklif etiladi"; mash.-chas va chel.-chas ham xuddi shunday.
 * Ma'lumot yo'q joy — tashlab ketiladi (taxmin qilinmaydi).
 */
import type { NarxManbaTur } from '../../api/t2-narx-dalil';

export type NarxIzohManba = {
  manba_tur: NarxManbaTur; manba_nom?: string | null; manba_raqam?: string | null; manba_sana?: string | null;
  yil?: number | null; kvartal?: number | null; region?: string | null; yetkazuvchi?: string | null;
  ishlab_chiqaruvchi?: string | null; nds_holati?: 'nds_siz' | 'nds_bilan' | 'nomalum' | null; nds_izoh?: string | null;
  narx_varianti?: string | null; platforma?: boolean | null;
};

const TUR: Record<NarxManbaTur, string> = {
  katalog: 'katalog', faktura: 'hisob-faktura', kp: 'tijorat taklifi',
  kalkulyatsiya_mash: 'mash.-soat kalkulyatsiyasi', chel_chas: 'chel.-soat narxi', boshqa: 'hujjat',
};
const VARIANT: Record<string, string> = { ijtimoiy_12: 'ijtimoiy soliq 12%', ijtimoiy_25: 'ijtimoiy soliq 25%' };

/** "Platforma katalogi · 2026 y. 2-kvartal · Toshkent sh. · ООО «TTZ» zavodi · NDS siz" */
export function narxIzohi(m: NarxIzohManba): string {
  const q: string[] = [];
  q.push((m.platforma ? 'Platforma ' : '') + TUR[m.manba_tur] + (m.manba_raqam ? ` № ${m.manba_raqam}` : '') + (m.manba_sana ? ` (${m.manba_sana.split('-').reverse().join('.')})` : ''));
  if (m.yil && m.kvartal) q.push(`${m.yil} y. ${m.kvartal}-kvartal`); else if (m.yil) q.push(`${m.yil} y.`);
  if (m.region) q.push(m.region);
  if (m.ishlab_chiqaruvchi) q.push(`${m.ishlab_chiqaruvchi} zavodi`);
  else if (m.yetkazuvchi) q.push(m.yetkazuvchi);
  if (m.nds_holati === 'nds_siz') q.push('NDS siz');
  else if (m.nds_holati === 'nds_bilan') q.push('NDS bilan');
  else if (m.nds_izoh) q.push(m.nds_izoh);
  if (m.narx_varianti && VARIANT[m.narx_varianti]) q.push(VARIANT[m.narx_varianti]);
  return q.join(' · ');
}
