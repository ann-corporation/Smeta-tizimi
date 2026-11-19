/**
 * hujjat-boshqa.ts - F-3 (Forma № 3) va obyekt hujjatlari (nakopitelniy, M-29, slichitelniy, ostatka) ni yasash: YAGONA yo'l.
 * /api/hujjat-yarat (sayt, ilovalar) va fon yangilovchi (hujjat-yangila) SHU funksiyalarni chaqiradi - ikkinchi quruvchi yo'q.
 */
import { sbT2KompaniyalarOl, sbT2ObyektlarOlKomp } from '../../src/api/supabase';
import { Rad, type Tayyor } from './hujjat-f2';
import { shartnomaSvodOl } from '../../src/api/t2-nakopitelniy';
import { sotuvF3lar, type SvodShartnoma } from '../../src/lib/nakopitelniy-svod';
import { f3ShaklTozala, forma3SotuvdanXlsx } from '../../src/lib/forma3-export';
import { mazmunXeshi } from '../../src/api/mazmun-xesh';
import { nakopitelniyPaketFayli } from '../../src/lib/oylik-hujjat/nakopitelniy';
import { ostatkaPaketFayli, paketImzosiOl } from '../../src/lib/oylik-hujjat/ostatka-slichitelniy';
import { m29PaketFayli, pudratchiNomiOl } from '../../src/lib/oylik-hujjat/m29';
import { forma3Manba, obyektHujjatManba } from '../../src/lib/disk-hujjat';
import { NDS_SUKUT_FOIZ } from '../../src/lib/nakopitelniy-vedomost-export';

const OY = /^\d{4}-(0[1-9]|1[0-2])$/;
export async function f3Yasa(kompaniyaId: number, obyektId: number, shartnomaId: number, f3Id: number, shakl: unknown): Promise<Tayyor> {
  const [svod, komp] = await Promise.all([shartnomaSvodOl(kompaniyaId), sbT2KompaniyalarOl()]);
  if (!svod.ok) throw new Rad(502, 'SVOD_OQILMADI', 'Shartnoma svodi o‘qilmadi');
  const sh: SvodShartnoma | undefined = svod.natija.shartnomalar.find((x) => x.id === shartnomaId);
  if (!sh || !sh.obyektlar.some((o) => o.id === obyektId)) throw new Rad(404, 'SHARTNOMA_TOPILMADI', 'Shartnoma topilmadi');
  const tashkilot = (komp.qatorlar ?? []).find((k) => k.id === kompaniyaId)?.nom ?? null;
  const h = forma3SotuvdanXlsx(sh, f3Id, { tashkilot, shakl: f3ShaklTozala(shakl) });
  if (!h) throw new Rad(409, 'F3_HISOBLANMADI', 'Форма № 3 hisoblanmadi (sana/summa yo‘q)');
  const f3q = sotuvF3lar(sh).find((x) => x.id === f3Id);
  return { bytes: h.bytes, faylNomi: h.faylNomi, turi: 'f3', obyektId, davr: null, xesh: await mazmunXeshi(h.bytes), arxivla: true,
    manba: forma3Manba({ forma3Id: f3Id, shartnomaId: sh.id, raqam: f3q?.raqam ?? null, shartnomaRaqam: sh.raqam ?? null, davr: (f3q?.sotuv_sana ?? '').slice(0, 7) || null }) };
}

/** Oylik/obyekt hujjatlari: sayt sahifalari va oylik paket ishlatadigan AYNAN o'sha `*PaketFayli` quruvchilari (paket.test: sahifa yo'li bilan bayt-bayt teng). */
export async function obyektHujjati(tur: 'nakopitelniy' | 'm29' | 'slichitelniy' | 'ostatka', kompaniyaId: number, obyektId: number, oySon: number | null, ndsFoiz: number | null): Promise<Tayyor> {
  const [obyektlar, imzo] = await Promise.all([sbT2ObyektlarOlKomp(kompaniyaId), paketImzosiOl(kompaniyaId, obyektId)]);
  const ob = (obyektlar.qatorlar ?? []).find((o) => o.id === obyektId);
  if (!ob) throw new Rad(404, 'OBYEKT_TOPILMADI', 'Obyekt topilmadi');
  const oy = oySon ? `${String(oySon).slice(0, 4)}-${String(oySon).slice(4, 6)}` : null;
  if ((tur === 'nakopitelniy' || tur === 'm29') && (!oy || !OY.test(oy))) throw new Rad(400, 'PARAMETR_YOQ', 'oy_son (YYYYMM) kerak');
  const r = tur === 'nakopitelniy' ? await nakopitelniyPaketFayli({ kompaniyaId, obyektId, obyektNom: ob.nom, oy: oy!, imzo, ndsFoiz })
    : tur === 'm29' ? await m29PaketFayli({ kompaniyaId, obyektId, obyektNom: ob.nom, oy: oy!, imzo, pudratchi: await pudratchiNomiOl(kompaniyaId).catch(() => null) })
      : await ostatkaPaketFayli({ kompaniyaId, obyektId, obyektNom: ob.nom, imzo, tur });
  if (!r.ok) throw new Rad(409, r.bosh ? 'HUJJAT_BOSH' : 'HUJJAT_TUZILMADI', r.xato.slice(0, 200));
  return { bytes: r.bytes, faylNomi: r.nom, turi: tur, obyektId, davr: oy, xesh: await mazmunXeshi(r.bytes), arxivla: true, manba: obyektHujjatManba({ tur, obyektId, obyekt: ob.nom ?? null, oy }) };
}


/** Fon yangilovchi navbat turlari (t2_hujjat_yangila_navbat.tur; f2 alohida: hujjat-f2.ts). */
export const BOSHQA_TURLAR = ['forma3', 'slichitelniy', 'ostatka', 'nakopitelniy', 'm29'] as const;
export type BoshqaTur = (typeof BOSHQA_TURLAR)[number];
export const boshqaTurMi = (t: string): t is BoshqaTur => (BOSHQA_TURLAR as readonly string[]).includes(t);

/** Navbat `manba_id` kodlash (SQL 20270119000501 bilan bir xil): nakopitelniy/m29 = obyekt*1e6 + YYYYMM; slichitelniy/ostatka = obyekt; forma3 = forma3 id. */
export function oylikManba(manbaId: number): { obyektId: number; oySon: number } { return { obyektId: Math.floor(manbaId / 1_000_000), oySon: manbaId % 1_000_000 }; }

export type BoshqaSorov = { tur: BoshqaTur; manba_id: number; kompaniya_id: number; obyekt_id: number | null };
/** Navbat qatoridan hujjatni yasaydi (hujjat-yarat bilan bir xil quruvchilar). Token YECHILMAYDI. */
export async function boshqaYasa(q: BoshqaSorov): Promise<Tayyor> {
  if (q.tur === 'forma3') {
    const svod = await shartnomaSvodOl(q.kompaniya_id);
    if (!svod.ok) throw new Rad(502, 'SVOD_OQILMADI', "Shartnoma svodi o'qilmadi");
    const sh = svod.natija.shartnomalar.find((x) => sotuvF3lar(x).some((f) => f.id === q.manba_id) && (q.obyekt_id == null || x.obyektlar.some((o) => o.id === q.obyekt_id)));
    const obyektId = q.obyekt_id ?? sh?.obyektlar[0]?.id ?? null;
    if (!sh || !obyektId) throw new Rad(404, 'SHARTNOMA_TOPILMADI', 'F-3 sotuv shartnomasida topilmadi');
    return f3Yasa(q.kompaniya_id, obyektId, sh.id, q.manba_id, undefined);
  }
  if (q.tur === 'slichitelniy' || q.tur === 'ostatka') return obyektHujjati(q.tur, q.kompaniya_id, q.manba_id, null, NDS_SUKUT_FOIZ);
  const { obyektId, oySon } = oylikManba(q.manba_id);
  return obyektHujjati(q.tur, q.kompaniya_id, obyektId, oySon, NDS_SUKUT_FOIZ);
}