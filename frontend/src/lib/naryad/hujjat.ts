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
  { sarlavha: 'Наименование работ (по смете)', kenglik: 58, tur: 'matn' },
  { sarlavha: 'Кратко (для бригады)', kenglik: 28, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'Объём работ', kenglik: 12, tur: 'hajm' },
  { sarlavha: 'Норма труда, чел-ч', kenglik: 13, tur: 'hajm' },
  { sarlavha: 'Расценка бригады за ед., сум', kenglik: 16, tur: 'narx' },
  { sarlavha: 'Сумма к оплате, сум', kenglik: 18, tur: 'pul' },
  { sarlavha: 'По смете: труд, сум', kenglik: 18, tur: 'pul' },
  { sarlavha: 'Экономия (+) / перерасход (−), сум', kenglik: 19, tur: 'pul' },
];
// Ustun harflari: A№ B kod C nom D qisqa E birlik F hajm G chel-soat H narx I summa J smeta K farq

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
    v.qator('ish', (rr) => [
      i + 1, q.kod, q.nom, odamNomi(q, til), q.birlik,
      s.hajm, n0(s.chelSoat),
      n0(q.usta_narx),
      s.summa == null ? { f: `IF(H${rr}="","",ROUND(F${rr}*H${rr},2))`, v: '' } : { f: `IF(H${rr}="","",ROUND(F${rr}*H${rr},2))`, v: s.summa },
      n0(s.smetaMehnat),
      { f: `IF(OR(I${rr}="",J${rr}=""),"",ROUND(J${rr}-I${rr},2))`, v: s.foyda ?? '' },
    ], { daraja: 1 });
  });
  const oxir = v.r - 1;
  const j = naryadJami(n.qatorlar, rejim);
  const yig = (harf: string, qiymat: number | null): Qiymat => (n.qatorlar.length ? { f: `SUM(${harf}${bosh}:${harf}${oxir})`, v: qiymat ?? '' } : 0);
  v.qator('jami', () => [null, null, 'ИТОГО', null, null, null, yig('G', j.chelSoat), null, yig('I', j.ustaSumma), yig('J', j.smetaMehnat), j.foyda == null ? '' : j.foyda]);
  if (j.narxsizSoni) v.izoh(`Расценка не согласована по ${j.narxsizSoni} поз. — сумма по ним неизвестна (не нуль) и в итог не включена.`);
  if (j.smetasizSoni) v.izoh(`По ${j.smetasizSoni} поз. трудозатраты по смете не определены — в сравнение не включены.`);
  v.izoh(`Оплата — по принятому объёму (${rejim === 'amalda' ? 'факт' : 'план'}); итоговая разница = смета (труд) − оплата бригаде, только по позициям с известными обеими суммами.`);
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'СУБПОДРЯДЧИК', 'ПРОВЕРИЛ'], { ...o.imzo, subpudratchi: o.imzo?.subpudratchi ?? n.usta_nom }));
  const { bytes } = rasmiyKitob([v], { tur: 'naryad' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: `Наряд ${n.raqam}`, davr: bugunSana().slice(0, 7) }) };
}
const bugunMatn = (_n: Naryad) => bugunSana().split('-').reverse().join('.');
