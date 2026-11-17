/**
 * Omborchi «eslab qolish» takliflari (autocomplete). Sof funksiyalar (DB/tarmoq yo'q).
 *
 * Qoida (egasi): variant guruhlari tasdiqlanmaydi. Omborchi bir marta kiritgan material nomi (birlik, oxirgi yetkazuvchi/qabul qiluvchi, narx)
 * shu omborning o'z yozuvlaridan eslab qolinadi va keyingi safar taklif qilinadi: eng yaqinda va eng ko'p ishlatilgani birinchi.
 * Taklifni tanlash qatorni to'ldiradi; yangi nom o'zi qabul qilinadi va keyingi safar taklif bo'ladi.
 * Lotin/kirill va qisman yozilgan so'z («sem» → «Цемент») ham topiladi. Web, Android va Telegram bir xil server mantiqidan foydalanadi.
 */
import { birlikKaliti, nomKaliti, nomTokenlari, nomTokenlariXom } from './moslash';

/** Ombor harakatidan eslatma uchun kerakli maydonlar (t2_sklad_harakat). */
export type EslatmaYozuv = {
  id?: number; nomi: string | null; birligi: string | null; sana: string | null; operatsiya: string | null;
  postavshik?: string | null; qabul_qiluvchi?: string | null; narx?: number | string | null;
};
export type Eslatma = {
  nomi: string; birligi: string; soni: number; oxirgi_sana: string | null;
  postavshik: string | null; qabul_qiluvchi: string | null; narx: number | null;
};

/** Eslatma uchun hisobga olinadigan harakat manbalari: kirim/chiqimning o'zi (storno/qaytarish yozuvlari EMAS). */
export const ESLATMA_MANBALARI: readonly string[] = [
  'c11_warehouse_receipt_v1', 'c11_warehouse_berdim_v1', 'ombor_prixod_v1', 'ombor_prixod_sinxron_v1', 'ombor_chiqim_v1',
];

const toza = (v: unknown): string | null => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s || null; };
const musbatSon = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };

/** So'rovdagi har bir token nom tokenlaridan birining BOSHIGA mos kelishi kerak (sinonimli va xom shakllarda). */
function mosmi(sorov: string[], nomTok: Set<string>): boolean {
  return sorov.every((q) => { for (const w of nomTok) if (w.startsWith(q)) return true; return false; });
}

/**
 * Yozuvlardan (har qanday tartibda) takliflar. `sorov` bo'sh bo'lsa — eng yaqin va eng ko'p ishlatilganlar.
 * Guruhlash: (nom kaliti, birlik kaliti) — bir xil nomning har xil yozilishi (lotin/kirill, bo'shliq) bitta taklifga, eng so'nggi yozilishi ko'rsatiladi.
 * Tartib: so'rovning birinchi so'zi bilan boshlanadigan nom → oxirgi sana (yangi) → soni (ko'p) → nom.
 */
export function eslatmaYigish(yozuvlar: readonly EslatmaYozuv[], sorov: string, limit = 8): Eslatma[] {
  const q = toza(sorov) ?? '';
  // so'rov va nom tokenlari ikkala shaklda (sinonimli/xom): kamida bitta shakl bo'yicha hammasi mos bo'lsa yetarli
  const qSyn = q ? nomTokenlari(q) : [], qXom = q ? nomTokenlariXom(q) : [];
  const guruhlar = new Map<string, { e: Eslatma; sanaKalit: string; tok: Set<string> }>();
  for (const y of yozuvlar) {
    const nomi = toza(y.nomi), birligi = toza(y.birligi);
    if (!nomi || !birligi) continue;
    const kalit = nomKaliti(nomi) + '|' + birlikKaliti(birligi);
    const sana = toza(y.sana) ?? '';
    let g = guruhlar.get(kalit);
    if (!g) {
      g = { e: { nomi, birligi, soni: 0, oxirgi_sana: null, postavshik: null, qabul_qiluvchi: null, narx: null }, sanaKalit: '', tok: new Set([...nomTokenlari(nomi), ...nomTokenlariXom(nomi)]) };
      guruhlar.set(kalit, g);
    }
    g.e.soni += 1;
    // eng yangi yozuv — nom yozilishi va yordamchi maydonlar shundan
    const yangi = g.e.soni === 1 || sana > g.sanaKalit; // yozuvlar yangisidan eskisiga keladi: teng sanada birinchisi qoladi
    if (yangi) { g.sanaKalit = sana; g.e.nomi = nomi; g.e.birligi = birligi; g.e.oxirgi_sana = sana || null; }
    if (y.operatsiya === 'prixod') {
      const p = toza(y.postavshik); const n = musbatSon(y.narx);
      if (p && (g.e.postavshik == null || yangi)) g.e.postavshik = p;
      if (n != null && (g.e.narx == null || yangi)) g.e.narx = n;
    } else if (y.operatsiya === 'rasxod') {
      const p = toza(y.qabul_qiluvchi);
      if (p && (g.e.qabul_qiluvchi == null || yangi)) g.e.qabul_qiluvchi = p;
    }
  }
  const nat: { e: Eslatma; sanaKalit: string; boshi: number }[] = [];
  for (const g of guruhlar.values()) {
    if (q && !(mosmi(qSyn, g.tok) || mosmi(qXom, g.tok))) continue;
    const birinchi = qSyn[0] ?? qXom[0];
    const nomTok = nomTokenlari(g.e.nomi);
    const boshi = !q || (birinchi && (nomTok[0]?.startsWith(birinchi) || nomTokenlariXom(g.e.nomi)[0]?.startsWith(qXom[0] ?? birinchi))) ? 0 : 1;
    nat.push({ e: g.e, sanaKalit: g.sanaKalit, boshi });
  }
  nat.sort((a, b) => a.boshi - b.boshi || (b.sanaKalit < a.sanaKalit ? -1 : b.sanaKalit > a.sanaKalit ? 1 : 0) || b.e.soni - a.e.soni || a.e.nomi.localeCompare(b.e.nomi));
  return nat.slice(0, Math.max(1, Math.min(20, limit))).map((x) => x.e);
}

/** Tanlangan taklifni kiritish qatoriga qo'yish: nom/birlik doim; kontragent faqat bo'sh bo'lsa (kirimda yetkazuvchi, chiqimda qabul qiluvchi). */
export function eslatmaQatorga(e: Eslatma, tur: 'prixod' | 'chiqim', joriyKontragent: string): { nomi: string; birligi: string; kontragent: string } {
  const taklif = tur === 'prixod' ? e.postavshik : e.qabul_qiluvchi;
  return { nomi: e.nomi, birligi: e.birligi, kontragent: joriyKontragent.trim() ? joriyKontragent : (taklif ?? '') };
}
