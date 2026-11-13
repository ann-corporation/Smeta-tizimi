/**
 * Shartnoma darajasidagi Forma 3: manbalar yuklagichi. Har obyekt uchun obyekt-rejimdagi F3 bilan AYNAN bir xil yagona yo'llar:
 * nakopitelniyYukla (smeta + F2 modeli), nakopitelniyUstamaOl (O'Z nakrutka/podvali), sbT2F2TafsilotOl (tasdiqlangan F2 certified),
 * portfelObyektOl + oyAktlarBahosi (har akt O'Z F2 podvali bilan). Hisob/Excel — forma3-export.ts (`forma3ShartnomaHujjat`).
 * Biror obyekt o'qilmasa — butun hujjat yasalmaydi (sabab bilan): chala shartnoma F3 si jim chiqmaydi.
 */
import { sbT2F2TafsilotOl } from '../../api/t2-narx';
import type { SvodYaxlit } from '../svod-yaxlit';
import { portfelObyektOl } from '../../api/f2-oylik-paket';
import { ozgarishRoyxatOl } from '../../api/t2-document-control';
import { oyAktlarBahosi } from '../f2-oylik-paket/portfel';
import { f3CertifiedHajm, f3CertifiedSources } from '../pto-document-lineage/f3-sources';
import { f3AktlarniFiltrla, type Forma3ShartnomaObyekt } from '../forma3-export';
import type { NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { nakopitelniyUstamaOl, nakopitelniyUstamaTayyorEmas, nakopitelniyYukla } from './nakopitelniy';

export type Forma3ShartnomaYuklash =
  | { ok: true; obyektlar: Forma3ShartnomaObyekt[] }
  | { ok: false; xato: string };

/**
 * @param oy hisobot oyi «YYYY-MM»
 * @param tanlangan hujjatga kiradigan (oy ichidagi) F2 akt idlari — tanlanmagan aktlar davr ustuniga kirmaydi
 */
export async function forma3ShartnomaManbalari(p: {
  kompaniyaId: number;
  obyektlar: ReadonlyArray<{ id: number; nom: string }>;
  oy: string;
  tanlangan: ReadonlySet<number>;
  onProgress?: (bajarildi: number, jami: number, nom: string) => void;
}): Promise<Forma3ShartnomaYuklash> {
  const out: Forma3ShartnomaObyekt[] = [];
  let i = 0;
  for (const ob of p.obyektlar) {
    p.onProgress?.(i, p.obyektlar.length, ob.nom);
    i++;
    const y = await nakopitelniyYukla(ob.id, `${p.oy}-01`);
    if ('xato' in y) return { ok: false, xato: `${ob.nom}: ${y.xato}` };
    if (y.r.truncated) return { ok: false, xato: `${ob.nom}: server ro‘yxatni to‘liq bermadi — chala hujjat chiqarilmaydi` };
    const ustama = await nakopitelniyUstamaOl(p.kompaniyaId, ob.id);
    const ux = nakopitelniyUstamaTayyorEmas(ustama);
    if (ux) return { ok: false, xato: `${ob.nom}: ${ux}` };
    const taf = await sbT2F2TafsilotOl({ obyektId: ob.id, tur: 'f2' });
    if (!taf.ok || taf.toliq === false || !taf.qatorlar) return { ok: false, xato: `${ob.nom}: F2 qatorlari to‘liq o‘qilmadi — chala ma’lumot ustida F3 tuzilmaydi` };
    let f2Oylik; let f2Hajm;
    try {
      f2Oylik = f3CertifiedSources(taf.qatorlar, p.kompaniyaId, ob.id, p.oy);
      f2Hajm = f3CertifiedHajm(taf.qatorlar, p.kompaniyaId, ob.id, p.oy);
    } catch (e) {
      return { ok: false, xato: `${ob.nom}: ${e instanceof Error && e.message === 'MISSING_CERTIFIED_AMOUNT' ? 'tasdiqlangan F2 manba summasi yetishmaydi' : 'F2 manbasi tekshiruvdan o‘tmadi'}` };
    }
    let ozgarishlar: Forma3ShartnomaObyekt['ozgarishlar'] = [];
    try {
      const oz = await ozgarishRoyxatOl(ob.id, 500);
      ozgarishlar = ((oz?.ozgarishlar ?? []) as Array<{ holat?: string | null; tur?: string | null; qatorlar?: Array<{ qator_id?: number | null; amal?: string | null }> }>)
        .filter((o) => o.tur === 'olib_tashlash' && o.holat === 'tasdiqlangan')
        .map((o) => ({
          holat: String(o.holat), tur: String(o.tur),
          qatorlar: (o.qatorlar ?? []).filter((z) => z.qator_id != null && !!z.amal).map((z) => ({ qator_id: Number(z.qator_id), amal: String(z.amal) })),
        }));
    } catch { /* ro‘yxat o‘qilmasa СМЕТНАЯ o‘zgarmaydi — obyekt rejimidagi kabi davom etamiz */ }
    // Hisobot oyining TANLANGAN aktlari — har biri O'Z F2 podvali bilan (M12).
    const oyAktlar = new Map<number, { id: number; oy: string; raqam: string | null }>();
    for (const l of taf.qatorlar) {
      if (l.akt_holat === 'tasdiqlangan' && String(l.oy).slice(0, 7) === p.oy && p.tanlangan.has(l.akt_id)) oyAktlar.set(l.akt_id, { id: l.akt_id, oy: l.oy, raqam: l.raqam ?? null });
    }
    let davrAktlari: Forma3ShartnomaObyekt['davrAktlari'] = [];
    if (oyAktlar.size) {
      try {
        const pm = await portfelObyektOl(p.kompaniyaId, ob.id, [...oyAktlar.keys()]);
        davrAktlari = oyAktlarBahosi(pm, [...oyAktlar.values()], ob.nom, new Map([...oyAktlar.values()].map((a) => [a.id, a.raqam] as const)));
      } catch {
        return { ok: false, xato: `${ob.nom}: F2 hujjatlarining o‘z podvali bo‘yicha oy summasi hisoblanmadi — F3 tuzilmadi. Qayta urinib ko‘ring.` };
      }
    }
    const manba = f3AktlarniFiltrla({ nakopitelniy: [{ obyekt_id: ob.id, obyektNom: ob.nom, qatorlar: y.qatorlar, svodYaxlit: (ustama.javob?.svod_yaxlit ?? null) as SvodYaxlit | null }], f2Oylik, f2Hajm }, p.oy, p.tanlangan);
    out.push({
      obyekt_id: ob.id, obyektNom: ob.nom, manba,
      nakrutka: ustama.koeffitsientlar as Partial<NakrutkaKoeffitsientlar> | null, nkManba: ustama.javob?.nk_manba ?? null, podval: ustama.podval,
      ozgarishlar, davrAktlari,
    });
  }
  p.onProgress?.(p.obyektlar.length, p.obyektlar.length, '');
  return { ok: true, obyektlar: out };
}
