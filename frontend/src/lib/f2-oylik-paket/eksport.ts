/**
 * Oylik F2 paketi hujjatlari: oylik reestr + svod (bitta Excel, ikki varaq) va ZIP.
 * Rasmiy hujjat standarti (hujjat-yozuvchi: H1–H9), hujjatlar RUS tilida. Summa NDS SIZ, NDS alohida ustun;
 * summasi noma'lum F2 — katak BO'SH + izoh (jamga 0 bo'lib kirmaydi).
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import { RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, sumFormula, yaxlit2, type ImzoNomlar, type RasmiyUstun } from '../hujjat-yozuvchi';
import { davrMatni } from '../nakopitelniy-vedomost-export';
import type { F2Bosqich } from '../f2-reestr/reestr';
import { NDS_FOIZ, oyJami, type PaketAkt, type PaketFayl, type Tekshiruv } from './oylik';

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

const REESTR_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Объект', kenglik: 34, tur: 'matn' },
  { sarlavha: '№ Ф-2', kenglik: 11, tur: 'kod' },
  { sarlavha: 'Источник', kenglik: 16, tur: 'birlik' },
  { sarlavha: 'Статус', kenglik: 16, tur: 'birlik' },
  { sarlavha: 'без накрутки (без НДС)', kenglik: 17, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'с накруткой (ИТОГО-4, без НДС)', kenglik: 17, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: `НДС ${NDS_FOIZ}%`, kenglik: 15, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'ВСЕГО с НДС', kenglik: 17, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'Примечание', kenglik: 30, tur: 'matn' },
];
const SVOD_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Объект', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Кол-во Ф-2', kenglik: 10, tur: 'birlik' },
  { sarlavha: 'без накрутки (без НДС)', kenglik: 18, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'с накруткой (ИТОГО-4, без НДС)', kenglik: 18, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: `НДС ${NDS_FOIZ}%`, kenglik: 16, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'ВСЕГО с НДС', kenglik: 18, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'Примечание', kenglik: 28, tur: 'matn' },
];

/** Oylik reestr (har F2 bir qator) + Свод (obyektlar kesimida) — bitta Excel. `rows` — faqat tanlangan F2 lar. */
export function oylikReestrXlsx(rows: readonly PaketAkt[], o: { oy: string; tashkilot?: string | null; loyiha?: string | null; imzo?: ImzoNomlar }): { bytes: Uint8Array; faylNomi: string } {
  const davr = davrMatni(`${o.oy}-01`);
  const titul: Array<readonly [string, string | null | undefined]> = [['Подрядчик:', o.tashkilot ?? o.imzo?.pudratchi]];
  if (o.loyiha) titul.push(['Проект:', o.loyiha]);
  const r1 = new RasmiyVaraq({ nom: 'Реестр Ф-2', sarlavha: 'РЕЕСТР АКТОВ ВЫПОЛНЕННЫХ РАБОТ (ФОРМА № 2)', ostSarlavha: [`за отчетный период: ${davr}`], titul, ustunlar: REESTR_USTUN, yonalish: 'landscape' });
  const pulQ: Record<'a' | 'b' | 'c' | 'd', number[]> = { a: [], b: [], c: [], d: [] };
  let no = 0;
  for (const r of rows) {
    const m = r.moliya;
    const q = r1.qator('oddiy', [++no, r.obyektNom, r.akt.raqam ?? '', MANBA_RU(r.akt.manba), BOSQICH_RU[r.bosqich],
      m ? m.ustamasiz : r.akt.hujjat_jami, m?.ustamali ?? null, m?.nds ?? null, m?.jami ?? null, izohRu(r)]);
    if ((m ? m.ustamasiz : r.akt.hujjat_jami) != null) pulQ.a.push(q);
    if (m?.ustamali != null) pulQ.b.push(q);
    if (m?.nds != null) pulQ.c.push(q);
    if (m?.jami != null) pulQ.d.push(q);
  }
  const j = oyJami(rows);
  const jamiKatak = (harf: number, qs: number[], val: number) => { const f = sumFormula(r1.harf(harf), qs); return f ? { f, v: yaxlit2(val) } : null; };
  r1.qator('vsego', ['', 'ИТОГО за месяц (суммы известных Ф-2)', '', '', '', jamiKatak(5, pulQ.a, j.ustamasiz.malum), jamiKatak(6, pulQ.b, j.ustamali.malum), jamiKatak(7, pulQ.c, j.nds.malum), jamiKatak(8, pulQ.d, j.jami.malum), '']);
  r1.bosh();
  const nom = [['без накрутки', j.ustamasiz.nomalum], ['с накруткой', j.ustamali.nomalum]] as const;
  r1.izoh(`Всего Ф-2: ${rows.length}. Суммы указаны без НДС; НДС ${NDS_FOIZ}% выделен отдельно в конце. Ф-2 с неизвестной суммой в итог не включены (в графе пусто): ${nom.map(([n, c]) => `${n} — ${c}`).join('; ')}.`);
  const diqqat = rows.filter((r) => izohRu(r)).map((r) => ({ nom: `${r.obyektNom} · Ф-2 № ${r.akt.raqam ?? '—'}`, sabab: izohRu(r) }));
  if (diqqat.length) r1.diqqat(diqqat);
  r1.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));

  const r2 = new RasmiyVaraq({ nom: 'Свод', sarlavha: 'СВОД ПО Ф-2 ЗА МЕСЯЦ', ostSarlavha: [`за отчетный период: ${davr}`], titul, ustunlar: SVOD_USTUN, yonalish: 'landscape' });
  const obyektlar = [...new Set(rows.map((r) => r.obyektNom))];
  const svodQ: Record<'a' | 'b' | 'c' | 'd', number[]> = { a: [], b: [], c: [], d: [] };
  let n2 = 0;
  for (const nom2 of obyektlar) {
    const js = oyJami(rows.filter((r) => r.obyektNom === nom2));
    const yoq = (s: { nomalum: number }) => (s.nomalum > 0 ? s.nomalum : 0);
    const bor = (s: { soni: number; nomalum: number }) => s.soni - s.nomalum > 0;
    const q = r2.qator('oddiy', [++n2, nom2, js.soni, bor(js.ustamasiz) ? js.ustamasiz.malum : null, bor(js.ustamali) ? js.ustamali.malum : null, bor(js.nds) ? js.nds.malum : null, bor(js.jami) ? js.jami.malum : null,
      yoq(js.ustamali) ? `сумма неизвестна у Ф-2: ${yoq(js.ustamali)}` : '']);
    if (bor(js.ustamasiz)) svodQ.a.push(q);
    if (bor(js.ustamali)) svodQ.b.push(q);
    if (bor(js.nds)) svodQ.c.push(q);
    if (bor(js.jami)) svodQ.d.push(q);
  }
  const jk = (harf: number, qs: number[], val: number) => { const f = sumFormula(r2.harf(harf), qs); return f ? { f, v: yaxlit2(val) } : null; };
  r2.qator('vsego', ['', 'ИТОГО за месяц', j.soni, jk(3, svodQ.a, j.ustamasiz.malum), jk(4, svodQ.b, j.ustamali.malum), jk(5, svodQ.c, j.nds.malum), jk(6, svodQ.d, j.jami.malum), '']);
  r2.bosh();
  r2.izoh(`Суммы без НДС; «с накруткой» = ИТОГО-4 (без НДС); НДС ${NDS_FOIZ}% — отдельной графой; «ВСЕГО с НДС» = с накруткой + НДС.`);
  r2.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));

  const { bytes } = rasmiyKitob([r1, r2], { tur: 'f2' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.tashkilot ?? undefined, hujjat: 'РЕЕСТР_Ф-2_СВОД', davr: o.oy }) };
}

/* ───────────── ZIP ───────────── */

const TEKSHIRUV_RU: Record<Tekshiruv['kod'], string> = {
  qoralama: 'Ф-2 не утверждён (черновик / на проверке)', raqamsiz: 'Ф-2 без номера', raqam_takror: 'повторяющийся номер Ф-2 у одного объекта за месяц',
  summa_nomalum: 'сумма / НДС неизвестны или приблизительны', uchastka_aralash: 'в акте смешаны участки',
};

/** Paket tarkibi (matn): fayllar ro'yxati + tekshiruv ogohlantirishlari. */
export function paketTarkibiMatni(o: { oy: string; fayllar: readonly PaketFayl[]; tekshiruvlar: readonly Tekshiruv[]; otkazilgan: readonly string[] }): string {
  const q = [`ПАКЕТ Ф-2 ЗА ${o.oy}`, '', 'Состав пакета:'];
  for (const f of o.fayllar) q.push(`  ${f.yol}`);
  if (o.otkazilgan.length) { q.push('', 'Не включено (ошибка при формировании):'); for (const s of o.otkazilgan) q.push(`  ${s}`); }
  if (o.tekshiruvlar.length) {
    q.push('', 'Замечания (не блокируют выпуск пакета):');
    for (const t of o.tekshiruvlar) q.push(`  ${t.obyektNom} · Ф-2 № ${t.raqam ?? '—'}: ${TEKSHIRUV_RU[t.kod]}`);
  }
  return q.join('\r\n');
}

/** Fayllarni bitta ZIP ga (barqaror sana — bir xil kirish = bir xil baytlar). UTF-8 nomlar. */
export function paketZip(fayllar: readonly PaketFayl[], tarkib: string): Uint8Array {
  const z: Zippable = {};
  const mtime = new Date('2000-01-01T00:00:00Z');
  for (const f of fayllar) z[f.yol] = [f.bytes, { level: 6, mtime }];
  z['ПАКЕТ_СОСТАВ.txt'] = [strToU8(`﻿${tarkib}`), { level: 6, mtime }];
  return zipSync(z);
}
