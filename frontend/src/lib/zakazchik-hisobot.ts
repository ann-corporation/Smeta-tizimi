/**
 * Buyurtmachi portfelining oylik hisoboti — Excel (hujjat-yozuvchi / RasmiyVaraq). Rasmiy hujjat rus tilida.
 * Manba: t2_zakazchik_bugun_v1 (server, grant bo'yicha qirqilgan). Ruxsat yo'q yoki noma'lum summa — bo'sh katak (0 emas).
 * Qarz = F3 − to'langan: ikkalasi ma'lum bo'lganda formula (tizim hisobi). Beriladi: `hujjatTokenBilan` (UI da).
 */
import type { BugunObyekt } from '../api/t2-tomon';
import { yaxlit2 } from './hisob-yadro';
import { PORTFEL_USTUNLAR, portfelJami, ustunQiymati, type PortfelUstun } from '../admin/zakazchik/bugun-yordam';

export type ZakazchikHisobotMeta = { kompaniya: string; sana: string };

/** Ustun tartibi (0 dan): 0 №, 1 Подрядчик, 2 Объект, 3.. summalar (PORTFEL_USTUNLAR tartibida), keyin 2 ta son. */
const SUMMA_BOSHI = 3;
const NOM_RU: Record<PortfelUstun, string> = {
  shartnoma: 'Договор (с НДС)', smeta: 'Смета, прямые (без НДС)', fakt: 'Факт по отчёту подрядчика (без НДС)', f2: 'Ф-2 утверждено, прямые (без НДС)',
  f2_ustamali: 'Ф-2 с накрутками (без НДС)', f2_qqs: 'Ф-2 всего (с НДС)', f3: 'Ф-3 выставлено (с НДС)', tolangan: 'Оплачено (с НДС)', qarz: 'Задолженность (с НДС)',
};

export async function zakazchikOylikHisobot(obyektlar: readonly BugunObyekt[], meta: ZakazchikHisobotMeta): Promise<{ bytes: Uint8Array; faylNomi: string; yacheykalar: number }> {
  const { RasmiyVaraq, rasmiyKitob, sumFormula } = await import('./hujjat-yozuvchi');
  const v = new RasmiyVaraq({
    nom: 'Портфель', kattaHarf: false, yonalish: 'landscape',
    sarlavha: 'ЕЖЕМЕСЯЧНЫЙ ОТЧЁТ ЗАКАЗЧИКА ПО ПОРТФЕЛЮ ОБЪЕКТОВ',
    ostSarlavha: ['Данные подрядчиков в пределах предоставленного доступа. Пустая ячейка — значение неизвестно или доступ не предоставлен (не ноль).'],
    titul: [['Заказчик', meta.kompaniya], ['Дата отчёта', meta.sana]],
    ustunlar: [
      { sarlavha: '№', kenglik: 5, tur: 'tartib' }, { sarlavha: 'Подрядчик', kenglik: 26, tur: 'matn' }, { sarlavha: 'Объект', kenglik: 30, tur: 'matn' },
      ...PORTFEL_USTUNLAR.map((u) => ({ sarlavha: NOM_RU[u], kenglik: 18, tur: 'pul' as const })),
      { sarlavha: 'Ожидает решения, док.', kenglik: 12, tur: 'tartib' as const }, { sarlavha: 'Открытые замечания', kenglik: 12, tur: 'tartib' as const },
    ],
  });
  const harf = (u: PortfelUstun) => v.harf(SUMMA_BOSHI + PORTFEL_USTUNLAR.indexOf(u));
  const rows: number[] = [];
  obyektlar.forEach((o, i) => {
    rows.push(v.qator('oddiy', (r) => {
      const qiymatlar = PORTFEL_USTUNLAR.map((u) => {
        const q = ustunQiymati(o, u);
        if (u === 'qarz' && q != null && o.f3?.summa != null && o.tolangan) return { f: `${harf('f3')}${r}-${harf('tolangan')}${r}`, v: q };
        return q;
      });
      return [i + 1, o.qarshi_nom, o.obyekt_nom, ...qiymatlar, o.kutayotgan_taqdim, o.ochiq_murojaat];
    }));
  });
  if (rows.length) {
    const j = portfelJami(obyektlar);
    const jk = (u: PortfelUstun) => { const f = sumFormula(harf(u), rows); return f && j[u].summa != null ? { f, v: yaxlit2(j[u].summa as number) } : null; };
    v.qator('jami', ['', 'ИТОГО', '', ...PORTFEL_USTUNLAR.map((u) => jk(u)), null, null]);
  }
  const k = rasmiyKitob([v]);
  return { bytes: k.bytes, yacheykalar: k.yacheykalar, faylNomi: `ОТЧЁТ_ЗАКАЗЧИКА_${meta.sana}.xlsx` };
}
