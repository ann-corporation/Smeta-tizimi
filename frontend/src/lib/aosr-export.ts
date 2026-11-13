/**
 * aosr-export.ts — АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ (ШНК 3.01.01-22, Прил. № 6).
 *
 * Shakl egasining real blankidan (AKT_SYSTEM_TEMPLATES: TPL_WITH_SUB /
 * TEMPLATE_NO_SUB_SHEET) olingan: A:K ustunlar, bir xil qator tartibi, izoh
 * qatorlari "(наименование работ)" va h.k., imzo bloki F (Ф.И.О.) | I (подпись).
 * Blankning o'zi repoga qo'yilmaydi — faqat tuzilma (kataklar xaritasi) kodda.
 *
 * Qoidalar:
 *   - Qiymat yo'q bo'lsa — to'ldirish chizig'i (o'ylab topilmaydi, NULL ≠ matn).
 *   - Komissiya tarkibi va imzolar bir ro'yxatdan: subpudratchili variantda
 *     субподрядчик + генподрядчик, subpudratchisizda bitta СМО vakili.
 *   - Laboratoriya protokollari "Приложения" bo'limida (protokol — alohida
 *     laboratoriya kompaniyasi hujjati, АОСР ga bog'langan).
 *   - Kompaniya logosi chap yuqori burchakda; kolontitulda tizim nomi.
 */

import type ExcelJS from 'exceljs';
import type { AosrHajmQator, AosrLabIlova } from './aosr-ilova';

export type AosrKomissiyaRol = 'smo' | 'subpudratchi' | 'bosh_pudratchi' | 'texnadzor' | 'loyihachi' | 'boshqa';

export type AosrKomissiyaAzo = {
  rol: AosrKomissiyaRol | string;
  tashkilot?: string | null;
  fio?: string | null;
  lavozim?: string | null;
};

export type AosrProtokol = {
  raqam: string;
  sana?: string | null;
  laboratoriya?: string | null;
  sinovTuri?: string | null;
  natija?: 'mos' | 'mos_emas' | 'kutilmoqda' | string | null;
};

export type AosrKirish = {
  tur?: 'aosr' | 'oraliq_qabul' | 'sinov';
  raqam?: string | null;
  /** Akt tuzilgan sana (ISO yyyy-mm-dd). */
  sana?: string | null;
  ishNomi?: string | null;
  /** Obyekt nomi va joylashuvi (blank D9). */
  obyektNomi?: string | null;
  /** Yuqori o'ng burchakdagi qisqa obyekt/buyurtmachi yozuvi (blank I2). */
  sarlavhaObyekt?: string | null;
  /** 1-bo'lim: taqdim etilgan ishlar — har qator alohida band. */
  ishTavsifi?: string | null;
  /** Ishni bajargan qurilish-montaj tashkiloti (blank A24). */
  smoNomi?: string | null;
  loyihaTashkiloti?: string | null;
  loyihaHujjati?: string | null;
  materiallar?: string | null;
  chetlanishlar?: string | null;
  boshlanishSana?: string | null;
  tugashSana?: string | null;
  keyingiIshlar?: string | null;
  blankVarianti?: 'subpudratchili' | 'subpudratchisiz';
  komissiya: readonly AosrKomissiyaAzo[];
  protokollar?: readonly AosrProtokol[];
  logo?: { base64: string; ext: 'png' | 'jpeg' } | null;
  /** Kolontitul matni (tizim reklamasi). */
  kolontitul?: string;
  /** АОСР ilovalari: ijro hajm hisobi va laboratoriya/sertifikat ro'yxati — eksportda alohida varaqlar. */
  ilova?: { hajm?: readonly AosrHajmQator[]; lab?: AosrLabIlova | null };
  /** 3-bo'limda sertifikat/pasport joyi (to'ldirish chizig'i) — sukut true. */
  sertifikatJoyi?: boolean;
};

/** «Sanasiz chop etish»: akt, boshlanish va tugash sanalari bo'sh qoladi (egasi o'zi qo'lda qo'yadi). */
export const sanasizQil = (k: AosrKirish): AosrKirish => ({ ...k, sana: null, boshlanishSana: null, tugashSana: null });

const SERT_BELGI = /сертиф|серт\.|паспорт|№|sertifikat|pasport/i;
/** Materiallar matni: har material alohida; sertifikat/pasport ko'rsatilmagan bo'lsa — to'ldirish joyi. */
export function materiallarSertifikatBilan(matn: string | null | undefined): string {
  const bandlar = String(matn ?? '').replace(/\r/g, '\n').split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
  return bandlar.map((b) => (SERT_BELGI.test(b) ? b : `${b} (сертификат/паспорт № ______ от ________)`)).join('; ');
}

export const AOSR_SARLAVHA: Record<NonNullable<AosrKirish['tur']>, string> = {
  aosr: 'АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ',
  oraliq_qabul: 'АКТ ПРОМЕЖУТОЧНОЙ ПРИЕМКИ ОТВЕТСТВЕННЫХ КОНСТРУКЦИЙ',
  sinov: 'АКТ ИСПЫТАНИЯ',
};

export { HUJJAT_KOLONTITUL as TIZIM_KOLONTITUL } from './hujjat-yozuvchi/rasmiy';
import { HUJJAT_KOLONTITUL as TIZIM_KOLONTITUL } from './hujjat-yozuvchi/rasmiy';

const ROL_MATNI: Record<string, string> = {
  smo: 'Представитель строительно-монтажной организации:',
  subpudratchi: 'Представитель субподрядной строительно-монтажной организации:',
  bosh_pudratchi: 'Представитель генеральной подрядной организации:',
  texnadzor: 'Представитель технического надзора заказчика:',
  loyihachi: 'Представитель проектной организации (в случаях осуществления авторского надзора проектной организацией в соответствии с требованиями ШНК 1.03.07-2010):',
  boshqa: 'Представитель:',
};
const ROL_IMZO: Record<string, string> = {
  smo: 'Представитель строительно-монтажной организации',
  subpudratchi: 'Представитель субподрядной организации',
  bosh_pudratchi: 'Представитель генеральной подрядной организации',
  texnadzor: 'Представитель технического надзора заказчика',
  loyihachi: 'Представитель проектной организации',
  boshqa: 'Представитель',
};

/** Blank variantiga mos komissiya tartibi (bo'sh ro'yxat — rollar chizig'i bilan). */
export function aosrKomissiyaTartibi(variant: AosrKirish['blankVarianti'], azolar: readonly AosrKomissiyaAzo[]): AosrKomissiyaAzo[] {
  const tartib = variant === 'subpudratchili'
    ? ['subpudratchi', 'bosh_pudratchi', 'texnadzor', 'loyihachi']
    : ['smo', 'texnadzor', 'loyihachi'];
  const natija: AosrKomissiyaAzo[] = [];
  for (const rol of tartib) {
    const topilgan = azolar.filter((a) => a.rol === rol);
    natija.push(...(topilgan.length ? topilgan : [{ rol }]));
  }
  natija.push(...azolar.filter((a) => !tartib.includes(String(a.rol))));
  return natija;
}

const OYLAR = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
/** «19» декабря 2025 г. — bo'sh bo'lsa to'ldirish chizig'i. */
export function aosrSana(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '«___» ______________ 20___ г.';
  return `«${m[3]}» ${OYLAR[Number(m[2]) - 1] ?? '______'} ${m[1]} г.`;
}

const CHIZIQ = '____________________________________________________________';
const toza = (s: string | null | undefined): string => (s ?? '').trim();
const yokiChiziq = (s: string | null | undefined): string => toza(s) || CHIZIQ;

/** Komissiya a'zosining matni: "Ф.И.О. — должность, организация". */
export function azoMatni(a: AosrKomissiyaAzo): string {
  const qism = [toza(a.lavozim), toza(a.tashkilot)].filter(Boolean).join(', ');
  const fio = toza(a.fio);
  if (!fio && !qism) return CHIZIQ;
  return fio ? (qism ? `${fio} — ${qism}` : fio) : qism;
}

const NATIJA_MATNI: Record<string, string> = { mos: 'соответствует', mos_emas: 'не соответствует', kutilmoqda: 'результат ожидается' };

/** Laboratoriya protokollari "Приложения" matni. */
export function protokolMatni(p: AosrProtokol): string {
  const qism = [`протокол испытаний № ${p.raqam}`];
  if (p.sana) qism.push(`от ${aosrSana(p.sana).replace(' г.', 'г.')}`);
  if (toza(p.laboratoriya)) qism.push(`(${toza(p.laboratoriya)})`);
  if (p.natija && NATIJA_MATNI[p.natija]) qism.push(`— ${NATIJA_MATNI[p.natija]}`);
  return qism.join(' ');
}

const SHRIFT = 'Times New Roman';
const USTUN_ENI = [11.8, 9.2, 9.2, 13, 9.2, 9.2, 17.3, 2.2, 9.2, 20, 15.6];

/** Bitta АОСР varag'i (ШНК 3.01.01-22 Прил.6 shakli). */
function aosrVaraqYoz(wb: ExcelJS.Workbook, k: AosrKirish, nom: string, logoId: number | null): void {
  const ws = wb.addWorksheet(nom, {
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.79, right: 0.31, top: 0.35, bottom: 0.45, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = USTUN_ENI.map((width) => ({ width }));
  ws.headerFooter.oddFooter = `&L&7${(k.kolontitul ?? TIZIM_KOLONTITUL).replace(/&/g, '&&')}&R&7Страница &P из &N`;

  let r = 1;
  const yoz = (c1: string, c2: string, matn: string, o: { qalin?: boolean; olcham?: number; markaz?: boolean; balandlik?: number; tagChiziq?: boolean; kursiv?: boolean } = {}) => {
    const ref = `${c1}${r}`;
    if (c1 !== c2) ws.mergeCells(`${c1}${r}:${c2}${r}`);
    const cell = ws.getCell(ref);
    cell.value = matn;
    cell.font = { name: SHRIFT, size: o.olcham ?? 11, bold: !!o.qalin, italic: !!o.kursiv };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: o.markaz ? 'center' : 'left' };
    if (o.tagChiziq) {
      const cols = 'ABCDEFGHIJK';
      for (let i = cols.indexOf(c1); i <= cols.indexOf(c2); i++) ws.getCell(`${cols[i]}${r}`).border = { bottom: { style: 'thin' } };
    }
    if (o.balandlik) ws.getRow(r).height = o.balandlik;
  };
  const izoh = (c1: string, c2: string, matn: string) => { yoz(c1, c2, matn, { olcham: 8, markaz: true, kursiv: true }); r++; };
  /** Taxminiy balandlik: uzun matn o'raladi. */
  const bal = (matn: string, belgi = 95) => Math.max(18, Math.ceil(matn.length / belgi) * 15 + 3);

  // Sarlavha bloki
  yoz('J', 'K', 'ШНК 3.01.01-22\nПрил. № 6', { qalin: true, olcham: 9, markaz: true, balandlik: 30 });
  r++;
  if (toza(k.sarlavhaObyekt)) {
    yoz('H', 'K', toza(k.sarlavhaObyekt), { qalin: true, olcham: 9, markaz: true, balandlik: bal(toza(k.sarlavhaObyekt), 45) });
  }
  r += 2;
  if (logoId != null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 60 }, editAs: 'oneCell' });

  yoz('A', 'K', `${AOSR_SARLAVHA[k.tur ?? 'aosr']} № ${toza(k.raqam) || '____'}`, { qalin: true, olcham: 12, markaz: true, balandlik: 28 });
  r++;
  yoz('A', 'K', yokiChiziq(k.ishNomi), { qalin: true, markaz: true, tagChiziq: true, balandlik: bal(toza(k.ishNomi), 80) });
  r++;
  izoh('A', 'K', '(наименование работ)');
  yoz('A', 'C', 'выполненных в:');
  yoz('D', 'K', yokiChiziq(k.obyektNomi), { qalin: true, tagChiziq: true, balandlik: bal(toza(k.obyektNomi), 65) });
  r++;
  izoh('D', 'K', '(наименование и место расположения объекта)');
  yoz('F', 'K', aosrSana(k.sana), { qalin: true, markaz: true });
  r += 2;

  // Komissiya
  yoz('A', 'K', 'Комиссия в составе:', { qalin: true });
  r++;
  const azolar = aosrKomissiyaTartibi(k.blankVarianti, k.komissiya);
  for (const a of azolar) {
    const rol = ROL_MATNI[String(a.rol)] ?? ROL_MATNI.boshqa;
    yoz('A', 'K', rol, { balandlik: bal(rol) });
    r++;
    yoz('A', 'K', azoMatni(a), { qalin: true, tagChiziq: true, balandlik: bal(azoMatni(a), 85) });
    r++;
    izoh('A', 'K', '(фамилия, инициалы, должность)');
  }
  yoz('A', 'K', 'произвела осмотр работ, выполненных');
  r++;
  yoz('A', 'K', yokiChiziq(k.smoNomi), { qalin: true, markaz: true, tagChiziq: true });
  r++;
  izoh('A', 'K', '(наименование строительно-монтажной организации)');
  yoz('A', 'K', 'и составила настоящий акт о нижеследующем:');
  r += 2;

  // 1. Ishlar jadvali
  yoz('A', 'K', '1. К освидетельствованию предъявлены следующие работы:');
  r++;
  const ramka = { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } };
  const jadvalQatori = (a: string, b: string, qalin: boolean) => {
    yoz('A', 'A', a, { qalin, markaz: true, olcham: 10 });
    yoz('B', 'K', b, { qalin, olcham: 10, markaz: qalin, balandlik: qalin ? 20 : bal(b, 80) });
    for (const c of 'ABCDEFGHIJK') ws.getCell(`${c}${r}`).border = ramka;
    r++;
  };
  jadvalQatori('№', 'Наименование работ', true);
  const bandlar = toza(k.ishTavsifi).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (bandlar.length) bandlar.forEach((b, i) => jadvalQatori(String(i + 1), b, false));
  else jadvalQatori('1', CHIZIQ, false);
  r++;

  // 2–4
  yoz('A', 'K', '2. Работы выполнены по проектной документации:');
  r++;
  const loyiha = [toza(k.loyihaTashkiloti), toza(k.loyihaHujjati)].filter(Boolean).join(', ');
  yoz('A', 'K', yokiChiziq(loyiha), { qalin: true, tagChiziq: true, balandlik: bal(loyiha, 85) });
  r++;
  izoh('A', 'K', '(наименование проектной организации, № чертежей и дата их составления)');
  yoz('A', 'K', '3. При выполнении работ применены:');
  r++;
  const mat = k.sertifikatJoyi === false ? toza(k.materiallar) : materiallarSertifikatBilan(k.materiallar);
  yoz('A', 'K', yokiChiziq(mat), { qalin: true, tagChiziq: true, balandlik: bal(mat, 85) });
  r++;
  izoh('A', 'K', '(наименование материалов, конструкций, изделий со ссылкой на сертификаты или др. документы, подтверждающие качество)');
  yoz('A', 'K', '4. При выполнении работ отсутствуют (или допущены) отклонения от проектной документации:', { balandlik: 30 });
  r++;
  yoz('A', 'K', yokiChiziq(k.chetlanishlar), { qalin: true, tagChiziq: true, balandlik: bal(toza(k.chetlanishlar), 85) });
  r++;
  izoh('A', 'K', '(при наличии отклонений указывается, кем согласованы, № чертежей и дата согласования)');

  // 5. Sanalar
  yoz('A', 'B', '5. Дата:');
  yoz('C', 'D', 'начала работ:');
  yoz('E', 'K', aosrSana(k.boshlanishSana), { qalin: true });
  r++;
  yoz('C', 'D', 'окончания работ:');
  yoz('E', 'K', aosrSana(k.tugashSana), { qalin: true });
  r += 2;

  // Qaror
  yoz('A', 'K', 'Решение комиссии:', { qalin: true, markaz: true });
  r++;
  const qaror = 'Работы выполнены в соответствии с проектной документацией, стандартами, строительными нормами и правилами и отвечают требованиям их приемки. На основании изложенного разрешается производство последующих работ по устройству (монтажу):';
  yoz('A', 'K', qaror, { balandlik: bal(qaror) });
  r++;
  yoz('A', 'K', yokiChiziq(k.keyingiIshlar), { qalin: true, tagChiziq: true, balandlik: bal(toza(k.keyingiIshlar), 85) });
  r++;
  izoh('A', 'K', '(наименование работ и конструкций)');

  // Ilovalar — laboratoriya protokollari
  if (k.protokollar?.length) {
    r++;
    yoz('A', 'K', 'Приложения:', { qalin: true });
    r++;
    k.protokollar.forEach((p, i) => {
      const m = `${i + 1}. ${protokolMatni(p)}`;
      yoz('A', 'K', m, { balandlik: bal(m) });
      r++;
    });
  }

  // Imzolar
  r += 2;
  for (const a of azolar) {
    const rol = ROL_IMZO[String(a.rol)] ?? ROL_IMZO.boshqa;
    yoz('A', 'E', rol, { balandlik: 32 });
    yoz('F', 'H', toza(a.fio) || '________________', { qalin: true, markaz: true, tagChiziq: true });
    yoz('I', 'K', '', { tagChiziq: true });
    r++;
    yoz('F', 'H', '(Ф.И.О.)', { olcham: 8, markaz: true, kursiv: true });
    yoz('I', 'K', '(подпись)', { olcham: 8, markaz: true, kursiv: true });
    r += 2;
  }
  ws.pageSetup.printArea = `A1:K${r}`;
}

/* ── Ilova varaqlari ─────────────────────────────────────────────── */
const sonMatni = (v: number | null | undefined): string => (v == null ? '' : v.toLocaleString('ru-RU', { maximumFractionDigits: 3 }));

/** Ilova varag'i uchun umumiy asos: A4, Times New Roman, ustun kengliklari. */
function ilovaVaraq(wb: ExcelJS.Workbook, nom: string, eni: number[], orientatsiya: 'portrait' | 'landscape') {
  const ws = wb.addWorksheet(nom, {
    pageSetup: { paperSize: 9, orientation: orientatsiya, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.6, right: 0.3, top: 0.4, bottom: 0.45, header: 0.2, footer: 0.2 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = eni.map((width) => ({ width }));
  return ws;
}
const RAMKA = { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } };

/** Ijro hajm hisobi (АОСР ilovasi): ish, birlik, formula, o'lchamlar (to'ldirish chizig'i), fakt jurnali hajmi, aktdagi hajm. */
function hajmVaraqYoz(wb: ExcelJS.Workbook, k: AosrKirish, nom: string): void {
  const qatorlar = k.ilova?.hajm ?? [];
  const ws = ilovaVaraq(wb, nom, [5, 40, 8, 22, 34, 16, 16], 'landscape');
  ws.headerFooter.oddFooter = `&L&7${(k.kolontitul ?? TIZIM_KOLONTITUL).replace(/&/g, '&&')}&R&7Страница &P из &N`;
  let r = 1;
  const sarlavha = (matn: string, olcham = 12, qalin = true) => {
    ws.mergeCells(`A${r}:G${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = matn; c.font = { name: SHRIFT, size: olcham, bold: qalin }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    ws.getRow(r).height = olcham >= 12 ? 24 : 18; r++;
  };
  sarlavha(`ПРИЛОЖЕНИЕ к АОСР № ${toza(k.raqam) || '____'}`);
  sarlavha('Исполнительная ведомость объёмов работ (расчёт объёма)', 11);
  sarlavha(toza(k.obyektNomi) ? `Объект: ${toza(k.obyektNomi)}` : 'Объект: ________________', 10, false);
  sarlavha(`Работы: ${toza(k.ishNomi) || CHIZIQ.slice(0, 40)}`, 10, false);
  r++;
  const bosh = ['№', 'Наименование работ', 'Ед. изм.', 'Формула объёма', 'Размеры (по чертежу / обмерам)', 'Объём по журналу выполнения', 'Объём в акте'];
  bosh.forEach((h, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = h; c.font = { name: SHRIFT, size: 10, bold: true }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; c.border = RAMKA;
  });
  ws.getRow(r).height = 32; r++;
  const yoz = qatorlar.length ? qatorlar : [{ nom: '', birlik: '', formula: '', faktHajm: null, aktHajmi: null } as AosrHajmQator];
  yoz.forEach((q, i) => {
    const qiymat = [String(i + 1), q.nom, q.birlik, q.formula, '', sonMatni(q.faktHajm), sonMatni(q.aktHajmi)];
    qiymat.forEach((v, j) => {
      const c = ws.getCell(r, j + 1);
      c.value = v; c.font = { name: SHRIFT, size: 10 }; c.border = RAMKA;
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: j === 1 || j === 4 ? 'left' : j >= 5 ? 'right' : 'center' };
    });
    ws.getRow(r).height = Math.max(30, Math.ceil(q.nom.length / 38) * 15 + 6); r++;
  });
  r++;
  ws.mergeCells(`A${r}:G${r}`);
  const izoh = ws.getCell(`A${r}`);
  izoh.value = 'Объём по журналу выполнения — из учёта фактических объёмов. Размеры вносятся по чертежам/обмерам; пустое поле — значение не указано.';
  izoh.font = { name: SHRIFT, size: 8, italic: true }; izoh.alignment = { wrapText: true, vertical: 'middle' }; ws.getRow(r).height = 24;
  r += 3;
  const imzo = (matn: string) => {
    ws.mergeCells(`A${r}:C${r}`); ws.getCell(`A${r}`).value = matn; ws.getCell(`A${r}`).font = { name: SHRIFT, size: 10 };
    ws.mergeCells(`E${r}:F${r}`); ws.getCell(`E${r}`).border = { bottom: { style: 'thin' } };
    r += 2;
  };
  imzo('Составил (представитель СМО)');
  imzo('Проверил (технический надзор)');
  ws.pageSetup.printArea = `A1:G${r}`;
}

/** Laboratoriya va sertifikat ro'yxati (АОСР ilovasi): kubik sinovi seriyasi, armatura sertifikati, material pasportlari, ulangan protokollar. */
function labVaraqYoz(wb: ExcelJS.Workbook, k: AosrKirish, nom: string): void {
  const lab = k.ilova?.lab;
  const ws = ilovaVaraq(wb, nom, [5, 44, 22, 22, 22], 'portrait');
  ws.headerFooter.oddFooter = `&L&7${(k.kolontitul ?? TIZIM_KOLONTITUL).replace(/&/g, '&&')}&R&7Страница &P из &N`;
  let r = 1;
  const qator = (matn: string, o: { qalin?: boolean; olcham?: number; markaz?: boolean; balandlik?: number } = {}) => {
    ws.mergeCells(`A${r}:E${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = matn; c.font = { name: SHRIFT, size: o.olcham ?? 10.5, bold: !!o.qalin }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: o.markaz ? 'center' : 'left' };
    ws.getRow(r).height = o.balandlik ?? Math.max(18, Math.ceil(matn.length / 95) * 15 + 3); r++;
  };
  const jadvalBosh = (...h: string[]) => {
    h.forEach((x, i) => { const c = ws.getCell(r, i + 1); c.value = x; c.font = { name: SHRIFT, size: 10, bold: true }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; c.border = RAMKA; });
    ws.getRow(r).height = 28; r++;
  };
  const jadvalQator = (...v: string[]) => {
    v.forEach((x, i) => { const c = ws.getCell(r, i + 1); c.value = x; c.font = { name: SHRIFT, size: 10 }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' }; c.border = RAMKA; });
    ws.getRow(r).height = Math.max(22, Math.ceil((v[1] ?? '').length / 40) * 15 + 6); r++;
  };
  qator(`ПРИЛОЖЕНИЕ к АОСР № ${toza(k.raqam) || '____'}`, { qalin: true, olcham: 12, markaz: true, balandlik: 24 });
  qator('Лабораторные испытания и документы о качестве', { qalin: true, olcham: 11, markaz: true, balandlik: 22 });
  qator(toza(k.obyektNomi) ? `Объект: ${toza(k.obyektNomi)}` : 'Объект: ________________');
  r++;
  let n = 0;
  if (lab?.beton) {
    qator('1. Бетон — контрольные образцы (кубики)', { qalin: true });
    jadvalBosh('№', 'Показатель', 'Значение', 'Серия № / протокол №', 'Результат');
    jadvalQator(String(++n), 'Класс бетона', lab.beton.sinf ?? '', '', '');
    if (lab.beton.qoshimcha) jadvalQator(String(++n), 'Марка / водонепроницаемость / морозостойкость', lab.beton.qoshimcha, '', '');
    jadvalQator(String(++n), 'Объём уложенного бетона', lab.beton.hajm ?? '', '', '');
    jadvalQator(String(++n), 'Количество серий контрольных образцов', '______', '______', '');
    r++;
  }
  if (lab?.armatura) {
    qator('2. Арматура — сертификат / паспорт, испытания', { qalin: true });
    jadvalBosh('№', 'Показатель', 'Значение', 'Сертификат № / дата', 'Протокол № (при необходимости)');
    const d = lab.armatura.diametrlar.length ? lab.armatura.diametrlar.map((x) => `Ø${x}`).join(', ') : '';
    jadvalQator(String(++n), 'Диаметры', d, '', '');
    jadvalQator(String(++n), 'Класс арматуры', lab.armatura.klasslar.join(', '), '', '');
    r++;
  }
  if (lab?.materiallar?.length) {
    qator('3. Материалы и изделия — сертификаты / паспорта', { qalin: true });
    jadvalBosh('№', 'Наименование материала', 'Сертификат / паспорт №', 'Дата', 'Изготовитель');
    lab.materiallar.forEach((m, i) => jadvalQator(String(i + 1), m, '', '', ''));
    r++;
  }
  if (lab?.talablar?.length && !lab.beton) {
    qator(`Требуются лабораторные испытания: ${lab.talablar.map((x) => ({ beton: 'бетон', grunt: 'уплотнение грунта', payvand: 'сварка' }[x])).join(', ')}.`);
    r++;
  }
  if (k.protokollar?.length) {
    qator('Приложенные протоколы испытаний:', { qalin: true });
    k.protokollar.forEach((p, i) => qator(`${i + 1}. ${protokolMatni(p)}`));
  }
  ws.pageSetup.printArea = `A1:E${r}`;
}

/** Ikkala varaq ham kerakmi: hajm qatorlari bor / lab ilovasida kamida bitta bo'lim bor. */
const hajmKerak = (k: AosrKirish) => (k.ilova?.hajm?.length ?? 0) > 0;
const labKerak = (k: AosrKirish) => !!k.ilova?.lab && (!!k.ilova.lab.beton || !!k.ilova.lab.armatura || k.ilova.lab.materiallar.length > 0 || k.ilova.lab.talablar.length > 0);

export type AosrKitobOpsiya = { sanasiz?: boolean };

const noyobNom = (royxat: Set<string>, asos: string): string => {
  const toza31 = asos.replace(/[\\/?*[\]:]/g, '_');
  let nom = toza31.slice(0, 31); let i = 2;
  while (royxat.has(nom.toLowerCase())) { const son = ` (${i++})`; nom = toza31.slice(0, 31 - son.length) + son; }
  royxat.add(nom.toLowerCase());
  return nom;
};

/**
 * «Pechat kitobi»: bir nechta АОСР bitta xlsx da — har akt alohida varaq (ШНК 3.01.01-22 Прил.6), ilovalari (hajm hisobi,
 * laboratoriya/sertifikat) o'z aktidan keyin. `sanasiz` — sanalar bo'sh (egasi qo'lda qo'yadi).
 */
export async function aosrKitobExcel(aktlar: readonly AosrKirish[], o: AosrKitobOpsiya = {}): Promise<Uint8Array> {
  const ExcelJSMod = (await import('exceljs')).default; // og'ir kutubxona — faqat eksportda yuklanadi
  const wb = new ExcelJSMod.Workbook();
  wb.creator = 'Smeta tizimi';
  const nomlar = new Set<string>();
  const logo = aktlar.find((a) => a.logo?.base64)?.logo ?? null;
  const logoId = logo ? wb.addImage({ base64: logo.base64, extension: logo.ext }) : null;
  for (const asl of aktlar) {
    const k = o.sanasiz ? sanasizQil(asl) : asl;
    const raqam = toza(k.raqam) || 'б-н';
    aosrVaraqYoz(wb, k, noyobNom(nomlar, `АОСР ${raqam}`), logoId);
    if (hajmKerak(k)) hajmVaraqYoz(wb, k, noyobNom(nomlar, `Объём ${raqam}`));
    if (labKerak(k)) labVaraqYoz(wb, k, noyobNom(nomlar, `Прил ${raqam}`));
  }
  if (!aktlar.length) wb.addWorksheet('АОСР');
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** Bitta akt (ilovalari bilan) — kitobning bir aktli holati. */
export async function aosrExcel(k: AosrKirish, o: AosrKitobOpsiya = {}): Promise<Uint8Array> {
  return aosrKitobExcel([k], o);
}

/** Pechat kitobi fayl nomi: <Obyekt>_АОСР_кн_<N akt>_<sana>.xlsx */
export function aosrKitobFaylNomi(obyekt: string | null | undefined, soni: number, sana?: string | null): string {
  const q = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${q(toza(obyekt) || 'Объект')}_АОСР_печатная_книга_${soni}${toza(sana) ? `_${toza(sana)}` : ''}.xlsx`;
}

/** Fayl nomi: <Obyekt>_АОСР_<raqam>_<sana>.xlsx */
export function aosrFaylNomi(obyekt: string | null | undefined, raqam: string | null | undefined, sana: string | null | undefined): string {
  const q = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${q(toza(obyekt) || 'Объект')}_АОСР_${q(toza(raqam) || 'б-н')}${toza(sana) ? `_${toza(sana)}` : ''}.xlsx`;
}
