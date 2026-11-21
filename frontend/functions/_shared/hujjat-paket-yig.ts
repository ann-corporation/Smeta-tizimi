/**
 * hujjat-paket-yig.ts - Hujjatlar paketini SERVERDA yig'ish (sayt, Android, Windows uchun bitta manba; /api/hujjat-paket ishlatadi).
 * Yangi mantiq yo'q: reja, ZIP yo'llari, «Tarkib» matni, token bahosi - `src/lib/hujjat-paket/*` (sayt va Telegram bot ishlatadigan o'sha kod).
 * Bu yerda faqat sayt HujjatPaket.yuklabOl bilan bir xil qoida: takror/taxminiy tashlanadi, F-2 doim server dvigateli orqali (token shu yerda, bir marta),
 * boshqa turlar Diskdan (bepul).
 */
import { paketReja, rejaF2Disk, type Nomzod, type PaketReja } from '../../src/lib/hujjat-paket/nomzod';
import { paketYigish, paketZipi, paketExcel, type Yetkazuvchi, type YigishNatija, type HujjatHolati } from '../../src/lib/hujjat-paket/yigish';
import { tanlanganlar, yuklashBahosi, type RoyxatQator } from '../../src/lib/hujjat-paket/royxat';

/** Bu hajmdan katta paket baytlar bilan emas, R2 havolasi bilan qaytariladi (hech qachon rad etilmaydi). */
export const PAKET_BAYT_CHEGARA = 25 * 1024 * 1024;
export const PAKET_HAVOLA_DAQIQA = 15;

export type PaketChiqish = 'zip' | 'excel';

/** Saytdagi `yuklabOl` reja qoidasi (HujjatPaket.tsx). */
export function paketRejaServer(nomzodlar: readonly Nomzod[]): Pick<PaketReja, 'diskdan' | 'yasash'> {
  const toza = nomzodlar.filter((n) => !n.takror && !n.taxminiy);
  const r0 = paketReja(toza, new Set(toza.map((n) => n.kalit)));
  return rejaF2Disk(r0);
}

/** Token bahosi: sayt `yuklashBahosi` bilan bir xil (faqat to'lanmagan va yasaladiganlar). Hech narsa yozilmaydi. */
export function paketBaho(qatorlar: readonly RoyxatQator[], kalitlar: ReadonlySet<string>, narx: ((katak: number) => number | null) | null) {
  const t = tanlanganlar(qatorlar, kalitlar);
  return { tanlangan: t.length, ...yuklashBahosi(t, narx) };
}

export type PaketNatija = { bytes: Uint8Array; nom: string; mime: string; soni: number; xatolar: string[]; /** Hujjat bo'yicha holat (tayyor/yangilandi/eskirgan/xato + sabab): hech narsa jim tashlanmaydi. */ holatlar: HujjatHolati[] };

/** Rejadagi hujjatlarni yig'ib ZIP yoki bitta Excel qiladi. Bo'sh paket - null (hech narsa yasalmadi). */
export async function paketYigServer(nomzodlar: readonly Nomzod[], sarlavha: string, chiqish: PaketChiqish, yet: Yetkazuvchi): Promise<PaketNatija | null> {
  const reja = paketRejaServer(nomzodlar);
  if (!reja.diskdan.length && !reja.yasash.length) return null;
  const y: YigishNatija = await paketYigish(reja, yet, {});
  if (!y.fayllar.length) return { bytes: new Uint8Array(), nom: '', mime: '', soni: 0, xatolar: y.xatolar, holatlar: y.holatlar ?? [] };
  if (chiqish === 'excel') {
    const e = await paketExcel(y, { sarlavha });
    return { bytes: e.bytes, nom: 'hujjatlar-paketi.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', soni: y.fayllar.length, xatolar: [...y.xatolar, ...e.otkazilgan], holatlar: y.holatlar ?? [] };
  }
  const z = paketZipi(y, { sarlavha, reja: { rad: [], olinmaydi: [] } });
  return { bytes: z.bytes, nom: 'hujjatlar-paketi.zip', mime: 'application/zip', soni: y.fayllar.length, xatolar: y.xatolar, holatlar: y.holatlar ?? [] };
}

/** R2 kaliti: aktorga bog'langan, taxmin qilib bo'lmaydigan. */
export const paketR2Kalit = (aktor: number, uuid: string, nom: string) => `paket/u${aktor}/${uuid}/${nom.replace(/[^A-Za-z0-9._-]+/g, '_')}`;
export const paketKalitAktorniki = (kalit: string, aktor: number) => new RegExp(`^paket/u${aktor}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$`).test(kalit);
