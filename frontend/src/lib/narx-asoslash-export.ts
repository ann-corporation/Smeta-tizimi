/**
 * narx-asoslash-export.ts — «ОБОСНОВАНИЕ СТОИМОСТИ РЕСУРСОВ» (egasi Q5, 2026-10-01).
 *
 * Maqsad: НАПУ va boshqa ekspertizada PTO har narx qayerdan olinganini himoya qila olsin —
 * har resurs bo'yicha: smetadagi narx, dalil manbasi (katalog kvartali / счет-фактура / КП /
 * kalkulyatsiya), hujjat rekvizitlari, manba narxi va og'ish. Dalilsiz narxlar ochiq ro'yxatda (H7).
 * Hujjat standarti H1–H9: formulalar tirik (og'ish), `$` siz, imzolar, fayl nomi.
 * Manba va smeta qiymatlari o'zgartirilmaydi; noma'lum — bo'sh (NULL ≠ 0).
 */
import {
  RANG_TARTIB, RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob,
  type ImzoNomlar, type QatorRangi, type RasmiyUstun,
} from './hujjat-yozuvchi';
import { NARX_MANBA_TUR_NOMI, type NarxDalilHolat } from '../api/t2-narx-dalil';

export type AsoslashResurs = {
  qator_id: number; kat: string | null; kod: string | null; nom: string | null; birlik: string | null;
  hajm: number | null; narx: number | null;
};

export type AsoslashOpsiya = { obyektNomi: string; sana?: string; imzo?: ImzoNomlar };

/* Egasi (2026-10-14): har narxda обоснование — manbadagi nom, birlik va narx, birlik qayta hisobi (formula) ko'rinsin.
 * A–F smeta pozitsiyasi; G–M asos: hujjat, manba qatori, qayta hisob, smeta birligidagi narx (tirik formula); N og'ish. */
const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Код', kenglik: 12, tur: 'kod' },
  { sarlavha: 'Наименование ресурса', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'Кол-во', kenglik: 11, tur: 'hajm' },
  { sarlavha: 'Цена в смете', kenglik: 14, tur: 'narx' },
  { sarlavha: 'Вид документа', kenglik: 18, tur: 'matn', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Документ (№, дата, поставщик / период)', kenglik: 32, tur: 'matn', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Наименование в документе', kenglik: 32, tur: 'matn', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Ед. изм. в документе', kenglik: 9, tur: 'birlik', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Цена по документу', kenglik: 14, tur: 'narx', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Пересчёт на ед. сметы', kenglik: 26, tur: 'matn', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Цена по документу на ед. сметы', kenglik: 14, tur: 'narx', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Отклонение, %', kenglik: 11, tur: 'foiz', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
];

/** One justified position (a resource at one estimate price) — the same sheet serves imported estimates and the studio. */
export type AsoslashBand = {
  kat: string; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; narx: number | null;
  /** Document type, details, the source row as written there (name/unit/price). */
  hujjatTuri: string | null; rekvizit: string | null; manbaNom: string | null; manbaBirlik: string | null; manbaNarx: number | null;
  /** Recalculation into the estimate unit: estimate-unit price = document price × koef; formula text for the reader. */
  qaytaHisob: { formula: string; koef: number; izoh: string } | null;
  /** Set when the position is not (fully) justified — listed under «ПОЗИЦИИ БЕЗ ДОКУМЕНТА-ОСНОВАНИЯ ЦЕНЫ». */
  dalilsizSabab: string | null;
  /** How many estimate lines the position covers (summary only). */
  qatorlar?: number;
};

/**
 * «ОБОСНОВАНИЕ ЦЕН» sheet: every position with its document, the source row, the unit recalculation (live formula) and the
 * deviation (live formula). Unjustified positions are listed openly. Returns the sheet for any workbook.
 */
export function narxAsoslashVaraq(bandlar: readonly AsoslashBand[], o: AsoslashOpsiya & { pozitsiyalar?: number }): { varaq: RasmiyVaraq; tasdiqlangan: number; dalilsiz: number } {
  const sana = o.sana ?? bugunSana();
  const v = new RasmiyVaraq({
    nom: 'Обоснование цен',
    sarlavha: 'ОБОСНОВАНИЕ СТОИМОСТИ РЕСУРСОВ, ПРИНЯТЫХ В СМЕТНОЙ ДОКУМЕНТАЦИИ',
    ostSarlavha: [`по состоянию на ${sana.split('-').reverse().join('.')}`],
    titul: [['Объект:', o.obyektNomi], ['Подрядчик:', o.imzo?.pudratchi], ['Заказчик:', o.imzo?.zakazchik]],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  let no = 0, tasdiqlangan = 0;
  const dalilsiz: { nom: string; sabab: string }[] = [];
  const katlar = [...KAT_TARTIB, ...new Set(bandlar.map((b) => b.kat).filter((k) => k && !KAT_TARTIB.includes(k)))];
  for (const kat of [...katlar, '']) {
    const guruh = bandlar.filter((b) => b.kat === kat).sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '', 'ru') || (a.kod ?? '').localeCompare(b.kod ?? ''));
    if (!guruh.length) continue;
    v.bolim(KAT_NOMI[kat] ?? (kat || 'ПРОЧИЕ РЕСУРСЫ (категория не указана)'));
    for (const b of guruh) {
      if (b.dalilsizSabab) dalilsiz.push({ nom: `${b.nom ?? '—'}${b.birlik ? `, ${b.birlik}` : ''}`, sabab: b.dalilsizSabab });
      else tasdiqlangan++;
      const q = b.qaytaHisob;
      const birlikNarx = b.manbaNarx == null ? null : Math.round(b.manbaNarx * (q?.koef ?? 1) * 100) / 100;
      v.qator('oddiy', (n) => [
        ++no, b.kod, b.nom, b.birlik, b.hajm, b.narx,
        b.hujjatTuri, b.rekvizit, b.manbaNom, b.manbaBirlik, b.manbaNarx,
        q ? `${q.formula}${q.izoh ? ` (${q.izoh})` : ''}` : null,
        b.manbaNarx == null ? null : { f: q ? `ROUND(K${n}*${q.koef},2)` : `K${n}`, v: birlikNarx ?? '' },
        b.manbaNarx == null ? null : { f: `IF(OR(F${n}="",M${n}="",F${n}=0),"",ROUND((M${n}-F${n})/F${n}*100,2))`,
          v: b.narx && birlikNarx != null ? Math.round(((birlikNarx - b.narx) / b.narx) * 10000) / 100 : '' },
      ], { rang: (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null });
    }
  }
  v.bosh();
  v.izoh(`Всего ресурсов: ${bandlar.length}${o.pozitsiyalar != null ? ` (позиций в смете: ${o.pozitsiyalar})` : ''}; цена подтверждена документом — ${tasdiqlangan}; без полного подтверждения — ${dalilsiz.length}.`);
  v.izoh('Цена по документу на ед. сметы = цена по документу × коэффициент пересчёта (размеры — из наименования изделия). Отклонение = (цена по документу на ед. сметы − цена в смете) / цена в смете × 100. Для машин и механизмов принята наибольшая стоимость маш.-часа по подтвержденным калькуляциям; для материалов — цены последнего квартала каталога либо документов поставщиков. Копии документов-оснований прилагаются.');
  if (dalilsiz.length) v.diqqat(dalilsiz, 'ПОЗИЦИИ БЕЗ ДОКУМЕНТА-ОСНОВАНИЯ ЦЕНЫ');
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));
  return { varaq: v, tasdiqlangan, dalilsiz: dalilsiz.length };
}

const KAT_TARTIB = ['ЧЕЛ', 'МАШ', 'МАТ', 'М/К', 'КАБ', 'БЕЗ СКЛАД', 'ОБ'];
const KAT_NOMI: Record<string, string> = {
  ЧЕЛ: 'ТРУДОВЫЕ РЕСУРСЫ (ЧЕЛ.-ЧАС)', МАШ: 'МАШИНЫ И МЕХАНИЗМЫ (МАШ.-ЧАС)', МАТ: 'МАТЕРИАЛЫ',
  'М/К': 'МЕТАЛЛОКОНСТРУКЦИИ', КАБ: 'КАБЕЛИ И ПРОВОДА', 'БЕЗ СКЛАД': 'МАТЕРИАЛЫ БЕЗ СКЛАДСКОГО ХРАНЕНИЯ', ОБ: 'ОБОРУДОВАНИЕ',
};

/** Bazadagi kanonik qiymat 'БЕЗСКЛАД' (bo'shliqsiz) — hujjatda bir bo'lim. */
const katKalit = (k: string | null) => { const x = (k ?? '').trim().toUpperCase(); return x === 'БЕЗСКЛАД' ? 'БЕЗ СКЛАД' : x; };

const NDS_MATNI = { nds_siz: 'без НДС', nds_bilan: 'с НДС', nomalum: '' } as const;

/** Hujjat rekvizitlari matni: «№ 125 от 12.08.2026, ООО «Бетон» (ИНН 301234567), без НДС» / «3 кв. 2026, Навоийская обл.». */
export function manbaRekviziti(d: Pick<NarxDalilHolat, 'manba_nom' | 'manba_raqam' | 'manba_sana' | 'yetkazuvchi' | 'yetkazuvchi_inn' | 'yil' | 'kvartal' | 'region' | 'nds_holati'> & Partial<Pick<NarxDalilHolat, 'ishlab_chiqaruvchi' | 'nds_izoh'>>): string {
  const q: string[] = [d.manba_nom];
  const nomer = [d.manba_raqam ? `№ ${d.manba_raqam}` : '', d.manba_sana ? `от ${d.manba_sana.split('-').reverse().join('.')}` : ''].filter(Boolean).join(' ');
  if (nomer) q.push(nomer);
  if (d.kvartal && d.yil) q.push(`${d.kvartal} кв. ${d.yil}`); else if (d.yil) q.push(`${d.yil} г.`);
  if (d.region) q.push(d.region);
  if (d.yetkazuvchi) q.push(d.yetkazuvchi + (d.yetkazuvchi_inn ? ` (ИНН ${d.yetkazuvchi_inn})` : ''));
  // Platforma katalogi (2026-10-02): ishlab chiqaruvchi zavod — "цена завода ООО «…»".
  if (d.ishlab_chiqaruvchi && d.ishlab_chiqaruvchi !== d.yetkazuvchi) q.push(`производитель: ${d.ishlab_chiqaruvchi}`);
  if (NDS_MATNI[d.nds_holati]) q.push(NDS_MATNI[d.nds_holati]);
  else if (d.nds_izoh) q.push(d.nds_izoh);
  return q.join(', ');
}

export function narxAsoslashXlsx(resurslar: readonly AsoslashResurs[], dalillar: readonly NarxDalilHolat[], o: AsoslashOpsiya): {
  bytes: Uint8Array; faylNomi: string; tasdiqlangan: number; dalilsiz: number;
} {
  const sana = o.sana ?? bugunSana();
  const dalil = new Map(dalillar.map((d) => [d.qator_id, d]));
  /* Egasi (2026-10-02): bir xil resurs (tur | kod | nom | birlik | smeta narxi) — BITTA qator, miqdori jamlanadi.
   * Smeta narxi farqli bo'lsa — alohida pozitsiya (har narx o'z asosini talab qiladi). */
  type Band = { kat: string; kod: string | null; nom: string | null; birlik: string | null; narx: number | null; hajm: number | null; qatorlar: number; dalillar: NarxDalilHolat[]; dalilsizQator: number };
  const bandlar = new Map<string, Band>();
  for (const r of resurslar) {
    const kat = katKalit(r.kat) || '';
    const k = [kat, (r.kod ?? '').trim(), (r.nom ?? '').trim().toUpperCase(), (r.birlik ?? '').trim().toUpperCase(), r.narx ?? ''].join('|');
    const b = bandlar.get(k) ?? { kat, kod: r.kod, nom: r.nom, birlik: r.birlik, narx: r.narx, hajm: 0, qatorlar: 0, dalillar: [], dalilsizQator: 0 };
    b.qatorlar++;
    b.hajm = b.hajm == null || r.hajm == null ? null : Math.round((b.hajm + Number(r.hajm)) * 1e6) / 1e6;
    const d = dalil.get(r.qator_id);
    if (d) { const dk = (x: NarxDalilHolat) => `${x.manba_id}|${x.manba_kod ?? ""}|${x.manba_nom_qator ?? ""}|${x.manba_narx ?? ""}`; if (!b.dalillar.some((x) => dk(x) === dk(d))) b.dalillar.push(d); } else b.dalilsizQator++;
    bandlar.set(k, b);
  }
  const umumiy: AsoslashBand[] = [...bandlar.values()].map((b) => {
    const d = b.dalillar[0];
    return { kat: b.kat, kod: b.kod, nom: b.nom, birlik: b.birlik, hajm: b.hajm, narx: b.narx, qatorlar: b.qatorlar,
      hujjatTuri: d ? NARX_MANBA_TUR_NOMI[d.manba_tur] : null,
      rekvizit: d ? manbaRekviziti(d) + (b.dalillar.length > 1 ? `; ещё документов: ${b.dalillar.length - 1}` : '') : null,
      manbaNom: d?.manba_nom_qator ?? null, manbaBirlik: d?.manba_birlik ?? null, manbaNarx: d?.manba_narx ?? null, qaytaHisob: null,
      dalilsizSabab: !d ? (b.narx == null ? 'цена в смете не указана' : 'документ-основание цены не приложен')
        : b.dalilsizQator ? `основание приложено не ко всем позициям сметы (без документа: ${b.dalilsizQator} из ${b.qatorlar})` : null };
  });
  const { varaq, tasdiqlangan, dalilsiz } = narxAsoslashVaraq(umumiy, { ...o, sana, pozitsiyalar: resurslar.length });
  const { bytes } = rasmiyKitob([varaq], { tur: 'narx_asoslash' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ОБОСНОВАНИЕ_ЦЕН', davr: sana }), tasdiqlangan, dalilsiz };
}
