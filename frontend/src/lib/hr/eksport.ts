/**
 * Ведомость начисления заработной платы (qoralama) — Excel, hujjat-yozuvchi (RasmiyVaraq) orqali.
 * Rasmiy hujjat rus tilida. Hisoblangan/Sof — formula (tizim hisobi), noma'lum qiymat — bo'sh katak (0 emas) + izoh.
 * Beriladi: `hujjatTokenBilan` (UI da). Hisob manbai: SQL `_t2_hr_hisob_v1` (HR_KPI_V1.md).
 */
import { yaxlit2 } from '../hisob-yadro';
import type { HrKpiQator } from '../../api/t2-hr';
import { kpiJamlari } from './hisob';

const OGOH_RU: Record<string, string> = {
  tabel_yoq: 'нет табеля', tabel_tasdiqlanmagan: 'табель не утверждён', ish_kun_norma_dan_oshdi: 'отработано больше нормы',
  baza_nomalum: 'не задан оклад/ставка', f2_summa_nomalum: 'в актах Ф-2 неизвестна сумма', tuzatma_nomalum: 'неизвестна сумма штрафа/премии',
  tuzatma_kutilmoqda: 'есть неутверждённые штрафы/премии', stavka_kiritilmagan: 'не заданы ставки НДФЛ/ИНПС', manfiy: 'отрицательное начисление',
};

export type HisobotMeta = { kompaniya: string; oy: string; tasdiqlangan: boolean };

export async function ishHaqiVedomosti(qatorlar: readonly HrKpiQator[], meta: HisobotMeta): Promise<{ bytes: Uint8Array; faylNomi: string; yacheykalar: number }> {
  const { RasmiyVaraq, rasmiyKitob, sumFormula } = await import('../hujjat-yozuvchi');
  const v = new RasmiyVaraq({
    nom: 'Ведомость', kattaHarf: false,
    sarlavha: `ВЕДОМОСТЬ НАЧИСЛЕНИЯ ЗАРАБОТНОЙ ПЛАТЫ ${meta.tasdiqlangan ? '' : '(ЧЕРНОВИК)'}`.trim(),
    ostSarlavha: ['Начислено = оклад/ставка по отработанным дням + КПИ (Ф-2) + премии − штрафы. Неизвестные значения не заменяются нулём.'],
    titul: [['Организация', meta.kompaniya], ['Период', meta.oy]],
    ustunlar: [
      { sarlavha: '№', kenglik: 5, tur: 'tartib' }, { sarlavha: 'Ф.И.О.', kenglik: 30, tur: 'matn' }, { sarlavha: 'Должность', kenglik: 18, tur: 'matn' },
      { sarlavha: 'Норма, дн.', kenglik: 9, tur: 'tartib' }, { sarlavha: 'Отработано, дн.', kenglik: 11, tur: 'tartib' },
      { sarlavha: 'Оклад / ставка', kenglik: 15, tur: 'pul' }, { sarlavha: 'По дням', kenglik: 15, tur: 'pul' },
      { sarlavha: 'КПИ (Ф-2)', kenglik: 15, tur: 'pul' }, { sarlavha: 'Премии', kenglik: 14, tur: 'pul' }, { sarlavha: 'Штрафы', kenglik: 14, tur: 'pul' },
      { sarlavha: 'Начислено', kenglik: 16, tur: 'pul' }, { sarlavha: 'НДФЛ', kenglik: 14, tur: 'pul' }, { sarlavha: 'ИНПС', kenglik: 13, tur: 'pul' },
      { sarlavha: 'К выплате', kenglik: 16, tur: 'pul' }, { sarlavha: 'Примечание', kenglik: 38, tur: 'matn' },
    ],
  });
  const rows: number[] = [];
  // Ustunlar (0 dan): 6 По дням, 7 КПИ, 8 Премии, 9 Штрафы, 10 Начислено, 11 НДФЛ, 12 ИНПС, 13 К выплате
  const [G, H, I, J, K, L, M] = [6, 7, 8, 9, 10, 11, 12].map((c) => v.harf(c));
  qatorlar.forEach((x, i) => {
    rows.push(v.qator('oddiy', (r) => {
      // Formula faqat barcha tashkil etuvchilar ma'lum bo'lganda (noma'lum — bo'sh katak, 0 emas).
      const hisobFormula = x.baza != null && (x.f2_foiz == null || x.kpi_f2 != null) && x.hisoblangan != null;
      const hisob = hisobFormula ? { f: `${G}${r}+${x.kpi_f2 == null ? '0' : `${H}${r}`}+${I}${r}-${J}${r}`, v: x.hisoblangan } : x.hisoblangan;
      const sofFormula = x.hisoblangan != null && x.ndfl != null && x.inps != null && x.sof != null;
      const sof = sofFormula ? { f: `${K}${r}-${L}${r}-${M}${r}`, v: x.sof } : x.sof;
      return [i + 1, x.ism, x.lavozim ?? '', x.norma_kun, x.kun_ishlagan, x.baza_summa, x.baza, x.kpi_f2, x.bonus, x.jarima, hisob, x.ndfl, x.inps, sof,
        x.ogohlantirish.map((k) => OGOH_RU[k] ?? k).join('; ')];
    }));
  });  const j = kpiJamlari(qatorlar);
  const jk = (c: number, val: number) => { const f = sumFormula(v.harf(c), rows); return f ? { f, v: yaxlit2(val) } : null; };
  if (rows.length) {
    v.qator('jami', ['', 'ИТОГО', '', null, null, null, jk(6, j.baza), jk(7, j.kpi), jk(8, j.bonus), jk(9, j.jarima), jk(10, j.hisoblangan), jk(11, j.ndfl), jk(12, j.inps), jk(13, j.sof),
      j.nomalum_hisoblangan || j.nomalum_sof ? `Неизвестно (не вошло в итог): ${Math.max(j.nomalum_hisoblangan, j.nomalum_sof)}` : '']);
  }
  const k = rasmiyKitob([v]);
  return { bytes: k.bytes, yacheykalar: k.yacheykalar, faylNomi: `ВЕДОМОСТЬ_ЗП_${meta.oy}${meta.tasdiqlangan ? '' : '_ЧЕРНОВИК'}.xlsx` };
}
