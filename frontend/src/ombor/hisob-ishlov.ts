import { paketDekod, paketdanHolatlar } from './paket';
import type { HisobSorov, HisobJavob } from './hisob-protokol';

/** DOM/tarmoqsiz Worker eshigi. Buzilgan paketda yarim hisob qaytarmaydi. */
export function hisobIshlov(s: HisobSorov): HisobJavob {
  const belgi = { id: s.id, epoch: s.epoch, revision: s.revision };
  try {
    if (![s.id, s.epoch, s.revision].every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error();
    const bosh = performance.now();
    const holatlar = paketdanHolatlar(paketDekod(s.paket));
    return { ...belgi, ok: true, holatlar, vaqtMs: performance.now() - bosh };
  } catch {
    // Xom paket, real nom/summa va ichki stack UIga yoki logga chiqmaydi.
    return { ...belgi, ok: false, xato: 'HISOB_PAKET_XATO' };
  }
}
