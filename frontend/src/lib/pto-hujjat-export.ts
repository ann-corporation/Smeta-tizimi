/**
 * pto-hujjat-export.ts — PTO hujjatlarini Excel VA PDF ko'rinishida chiqarish.
 *
 * Egasining talabi (2026-09-09): «nakopitelniy slichitelniy forma3
 * reyestrlari hujjatlari har birini ham exell ham pdf shaklida yuklash
 * mumkin bo'lsin ... hammasi uchun resursniy vedomost degan bloki yoki
 * alohida sahifada yig'ilishi kerak, bunda birinchi chel-chas keyin
 * mash-chas keyin material keyin oborudovaniya. hammasi shu hujjatda
 * qancha ishlatilgani summa yig'indilari birlik narxi va summasi
 * yig'ilgan turishi kerak. m29 da ham xuddi shunday.»
 *
 * Bu modul YANGI HISOB-KITOB QILMAYDI. Hujjat qatorlari chaqiruvchidan
 * tayyor keladi, resurs bloki esa `resurs-vedomost.ts` orqali
 * `t2_qator_holat` dan jamlanadi — ya'ni ikkinchi haqiqat manbai emas.
 *
 * Og'ir kutubxonalar (ExcelJS, jsPDF, kirill shrifti) FAQAT eksport
 * chaqirilganda dinamik yuklanadi.
 */
import { resursVedomostQur } from './resurs-vedomost';
import { IMZO_IMZO_CHIZIQ, IMZO_MP, IMZO_PODPIS, RasmiyVaraq, hujjatFaylNomi, imzoMatni, imzoMuhrli, imzoTomonlari, rasmiyKitob, sumFormula, bosRefs, type RasmiyUstun } from './hujjat-yozuvchi';
import type { T2QatorHolat } from '../api/supabase';

export type PtoHujjatTuri = 'forma2' | 'nakopitelniy' | 'slichitelniy' | 'forma3' | 'm29';

export const PTO_HUJJAT_NOMI: Record<PtoHujjatTuri, string> = {
  forma2: 'ФОРМА-2 · Акт выполненных работ',
  nakopitelniy: 'НАКОПИТЕЛЬНАЯ ВЕДОМОСТЬ',
  slichitelniy: 'СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ',
  forma3: 'ФОРМА-3 · Справка о стоимости',
  m29: 'М-29 · Отчёт о расходе материалов',
};

/** Har bir hujjat turi uchun raqamli ustun sarlavhalari. */
export const PTO_HUJJAT_USTUNLARI: Record<PtoHujjatTuri, string[]> = {
  forma2: ['Кол-во', 'Цена', 'Сумма'],
  nakopitelniy: ['Смета', 'Факт', 'Пред. Ф2', 'Тек. Ф2', 'Всего Ф2', 'Остаток'],
  slichitelniy: ['По смете', 'Фактически', 'Отклонение', 'Сумма откл.'],
  forma3: ['С начала строительства', 'За отчётный период'],
  m29: ['Норма', 'По норме', 'Фактически', 'Экономия / перерасход'],
};

export type PtoHujjatQator = {
  no: number;
  kod: string;
  nom: string;
  birlik: string;
  /** `PTO_HUJJAT_USTUNLARI[turi]` bilan bir xil tartibda va uzunlikda. */
  qiymatlar: (number | null)[];
  /** Bo'lim sarlavhasi bo'lsa — qalin, raqamsiz chiziladi. */
  bolim?: boolean;
  /** Ogohlantirish (masalan smetadan oshgan hajm). */
  ogohlantirish?: string;
};

export type PtoResursQator = {
  kat: string;
  kod: string;
  nom: string;
  birlik: string;
  hajm: number;
  narx: number | null;
  summa: number;
};

export type PtoHujjat = {
  turi: PtoHujjatTuri;
  obyekt: string;
  davr: string;
  raqam?: string;
  pudratchi?: string;
  buyurtmachi?: string;
  qatorlar: PtoHujjatQator[];
  /** ЧЕЛ→МАШ→МАТ→ОБ tartibida. `ptoResurslarniQur` bilan tayyorlanadi. */
  resurslar: PtoResursQator[];
  izoh?: string[];
};

const KATEGORIYA_TARTIB = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К'];
const KATEGORIYA_NOMI: Record<string, string> = {
  'ЧЕЛ': 'ЧЕЛ-ЧАС · Затраты труда рабочих',
  'МАШ': 'МАШ-ЧАС · Эксплуатация машин',
  'МАТ': 'МАТЕРИАЛЫ',
  'ОБ': 'ОБОРУДОВАНИЕ',
  'КАБ': 'КАБЕЛЬНАЯ ПРОДУКЦИЯ',
  'М/К': 'МЕТАЛЛОКОНСТРУКЦИИ',
};

/**
 * `t2_qator_holat` dan resurs vedomostini quradi — kategoriya tartibi
 * `resurs-vedomost.ts` da belgilangan (ЧЕЛ→МАШ→МАТ→ОБ→КАБ→М/К).
 *
 * `manba`: `'f2'` — hujjatga olingan hajm/summa; `'smeta'` — smeta bo'yicha.
 */
export function ptoResurslarniQur(
  holatlar: readonly T2QatorHolat[],
  manba: 'f2' | 'smeta' = 'f2',
): PtoResursQator[] {
  return resursVedomostQur(holatlar)
    .map((r) => {
      const hajm = manba === 'f2' ? r.f2Hajm : r.smetaHajm;
      const summa = manba === 'f2' ? r.f2Summa : r.smetaSumma;
      return {
        kat: r.kat,
        kod: r.kod ?? '',
        nom: r.nom,
        birlik: r.birlik ?? '',
        hajm,
        // Birlik narxi hajmdan kelib chiqadi; hajm nol bo'lsa narx noma'lum
        // (`null`) — NOL EMAS (Konstitutsiya: NULL hech qachon 0 ga aylanmaydi).
        narx: hajm > 0 ? summa / hajm : null,
        summa,
      };
    })
    .filter((r) => r.hajm !== 0 || r.summa !== 0);
}

type ResursGuruh = { kat: string; nom: string; qatorlar: PtoResursQator[]; jami: number };

function resurslarniGuruhla(resurslar: readonly PtoResursQator[]): ResursGuruh[] {
  const guruh = new Map<string, PtoResursQator[]>();
  for (const r of resurslar) {
    const a = guruh.get(r.kat);
    if (a) a.push(r); else guruh.set(r.kat, [r]);
  }
  const tartib = (k: string) => {
    const i = KATEGORIYA_TARTIB.indexOf(k);
    return i < 0 ? KATEGORIYA_TARTIB.length : i;
  };
  return [...guruh.entries()]
    .sort(([a], [b]) => tartib(a) - tartib(b) || a.localeCompare(b))
    .map(([kat, qatorlar]) => ({
      kat,
      nom: KATEGORIYA_NOMI[kat] ?? kat,
      qatorlar,
      jami: qatorlar.reduce((s, r) => s + r.summa, 0),
    }));
}

/** H8: `<Obyekt>_<Hujjat>_<davr>.xlsx|pdf` (hujjat nomi rus tilida). */
export const PTO_HUJJAT_FAYL: Record<PtoHujjatTuri, string> = {
  forma2: 'ФОРМА-2', nakopitelniy: 'НАКОПИТЕЛЬНАЯ', slichitelniy: 'СЛИЧИТЕЛЬНАЯ', forma3: 'ФОРМА-3', m29: 'М-29',
};

export function ptoFaylNomi(h: PtoHujjat, kengaytma: 'xlsx' | 'pdf'): string {
  return hujjatFaylNomi({ obyekt: (h.obyekt || '').slice(0, 60), hujjat: PTO_HUJJAT_FAYL[h.turi], davr: h.davr, kengaytma });
}

/** ИТОГО faqat pul ustunlarida (turli birlikdagi hajm yoki narx yig'ilmaydi).
 *  Forma-3 yuridik jami qoidasi hal qilinmagan (FORMA3_RULE_UNRESOLVED) — jami yo'q. */
export function ptoJamlanadi(turi: PtoHujjatTuri): boolean[] {
  if (turi === 'forma3') return PTO_HUJJAT_USTUNLARI[turi].map(() => false);
  return PTO_HUJJAT_USTUNLARI[turi].map((u) => /сумм/i.test(u));
}

/* ═══════════════════ EXCEL (hujjat standarti H1–H9) ═══════════════════ */

export async function ptoHujjatXlsx(h: PtoHujjat): Promise<Uint8Array> {
  const ustunlar = PTO_HUJJAT_USTUNLARI[h.turi];
  const jamlanadi = ptoJamlanadi(h.turi);
  const ust: RasmiyUstun[] = [
    { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
    { sarlavha: 'Код', kenglik: 16, tur: 'kod' },
    { sarlavha: 'Наименование', kenglik: 52, tur: 'matn' },
    { sarlavha: 'Ед. изм.', kenglik: 10, tur: 'birlik' },
    ...ustunlar.map((u, i): RasmiyUstun => ({ sarlavha: u, kenglik: 16, tur: jamlanadi[i] ? 'pul' : /цена/i.test(u) ? 'narx' : 'hajm' })),
  ];
  const v = new RasmiyVaraq({
    nom: 'Документ',
    sarlavha: PTO_HUJJAT_NOMI[h.turi],
    titul: [['Объект:', h.obyekt], ['Период:', h.davr], ['Документ №:', h.raqam], ['Заказчик:', h.buyurtmachi], ['Подрядчик:', h.pudratchi]],
    ustunlar: ust,
    yonalish: 'landscape',
  });
  const qatorlar: number[] = [];
  const diqqat: Array<{ nom: string; sabab: string }> = [];
  for (const q of h.qatorlar) {
    if (q.bolim) { v.bolim(q.nom); continue; }
    qatorlar.push(v.qator('oddiy', [q.no, q.kod, q.nom, q.birlik, ...q.qiymatlar]));
    if (q.ogohlantirish) diqqat.push({ nom: `${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: q.ogohlantirish });
  }
  if (jamlanadi.some(Boolean) && qatorlar.length) {
    v.qator('vsego', [null, null, 'ИТОГО', null, ...ustunlar.map((_u, i) => {
      if (!jamlanadi[i]) return null;
      const harf = v.harf(4 + i);
      const nomalum = h.qatorlar.some((q) => !q.bolim && q.qiymatlar[i] == null);
      const f = sumFormula(harf, qatorlar)!;
      const jami = h.qatorlar.reduce((a, q) => a + (!q.bolim && typeof q.qiymatlar[i] === 'number' ? q.qiymatlar[i] as number : 0), 0);
      return nomalum ? { f: `IF(${bosRefs(harf, qatorlar)}>0,"",${f})`, v: '' } : { f, v: jami };
    })]);
  }
  v.bosh();
  if (h.turi === 'forma3') v.izoh('Итог формы № 3 не подводится: правило определения юридического итога (накладные, НДС, удержания) не утверждено.');
  for (const s of h.izoh ?? []) v.izoh(s);
  v.diqqat(diqqat);
  v.imzo(imzoTomonlari(h.turi === 'forma2' || h.turi === 'forma3' ? ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР'] : ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], { zakazchik: h.buyurtmachi, pudratchi: h.pudratchi }));
  return rasmiyKitob([v, ptoResursVaragi(h)], { tur: 'pto' }).bytes;
}

function ptoResursVaragi(h: PtoHujjat): RasmiyVaraq {
  const v = new RasmiyVaraq({
    nom: 'Ресурсная ведомость',
    sarlavha: 'РЕСУРСНАЯ ВЕДОМОСТЬ',
    ostSarlavha: [`${PTO_HUJJAT_NOMI[h.turi]} · ${h.obyekt} · ${h.davr}`],
    ustunlar: [
      { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
      { sarlavha: 'Код', kenglik: 14, tur: 'kod' },
      { sarlavha: 'Наименование ресурса', kenglik: 56, tur: 'matn' },
      { sarlavha: 'Ед. изм.', kenglik: 10, tur: 'birlik' },
      { sarlavha: 'Количество', kenglik: 15, tur: 'hajm' },
      { sarlavha: 'Цена за ед., сум', kenglik: 16, tur: 'narx' },
      { sarlavha: 'Сумма, сум', kenglik: 18, tur: 'pul' },
    ],
    yonalish: 'landscape',
  });
  let no = 0;
  const guruhQatorlari: number[] = [];
  let umumiy = 0;
  for (const g of resurslarniGuruhla(h.resurslar)) {
    const bosh = v.r;
    const oxir = bosh + g.qatorlar.length;
    guruhQatorlari.push(v.qator('ish', [null, null, g.nom, null, null, null, { f: `SUM(G${bosh + 1}:G${oxir})`, v: g.jami }]));
    for (const r of g.qatorlar) {
      v.qator('oddiy', (n) => [++no, r.kod, r.nom, r.birlik, r.hajm, r.narx == null ? null : { f: `IF(N(E${n})=0,"",G${n}/E${n})`, v: r.narx }, r.summa], { daraja: 1 });
    }
    umumiy += g.jami;
  }
  if (guruhQatorlari.length) v.qator('vsego', [null, null, 'ВСЕГО ПО ВЕДОМОСТИ', null, null, null, { f: sumFormula('G', guruhQatorlari)!, v: umumiy }]);
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ']));
  return v;
}

/* ═══════════════════ PDF ═══════════════════ */

const son = (v: number | null | undefined, kasr = 2) =>
  v == null ? '' : v.toLocaleString('ru-RU', { minimumFractionDigits: kasr, maximumFractionDigits: kasr });

export async function ptoHujjatPdf(h: PtoHujjat): Promise<Uint8Array> {
  const [{ jsPDF }, autoTableMod, shrift] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./pdf/pto-pdf-shrift'),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (d: unknown, o: unknown) => void }).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Kirillcha uchun Unicode shrift — standart Helvetica buni ko'rsata olmaydi.
  doc.addFileToVFS('LiberationSans.ttf', shrift.PTO_PDF_SHRIFT_REGULAR);
  doc.addFont('LiberationSans.ttf', shrift.PTO_PDF_SHRIFT_NOMI, 'normal');
  doc.addFileToVFS('LiberationSans-Bold.ttf', shrift.PTO_PDF_SHRIFT_BOLD);
  doc.addFont('LiberationSans-Bold.ttf', shrift.PTO_PDF_SHRIFT_NOMI, 'bold');
  doc.setFont(shrift.PTO_PDF_SHRIFT_NOMI, 'normal');

  const chap = 10;
  let y = 14;
  doc.setFont(shrift.PTO_PDF_SHRIFT_NOMI, 'bold').setFontSize(13);
  doc.text(PTO_HUJJAT_NOMI[h.turi], doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 7;
  doc.setFont(shrift.PTO_PDF_SHRIFT_NOMI, 'normal').setFontSize(9);
  const bosh = [
    `Объект: ${h.obyekt}`,
    `Период: ${h.davr}`,
    h.raqam ? `Документ №: ${h.raqam}` : '',
    h.buyurtmachi ? `Заказчик: ${h.buyurtmachi}` : '',
    h.pudratchi ? `Подрядчик: ${h.pudratchi}` : '',
  ].filter(Boolean);
  for (const s of bosh) { doc.text(s, chap, y); y += 4.5; }
  y += 2;

  const ustunlar = PTO_HUJJAT_USTUNLARI[h.turi];
  const jami = ustunlar.map(() => 0);
  const tana = h.qatorlar.map((q) => {
    if (!q.bolim) q.qiymatlar.forEach((v, i) => { if (typeof v === 'number') jami[i] += v; });
    return [
      q.bolim ? '' : String(q.no), q.kod, q.nom + (q.ogohlantirish ? '  ⚠' : ''), q.birlik,
      ...q.qiymatlar.map((v) => son(v)),
    ];
  });
  tana.push(['', '', 'ИТОГО', '', ...jami.map((v) => son(v))]);

  autoTable(doc, {
    startY: y,
    head: [['№', 'Код', 'Наименование', 'Ед.изм.', ...ustunlar]],
    body: tana,
    styles: { font: shrift.PTO_PDF_SHRIFT_NOMI, fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
    headStyles: { font: shrift.PTO_PDF_SHRIFT_NOMI, fontStyle: 'bold', fillColor: [31, 78, 121], textColor: 255, halign: 'center' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' },
      1: { cellWidth: 24 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 16, halign: 'center' },
      ...Object.fromEntries(ustunlar.map((_, i) => [4 + i, { cellWidth: 24, halign: 'right' }])),
    },
    didParseCell: (d: { row: { index: number }; cell: { styles: Record<string, unknown> }; section: string }) => {
      if (d.section !== 'body') return;
      const q = h.qatorlar[d.row.index];
      if (d.row.index === tana.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [255, 242, 204];
      } else if (q?.bolim) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [221, 235, 247];
      } else if (q?.ogohlantirish) {
        d.cell.styles.fillColor = [255, 199, 206];
      }
    },
  });

  // ── Imzo bloki (H3) ──
  {
    const tomonlar = imzoTomonlari(h.turi === 'forma2' || h.turi === 'forma3' ? ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР'] : ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], { zakazchik: h.buyurtmachi, pudratchi: h.pudratchi });
    const balandlik = doc.internal.pageSize.getHeight();
    let iy = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;
    if (iy + tomonlar.length * 12 > balandlik - 12) { doc.addPage(); iy = 20; }
    doc.setFont(shrift.PTO_PDF_SHRIFT_NOMI, 'normal').setFontSize(9);
    for (const t of tomonlar) {
      doc.text(imzoMatni(t.rol, t.nom), chap, iy);
      doc.text(`${IMZO_IMZO_CHIZIQ}   ${IMZO_PODPIS}${imzoMuhrli(t.rol) ? `   ${IMZO_MP}` : ''}`, doc.internal.pageSize.getWidth() - 110, iy);
      iy += 10;
    }
  }

  // ── Resurs vedomosti — YANGI SAHIFA ──
  doc.addPage();
  y = 14;
  doc.setFont(shrift.PTO_PDF_SHRIFT_NOMI, 'bold').setFontSize(13);
  doc.text('РЕСУРСНАЯ ВЕДОМОСТЬ', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 6;
  doc.setFont(shrift.PTO_PDF_SHRIFT_NOMI, 'normal').setFontSize(9);
  doc.text(`${h.obyekt} · ${h.davr}`, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 6;

  const rTana: string[][] = [];
  const kategoriyaQatorlari = new Set<number>();
  let no = 0;
  let umumiy = 0;
  for (const g of resurslarniGuruhla(h.resurslar)) {
    kategoriyaQatorlari.add(rTana.length);
    rTana.push(['', '', g.nom, '', '', '', son(g.jami)]);
    for (const r of g.qatorlar) {
      rTana.push([String(++no), r.kod, r.nom, r.birlik, son(r.hajm, 3), son(r.narx), son(r.summa)]);
    }
    umumiy += g.jami;
  }
  rTana.push(['', '', 'ВСЕГО ПО ВЕДОМОСТИ', '', '', '', son(umumiy)]);

  autoTable(doc, {
    startY: y,
    head: [['№', 'Код', 'Наименование ресурса', 'Ед.изм.', 'Количество', 'Цена за ед.', 'Сумма']],
    body: rTana,
    styles: { font: shrift.PTO_PDF_SHRIFT_NOMI, fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
    headStyles: { font: shrift.PTO_PDF_SHRIFT_NOMI, fontStyle: 'bold', fillColor: [31, 78, 121], textColor: 255, halign: 'center' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' }, 1: { cellWidth: 22 }, 2: { cellWidth: 'auto' },
      3: { cellWidth: 16, halign: 'center' }, 4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 26, halign: 'right' }, 6: { cellWidth: 30, halign: 'right' },
    },
    didParseCell: (d: { row: { index: number }; cell: { styles: Record<string, unknown> }; section: string }) => {
      if (d.section !== 'body') return;
      if (d.row.index === rTana.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [255, 242, 204];
      } else if (kategoriyaQatorlari.has(d.row.index)) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [252, 228, 214];
      }
    },
  });

  // Sahifa raqamlari
  const jamiSahifa = doc.getNumberOfPages();
  for (let i = 1; i <= jamiSahifa; i++) {
    doc.setPage(i);
    doc.setFont(shrift.PTO_PDF_SHRIFT_NOMI, 'normal').setFontSize(8);
    doc.text(`${i} / ${jamiSahifa}`, doc.internal.pageSize.getWidth() - 12,
      doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/** Brauzerda yuklab olishga majburlaydi. */
export function ptoHujjatYuklab(bytes: Uint8Array, faylNomi: string): void {
  const tur = faylNomi.endsWith('.pdf')
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = new Blob([bytes as any], { type: tur });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = faylNomi;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
