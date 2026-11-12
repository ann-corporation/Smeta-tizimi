import { tizimImzosiniQoy } from '../../hujjat-yozuvchi/tizim-imzo';
import { nashrKompaniyasi } from '../../imzo/nashr-kontekst';
import type { NashrMeta } from '../../imzo/nashr';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Faylni foydalanuvchiga beradigan YAGONA yo'l. Har Excel hujjat (va zip paket ichidagi xlsx) shu yerda
 * tizim imzosini oladi (kolontitul + xususiyatlar, egasi 2026-10-27), yakka xlsx esa MANBA QR ham oladi
 * (lib/imzo/nashr.ts: qog'ozdagi QR skaner qilinsa hujjat tizimdan ochiladi/yuklanadi) - eksportlar alohida yozmaydi.
 * `meta` - ixtiyoriy (hujjat turi kaliti, obyekt); bo'lmasa tur fayl nomidan olinadi.
 */
export function downloadBlob(data: Uint8Array, filename: string, mimeType: string = XLSX_MIME, meta?: NashrMeta) {
  const imzoli = /\.(xlsx|xlsm|zip)$/i.test(filename) ? tizimImzosiniQoy(data, { hujjat: filename }) : data;
  const ber = (bytes: Uint8Array) => {
    const blob = new Blob([bytes as any], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };
  if (nashrKompaniyasi() && /\.(xlsx|xlsm)$/i.test(filename)) {
    // QR olish tarmoqqa tayanadi: xato yoki sekin bo'lsa ham fayl beriladi (QR siz) - eksport to'xtamaydi.
    void Promise.all([import('../../imzo/nashr'), import('../../../api/t2-nashr')])
      .then(([{ nashrQoy }, { nashrAdapter }]) => nashrQoy(imzoli, filename, meta, nashrAdapter))
      .then((qrli) => ber(qrli ?? imzoli), () => ber(imzoli));
    return;
  }
  ber(imzoli);
}
