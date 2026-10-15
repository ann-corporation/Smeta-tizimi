/**
 * Kompaniyaning o'z narx manbalari (egasi 2026-10-15: "foydalanuvchi individual KP berib yetkazuvchining haqiqiy narxini qo'ya
 * olishi kerak"; "kompaniya foydalanuvchilari faqat o'zlari uchun narx yuklashi mumkin"): KP, hisob-faktura, kompaniya katalogi /
 * prays-listi → Studio narx nomzodlari. Bular OBOSNOVANIYA bo'la oladi (hujjat bor), oldingi smetalardan farqli.
 *
 * QQS (egasi: smeta hujjatlarida narx QQSsiz): manba «QQS bilan» bo'lsa narx ÷ 1,12 va bu izohda yoziladi; QQS holati
 * NOMA'LUM manba nomzod bo'lmaydi (sanaladi va foydalanuvchiga ko'rsatiladi) — taxmin qilinmaydi.
 */
import { sbNarxManbaQidiruvQatorlariOl, sbNarxManbalarOl, type NarxManba } from '../../api/t2-narx-dalil';
import type { KatalogQatori } from '../narx-katalog/types';
import type { MatchCatalog } from './resource-match';

/** Price-source kinds that are product prices (hour publications are priced elsewhere). */
const NARX_TURLARI = new Set(['kp', 'faktura', 'katalog', 'boshqa']);
export const QQS_STAVKA = 0.12;

export type KompaniyaManbalari = { view: MatchCatalog; manbalar: number; qatorlar: number; qqsNomalum: number; qqsChiqarildi: number };

/** Pure: company sources + rows → a matcher view with VAT-free prices. */
export function kompaniyaManbaKatalogi(manbalar: Array<Pick<NarxManba, 'id' | 'tur' | 'nom' | 'raqam' | 'sana' | 'yetkazuvchi' | 'region' | 'yil' | 'kvartal' | 'nds_holati'>>,
  qatorlar: Array<{ id: number; manba_id: number; nom: string; birlik: string | null; narx: number | null }>): KompaniyaManbalari {
  const by = new Map(manbalar.filter(m => NARX_TURLARI.has(m.tur)).map(m => [m.id, m]));
  const rows: KatalogQatori[] = [];
  let qqsNomalum = 0, qqsChiqarildi = 0;
  for (const q of qatorlar) {
    const m = by.get(q.manba_id);
    if (!m || q.narx == null || !(Number(q.narx) > 0) || !q.nom?.trim()) continue;
    if (m.nds_holati === 'nomalum') { qqsNomalum++; continue; }
    const asl = Number(q.narx);
    const narx = m.nds_holati === 'nds_bilan' ? Math.round((asl / (1 + QQS_STAVKA)) * 100) / 100 : asl;
    if (m.nds_holati === 'nds_bilan') qqsChiqarildi++;
    const hujjat = [m.tur === 'kp' ? 'Коммерческое предложение' : m.tur === 'faktura' ? 'Счет-фактура' : 'Прайс-лист', m.raqam ? `№ ${m.raqam}` : null,
      m.sana ? `от ${m.sana.split('-').reverse().join('.')}` : null, m.yetkazuvchi].filter(Boolean).join(' ');
    rows.push({ id: q.id, manba_id: m.id, kod: null, nom: q.nom.trim(), birlik: q.birlik, narx, hudud: m.region, ishlab_chiqaruvchi: null, nds_holati: 'nds_siz',
      nds_izoh: m.nds_holati === 'nds_bilan' ? `цена документа ${asl} с НДС, НДС 12% исключён` : null, yil: m.yil, kvartal: m.kvartal, narx_varianti: null, guruh: null,
      hudud_kalit: null, manba_nom: hujjat || m.nom, manba_tur: m.tur === 'katalog' || m.tur === 'boshqa' ? 'prays' : m.tur, manba_sana: m.sana, manba_yetkazuvchi: m.yetkazuvchi });
  }
  const view: MatchCatalog = { size: rows.length, name: i => rows[i].nom, unit: i => rows[i].birlik, region: () => null, price: i => rows[i].narx, row: i => rows[i] };
  return { view, manbalar: by.size, qatorlar: rows.length, qqsNomalum, qqsChiqarildi };
}

export async function kompaniyaManbalariniOl(kompaniyaId: number): Promise<KompaniyaManbalari> {
  const [m, q] = await Promise.all([sbNarxManbalarOl(kompaniyaId), sbNarxManbaQidiruvQatorlariOl(kompaniyaId)]);
  if (!m.ok || !q.ok) throw new Error('COMPANY_SOURCES_UNAVAILABLE');
  return kompaniyaManbaKatalogi(m.qatorlar ?? [], (q.qatorlar ?? []).map(x => ({ id: x.id, manba_id: x.manba_id, nom: x.nom, birlik: x.birlik, narx: x.narx == null ? null : Number(x.narx) })));
}

/** VAT state from the document's own words (headers, notes). Both or neither → unknown: the user decides, nothing is guessed. */
export function qqsHolatiniAniqla(matn: string): 'nds_bilan' | 'nds_siz' | 'nomalum' {
  const s = matn.toLowerCase().replace(/\s+/g, ' ');
  const siz = /без\s*(учета\s*)?ндс|ндс\s*не\s*облага|qqs\s*siz|qqssiz/.test(s);
  const bilan = /с\s*(учетом\s*)?ндс|в\s*т\.?\s*ч\.?\s*ндс|включая\s*ндс|ндс\s*\(?\s*1[25]\s*%|qqs\s*bilan/.test(s);
  return siz === bilan ? 'nomalum' : siz ? 'nds_siz' : 'nds_bilan';
}
