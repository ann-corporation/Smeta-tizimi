/**
 * NARYAD-ZADANIE hujjati (rasmiy rus shakli; asosiy qatorlar KATTA HARFDA — `RasmiyVaraq`, hujjat standarti H1–H9).
 * Ustunlar: № | Шифр | Наименование работ | Кратко (бригадага, lug'at) | Ед. изм. | Объём | Норма труда, чел-ч | Расценка бригады |
 * Сумма к оплате (= Объём × Расценка, formula) | По смете: труд | Экономия (+) / перерасход (−) (formula).
 * Pul QQS SIZ (to'g'ri xarajat). Narx/smeta mehnati noma'lum — bo'sh katak (0 emas), formulada «» qaytadi.
 */
import { RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, type ImzoNomlar, type Qiymat, type RasmiyUstun } from '../hujjat-yozuvchi';
import { odamNomi, type Til } from '../qurilish-lugat';
import { HOLAT_NOMI, naryadJami, satrTahlil, type Naryad } from './index';

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 14, tur: 'kod' },
  { sarlavha: 'Наименование работ (по смете)', kenglik: 52, tur: 'matn' },
  { sarlavha: 'Кратко (для бригады)', kenglik: 26, tur: 'matn' },
  { sarlavha: 'Ед. изм. бригады', kenglik: 10, tur: 'birlik' },
  { sarlavha: 'Объём (в ед. бригады)', kenglik: 13, tur: 'hajm' },
  { sarlavha: 'Расценка бригады за ед., сум', kenglik: 16, tur: 'narx' },
  { sarlavha: 'Сумма к оплате, сум', kenglik: 18, tur: 'pul' },
  { sarlavha: 'Ед. изм. по смете', kenglik: 10, tur: 'birlik' },
  { sarlavha: 'Объём по смете', kenglik: 13, tur: 'hajm' },
  { sarlavha: 'Норма труда, чел-ч', kenglik: 12, tur: 'hajm' },
  { sarlavha: 'По смете (труд / материал / механизмы), сум', kenglik: 19, tur: 'pul' },
  { sarlavha: 'Экономия (+) / перерасход (−), сум', kenglik: 19, tur: 'pul' },
];
// Ustun harflari: A№ B kod C nom D qisqa E usta birligi F usta hajmi G usta narxi H summa | I smeta birligi J smeta hajmi | K chel-soat L smeta puli M farq
// Brigada imzolaydigan qism — o'z birligi, hajmi va narxi (E–H); smeta birligi/hajmi (I–J) — ikkinchi darajali.
export type NaryadHujjatOpsiya = {
  obyektNom: string;
  pudratchi?: string | null;
  imzo?: ImzoNomlar;
  /** Qisqa nom tili (brigada o'qiydi): o'zbekcha lotin/kirill yoki ruscha. */
  qisqaTil?: Til;
  /** 'reja' — berilgan hajm bo'yicha; 'amalda' — qabul/bajarilgan hajm bo'yicha (sukut: holat bo'yicha). */
  rejim?: 'reja' | 'amalda';
};

export function naryadHujjat(n: Naryad, o: NaryadHujjatOpsiya): { bytes: Uint8Array; faylNomi: string } {
  const rejim = o.rejim ?? (n.holat === 'berildi' ? 'reja' : 'amalda');
  const til = o.qisqaTil ?? 'uz';
  const davr = [n.davr_dan, n.davr_gacha].filter(Boolean).map((d) => String(d).split('-').reverse().join('.')).join(' — ');
  const v = new RasmiyVaraq({
    nom: 'Наряд',
    sarlavha: 'НАРЯД-ЗАДАНИЕ БРИГАДЕ (МАСТЕРУ) НА ВЫПОЛНЕНИЕ РАБОТ',
    ostSarlavha: [`№ ${n.raqam}${davr ? ` · период: ${davr}` : ''}`, `Состояние: ${HOLAT_NOMI[n.holat]}; суммы — без НДС и накладных (прямые затраты труда)`],
    titul: [
      ['Объект:', o.obyektNom],
      ['Подрядчик:', o.pudratchi ?? null],
      ['Бригада / мастер:', [n.usta_nom, n.brigada].filter(Boolean).join(', ')],
      ['Дата составления:', bugunMatn(n)],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });

  const bosh = v.r;
  const n0 = (x: number | null | undefined): Qiymat => (x == null ? null : x);
  n.qatorlar.forEach((q, i) => {
    const s = satrTahlil(q, rejim);
    // Usta o'z birligida: hajm = smeta hajmi / koef; narx = usta_narx_birlik. Usta birligi bo'lmasa — smeta birligi va narxi.
    const ustaBirlikda = q.usta_birlik != null && q.koef != null && q.koef > 0;
    const ustaHajm = ustaBirlikda ? s.hajm / (q.koef as number) : s.hajm;
    const ustaNarx = ustaBirlikda ? q.usta_narx_birlik : q.usta_narx;
    const katBelgi = q.kat === 'ЧЕЛ' ? '' : ` (${q.kat})`;
    v.qator('ish', (rr) => [
      i + 1, q.kod, q.nom, odamNomi(q, til) + katBelgi, ustaBirlikda ? q.usta_birlik : q.birlik,
      Number(ustaHajm.toFixed(6)), n0(ustaNarx),
      s.summa == null ? { f: `IF(G${rr}="","",ROUND(F${rr}*G${rr},2))`, v: '' } : { f: `IF(G${rr}="","",ROUND(F${rr}*G${rr},2))`, v: s.summa },
      q.birlik, s.hajm, n0(s.chelSoat), n0(s.smetaMehnat),
      { f: `IF(OR(H${rr}="",L${rr}=""),"",ROUND(L${rr}-H${rr},2))`, v: s.foyda ?? '' },
    ], { daraja: 1 });
  });
  const oxir = v.r - 1;
  const j = naryadJami(n.qatorlar, rejim);
  const yig = (harf: string, qiymat: number | null): Qiymat => (n.qatorlar.length ? { f: `SUM(${harf}${bosh}:${harf}${oxir})`, v: qiymat ?? '' } : 0);
  v.qator('jami', () => [null, null, 'ИТОГО', null, null, null, null, yig('H', j.ustaSumma), null, null, yig('K', j.chelSoat), yig('L', j.smetaMehnat), j.foyda == null ? '' : j.foyda]);
  if (j.narxsizSoni) v.izoh(`Расценка не согласована по ${j.narxsizSoni} поз. — сумма по ним неизвестна (не нуль) и в итог не включена.`);
  if (j.smetasizSoni) v.izoh(`По ${j.smetasizSoni} поз. трудозатраты по смете не определены — в сравнение не включены.`);
  v.izoh(`Оплата — по принятому объёму (${rejim === 'amalda' ? 'факт' : 'план'}); итоговая разница = смета (труд) − оплата бригаде, только по позициям с известными обеими суммами.`);
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'СУБПОДРЯДЧИК', 'ПРОВЕРИЛ'], { ...o.imzo, subpudratchi: o.imzo?.subpudratchi ?? n.usta_nom }));
  const { bytes } = rasmiyKitob([v], { tur: 'naryad' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: `Наряд ${n.raqam}`, davr: bugunSana().slice(0, 7) }) };
}
const bugunMatn = (_n: Naryad) => bugunSana().split('-').reverse().join('.');
