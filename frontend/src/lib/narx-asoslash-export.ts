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
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob,
  type ImzoNomlar, type RasmiyUstun,
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
  let no = 0;
  let tasdiqlangan = 0;
  const dalilsiz: { nom: string; sabab: string }[] = [];
  const katlar = [...KAT_TARTIB, ...new Set(resurslar.map((r) => katKalit(r.kat)).filter((k) => k && !KAT_TARTIB.includes(k)))];
  for (const kat of [...katlar, '']) {
    const bandlar = resurslar.filter((r) => (katKalit(r.kat) || '') === kat);
    if (!bandlar.length) continue;
    v.bolim(KAT_NOMI[kat] ?? (kat || 'ПРОЧИЕ РЕСУРСЫ (категория не указана)'));
    for (const r of bandlar) {
      const d = dalil.get(r.qator_id);
      if (d) tasdiqlangan++;
      else dalilsiz.push({ nom: `${r.nom ?? '—'}${r.birlik ? `, ${r.birlik}` : ''}`, sabab: r.narx == null ? 'цена в смете не указана' : 'документ-основание цены не приложен' });
      v.qator('oddiy', (n) => [
        ++no, r.kod, r.nom, r.birlik, r.hajm, r.narx,
        d ? NARX_MANBA_TUR_NOMI[d.manba_tur] : null,
        d ? manbaRekviziti(d) : null,
        d ? d.manba_narx : null,
        d ? { f: `IF(OR(F${n}="",I${n}="",F${n}=0),"",ROUND((I${n}-F${n})/F${n}*100,2))`, v: r.narx && d.manba_narx != null ? Math.round(((Number(d.manba_narx) - r.narx) / r.narx) * 10000) / 100 : '' } : null,
      ]);
    }
  }
  v.bosh();
  v.izoh(`Всего ресурсов: ${resurslar.length}; цена подтверждена документом — ${tasdiqlangan}; без подтверждения — ${dalilsiz.length}.`);
  v.izoh('Отклонение = (цена по документу − цена в смете) / цена в смете × 100. Для машин и механизмов принята наибольшая стоимость маш.-часа по подтвержденным калькуляциям; для материалов — цены последнего квартала каталога либо документов поставщиков. Копии документов-оснований прилагаются.');
  if (dalilsiz.length) v.diqqat(dalilsiz, 'ПОЗИЦИИ БЕЗ ДОКУМЕНТА-ОСНОВАНИЯ ЦЕНЫ');
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ОБОСНОВАНИЕ_ЦЕН', davr: sana }), tasdiqlangan, dalilsiz: dalilsiz.length };
}
