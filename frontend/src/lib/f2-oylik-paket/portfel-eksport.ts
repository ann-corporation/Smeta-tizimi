/**
 * F2 PORTFELI — BITTA Excel kitob (egasi 2026-11-05: «yuklab olishni bossam hammasini yig'ib yuklab bersin»):
 *  1-varaq «Свод» — kesimdagi barcha F2 (obyekt → oy), obyekt va shartnoma jamilari: утверждённые / черновики / всего;
 *     summa tartibi — QQS bilan birinchi (ВСЕГО с НДС, НДС, с накрутками без НДС, прямые). Bekor — kulrang, jamiga kirmaydi.
 *  keyingi varaqlar — har akt uchun mavjud Ф-2 varag'i (`f2HujjatVaraqlar`, F2 tarixi bilan bir xil generator, formulasiz).
 * Hujjat RUS tilida (rasmiy hujjat qoidasi). Summasi noma'lum katak BO'SH (0 emas).
 */
import { RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, sumFormula, yaxlit2, type ImzoNomlar, type RasmiyUstun } from '../hujjat-yozuvchi';
import { davrMatni } from '../nakopitelniy-vedomost-export';
import type { F2Bosqich, Summa } from '../f2-reestr/reestr';
import type { OyJami, PaketAkt } from './oylik';
import type { Portfel, PortfelJami } from './portfel';

const BOSQICH_RU: Record<F2Bosqich, string> = { tasdiqlangan: 'утверждён', jarayonda: 'черновик / на проверке', rad: 'отклонён', bekor: 'аннулирован' };

const USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Отчётный период', kenglik: 18, tur: 'matn' },
  { sarlavha: '№ Ф-2', kenglik: 11, tur: 'kod' },
  { sarlavha: 'Статус', kenglik: 16, tur: 'birlik' },
  { sarlavha: 'ВСЕГО с НДС', kenglik: 18, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'в т.ч. НДС', kenglik: 16, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'с накрутками (ИТОГО-4, без НДС)', kenglik: 18, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'прямые затраты (без накрутки, без НДС)', kenglik: 18, tur: 'pul', guruh: 'СУММА, сум' },
  { sarlavha: 'Лист / примечание', kenglik: 30, tur: 'matn' },
];

/** Ustunlar: 4 — с НДС, 5 — НДС, 6 — с накрутками, 7 — прямые. */
type Kolon = 'jami' | 'nds' | 'ustamali' | 'ustamasiz';
const KOLON: Array<[Kolon, number]> = [['jami', 4], ['nds', 5], ['ustamali', 6], ['ustamasiz', 7]];

function aktQiymat(r: PaketAkt, k: Kolon): number | null {
  const m = r.moliya;
  if (k === 'ustamasiz') return m ? m.ustamasiz : r.akt.hujjat_jami;
  return m?.[k] ?? null;
}

const malumBor = (s: Summa) => s.soni - s.nomalum > 0;

export type PortfelSvodOpsiya = {
  /** Sarlavha osti: «Договор № 12 · …» yoki «Объект: …». */
  kesimMatni: string;
  tashkilot?: string | null;
  imzo?: ImzoNomlar;
  /** Akt id → Excel varaq nomi (kitobga kirgan Ф-2) yoki, ZIP rejimida, paketdagi fayl yo'li. */
  varaqlar: ReadonlyMap<number, string>;
  /** ZIP paket: har akt alohida fayl — izohda «файл «…»» (aks holda «лист «…»»). */
  faylRejimi?: boolean;
  /** Akt id → kirmaslik sababi (masalan, token yetmadi). */
  kirmadi?: ReadonlyMap<number, string>;
};

/** «Свод» varag'i. `p` — kesimning to'liq portfeli (bekor ham, ular kulrang). */
export function portfelSvodVaraq(p: Portfel, o: PortfelSvodOpsiya): RasmiyVaraq {
  const v = new RasmiyVaraq({
    nom: 'Свод', sarlavha: 'СВОД АКТОВ ВЫПОЛНЕННЫХ РАБОТ (ФОРМА № 02)', ostSarlavha: [o.kesimMatni],
    titul: [['Подрядчик:', o.tashkilot ?? o.imzo?.pudratchi]], ustunlar: USTUN, yonalish: 'landscape',
  });
  type Q = Record<Kolon, number[]>;
  const bosQ = (): Q => ({ jami: [], nds: [], ustamali: [], ustamasiz: [] });
  const umumiy = { tasdiqlangan: bosQ(), qoralama: bosQ(), hammasi: bosQ() };
  const jamiQator = (nom: string, q: Q, j: OyJami, tur: 'jami' | 'vsego') => {
    const qiymat: Array<string | number | { f: string; v: number } | null> = ['', nom, '', `${j.soni} шт.`, null, null, null, null, ''];
    for (const [k, i] of KOLON) {
      const f = sumFormula(v.harf(i), q[k]);
      qiymat[i] = f && malumBor(j[k]) ? { f, v: yaxlit2(j[k].malum) } : null;
    }
    const nom2 = KOLON.map(([k]) => j[k].nomalum).some((x) => x > 0) ? `сумма неизвестна у Ф-2: ${Math.max(...KOLON.map(([k]) => j[k].nomalum))}` : '';
    qiymat[8] = nom2;
    v.qator(tur, qiymat);
  };
  const guruhJamilari = (sarlavha: string, q: { tasdiqlangan: Q; qoralama: Q; hammasi: Q }, j: PortfelJami, tur: 'jami' | 'vsego') => {
    jamiQator(`${sarlavha} — утверждённые`, q.tasdiqlangan, j.tasdiqlangan, tur);
    if (j.qoralama.soni) jamiQator(`${sarlavha} — черновики (не утверждены)`, q.qoralama, j.qoralama, tur);
    if (j.qoralama.soni) jamiQator(`${sarlavha} — всего (без аннулированных)`, q.hammasi, j.hammasi, tur);
  };
  let no = 0;
  /** Bekor bo'lmagan aktlardagi narxsiz qatorlar — ИТОГО yonida ogohlantirish (egasi 2026-11-06). */
  let narxsizN = 0;
  for (const ob of p.obyektlar) {
    v.bolim(ob.nom);
    const oq = { tasdiqlangan: bosQ(), qoralama: bosQ(), hammasi: bosQ() };
    for (const oy of ob.oylar) {
      for (const r of oy.aktlar) {
        const bekor = r.bosqich === 'bekor';
        const izoh = [o.varaqlar.get(r.akt.id) ? `${o.faylRejimi ? 'файл' : 'лист'} «${o.varaqlar.get(r.akt.id)}»` : '', bekor ? 'аннулирован — в итоги не входит' : '',
          o.kirmadi?.get(r.akt.id) ?? '', r.moliya?.taxminiy ? 'приблизительно' : '', r.moliyaXato ? 'строки акта не прочитаны' : '',
          r.moliya && r.moliya.narxsizQator > 0 ? `строк без цены: ${r.moliya.narxsizQator}` : ''].filter(Boolean).join('; ');
        if (!bekor) narxsizN += r.moliya?.narxsizQator ?? 0;
        const qiymat: Array<string | number | null> = [++no, davrMatni(r.akt.oy ?? ''), r.akt.raqam ?? '', BOSQICH_RU[r.bosqich], null, null, null, null, izoh];
        for (const [k, i] of KOLON) qiymat[i] = aktQiymat(r, k);
        const n = v.qator('oddiy', qiymat, bekor ? { rang: 'almashtirilgan' } : undefined);
        if (bekor) continue;
        const bolak = r.bosqich === 'tasdiqlangan' ? 'tasdiqlangan' : 'qoralama';
        for (const [k] of KOLON) {
          if (aktQiymat(r, k) == null) continue;
          for (const q of [oq[bolak], oq.hammasi, umumiy[bolak], umumiy.hammasi]) q[k].push(n);
        }
      }
    }
    guruhJamilari('Итого по объекту', oq, ob.jami, 'jami');
    v.bosh();
  }
  guruhJamilari('ИТОГО', umumiy, p.jami, 'vsego');
  v.narxsizOgoh(narxsizN);
  v.bosh();
  v.izoh('«ВСЕГО с НДС» — основная сумма; «с накрутками» = ИТОГО-4 без НДС; «прямые» — без накрутки. Накрутка — по подвалу самого акта (если сохранён), иначе по подвалу сметы объекта. Сторно и минусовые строки учтены со своим знаком.');
  if (p.jami.bekorSoni) v.izoh(`Аннулированных Ф-2: ${p.jami.bekorSoni} — показаны серым, в итоги не входят.`);
  v.izoh('Ф-2 с неизвестной суммой в итог не включены (в графе пусто).');
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));
  return v;
}

/** Portfel akt varag'i: `formulali` — qoralama (tirik formulalar, F2 tarixi bilan bir xil); sukut — muzlatilgan (formulasiz). */
export type PortfelAktVaraq = RasmiyVaraq | { varaq: RasmiyVaraq; formulali: boolean };

/** Kitob: Свод (formulali) + har akt Ф-2 varag'i (tasdiqlangan — formulasiz; qoralama — formulali, audit C M11). */
export function portfelKitob(svod: RasmiyVaraq, aktVaraqlar: readonly PortfelAktVaraq[], o: { nom: string; tashkilot?: string | null }): { bytes: Uint8Array; faylNomi: string } {
  const vs = aktVaraqlar.map((x) => (x instanceof RasmiyVaraq ? { varaq: x, formulali: false } : x));
  const varaqlar = [svod, ...vs.map((x) => x.varaq)];
  const formulasizVaraqlar = vs.flatMap((x, i) => (x.formulali ? [] : [i + 1]));
  const { bytes } = rasmiyKitob(varaqlar, { tur: 'f2', formulasizVaraqlar });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.tashkilot ?? undefined, hujjat: `ПОРТФЕЛЬ_Ф-2_${o.nom}`.slice(0, 80), kengaytma: 'xlsx' }) };
}
