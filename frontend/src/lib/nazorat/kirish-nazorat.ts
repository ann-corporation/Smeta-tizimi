/**
 * kirish-nazorat.ts - Акт входного контроля материалов (rasmiy ruscha) uchun sof qatorlar.
 * Pul yo'q. Qiymat yo'q bo'lsa katak bo'sh qoladi (soxta matn va 0 yo'q); sertifikat/pasport
 * yo'q material "документ не представлен" deb belgilanadi, "mos" deb emas.
 */
export type KirishMaterial = {
  nom: string;
  birlik?: string | null;
  /** NULL != 0: noma'lum miqdor bo'sh qoladi. */
  miqdor?: number | null;
  partiya?: string | null;
  yetkazuvchi?: string | null;
  /** Sertifikat / паспорт качества raqami. */
  sertifikat?: string | null;
  sertifikatSana?: string | null;
  /** Ko'rik natijasi: mos / mos emas / hali ko'rilmagan. */
  natija?: 'mos' | 'mos_emas' | 'kutilmoqda' | null;
  izoh?: string | null;
};

export const KIRISH_USTUNLARI = ['№ п/п', 'Наименование материала', 'Ед. изм.', 'Кол-во', 'Партия', 'Поставщик', 'Документ о качестве', 'Результат входного контроля', 'Примечание'] as const;

const ddmmyyyy = (iso?: string | null): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

export function kirishNatijasiRu(m: Pick<KirishMaterial, 'natija' | 'sertifikat'>): string {
  if (!m.sertifikat?.trim()) return 'Документ о качестве не представлен';
  if (m.natija === 'mos') return 'Соответствует';
  if (m.natija === 'mos_emas') return 'Не соответствует';
  return 'Проверка не завершена';
}

export function kirishQatorlari(royxat: readonly KirishMaterial[]): string[][] {
  return royxat.map((m, i) => [
    String(i + 1), m.nom, m.birlik ?? '', m.miqdor == null ? '' : String(m.miqdor), m.partiya ?? '', m.yetkazuvchi ?? '',
    m.sertifikat?.trim() ? [m.sertifikat.trim(), ddmmyyyy(m.sertifikatSana)].filter(Boolean).join(' от ') : '',
    kirishNatijasiRu(m), m.izoh ?? '',
  ]);
}

/** Qisqa xulosa: nechta material, nechtasida hujjat yo'q yoki mos emas. Hammasi mos bo'lmasa "mos" deyilmaydi. */
export function kirishXulosa(royxat: readonly KirishMaterial[]): { jami: number; hujjatsiz: number; mosEmas: number; tugallanmagan: number; hammasiMos: boolean } {
  let hujjatsiz = 0; let mosEmas = 0; let tugallanmagan = 0;
  for (const m of royxat) {
    if (!m.sertifikat?.trim()) hujjatsiz += 1;
    else if (m.natija === 'mos_emas') mosEmas += 1;
    else if (m.natija !== 'mos') tugallanmagan += 1;
  }
  return { jami: royxat.length, hujjatsiz, mosEmas, tugallanmagan, hammasiMos: royxat.length > 0 && hujjatsiz + mosEmas + tugallanmagan === 0 };
}
