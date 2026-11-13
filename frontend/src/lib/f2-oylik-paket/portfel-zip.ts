/**
 * F2 PORTFELI — ZIP PAKET (egasi 2026-11-13: «paket degani alohida folderlarda alohida hujjat sifatida berilishi kerak»).
 * Avval «Yuklab olish» bitta Excel kitobda «Свод» + har akt varag'i berardi. Endi sukut — ZIP:
 *
 *   Реестр пакета.xlsx                       — paketdagi har fayl: hujjat, obyekt, №, davr, holat, summa (ВСЕГО с НДС)
 *   01 Акты Ф-2/<объект>/<объект> — Акт Ф-2 №… .xlsx   — har akt ALOHIDA fayl (obyekt 1 ta bo'lsa — papkasiz)
 *   02 Свод Ф-2/Свод Ф-2 — <срез>.xlsx       — obyekt/oy kesimidagi svod (jami: утверждённые / черновики / всего)
 *
 * Papka va fayl nomlari RUS tilida (rasmiy hujjat qoidasi), raqamlangan — ish tartibida saralanadi; xavfsiz (`/\:*?"<>|` yo'q),
 * uzunligi cheklangan, takrorsiz. Toza funksiyalar: rejalash + ZIP yig'ish; Excel generatorlari tashqarida (sahifa chaqiradi).
 */
import { zipSync, type Zippable } from 'fflate';
import { BARQAROR_VAQT, RasmiyVaraq, imzoTomonlari, rasmiyKitob, xavfsizFaylNomi, xavfsizQism, type ImzoNomlar, type RasmiyUstun } from '../hujjat-yozuvchi';
import { takrorsizYol } from './oylik';

export const PAPKA_AKT = '01 Акты Ф-2';
export const PAPKA_SVOD = '02 Свод Ф-2';
export const REESTR_FAYL_NOMI = 'Реестр пакета.xlsx';
/** ZIP ichidagi to'liq yo'l uzunligi chegarasi (Windows MAX_PATH=260 dan pastroq — papka bilan yuklab ochilganda ham sig'sin). */
export const YOL_MAKS = 200;

export type PaketHujjatTuri = 'akt' | 'svod';
export type PaketHujjat = {
  tur: PaketHujjatTuri;
  /** Obyekt nomi (svod uchun null). */
  obyekt: string | null;
  /** Hujjat nomi (reestr ustuni): «Акт Ф-2», «Свод Ф-2». */
  hujjat: string;
  /** Ф-2 raqami (akt) yoki bo'sh. */
  raqam?: string | null;
  /** Davr matni (masalan «Март 2026»). */
  davr?: string | null;
  /** Saralash kaliti `YYYY-MM` (matn bo'yicha emas, xronologik). */
  oyKalit?: string | null;
  /** Holat (rus): «утверждён», «черновик / на проверке». */
  holat?: string | null;
  /** QQS bilan summa; null — noma'lum (reestrda katak bo'sh, 0 emas). */
  summa?: number | null;
  qoralama?: boolean;
  /** Takror nomlarni ajratish uchun (akt id). */
  aktId?: number;
  bytes: Uint8Array;
};

const AJRATGICH = ' — ';

/** Akt fayl nomi: `<Объект> — Акт Ф-2 №<raqam> <davr>[ (черновик)].xlsx`; raqam yo'q — `id<aktId>`. */
export function aktFaylNomi(i: { obyekt: string; raqam?: string | null; davr?: string | null; aktId?: number; qoralama?: boolean }): string {
  const raqam = xavfsizQism(i.raqam, 24, '');
  const q = [
    xavfsizQism(i.obyekt, 60, 'Объект'),
    `Акт Ф-2 №${raqam || (i.aktId != null ? `id${i.aktId}` : '—')}`,
  ];
  const davr = xavfsizQism(i.davr, 24, '');
  const dm = [q.join(AJRATGICH), davr, i.qoralama ? '(черновик)' : ''].filter(Boolean).join(' ');
  return xavfsizFaylNomi(dm, 'xlsx', 110);
}

/** Svod fayl nomi: `Свод Ф-2 — <срез>.xlsx`. */
export function svodFaylNomi(kesim: string): string {
  return xavfsizFaylNomi(`Свод Ф-2${AJRATGICH}${xavfsizQism(kesim, 70, 'портфель')}`, 'xlsx', 110);
}

export type PaketRejaQator = { yol: string; hujjat: PaketHujjat };

/**
 * ZIP rejasi: har hujjat — to'liq yo'l. Aktlar `01 Акты Ф-2/`, svod `02 Свод Ф-2/`; obyekt BIR nechta bo'lsa — aktlar obyekt papkasida.
 * Papka tartibi — nom bo'yicha; takror yo'l — `_2`, `_3`; yo'l `YOL_MAKS` dan uzun bo'lmaydi (fayl nomi qisqartiriladi).
 */
export function paketRejasi(hujjatlar: readonly PaketHujjat[], nomlar: { svodKesim: string }): PaketRejaQator[] {
  const obyektlar = new Set(hujjatlar.filter((h) => h.tur === 'akt').map((h) => h.obyekt ?? ''));
  const papkali = obyektlar.size > 1;
  const band = new Set<string>([REESTR_FAYL_NOMI.toLowerCase()]);
  const papkaNomi = new Map<string, string>();
  const bandPapka = new Set<string>();
  const obyektPapka = (nom: string): string => {
    const k = nom.toLowerCase();
    let p = papkaNomi.get(k);
    if (p) return p;
    const asos = xavfsizQism(nom, 60, 'Объект');
    p = asos;
    for (let n = 2; bandPapka.has(p.toLowerCase()); n++) p = `${asos} (${n})`;
    bandPapka.add(p.toLowerCase());
    papkaNomi.set(k, p);
    return p;
  };
  const tartib = [...hujjatlar].sort((a, b) => (a.tur === b.tur ? 0 : a.tur === 'akt' ? -1 : 1)
    || (a.obyekt ?? '').localeCompare(b.obyekt ?? '', 'ru') || String(a.oyKalit ?? '').localeCompare(String(b.oyKalit ?? ''))
    || String(a.raqam ?? '').localeCompare(String(b.raqam ?? ''), 'ru', { numeric: true }) || (a.aktId ?? 0) - (b.aktId ?? 0));
  return tartib.map((h) => {
    const papka = h.tur === 'svod' ? PAPKA_SVOD : papkali ? `${PAPKA_AKT}/${obyektPapka(h.obyekt ?? '')}` : PAPKA_AKT;
    const nom = h.tur === 'svod' ? svodFaylNomi(nomlar.svodKesim)
      : aktFaylNomi({ obyekt: h.obyekt ?? '', raqam: h.raqam, davr: h.davr, aktId: h.aktId, qoralama: h.qoralama });
    // Yo'l chegarasi: fayl nomi qisqartiriladi (kengaytma saqlanadi).
    const sigadi = Math.max(24, YOL_MAKS - papka.length - 1);
    const qisqa = nom.length > sigadi ? xavfsizFaylNomi(nom.slice(0, nom.length - '.xlsx'.length), 'xlsx', sigadi) : nom;
    const yol = takrorsizYol(`${papka}/${qisqa}`, band);
    band.add(yol.toLowerCase());
    return { yol, hujjat: h };
  });
}

const REESTR_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Файл в пакете', kenglik: 60, tur: 'matn' },
  { sarlavha: 'Документ', kenglik: 16, tur: 'matn' },
  { sarlavha: 'Объект', kenglik: 28, tur: 'matn' },
  { sarlavha: '№ Ф-2', kenglik: 11, tur: 'kod' },
  { sarlavha: 'Период', kenglik: 16, tur: 'birlik' },
  { sarlavha: 'Статус', kenglik: 18, tur: 'birlik' },
  { sarlavha: 'ВСЕГО с НДС, сум', kenglik: 18, tur: 'pul' },
];

/** «Реестр пакета.xlsx» — paketdagi har faylning ro'yxati (hujjat, obyekt, №, davr, holat, summa). Summa noma'lum — katak bo'sh. */
export function paketReestriXlsx(reja: readonly PaketRejaQator[], o: { kesimMatni: string; tashkilot?: string | null; imzo?: ImzoNomlar; kirmadi?: readonly string[] }): Uint8Array {
  const v = new RasmiyVaraq({
    nom: 'Реестр пакета', sarlavha: 'РЕЕСТР ПАКЕТА ДОКУМЕНТОВ (Ф-2)', ostSarlavha: [o.kesimMatni],
    titul: [['Подрядчик:', o.tashkilot ?? o.imzo?.pudratchi]], ustunlar: REESTR_USTUN, yonalish: 'landscape',
    kattaHarf: false, // fayl yo'llari aynan ZIP dagidek yoziladi (katta harfga o'tmaydi)
  });
  reja.forEach((q, i) => {
    const h = q.hujjat;
    v.qator('oddiy', [i + 1, q.yol, h.hujjat, h.obyekt ?? '', h.raqam ?? '', h.davr ?? '', h.holat ?? '', h.summa ?? null],
      h.qoralama ? { rang: 'almashtirilgan' } : undefined);
  });
  v.bosh();
  v.izoh('Сумма — «ВСЕГО с НДС» по акту; пусто — сумма неизвестна (в итоги не включена, это не 0). Черновики выделены серым. Итоги — в файле из папки «02 Свод Ф-2».');
  if (o.kirmadi?.length) v.diqqat(o.kirmadi.map((s) => ({ nom: s, sabab: 'не включён в пакет' })), 'НЕ ВКЛЮЧЕНО В ПАКЕТ');
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));
  return rasmiyKitob([v], { tur: 'f2' }).bytes;
}

/** ZIP baytlari (barqaror sana — bir xil kirish = bir xil baytlar; UTF-8 yo'llar). Reestr ildizda. */
export function paketZipi(reja: readonly PaketRejaQator[], reestr: Uint8Array): Uint8Array {
  const z: Zippable = {};
  const o = { level: 6 as const, mtime: new Date(BARQAROR_VAQT) };
  z[REESTR_FAYL_NOMI] = [reestr, o];
  for (const q of reja) z[q.yol] = [q.hujjat.bytes, o];
  return zipSync(z);
}
