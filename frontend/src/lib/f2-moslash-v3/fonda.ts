/**
 * F2 V3 og'ir bosqichlarini FONDA (Web Worker) bajaradi — sahifa qotmaydi.
 * Worker bo'lmasa (test/jsdom, eski brauzer) yoki Worker yiqilsa — asosiy oqimda
 * xuddi shu funksiya (natija bir xil, faqat tezlik farq qiladi).
 */
import { readXlsxFonda } from '../f2-import-parse/xlsxFonda';
import { f2AktlarniOqi, type F2Akt, type F2Tugun } from '../smeta-anatomiya/f2';
import { f2MoslashV3, type F2MoslashNatija, type F2MoslashOpts, type SmetaQator } from './index';

export type F2IshchiKirish =
  | { id: number; tur: 'oqi'; fayl: string; bytes: ArrayBuffer }
  | { id: number; tur: 'mosla'; daraxt: F2Tugun[]; smeta: SmetaQator[]; opts: F2MoslashOpts };

let keyingiId = 1;
/** Union bo'yicha taqsimlanuvchi Omit (oddiy Omit union kalitlarini yo'qotadi). */
type BezId<T> = T extends unknown ? Omit<T, 'id'> : never;

async function ishchida<T>(xabar: BezId<F2IshchiKirish>, kalit: 'aktlar' | 'natija', transfer?: Transferable[]): Promise<T | undefined> {
  if (typeof Worker === 'undefined' || typeof URL === 'undefined') return undefined;
  let w: Worker;
  try { w = new Worker(new URL('./f2v3.worker.ts', import.meta.url), { type: 'module' }); } catch { return undefined; }
  const id = keyingiId++;
  try {
    return await new Promise<T>((resolve, reject) => {
      w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; error?: string } & Record<string, unknown>>) => {
        if (e.data.id !== id) return;
        if (e.data.ok) resolve(e.data[kalit] as T); else reject(new Error(e.data.error || 'F2_ISHCHI_XATO'));
      };
      w.onerror = (ev) => { ev.preventDefault?.(); reject(new Error('F2_ISHCHI_YIQILDI')); };
      w.postMessage({ ...xabar, id }, transfer ?? []);
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'F2_ISHCHI_YIQILDI') return undefined;
    throw e;
  } finally {
    w.terminate();
  }
}

/** XLSX → F2 aktlari (fonda). */
export async function f2AktlarniOqiFonda(fayl: string, bytes: ArrayBuffer): Promise<F2Akt[]> {
  const nusxa = bytes.slice(0);
  const r = await ishchida<F2Akt[]>({ tur: 'oqi', fayl, bytes: nusxa }, 'aktlar', [nusxa]);
  if (r) return r;
  const kitob = await readXlsxFonda(bytes);
  return f2AktlarniOqi({ fayl, varaqlar: kitob.sheets.map((s) => ({ nom: s.name, rows: s.rows, merges: s.merges })) });
}

/** F2 daraxti × smeta → natija (fonda). */
export async function f2MoslashV3Fonda(daraxt: F2Tugun[], smeta: SmetaQator[], opts: F2MoslashOpts): Promise<F2MoslashNatija> {
  const r = await ishchida<F2MoslashNatija>({ tur: 'mosla', daraxt, smeta, opts }, 'natija');
  return r ?? f2MoslashV3(daraxt, smeta, opts);
}
