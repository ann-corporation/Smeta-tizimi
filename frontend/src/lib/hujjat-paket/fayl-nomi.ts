/**
 * Paketga kiradigan har fayl nomida KENGAYTMA bo'lishi shart (egasi 2026-11-21: Diskdagi F-2 nomi kengaytmasiz kelgan, ZIP da «Excel emas» fayl chiqqan).
 * Kengaytma: nomda bo'lsa - shu; aks holda mime (xlsx/pdf/docx/zip), bo'lmasa baytlar boshi (%PDF, PK = xlsx). Toza funksiya.
 */
const MA_LUM = /\.(xlsx|xlsm|xls|docx|doc|pdf|zip|txt|csv|png|jpe?g|dwg|dxf)$/i;
const MIME: ReadonlyArray<[RegExp, string]> = [
  [/spreadsheetml\.sheet/i, '.xlsx'], [/ms-excel/i, '.xls'], [/wordprocessingml/i, '.docx'], [/^application\/pdf/i, '.pdf'], [/^application\/zip/i, '.zip'],
  [/^image\/png/i, '.png'], [/^image\/jpe?g/i, '.jpg'], [/^text\/csv/i, '.csv'], [/^text\/plain/i, '.txt'],
];

export function kengaytmaTopish(bytes?: Uint8Array | null, mime?: string | null): string {
  for (const [re, ext] of MIME) if (mime && re.test(mime)) return ext;
  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return '.pdf';
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return '.xlsx'; // paket hujjatlari - Excel
  }
  return '';
}

/** Fayl nomi kengaytma bilan. Nom bo'sh bo'lsa `zaxira`. */
export function kengaytmaBilan(nom: string | null | undefined, bytes?: Uint8Array | null, mime?: string | null, zaxira = 'hujjat'): string {
  const n = (nom ?? '').trim() || zaxira;
  return MA_LUM.test(n) ? n : n + kengaytmaTopish(bytes, mime);
}
