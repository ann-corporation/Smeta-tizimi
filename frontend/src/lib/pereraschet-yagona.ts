/**
 * PERERASCHET = SLICHITELNIY modeli (egasi: «bir hisob — bir joy, parallel hisoblagich bo'lmaydi»).
 * Oldin pereraschet o'zi alohida hisoblardi (smeta hajmiga cheklangan «olinmagan», «ortiqcha» — fakt < F-2 ni ko'rmasdi) va
 * slichitelniy hujjatidan boshqa son berardi. Endi pereraschet ekrani, Excel va MCP `pereraschet` shu yerdan: `slichitelniyModeli`
 * barglarining «fakt (F-2 narxida) − tasdiqlangan F-2» farqi (`doplataSumma`); + к доплате, − к снятию; smeta bilan cheklanmaydi
 * (fakt smetadan oshsa — к доплате, ogohlantirish bilan); NULL ≠ 0 (noma'lum qator pulga kirmaydi, «tekshirish» da).
 * Svod (yaxlit) bo'limi — bitta sof farq (`slichitelniy-tsikl.ts`). Bu modul faqat model → eski ekran shakli (`PNatija`) ko'prigi.
 */
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { slichitelniyModeli, type SlichitelniyModel } from './slichitelniy-vedomost';
import { slichitelniyTsiklYuki } from './slichitelniy-tsikl';
import { yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';
import { yaxlit2 } from './hisob-yadro';
import type { BandTur, PBolimJami, PNatija, PNatijaQator, TekshirSabab } from './pereraschet';

/** Model uchun kerakli `t2_qator` ustunlari (joriy versiya). */
export const YAGONA_QATOR_USTUNLAR = 'id,obyekt_id,ota_id,tartib,tur,kod,nom,birlik,hajm,narx,kat,summa,qoshimcha,zamena,norma,replaces_line_id';
/** Model uchun kerakli `t2_qator_holat` ustunlari. */
export const YAGONA_HOLAT_USTUNLAR = 'qator_id,ota_id,tur,kod,nom,birlik,kat,smeta_hajm,smeta_narx,smeta_summa,fakt_hajm,fakt_summa,f2_hajm,f2_summa,f2_summa_nomalum,f2_summa_yoq,almashtirilgan_hajm,fakt_manbasi';

export type YagonaKirish = { svodYaxlit?: SvodYaxlit | null; bolimId?: number | null };
export type PYagona = PNatija & { model: SlichitelniyModel; nomalum: number };

const NOL = 1e-9;
const RZ_PREFIKS = 'ИТОГО ПО РАЗДЕЛУ: ';

type Joy = { yol: string[]; ajdodlar: number[]; bolimId: number | null };

/** Model daraxti bo'yicha har bargning razdel yo'li (itogo qatorlari razdelni bildiradi). */
function joylar(model: SlichitelniyModel): Map<number, Joy> {
  const out = new Map<number, Joy>();
  const yur = (i: number, j: Joy) => {
    const r = model.qatorlar[i];
    if (r.tur === 'barg') { out.set(i, j); return; }
    const n: Joy = r.tur === 'itogo'
      ? { yol: [...j.yol, r.nom.startsWith(RZ_PREFIKS) ? r.nom.slice(RZ_PREFIKS.length) : r.nom], ajdodlar: [...j.ajdodlar, r.id], bolimId: r.id }
      : j;
    for (const k of r.bolalar) yur(k, n);
  };
  for (const i of model.ildizlar) yur(i, { yol: [], ajdodlar: [], bolimId: null });
  return out;
}

export function pereraschetYagona(qatorlar: readonly T2Qator[], holatlar: readonly T2QatorHolat[], k: YagonaKirish = {}): PYagona {
  const model = slichitelniyModeli(qatorlar, holatlar, { svodYaxlit: k.svodYaxlit ?? null });
  return pereraschetModeldan(model, yaxlitQatorIdlari(qatorlar, k.svodYaxlit), k.bolimId ?? null);
}

export function pereraschetModeldan(model: SlichitelniyModel, yaxlitIdlar: ReadonlySet<number> | null, bolimId: number | null = null): PYagona {
  const joy = joylar(model);
  const ruxsat = bolimId == null ? null : new Set([...joy].filter(([, j]) => j.ajdodlar.includes(bolimId)).map(([i]) => i));
  const yuk = slichitelniyTsiklYuki(model, yaxlitIdlar, ruxsat);

  const natijaQ: PNatijaQator[] = [];
  const asos = (i: number) => {
    const r = model.qatorlar[i]; const j = joy.get(i) ?? { yol: [], ajdodlar: [], bolimId: null };
    return { r, j };
  };
  const baza = (i: number, tekshir: TekshirSabab[]): Omit<PNatijaQator, 'bandlar' | 'sof' | 'hisobda'> => {
    const { r, j } = asos(i);
    const f2Aniq = !r.f2SummaNomalum;
    return {
      qatorId: r.id, kod: r.kod || null, nom: r.nom, birlik: r.birlik || null, kat: r.kat ?? null, tur: r.resTur ?? 'rs',
      smetaHajm: r.smetaHajm, smetaNarx: r.narx, faktHajm: r.faktHajm ?? 0, f2Hajm: r.f2Hajm, f2Summa: f2Aniq ? r.f2Summa : null,
      f2Narx: f2Aniq && Math.abs(r.f2Hajm) > NOL ? r.f2Summa / r.f2Hajm : null, almashtirilgan: 0,
      bolimId: j.bolimId, bolimYol: j.yol, ajdodlar: j.ajdodlar, tekshir,
      eslatma: r.smetaHajm != null && (r.faktHajm ?? 0) > r.smetaHajm + NOL ? ['smetadan_tashqari'] : [], tashqariHajm: 0,
    };
  };
  const hisobdaIdx = new Set<number>();
  for (const e of yuk.effektiv) {
    hisobdaIdx.add(e.idx);
    // Band turi faqat ko'rsatish uchun: hajm + (к доплате: «olinmagan»), hajm − (к снятию: «ortiqcha»), hajmsiz farq — «narx_farqi».
    const tur: BandTur = Math.abs(e.hajm) < NOL ? 'narx_farqi' : e.hajm > 0 ? 'olinmagan' : 'ortiqcha';
    const summa = yaxlit2(e.summa);
    natijaQ.push({ ...baza(e.idx, []), bandlar: [{ tur, hajm: e.hajm, summa }], sof: summa, hisobda: true });
  }
  // Pulga kirmaydigan (noma'lum) qatorlar: NULL ≠ 0 — taxminiy summasiz «tekshirish»da.
  model.qatorlar.forEach((r, i) => {
    if (r.tur !== 'barg' || hisobdaIdx.has(i) || r.doplataSumma != null) return;
    if (ruxsat && !ruxsat.has(i)) return;
    const sabab: TekshirSabab | null = r.f2SummaNomalum && r.faktHajm != null ? 'f2_summa_yoq' : r.narx == null && (r.faktHajm ?? 0) > NOL ? 'narx_yoq' : null;
    if (sabab) natijaQ.push({ ...baza(i, [sabab]), bandlar: [], sof: 0, hisobda: false });
  });

  const hisobda = natijaQ.filter((q) => q.hisobda).sort((a, b) => Math.abs(b.sof) - Math.abs(a.sof));
  const tekshirish = natijaQ.filter((q) => q.tekshir.length > 0);
  const turBoyicha: PNatija['turBoyicha'] = { ortiqcha: { plus: 0, minus: 0, soni: 0 }, narx_farqi: { plus: 0, minus: 0, soni: 0 }, olinmagan: { plus: 0, minus: 0, soni: 0 }, chegirma: { plus: 0, minus: 0, soni: 0 } };
  const bolimMap = new Map<string, PBolimJami>();
  let plus = 0, minus = 0;
  for (const q of hisobda) {
    const bk = String(q.bolimId ?? 'yoq');
    const bj = bolimMap.get(bk) ?? { bolimId: q.bolimId, yol: q.bolimYol, plus: 0, minus: 0, sof: 0, soni: 0 };
    bj.soni++;
    for (const b of q.bandlar) {
      const t = turBoyicha[b.tur]; t.soni++;
      if (b.summa > 0) { t.plus += b.summa; plus += b.summa; bj.plus += b.summa; } else { t.minus += -b.summa; minus += -b.summa; bj.minus += -b.summa; }
    }
    bolimMap.set(bk, bj);
  }
  // Butun obyekt: jami AYNAN slichitelniy hujjatidagi (svod bo'limida bo'lim sofi) — bitta son.
  if (bolimId == null) { plus = model.pereraschet.doplata; minus = -model.pereraschet.snyatie; }
  const jami = { plus: yaxlit2(plus), minus: yaxlit2(minus), sof: yaxlit2(plus - minus), soni: hisobda.length };
  for (const t of Object.values(turBoyicha)) { t.plus = yaxlit2(t.plus); t.minus = yaxlit2(t.minus); }
  const bolimlar = [...bolimMap.values()].map((b) => ({ ...b, plus: yaxlit2(b.plus), minus: yaxlit2(b.minus), sof: yaxlit2(b.plus - b.minus) }))
    .sort((a, b) => Math.abs(b.sof) - Math.abs(a.sof));
  return {
    qatorlar: natijaQ, hisobda, tekshirish, jami, turBoyicha, plusKesim: yuk.plusKesim, minusKesim: yuk.minusKesim, faktNormaPlus: 0,
    tekshirTaxminiy: { plus: 0, minus: 0, soni: tekshirish.length }, bolimlar, model, nomalum: yuk.nomalum,
  };
}
