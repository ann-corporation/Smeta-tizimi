import { tizimImzosiniQoy } from '../../hujjat-yozuvchi/tizim-imzo';

/**
 * Faylni foydalanuvchiga beradigan YAGONA yo'l. Har Excel hujjat (va zip paket ichidagi xlsx) shu yerda
 * tizim imzosini oladi (kolontitul + xususiyatlar, egasi 2026-10-27) — eksportlar alohida yozmaydi.
 */
export function downloadBlob(data: Uint8Array, filename: string, mimeType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const imzoli = /\.(xlsx|xlsm|zip)$/i.test(filename) ? tizimImzosiniQoy(data, { hujjat: filename }) : data;
  const blob = new Blob([imzoli as any], { type: mimeType });
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
}
