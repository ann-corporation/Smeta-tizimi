/**
 * Foyda/zarar manbasi — PROVODKALAR JURNALI (buxgalteriya yadrosi P2). Jurnal ma'lumoti bor kompaniyada «Foyda / zarar» raqamlari
 * `t2_bux_pul_korinish_v1` dan keladi (parallel jami YO'Q); jurnal bo'sh bo'lsa eski manba (F2/xarajat/to'lov) zaxira bo'lib qoladi.
 * Bu fayl faqat jurnal qatorlarini daraxt quruvchisi kutadigan shaklga (FzQator, SummaPaket) o'giradi. Arifmetika — hisob-yadro.
 */
import { ayirma2, yigindi2 } from './hisob-yadro/yaxlit';
import type { SummaPaket } from './summa-paket';
import type { FzQator } from './foyda-zarar';
import type { BuxPulQator } from '../api/t2-bux-hisob';

const KAT: ReadonlyArray<[keyof BuxPulQator, string]> = [['xarajat_chel', 'ЧЕЛ'], ['xarajat_mat', 'МАТ'], ['xarajat_mash', 'МАШ'], ['xarajat_ob', 'ОБ'], ['xarajat_sub', 'SUB']];

export type JurnalFz = {
  xarajat: FzQator[]; tolov: FzQator[];
  /** Obyekt bo'yicha tan olingan daromad (QQS siz) va chiqarilgan QQS; obyektsiz daromad `taqsimlanmaganDaromad` da. */
  daromad: Map<number, { net: number; qqs: number }>; taqsimlanmaganDaromad: number;
};

export function jurnalQatorlari(rows: ReadonlyArray<BuxPulQator>): JurnalFz {
  const xarajat: FzQator[] = []; const tolov: FzQator[] = [];
  const daromad = new Map<number, { net: number; qqs: number }>(); const taqsim: number[] = [];
  for (const r of rows) {
    const asos = { obyekt_id: r.obyekt_id, shartnoma_id: r.shartnoma_id };
    const toifali: number[] = [];
    for (const [k, kat] of KAT) { const s = Number(r[k] ?? 0); if (s !== 0) { xarajat.push({ ...asos, kat, summa: s }); toifali.push(s); } }
    const qolgan = ayirma2(Number(r.xarajat), yigindi2(toifali));
    if (qolgan != null && qolgan !== 0) xarajat.push({ ...asos, kat: null, summa: qolgan });
    if (Number(r.tushgan) !== 0) tolov.push({ ...asos, summa: Number(r.tushgan), tur: 'tolov' });
    const dn = Number(r.daromad); const dq = Number(r.daromad_qqs);
    if (dn !== 0 || dq !== 0) {
      if (r.obyekt_id == null) taqsim.push(dn);
      else { const m = daromad.get(r.obyekt_id) ?? { net: 0, qqs: 0 }; daromad.set(r.obyekt_id, { net: yigindi2([m.net, dn]), qqs: yigindi2([m.qqs, dq]) }); }
    }
  }
  return { xarajat, tolov, daromad, taqsimlanmaganDaromad: yigindi2(taqsim) };
}

/** Jurnaldagi daromad → daraxt kutadigan «bajarilgan» paketi (ustamali = jurnal daromadi, QQS siz; smeta kesimi yo'q — nollar). */
export function jurnalPaketi(net: number, qqs: number): SummaPaket {
  return {
    qqs_bilan: yigindi2([net, qqs]), qqs, ustamali: net, ustamasiz: net, qqs_foiz: null, ustamasiz_qism: 0,
    kesim: { chel: 0, mash: 0, mat: 0, ob: 0, subpudrat: 0, svod: 0, ustamasiz: 0, nomalum: 0 },
    soat: { chel: 0, mash: 0, mashinist: 0 }, subpudratchilar: [], narxsiz_soni: 0, qator_soni: 0,
  };
}