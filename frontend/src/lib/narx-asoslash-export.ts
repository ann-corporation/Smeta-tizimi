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

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Код', kenglik: 12, tur: 'kod' },
  { sarlavha: 'Наименование ресурса', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'Кол-во', kenglik: 11, tur: 'hajm' },
  { sarlavha: 'Цена в смете', kenglik: 14, tur: 'narx' },
  { sarlavha: 'Вид документа', kenglik: 20, tur: 'matn', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Документ (№, дата, поставщик / период)', kenglik: 36, tur: 'matn', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Цена по документу', kenglik: 14, tur: 'narx', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
  { sarlavha: 'Отклонение, %', kenglik: 11, tur: 'foiz', guruh: 'ОБОСНОВАНИЕ ЦЕНЫ' },
];

const KAT_TARTIB = ['ЧЕЛ', 'МАШ', 'МАТ', 'М/К', 'КАБ', 'БЕЗ СКЛАД', 'ОБ'];
const KAT_NOMI: Record<string, string> = {
  ЧЕЛ: 'ТРУДОВЫЕ РЕСУРСЫ (ЧЕЛ.-ЧАС)', МАШ: 'МАШИНЫ И МЕХАНИЗМЫ (МАШ.-ЧАС)', МАТ: 'МАТЕРИАЛЫ',
  'М/К': 'МЕТАЛЛОКОНСТРУКЦИИ', КАБ: 'КАБЕЛИ И ПРОВОДА', 'БЕЗ СКЛАД': 'МАТЕРИАЛЫ БЕЗ СКЛАДСКОГО ХРАНЕНИЯ', ОБ: 'ОБОРУДОВАНИЕ',
};

/** Bazadagi kanonik qiymat 'БЕЗСКЛАД' (bo'shliqsiz) — hujjatda bir bo'lim. */
const katKalit = (k: string | null) => { const x = (k ?? '').trim().toUpperCase(); return x === 'БЕЗСКЛАД' ? 'БЕЗ СКЛАД' : x; };

const NDS_MATNI = { nds_siz: 'без НДС', nds_bilan: 'с НДС', nomalum: '' } as const;

/** Hujjat rekvizitlari matni: «№ 125 от 12.08.2026, ООО «Бетон» (ИНН 301234567), без НДС» / «3 кв. 2026, Навоийская обл.». */
export function manbaRekviziti(d: Pick<NarxDalilHolat, 'manba_nom' | 'manba_raqam' | 'manba_sana' | 'yetkazuvchi' | 'yetkazuvchi_inn' | 'yil' | 'kvartal' | 'region' | 'nds_holati'>): string {
  const q: string[] = [d.manba_nom];
  const nomer = [d.manba_raqam ? `№ ${d.manba_raqam}` : '', d.manba_sana ? `от ${d.manba_sana.split('-').reverse().join('.')}` : ''].filter(Boolean).join(' ');
  if (nomer) q.push(nomer);
  if (d.kvartal && d.yil) q.push(`${d.kvartal} кв. ${d.yil}`); else if (d.yil) q.push(`${d.yil} г.`);
  if (d.region) q.push(d.region);
  if (d.yetkazuvchi) q.push(d.yetkazuvchi + (d.yetkazuvchi_inn ? ` (ИНН ${d.yetkazuvchi_inn})` : ''));
  if (NDS_MATNI[d.nds_holati]) q.push(NDS_MATNI[d.nds_holati]);
  return q.join(', ');
}

export function narxAsoslashXlsx(resurslar: readonly AsoslashResurs[], dalillar: readonly NarxDalilHolat[], o: AsoslashOpsiya): {
  bytes: Uint8Array; faylNomi: string; tasdiqlangan: number; dalilsiz: number;
} {
  const sana = o.sana ?? bugunSana();
  const dalil = new Map(dalillar.map((d) => [d.qator_id, d]));
  const v = new RasmiyVaraq({
    nom: 'Обоснование цен',
    sarlavha: 'ОБОСНОВАНИЕ СТОИМОСТИ РЕСУРСОВ, ПРИНЯТЫХ В СМЕТНОЙ ДОКУМЕНТАЦИИ',
    ostSarlavha: [`по состоянию на ${sana.split('-').reverse().join('.')}`],
    titul: [['Объект:', o.obyektNomi], ['Подрядчик:', o.imzo?.pudratchi], ['Заказчик:', o.imzo?.zakazchik]],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  /* Egasi (2026-10-02): "smetadagi bir xil pozitsiyalar qayta-qayta kelavergan — resurs vedomostidek kategoriyaga
   * ajratilgan holatda bo'lsin". Bir xil resurs (tur | kod | nom | birlik | smeta narxi) — BITTA qator, miqdori jamlanadi.
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
  let no = 0;
  let tasdiqlangan = 0;
  const dalilsiz: { nom: string; sabab: string }[] = [];
  const hammasi = [...bandlar.values()];
  const katlar = [...KAT_TARTIB, ...new Set(hammasi.map((b) => b.kat).filter((k) => k && !KAT_TARTIB.includes(k)))];
  for (const kat of [...katlar, '']) {
    const guruh = hammasi.filter((b) => b.kat === kat).sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '', 'ru') || (a.kod ?? '').localeCompare(b.kod ?? ''));
    if (!guruh.length) continue;
    v.bolim(KAT_NOMI[kat] ?? (kat || 'ПРОЧИЕ РЕСУРСЫ (категория не указана)'));
    for (const b of guruh) {
      const d = b.dalillar[0];
      if (d && !b.dalilsizQator) tasdiqlangan++;
      else if (!d) dalilsiz.push({ nom: `${b.nom ?? '—'}${b.birlik ? `, ${b.birlik}` : ''}`, sabab: b.narx == null ? 'цена в смете не указана' : 'документ-основание цены не приложен' });
      else dalilsiz.push({ nom: `${b.nom ?? '—'}${b.birlik ? `, ${b.birlik}` : ''}`, sabab: `основание приложено не ко всем позициям сметы (без документа: ${b.dalilsizQator} из ${b.qatorlar})` });
      const rekvizit = d ? manbaRekviziti(d) + (b.dalillar.length > 1 ? `; ещё документов: ${b.dalillar.length - 1}` : '') : null;
      v.qator('oddiy', (n) => [
        ++no, b.kod, b.nom, b.birlik, b.hajm, b.narx,
        d ? NARX_MANBA_TUR_NOMI[d.manba_tur] : null,
        rekvizit,
        d ? d.manba_narx : null,
        d ? { f: `IF(OR(F${n}="",I${n}="",F${n}=0),"",ROUND((I${n}-F${n})/F${n}*100,2))`, v: b.narx && d.manba_narx != null ? Math.round(((Number(d.manba_narx) - b.narx) / b.narx) * 10000) / 100 : '' } : null,
      ], { rang: (RANG_TARTIB as readonly string[]).includes(kat) ? kat as QatorRangi : null });
    }
  }
  v.bosh();
  v.izoh(`Всего ресурсов: ${hammasi.length} (позиций в смете: ${resurslar.length}); цена подтверждена документом — ${tasdiqlangan}; без полного подтверждения — ${dalilsiz.length}.`);
  v.izoh('Отклонение = (цена по документу − цена в смете) / цена в смете × 100. Для машин и механизмов принята наибольшая стоимость маш.-часа по подтвержденным калькуляциям; для материалов — цены последнего квартала каталога либо документов поставщиков. Копии документов-оснований прилагаются.');
  if (dalilsiz.length) v.diqqat(dalilsiz, 'ПОЗИЦИИ БЕЗ ДОКУМЕНТА-ОСНОВАНИЯ ЦЕНЫ');
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'narx_asoslash' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ОБОСНОВАНИЕ_ЦЕН', davr: sana }), tasdiqlangan, dalilsiz: dalilsiz.length };
}
