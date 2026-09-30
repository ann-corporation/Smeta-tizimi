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
import ExcelJS from 'exceljs';

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
};

export const AOSR_SARLAVHA: Record<NonNullable<AosrKirish['tur']>, string> = {
  aosr: 'АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ',
  oraliq_qabul: 'АКТ ПРОМЕЖУТОЧНОЙ ПРИЕМКИ ОТВЕТСТВЕННЫХ КОНСТРУКЦИЙ',
  sinov: 'АКТ ИСПЫТАНИЯ',
};

export const TIZIM_KOLONTITUL = 'Сформировано в системе «Smeta tizimi» — smeta-tizimi.pages.dev';

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

export async function aosrExcel(k: AosrKirish): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Smeta tizimi';
  const nom = `АОСР ${toza(k.raqam) || 'б-н'}`.replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
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
  if (k.logo?.base64) {
    const id = wb.addImage({ base64: k.logo.base64, extension: k.logo.ext });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 60 }, editAs: 'oneCell' });
  }

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
  yoz('A', 'K', yokiChiziq(k.materiallar), { qalin: true, tagChiziq: true, balandlik: bal(toza(k.materiallar), 85) });
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

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** Fayl nomi: <Obyekt>_АОСР_<raqam>_<sana>.xlsx */
export function aosrFaylNomi(obyekt: string | null | undefined, raqam: string | null | undefined, sana: string | null | undefined): string {
  const q = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${q(toza(obyekt) || 'Объект')}_АОСР_${q(toza(raqam) || 'б-н')}_${toza(sana) || 'без-даты'}.xlsx`;
}
