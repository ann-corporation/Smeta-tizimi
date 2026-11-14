/**
 * PERERASCHET (egasi 2026-10-25: «nakopitelniyga erishganimizdan keyin pereraschet uchun nimadir qila olamizmi?
 * olmay qolib ketgan obyomim yoki ortiqcha olganim bordir … shuncha pul ziyod olasan yoki shuncha minus kirasan»).
 *
 * ESKI HISOB O'CHIRILDI (2026-11-14): pereraschet hisobi endi slichitelniy modelidan (pereraschet-yagona.ts) — bitta son.
 * Bu fayl: ekran/Excel/MCP shakli (tiplar), razdel ro'yxati va jdodlarQur (fakt bo'yicha qayta hisob pereraschet-fakt.ts ishlatadi).
 * Qoidalar: asl smeta va tasdiqlangan aktlar O'ZGARMAYDI; NULL ≠ 0; summalar NDS SIZ.
 */
import type { KatKesim } from './ustamali-summa';
import { yaxlit2 } from './hisob-yadro';
import { ESKI_SMETA } from './f2-dublikat/tekshiruv';

/** `t2_qator_holat` dan o'qiladigan ustunlar (25k qatorli obyekt uchun ham — faqat keraklilari). */
export const PERERASCHET_USTUNLAR = 'qator_id,ota_id,tur,kod,nom,birlik,kat,smeta_hajm,smeta_narx,smeta_summa,fakt_hajm,fakt_summa,f2_hajm,f2_summa,f2_summa_nomalum,almashtirilgan_hajm,fakt_manbasi';

export type PQator = {
  qator_id: number; ota_id: number | null; tur: string | null;
  kod: string | null; nom: string | null; birlik: string | null; kat: string | null;
  smeta_hajm: number | string | null; smeta_narx: number | string | null; smeta_summa?: number | string | null;
  fakt_hajm: number | string | null; fakt_summa?: number | string | null;
  f2_hajm: number | string | null; f2_summa: number | string | null;
  f2_summa_nomalum?: number | string | null; almashtirilgan_hajm?: number | string | null;
  fakt_manbasi?: string | null;
};

export type BandTur = 'ortiqcha' | 'narx_farqi' | 'olinmagan' | 'chegirma';
export type TekshirSabab = 'birlik_shubha' | 'smeta_hajm_yoq' | 'narx_yoq' | 'chegirma_asosiy_yoq' | 'eski_smeta' | 'zamena' | 'f2_hajmsiz_summa' | 'f2_summa_yoq';
export type Eslatma = 'fakt_norma' | 'smetadan_tashqari' | 'narx_farqi_hisoblanmadi';

/** `summa` ishorali: + olish mumkin, − qaytarish kerak. `hajm` ishorali (ortiqcha — manfiy, narx farqi — 0). */
export type PBand = { tur: BandTur; hajm: number; summa: number };

export type PNatijaQator = {
  qatorId: number; kod: string | null; nom: string; birlik: string | null; kat: string | null; tur: string;
  smetaHajm: number | null; smetaNarx: number | null; faktHajm: number; f2Hajm: number; f2Summa: number | null;
  /** F2 o'rtacha narxi (F2 summa / F2 hajm) — noma'lum bo'lsa null. */
  f2Narx: number | null;
  almashtirilgan: number;
  /** Eng yaqin razdel (rz) id va ildizdan yo'li. */
  bolimId: number | null; bolimYol: string[];
  /** Barcha ajdod razdellar (filtr uchun). */
  ajdodlar: number[];
  bandlar: PBand[];
  /** Bandlar yig'indisi (ishorali). */
  sof: number;
  tekshir: TekshirSabab[];
  eslatma: Eslatma[];
  /** Pulga kiradimi (tekshirish sababi yo'q va kamida bitta band bor). */
  hisobda: boolean;
  /** Smetadan tashqari fakt hajmi (pulga kirmaydi). */
  tashqariHajm: number;
  /** Chegirma (manfiy smeta, «исключать») qatori: asosiy ish (X — uning F2 ulushi) va chegirma qo'llangan ulushi Y. */
  chegirma?: { asosiy: ChegirmaAsosiy | null; y: number };
};

export type ChegirmaAsosiy = { qatorId: number; kod: string | null; nom: string; ulush: number };

export type PJami = { plus: number; minus: number; sof: number; soni: number };
export type PBolimJami = PJami & { bolimId: number | null; yol: string[] };

export type PNatija = {
  qatorlar: PNatijaQator[];
  /** Pulga kirgan qatorlar (|sof| bo'yicha kamayish). */
  hisobda: PNatijaQator[];
  /** Tekshirish kerak qatorlar (taxminiy |sof| bo'yicha kamayish). */
  tekshirish: PNatijaQator[];
  jami: PJami;
  turBoyicha: Record<BandTur, { plus: number; minus: number; soni: number }>;
  /** Ustamali hisob uchun kategoriya kesimlari: plus va minus (MUTLAQ qiymatda). */
  plusKesim: KatKesim; minusKesim: KatKesim;
  /** BL norma bo'yicha hosila faktdan kelgan plus summa (shundan). */
  faktNormaPlus: number;
  tekshirTaxminiy: { plus: number; minus: number; soni: number };
  bolimlar: PBolimJami[];
};

const BARG = new Set(['rs', 'mat', 'ob']);
const EPS = 1e-6;
/** Shu summadan kichik band yozilmaydi (yaxlitlash shovqini). */
export const PUL_CHEGARA = 0.5;
export { yaxlit2 };


export type Ajdod = { bolimId: number | null; yol: string[]; ajdodlar: number[]; eski: boolean };

/**
 * Daraxt bo'yicha ajdod ma'lumoti (eng yaqin razdel, yo'l, barcha razdel ajdodlar, «(ekspertizagacha)» belgisi).
 * `ajdodOl(id)` — tugunning O'ZI va ajdodlari (iterativ, memo bilan). Fakt asosidagi pereraschet ham shuni ishlatadi.
 */
export function ajdodlarQur(rows: readonly PQator[]): { byId: Map<number, PQator>; ajdodOl: (id: number | null) => Ajdod } {
  const byId = new Map<number, PQator>();
  for (const r of rows) byId.set(r.qator_id, r);
  const memo = new Map<number, Ajdod>();
  const BOSH: Ajdod = { bolimId: null, yol: [], ajdodlar: [], eski: false };
  /** Tugunning O'ZI va ajdodlari bo'yicha ma'lumot (iterativ — chuqur daraxtda stek toshmaydi). */
  const ajdodOl = (id: number | null): Ajdod => {
    if (id == null) return BOSH;
    const c = memo.get(id);
    if (c) return c;
    const zanjir: number[] = [];
    let p: number | null = id;
    while (p != null && !memo.has(p) && byId.has(p) && zanjir.length < 64) { zanjir.push(p); p = byId.get(p)!.ota_id ?? null; }
    let ota = p != null && memo.has(p) ? memo.get(p)! : BOSH;
    for (let i = zanjir.length - 1; i >= 0; i--) {
      const q = byId.get(zanjir[i])!;
      const rz = q.tur === 'rz';
      const a: Ajdod = {
        bolimId: rz ? q.qator_id : ota.bolimId,
        yol: rz ? [...ota.yol, q.nom || 'Bo‘lim'] : ota.yol,
        ajdodlar: rz ? [...ota.ajdodlar, q.qator_id] : ota.ajdodlar,
        eski: ota.eski || ESKI_SMETA.test(String(q.nom ?? '')),
      };
      memo.set(q.qator_id, a);
      ota = a;
    }
    return memo.get(id) ?? BOSH;
  };
  return { byId, ajdodOl };
}

/** Uchastka/razdel filtri uchun razdellar ro'yxati (daraxt tartibida, chuqurlik bilan). Faqat ostida barg bor razdellar. */
export function pereraschetBolimlari(rows: readonly PQator[]): Array<{ id: number; nom: string; daraja: number }> {
  const bolalar = new Map<number | null, PQator[]>();
  for (const r of rows) { const k = r.ota_id ?? null; const a = bolalar.get(k); if (a) a.push(r); else bolalar.set(k, [r]); }
  const bargBor = new Map<number, boolean>();
  const bor = (id: number): boolean => {
    const c = bargBor.get(id);
    if (c != null) return c;
    bargBor.set(id, false);
    const v = (bolalar.get(id) ?? []).some((r) => BARG.has(r.tur ?? '') || bor(r.qator_id));
    bargBor.set(id, v);
    return v;
  };
  const out: Array<{ id: number; nom: string; daraja: number }> = [];
  // DFS, id tartibida (chuqurlik 12 bilan cheklangan).
  const yur = (ota: number | null, daraja: number) => {
    const rz = (bolalar.get(ota) ?? []).filter((r) => r.tur === 'rz').sort((a, b) => a.qator_id - b.qator_id);
    for (const r of rz) { if (!bor(r.qator_id)) continue; out.push({ id: r.qator_id, nom: r.nom || 'Bo‘lim', daraja }); if (daraja < 12) yur(r.qator_id, daraja + 1); }
  };
  yur(null, 0);
  return out;
}
