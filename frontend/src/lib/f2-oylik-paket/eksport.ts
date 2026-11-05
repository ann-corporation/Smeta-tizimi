/**
 * Oylik F2 paketi hujjatlari: oylik reestr + svod (bitta Excel, ikki varaq) va ZIP.
 * Rasmiy hujjat standarti (hujjat-yozuvchi: H1–H9), hujjatlar RUS tilida. Summa NDS SIZ, NDS alohida ustun;
 * summasi noma'lum F2 — katak BO'SH + izoh (jamga 0 bo'lib kirmaydi).
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import { RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, sumFormula, yaxlit2, type ImzoNomlar, type RasmiyUstun } from '../hujjat-yozuvchi';
import { davrMatni } from '../nakopitelniy-vedomost-export';
import type { F2Bosqich } from '../f2-reestr/reestr';
import { NDS_FOIZ, oyJami, type FaylMeta, type PaketAkt, type PaketFayl, type Tekshiruv } from './oylik';

const BOSQICH_RU: Record<F2Bosqich, string> = { tasdiqlangan: 'утверждён', jarayonda: 'черновик / на проверке', rad: 'отклонён', bekor: 'аннулирован' };
const MANBA_RU = (m: PaketAkt['akt']['manba']) => (m === 'import' ? 'импорт из файла' : m === 'tizim' ? 'создан в системе' : 'не определён');
const SABAB_RU: Record<string, string> = {
  QATOR_YOQ: 'нет строк акта — накрутка неизвестна', KOEF_YOQ: 'не заданы проценты накрутки объекта', PODVAL_TOLIQ_EMAS: 'подвал накрутки неполный',
  KAT_NOMALUM: 'категория затрат неизвестна — накрутка неизвестна',
};
const izohRu = (r: PaketAkt): string => {
  const m = r.moliya;
  const q: string[] = [];
  if (r.akt.hujjat_jami == null) q.push('итог акта неизвестен');
  if (m?.sabab) q.push(SABAB_RU[m.sabab] ?? m.sabab);
  if (m?.taxminiy) q.push('приблизительно: у части строк категория неизвестна');
  if (m && m.narxsizQator > 0) q.push(`строк без цены: ${m.narxsizQator}`);
  if (!m && !r.moliyaXato) q.push('строки не прочитаны');
  if (r.moliyaXato) q.push('не удалось прочитать строки акта');
  return q.join('; ');
};

/** Summa ustunlari tartibi — QQS bilan BIRINCHI (egasi qoidasi «QQS bilan asosiy»): ВСЕГО с НДС, НДС, с накруткой, без накрутки. */
const PUL_USTUN = (k: number): RasmiyUstun[] => [
  { sarlavha: 'ВСЕГО с НДС', kenglik: k + 1, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: `в т.ч. НДС ${NDS_FOIZ}%`, kenglik: k - 1, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'с накруткой (ИТОГО-4, без НДС)', kenglik: k, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'без накрутки (без НДС)', kenglik: k, tur: 'pul', guruh: 'СУММА, сум' },
];
type PulK = 'jami' | 'nds' | 'ustamali' | 'ustamasiz';
const PUL_TARTIB: readonly PulK[] = ['jami', 'nds', 'ustamali', 'ustamasiz'];
const aktPul = (r: PaketAkt, k: PulK): number | null => (k === 'ustamasiz' ? (r.moliya ? r.moliya.ustamasiz : r.akt.hujjat_jami) : r.moliya?.[k] ?? null);

const REESTR_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Объект', kenglik: 34, tur: 'matn' },
  { sarlavha: '№ Ф-2', kenglik: 11, tur: 'kod' },
  { sarlavha: 'Источник', kenglik: 16, tur: 'birlik' },
  { sarlavha: 'Статус', kenglik: 16, tur: 'birlik' },
  ...PUL_USTUN(17),
  { sarlavha: 'Примечание', kenglik: 30, tur: 'matn' },
];
const SVOD_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Объект', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Кол-во Ф-2', kenglik: 10, tur: 'birlik' },
  ...PUL_USTUN(18),
  { sarlavha: 'Примечание', kenglik: 28, tur: 'matn' },
];

/**
 * Oylik reestr (har F2 bir qator) + Свод (obyektlar kesimida) — bitta Excel. `rows` — faqat tanlangan F2 lar.
 * `davr` berilsa (oraliq paketi) — sarlavha shu matn bilan («за период: …»), aks holda `oy` oyi.
 */
export function oylikReestrXlsx(rows: readonly PaketAkt[], o: { oy: string; tashkilot?: string | null; loyiha?: string | null; imzo?: ImzoNomlar; davr?: string | null }): { bytes: Uint8Array; faylNomi: string } {
  const davr = o.davr ?? davrMatni(`${o.oy}-01`);
  const oraliq = !!o.davr;
  const titul: Array<readonly [string, string | null | undefined]> = [['Подрядчик:', o.tashkilot ?? o.imzo?.pudratchi]];
  if (o.loyiha) titul.push(['Проект:', o.loyiha]);
  const r1 = new RasmiyVaraq({ nom: 'Реестр Ф-2', sarlavha: 'РЕЕСТР АКТОВ ВЫПОЛНЕННЫХ РАБОТ (ФОРМА № 2)', ostSarlavha: [`за отчетный период: ${davr}`], titul, ustunlar: REESTR_USTUN, yonalish: 'landscape' });
  const pulQ: Record<PulK, number[]> = { jami: [], nds: [], ustamali: [], ustamasiz: [] };
  let no = 0;
  for (const r of rows) {
    const q = r1.qator('oddiy', [++no, oraliq ? `${r.obyektNom} · ${davrMatni(r.akt.oy ?? '')}` : r.obyektNom, r.akt.raqam ?? '', MANBA_RU(r.akt.manba), BOSQICH_RU[r.bosqich],
      ...PUL_TARTIB.map((k) => aktPul(r, k)), izohRu(r)]);
    for (const k of PUL_TARTIB) if (aktPul(r, k) != null) pulQ[k].push(q);
  }
  const j = oyJami(rows);
  const jamiKatak = (harf: number, qs: number[], val: number) => { const f = sumFormula(r1.harf(harf), qs); return f ? { f, v: yaxlit2(val) } : null; };
  r1.qator('vsego', ['', oraliq ? 'ИТОГО за период (суммы известных Ф-2)' : 'ИТОГО за месяц (суммы известных Ф-2)', '', '', '', ...PUL_TARTIB.map((k, i) => jamiKatak(5 + i, pulQ[k], j[k].malum)), '']);
  r1.bosh();
  const nom = [['с НДС', j.jami.nomalum], ['без накрутки', j.ustamasiz.nomalum]] as const;
  r1.izoh(`Всего Ф-2: ${rows.length}. Основная сумма — «ВСЕГО с НДС»; «с накруткой» = ИТОГО-4 без НДС. Ф-2 с неизвестной суммой в итог не включены (в графе пусто): ${nom.map(([n, c]) => `${n} — ${c}`).join('; ')}.`);
  const diqqat = rows.filter((r) => izohRu(r)).map((r) => ({ nom: `${r.obyektNom} · Ф-2 № ${r.akt.raqam ?? '—'}`, sabab: izohRu(r) }));
  if (diqqat.length) r1.diqqat(diqqat);
  r1.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));

  const r2 = new RasmiyVaraq({ nom: 'Свод', sarlavha: oraliq ? 'СВОД ПО Ф-2 ЗА ПЕРИОД' : 'СВОД ПО Ф-2 ЗА МЕСЯЦ', ostSarlavha: [`за отчетный период: ${davr}`], titul, ustunlar: SVOD_USTUN, yonalish: 'landscape' });
  const obyektlar = [...new Set(rows.map((r) => r.obyektNom))];
  const svodQ: Record<PulK, number[]> = { jami: [], nds: [], ustamali: [], ustamasiz: [] };
  let n2 = 0;
  for (const nom2 of obyektlar) {
    const js = oyJami(rows.filter((r) => r.obyektNom === nom2));
    const bor = (s: { soni: number; nomalum: number }) => s.soni - s.nomalum > 0;
    const q = r2.qator('oddiy', [++n2, nom2, js.soni, ...PUL_TARTIB.map((k) => (bor(js[k]) ? js[k].malum : null)),
      js.jami.nomalum > 0 ? `сумма неизвестна у Ф-2: ${js.jami.nomalum}` : '']);
    for (const k of PUL_TARTIB) if (bor(js[k])) svodQ[k].push(q);
  }
  const jk = (harf: number, qs: number[], val: number) => { const f = sumFormula(r2.harf(harf), qs); return f ? { f, v: yaxlit2(val) } : null; };
  r2.qator('vsego', ['', oraliq ? 'ИТОГО за период' : 'ИТОГО за месяц', j.soni, ...PUL_TARTIB.map((k, i) => jk(3 + i, svodQ[k], j[k].malum)), '']);
  r2.bosh();
  r2.izoh('«ВСЕГО с НДС» — основная сумма; «с накруткой» = ИТОГО-4 без НДС; «без накрутки» — прямые затраты. Накрутка — по подвалу самого акта (если сохранён), иначе по подвалу сметы объекта.');
  r2.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));

  const { bytes } = rasmiyKitob([r1, r2], { tur: 'f2' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.tashkilot ?? undefined, hujjat: 'РЕЕСТР_Ф-2_СВОД', davr: o.oy }) };
}

/* ───────────── MUNDARIJA (paket mundarijasi) ───────────── */

/** Mundarija qatori: ZIP yo'li + fayl tavsifi (F2 bo'lsa summalar, qoralama — «черновики» jamisiga). */
export type MundarijaQator = FaylMeta & { yol: string };

export const MUNDARIJA_FAYL_NOMI = '00_MUNDARIJA.xlsx';

const MUNDARIJA_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Файл в пакете', kenglik: 52, tur: 'matn' },
  { sarlavha: 'Документ', kenglik: 20, tur: 'matn' },
  { sarlavha: 'Объект', kenglik: 26, tur: 'matn' },
  { sarlavha: 'Период', kenglik: 14, tur: 'birlik' },
  { sarlavha: 'Статус', kenglik: 18, tur: 'birlik' },
  ...PUL_USTUN(17),
];

/** MUNDARIJA — paketdagi har hujjat (yo'l, turi, obyekt, oy, holat) va F2 summalari; jami: утверждённые / черновики. */
export function mundarijaXlsx(qatorlar: readonly MundarijaQator[], o: { sarlavha: string; tashkilot?: string | null; imzo?: ImzoNomlar }): { bytes: Uint8Array; faylNomi: string } {
  const v = new RasmiyVaraq({ nom: 'MUNDARIJA', sarlavha: 'СОДЕРЖАНИЕ ПАКЕТА (MUNDARIJA)', ostSarlavha: [o.sarlavha], titul: [['Подрядчик:', o.tashkilot ?? o.imzo?.pudratchi]], ustunlar: MUNDARIJA_USTUN, yonalish: 'landscape' });
  const q: Record<'t' | 'q', Record<PulK, number[]>> = { t: { jami: [], nds: [], ustamali: [], ustamasiz: [] }, q: { jami: [], nds: [], ustamali: [], ustamasiz: [] } };
  const aktlar: Record<'t' | 'q', PaketAkt[]> = { t: [], q: [] };
  let no = 0;
  for (const x of qatorlar) {
    const r = v.qator('oddiy', [++no, x.yol, x.hujjat, x.obyekt ?? '', x.oy ? davrMatni(x.oy) : '', x.holat ?? '', ...PUL_TARTIB.map((k) => (x.akt ? aktPul(x.akt, k) : null))],
      x.qoralama ? { rang: 'almashtirilgan' } : undefined);
    if (!x.akt) continue;
    const b = x.qoralama ? 'q' : 't';
    aktlar[b].push(x.akt);
    for (const k of PUL_TARTIB) if (aktPul(x.akt, k) != null) q[b][k].push(r);
  }
  const jamiQ = (nom: string, b: 't' | 'q') => {
    const j = oyJami(aktlar[b]);
    v.qator('vsego', ['', nom, `${j.soni} шт.`, '', '', '', ...PUL_TARTIB.map((k, i) => { const f = sumFormula(v.harf(6 + i), q[b][k]); return f ? { f, v: yaxlit2(j[k].malum) } : null; })]);
  };
  jamiQ('ИТОГО Ф-2 — утверждённые', 't');
  if (aktlar.q.length) jamiQ('ИТОГО Ф-2 — черновики (QORALAMA, не утверждены)', 'q');
  v.bosh();
  v.izoh('Суммы — только по Ф-2 (основная — «ВСЕГО с НДС»). Ф-2 с неизвестной суммой в итог не включены (в графе пусто). Черновики выделены серым и в итог утверждённых не входят.');
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'f2' });
  return { bytes, faylNomi: MUNDARIJA_FAYL_NOMI };
}

/* ───────────── ZIP ───────────── */

const TEKSHIRUV_RU: Record<Tekshiruv['kod'], string> = {
  qoralama: 'Ф-2 не утверждён (черновик / на проверке)', raqamsiz: 'Ф-2 без номера', raqam_takror: 'повторяющийся номер Ф-2 у одного объекта за месяц',
  summa_nomalum: 'сумма / НДС неизвестны или приблизительны', uchastka_aralash: 'в акте смешаны участки',
};

/** Paket tarkibi (matn): fayllar ro'yxati + tekshiruv ogohlantirishlari. */
export function paketTarkibiMatni(o: {
  oy: string; fayllar: readonly PaketFayl[]; tekshiruvlar: readonly Tekshiruv[]; otkazilgan: readonly string[];
  /** Shartnoma rejimi: sarlavha shartnoma bilan (loyiha rejimida yo'q). */
  shartnoma?: { raqam: string; nom?: string | null } | null;
}): string {
  const q = [o.shartnoma ? `ПАКЕТ ПО ДОГОВОРУ № ${o.shartnoma.raqam}${o.shartnoma.nom ? ` (${o.shartnoma.nom})` : ''} ЗА ${o.oy}` : `ПАКЕТ Ф-2 ЗА ${o.oy}`, '', 'Состав пакета:'];
  for (const f of o.fayllar) q.push(`  ${f.yol}`);
  if (o.otkazilgan.length) { q.push('', 'Не включено (ошибка при формировании):'); for (const s of o.otkazilgan) q.push(`  ${s}`); }
  if (o.tekshiruvlar.length) {
    q.push('', 'Замечания (не блокируют выпуск пакета):');
    for (const t of o.tekshiruvlar) q.push(`  ${t.obyektNom} · Ф-2 № ${t.raqam ?? '—'}: ${TEKSHIRUV_RU[t.kod]}`);
  }
  return q.join('\r\n');
}

/** Fayllarni bitta ZIP ga (barqaror sana — bir xil kirish = bir xil baytlar). UTF-8 nomlar. */
export const TARKIB_FAYL_NOMI = 'ПАКЕТ_СОСТАВ.txt';
/** ПАКЕТ_СОСТАВ.txt baytlari (UTF-8 BOM bilan) - ZIP ichidagi aynan shu baytlar manifestda ham xeshlanadi. */
export const tarkibBaytlari = (tarkib: string): Uint8Array => strToU8(`﻿${tarkib}`);

export function paketZip(fayllar: readonly PaketFayl[], tarkib: string): Uint8Array {
  const z: Zippable = {};
  const mtime = new Date('2000-01-01T00:00:00Z');
  for (const f of fayllar) z[f.yol] = [f.bytes, { level: 6, mtime }];
  z[TARKIB_FAYL_NOMI] = [tarkibBaytlari(tarkib), { level: 6, mtime }];
  return zipSync(z);
}
