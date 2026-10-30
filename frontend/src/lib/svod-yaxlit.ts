/**
 * Svod yaxlit bo'limlari (egasi 2026-10-27, migratsiya 20261113500000_t2_svod_yaxlit_v1): svoddagi «письмо
 * заказчика» / ekspertiza yaxlit summalariga ustama HISOBLANMAYDI. Server (`t2_obyekt_nakrutka_v1`) belgili bo'lim
 * avlodlarini kategoriyalardan chiqaradi va bo'lim summasini (QQS siz) ИТОГО-4 ga ustamasiz qo'shadi; QQS bir marta.
 *
 * Bu fayl — o'sha qadamning JS oynasi (SQL `t2_nakrutka_yaxlit_qosh_v1` bilan tiyingacha bir xil), yangi formula emas.
 * Ekran/eksportlar shu yerdagi yordamchilardan foydalanadi:
 *  - `yaxlitQatorIdlari` — belgili bo'lim va uning barcha avlodlari (qator darajasida ustama qo'llanmaydi);
 *  - `svodYaxlitQqs` / `bolimQqsBilan` — yaxlit summa QQS BILAN (svodda НДС dan keyin, yakuniy — egasi 2026-10-30).
 * Hisob qadami yadroda (`lib/hisob-yadro/yaxlit-svod.ts`).
 */
import { yaxlit2 as r2, yaxlitKOplate } from './hisob-yadro';

export type SvodYaxlitBolim = {
  id: number; qator_id: number; nom: string | null;
  svod_summa: number | null; qqs_stavka: number | null;
  /** Ustamaga kirmaydigan summa, QQS siz. */
  qqssiz: number;
  /** Bo'lim barglarining smetadagi to'g'ri xarajati (ustamasiz). */
  barglar: number;
  asos: 'svod' | 'barglar';
  dalil: Record<string, unknown>;
};
export type SvodYaxlit = { qqssiz: number; barglar: number; summasiz: number; bolimlar: SvodYaxlitBolim[] };

/** Eksport hujjatlaridagi yashirin kategoriya ustuniga yaxlit qatorlar uchun yoziladigan belgi — SUMIF ga kirmaydi. */
export const YAXLIT_KAT = 'СВОД';
/** Eksport podvalidagi alohida qator nomi. */
export const YAXLIT_PODVAL_NOM = 'Разделы по своду целой суммой (с НДС; без накладных расходов, НДС не начисляется повторно)';
/** Eksport izohi (qator darajasi). */
export const YAXLIT_IZOH = 'Разделы, принятые по своду (письмо заказчика / экспертиза) целой суммой: накладные и прочие расходы на их строки НЕ начисляются; сумма свода указана С НДС и является итоговой — в расчете стоимости к оплате она учтена одной строкой «Разделы по своду целой суммой (с НДС)» после НДС, без повторного начисления НДС; по строкам раздела сумма распределена так, что итог раздела равен сумме свода.';

/**
 * Bo'lim yaxlit summasi QQS BILAN (egasi 2026-10-30: svodda yaxlit qator НДС dan keyin — summa yakuniy): svod summasi
 * kiritilgan bo'lsa — aynan o'zi; aks holda (sof tarkib) QQS siz × (1 + QQS). Stavka noma'lum — null.
 */
export function bolimQqsBilan(b: Pick<SvodYaxlitBolim, 'svod_summa' | 'qqssiz'>, ndsFoiz: number | null | undefined): number | null {
  return b.svod_summa != null ? r2(Number(b.svod_summa)) : yaxlitKOplate(Number(b.qqssiz), ndsFoiz);
}

/** Obyekt yaxlit svodi: QQS bilan (aynan, bo'limlar yig'indisi) va QQS siz (ko'rsatish). */
export function svodYaxlitQqs(svod: SvodYaxlit | null | undefined, ndsFoiz: number | null | undefined): { qqsBilan: number; qqssiz: number } | null {
  if (!svod?.bolimlar?.length) return null;
  let qqsBilan = 0;
  for (const b of svod.bolimlar) { const x = bolimQqsBilan(b, ndsFoiz); if (x == null) return null; qqsBilan += x; }
  return { qqsBilan: r2(qqsBilan), qqssiz: r2(svod.qqssiz) };
}

/** Server svod xulosasi → kesim yaxlit qismi (svod summasi bor bo'limlar QQS bilan aynan ajratiladi). */
export function svodKesimYaxlit(svod: SvodYaxlit): { qqssiz: number; barglar: number; svodQqsBilan: number; svodQqssiz: number } {
  let svodQqsBilan = 0, svodQqssiz = 0;
  for (const b of svod.bolimlar ?? []) if (b.svod_summa != null) { svodQqsBilan += Number(b.svod_summa); svodQqssiz += Number(b.qqssiz); }
  return { qqssiz: svod.qqssiz, barglar: svod.barglar, svodQqsBilan: r2(svodQqsBilan), svodQqssiz: r2(svodQqssiz) };
}
/** Server javobidan ustama kaskadi uchun kategoriya summalari: belgi bo'lsa `cats_kaskad`, aks holda `cats`. */
export function kaskadCats<C>(r: { cats?: C; cats_kaskad?: C; svod_yaxlit?: SvodYaxlit | null }): C | undefined {
  return r.svod_yaxlit && r.cats_kaskad ? r.cats_kaskad : r.cats;
}

/**
 * Belgili bo'limlar (svod_yaxlit.bolimlar[].qator_id) va ularning BARCHA avlodlari (ota_id bo'yicha) — server
 * `t2_svod_yaxlit_obyekt_v1` dagi rekursiya bilan bir xil to'plam. Belgi yo'q — bo'sh to'plam.
 */
export function yaxlitQatorIdlari(qatorlar: Iterable<{ id: number; ota_id?: number | null }>, svod: SvodYaxlit | null | undefined): Set<number> {
  const out = new Set<number>();
  if (!svod?.bolimlar?.length) return out;
  const bolalar = new Map<number, number[]>();
  for (const q of qatorlar) {
    if (q.ota_id == null) continue;
    const b = bolalar.get(q.ota_id);
    if (b) b.push(q.id); else bolalar.set(q.ota_id, [q.id]);
  }
  const navbat = svod.bolimlar.map((b) => b.qator_id);
  while (navbat.length) {
    const id = navbat.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of bolalar.get(id) ?? []) navbat.push(c);
  }
  return out;
}

/**
 * Hujjat modelidagi bo'lim (svod) barglari: model qatorlarida `id` — t2_qator.id, `bolalar` — model indekslari.
 * `qatorId` li ИТОГО yoki ish (bl) qatoridan pastga barcha barglar (tur 'barg'). Topilmasa — null.
 */
export function bolimBarglari<T extends { id: number; tur: string; bolalar: readonly number[] }>(qatorlar: readonly T[], qatorId: number): number[] | null {
  const i = qatorlar.findIndex((q) => q.id === qatorId && (q.tur === 'itogo' || q.tur === 'bl'));
  if (i < 0) return null;
  const out: number[] = [];
  const w = (k: number) => { const q = qatorlar[k]; if (q.tur === 'barg') out.push(k); else q.bolalar.forEach(w); };
  qatorlar[i].bolalar.forEach(w);
  return out;
}

/** Daraxtda bo'lim (svod) avlodlari bo'yicha barg summalari jami (smeta va fakt to'liq bo'lim bo'yicha — filtrsiz). */
export function bolimJamilari(
  qatorlar: ReadonlyArray<{ id: number; ota_id?: number | null; tur?: string | null; hajm?: number | null; narx?: number | null }>,
  faktHajm: (id: number) => number | null, svod: SvodYaxlit | null | undefined,
): Map<number, { qqssiz: number; svodSumma: number | null; smeta: number; fakt: number }> {
  const out = new Map<number, { qqssiz: number; svodSumma: number | null; smeta: number; fakt: number }>();
  for (const b of svod?.bolimlar ?? []) {
    const ids = yaxlitQatorIdlari(qatorlar, { ...svod!, bolimlar: [b] });
    let smeta = 0, fakt = 0;
    const bolasi = new Set(qatorlar.filter((q) => q.ota_id != null).map((q) => q.ota_id as number));
    for (const q of qatorlar) {
      if (!ids.has(q.id) || bolasi.has(q.id) || q.narx == null) continue;
      smeta += (q.hajm ?? 0) * q.narx;
      fakt += (faktHajm(q.id) ?? 0) * q.narx;
    }
    out.set(Number(b.qator_id), { qqssiz: Number(b.qqssiz), svodSumma: b.svod_summa == null ? null : Number(b.svod_summa), smeta: r2(smeta), fakt: r2(fakt) });
  }
  return out;
}