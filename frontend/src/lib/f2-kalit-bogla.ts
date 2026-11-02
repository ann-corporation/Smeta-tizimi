/**
 * F2 round-trip: tizim chiqargan Ф-2 Excel'idagi yashirin КАЛИТ ustuni (K) bo'yicha aniq bog'lash.
 * Ssenariy: tizim F2 ni eksport qiladi -> texnadzor Excel'da hajm/narxni tuzatadi -> fayl F2 importga qaytadi.
 * Himoya lrv-qayta-import.ts bilan bir xil (egasi ogohlantirishi 2026-09-09): kalit `<id>:<barmoq izi>`;
 * ID ga ko'r-ko'rona ishonilmaydi. Bog'lanadi FAQAT agar:
 *   - kalit to'g'ri shaklda, ID bu obyekt smetasida bor;
 *   - ID faylda ikki marta uchramagan (nusxalangan qator -> oddiy moslash);
 *   - fayldagi kod/nom/birlik barmoq izi kalitniki bilan mos (qo'lda tahrirlanmagan);
 *   - kanonik qator barmoq izi ham mos (eksportdan keyin smeta o'zgarmagan).
 * Aks holda qator jim oddiy moslashga qoladi. Kalitsiz (texnadzor qo'shgan) qatorlar ham oddiy moslashdan o'tadi.
 */
import { lrvIziMos, lrvKalitOqi } from './lrv-qayta-import';
import type { Katak } from './smeta-anatomiya/turlar';
import type { Bog } from './f2-moslash-v3/ishJoyi';
import { readXlsxFonda } from './f2-import-parse/xlsxFonda';

/** Yashirin КАЛИТ ustuni: K (0-asosli indeks 10) — f2-hujjat.ts USTUNLAR bilan bir xil. */
export const F2_KALIT_USTUN = 10;
export const F2_KALIT_USUL = 'kalit';

export type KalitTugun = { uid: string; kod: string | null; nom: string; birlik: string | null; manzil: { qator: number } };
export type KalitKanonik = { id: number; kod: string | null; nom: string | null; birlik: string | null };

export function kalitdanBog(rows: readonly (readonly Katak[])[], tugunlar: readonly KalitTugun[], kanonik: readonly KalitKanonik[]): Map<string, Bog> {
  const kan = new Map(kanonik.map((q) => [q.id, q]));
  const oqilgan: Array<{ t: KalitTugun; id: number; fp: string }> = [];
  const soni = new Map<number, number>();
  for (const t of tugunlar) {
    const k = lrvKalitOqi(rows[t.manzil.qator - 1]?.[F2_KALIT_USTUN]);
    if (!k) continue;
    oqilgan.push({ t, id: k.id, fp: k.fp });
    soni.set(k.id, (soni.get(k.id) ?? 0) + 1);
  }
  const bog = new Map<string, Bog>();
  for (const { t, id, fp } of oqilgan) {
    if ((soni.get(id) ?? 0) !== 1) continue; // nusxalangan qator
    const q = kan.get(id);
    if (!q) continue; // begona ID
    if (!lrvIziMos(fp, t.kod, t.nom, t.birlik)) continue; // fayldagi qator tahrirlangan
    if (!lrvIziMos(fp, q.kod, q.nom, q.birlik)) continue; // smeta o'zgargan
    bog.set(t.uid, { qatorId: id, holat: 'qolda', usul: F2_KALIT_USUL });
  }
  return bog;
}

/** Faylni (varaq nomi bo'yicha) o'qib kalitdan bog'laydi. Hech qachon xato tashlamaydi - kalit yo'q bo'lsa bo'sh xarita. */
export async function fayldanKalitBog(fayl: Blob | null | undefined, varaq: string, tugunlar: readonly KalitTugun[], kanonik: readonly KalitKanonik[]): Promise<Map<string, Bog>> {
  if (!fayl) return new Map();
  try {
    const wb = await readXlsxFonda(await fayl.arrayBuffer());
    const sheet = wb.sheet(varaq);
    return sheet ? kalitdanBog(sheet.rows as Katak[][], tugunlar, kanonik) : new Map();
  } catch { return new Map(); }
}
