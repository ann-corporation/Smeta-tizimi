/**
 * Fakt egizak obyektlarga (egasi 2026-11-02: «Osiyo oshxonasi №1/№2…» — bir xil binolarga fakt alohida-alohida kiritilmasin).
 *
 * Qatorlar moslashi — F2 egizak yadrosi (`f2-moslash-v3/egizak`: aslMoslash/egizakOpId), parallel moslagich YO'Q.
 * Har egizak uchun: o'z smetasi bilan foiz («50%» — shu egizakning smeta hajmidan), '+' / '=' rejimi saqlanadi,
 * yozuv — mavjud `fakt_yoz_v2` (jurnalning `jurnalPaket`i), har egizakka ALOHIDA operation_id, CAS ('=' qatorlar qayta o'qiladi).
 * NULL ≠ 0; minus hajm mumkin; fakt F2 dan kam bo'lishi mumkin (MAX yo'q); tasdiqlangan F2 ga tegilmaydi.
 */
import { aslMoslash, egizakOpId, type EgizakQator } from './f2-moslash-v3/egizak';
import { casZiddiyat, jamiIdlari } from './fakt-foiz-grid';
import { jurnalPaket, kiritmaSoni, type JurnalXato, type Kiritma } from './fakt-jurnal';
import { faktQoldaKiritiladimi } from './fakt-input-policy';
import { tuzatishBoglanishlari } from './smeta-anatomiya/tuzatish';
import { tuzatishPaketi } from './fakt-tuzatish';

export type EgizakRadSabab = 'topilmadi' | 'qoshimcha_yoq' | 'tur' | JurnalXato;
export const RAD_SABAB_MATN: Record<EgizakRadSabab, string> = {
  topilmadi: 'egizak smetasida mos qator topilmadi',
  qoshimcha_yoq: 'qo‘shimcha qator egizakda yo‘q (F2 egizak nusxasi bilan yarating)',
  tur: 'bu qatorga fakt qo‘lda kiritilmaydi',
  SON_EMAS: 'Son emas', MANFIY: 'Jami fakt manfiy bo‘lib qoladi', ISHORA: 'Chegirma ishi: fakt smeta kabi manfiy bo‘lishi kerak', NOL: '0 qo‘shilmaydi',
  FOIZ_SMETASIZ: 'Foiz uchun smeta hajmi kerak',
};

export type EgizakMos = {
  aId: number; bId: number; nom: string; birlik: string | null; rejim: Kiritma['rejim']; qiymat: string;
  smeta: number | null; joriy: number; delta: number; yangi: number; hajmFarq: boolean;
};
export type EgizakRad = { aId: number; nom: string; sabab: EgizakRadSabab };

export type EgizakTomon = {
  id: number; nom: string; qatorlar: readonly EgizakQator[];
  /** Egizakning smeta hajmi (qator id → hajm; yo'q = null) va joriy fakti (yo'q = 0, jurnal kabi). */
  smeta: ReadonlyMap<number, number | null>; fakt: ReadonlyMap<number, number>;
};

export type EgizakReja = {
  obyektId: number; nom: string; qatiy: boolean;
  moslar: EgizakMos[]; radlar: EgizakRad[];
  paket: { qator_id: number; hajm: number }[];
  /** CAS uchun: egizak kiritmalari va ko'rilgan fakt. */
  kirit: Record<number, Kiritma>; faktlar: ReadonlyMap<number, number>; smetalar: ReadonlyMap<number, number | null>;
};

/** Manba qoralamasidagi qo'shimcha qatorlar → egizakdagi nusxasi (operation_id = egizakOpId(A qator, egizak) bo'yicha). */
export async function qoshimchaXarita(manba: readonly EgizakQator[], egizak: readonly EgizakQator[], egizakId: number): Promise<Map<number, number>> {
  const byOp = new Map<string, number>();
  for (const q of egizak) if (q.qoshimcha && q.operation_id) byOp.set(q.operation_id.toLowerCase(), q.id);
  const out = new Map<number, number>();
  for (const q of manba) {
    if (!q.qoshimcha) continue;
    const b = byOp.get((await egizakOpId(q.id, egizakId)).toLowerCase());
    if (b != null) out.set(q.id, b);
  }
  return out;
}

/** Berilgan qatorlarning joriy faktini '=' kiritmalar sifatida (bo'lim / butun obyekt nusxasi). Faqat bl/mat/ob va fakt ≠ 0. */
export function faktdanKiritmalar(qatorlar: ReadonlyArray<{ id: number; tur: string; fakt: number }>): Record<number, Kiritma> {
  const out: Record<number, Kiritma> = {};
  for (const q of qatorlar) if (faktQoldaKiritiladimi(q.tur) && Number.isFinite(q.fakt) && q.fakt !== 0) out[q.id] = { rejim: '=', qiymat: String(q.fakt) };
  return out;
}

/** Bitta egizak uchun reja: moslash, foiz (egizakning o'z smetasidan), '+'/'=' va paket (jurnalPaket — xuddi shu qoidalar). */
export function faktEgizakReja(manba: readonly EgizakQator[], kirit: Readonly<Record<number, Kiritma>>, e: EgizakTomon, qoshXarita: ReadonlyMap<number, number>): EgizakReja {
  const m = aslMoslash(manba, e.qatorlar);
  const aById = new Map(manba.map((q) => [q.id, q]));
  const bIdlar = new Set(e.qatorlar.map((q) => q.id));
  const radlar: EgizakRad[] = [];
  const bKirit: Record<number, Kiritma> = {};
  const aOf = new Map<number, number>();
  for (const [k, v] of Object.entries(kirit)) {
    if (!v.qiymat.trim()) continue;
    const aId = Number(k); const a = aById.get(aId);
    const nom = a?.nom?.trim() || `#${aId}`;
    if (!a || !faktQoldaKiritiladimi(a.tur ?? '')) { radlar.push({ aId, nom, sabab: 'tur' }); continue; }
    const bId = a.qoshimcha ? qoshXarita.get(aId) : m.map.get(aId);
    if (bId == null || !bIdlar.has(bId)) { radlar.push({ aId, nom, sabab: a.qoshimcha ? 'qoshimcha_yoq' : 'topilmadi' }); continue; }
    bKirit[bId] = v; aOf.set(bId, aId);
  }
  const faktlar = new Map<number, number>(); const smetalar = new Map<number, number | null>();
  for (const q of e.qatorlar) { faktlar.set(q.id, e.fakt.get(q.id) ?? 0); smetalar.set(q.id, e.smeta.get(q.id) ?? null); }
  const p0 = jurnalPaket(bKirit, faktlar, smetalar);
  // Egizakning tuzatish qatorlari (qalinlik/norma tuzatishi) — o'z asosiy ishiga ergashadi (smeta yadrosi bog'laydi).
  const xarita = tuzatishBoglanishlari(e.qatorlar.map((q) => ({ ...q, zamena: q.replaces_line_id != null })));
  const tz = tuzatishPaketi(p0.qatorlar, xarita, faktlar, smetalar);
  const tzIdlar = new Set(tz.tuzatishlar);
  const p = { ...p0, qatorlar: tz.qatorlar };
  const delta = new Map(p.qatorlar.map((x) => [x.qator_id, x.hajm]));
  const moslar: EgizakMos[] = [];
  const bById = new Map(e.qatorlar.map((q) => [q.id, q]));
  for (const [bId, aId] of aOf) {
    if (xarita.asos.has(bId)) continue; // tuzatish qatori — hosila, kiritmasi olinmaydi
    const xato = p.xatolar.get(bId);
    const a = aById.get(aId)!;
    if (xato) { radlar.push({ aId, nom: a.nom?.trim() || `#${aId}`, sabab: xato }); continue; }
    const d = delta.get(bId);
    if (d == null) continue; // o'zgarish yo'q (= joriy fakt)
    const k = bKirit[bId]; const joriy = faktlar.get(bId) ?? 0;
    const sm = smetalar.get(bId) ?? null;
    const n = kiritmaSoni(k.qiymat, sm);
    moslar.push({ aId, bId, nom: a.nom?.trim() || `#${aId}`, birlik: bById.get(bId)?.birlik ?? null, rejim: k.rejim, qiymat: k.qiymat, smeta: sm, joriy, delta: d,
      yangi: k.rejim === '+' ? joriy + (typeof n === 'number' ? n : 0) : (typeof n === 'number' ? n : joriy), hajmFarq: m.hajmFarq.includes(aId) });
  }
  return { obyektId: e.id, nom: e.nom, qatiy: m.qatiy, moslar, radlar, paket: p.qatorlar.filter((x) => (aOf.has(x.qator_id) && !xarita.asos.has(x.qator_id)) || tzIdlar.has(x.qator_id)), kirit: bKirit, faktlar, smetalar };
}

export type EgizakNatija = {
  obyektId: number; nom: string; holat: 'yozildi' | 'ziddiyat' | 'xato' | 'bosh';
  qatorSoni: number; xabar?: string; ziddiyatIdlar?: number[];
};

/**
 * Egizaklarga ketma-ket yozish. Har egizak: '=' qatorlar serverda qayta o'qiladi (CAS, jurnal kabi) — farq bo'lsa SHU egizak to'xtaydi,
 * boshqalari davom etadi; xato ham faqat o'z egizagini to'xtatadi. Har egizak — o'z operation_id si (takror yuborish xavfsiz).
 */
export async function faktEgizakYoz(rejalar: readonly EgizakReja[], opIdlar: ReadonlyMap<number, string>, d: {
  serverFakt: (obyektId: number, idlar: number[]) => Promise<Map<number, number> | null>;
  yoz: (obyektId: number, paket: { qator_id: number; hajm: number }[], operationId: string) => Promise<{ ok: boolean; xato?: string }>;
  progress?: (natija: EgizakNatija) => void;
}): Promise<EgizakNatija[]> {
  const out: EgizakNatija[] = [];
  for (const r of rejalar) {
    let n: EgizakNatija;
    try {
      const op = opIdlar.get(r.obyektId);
      if (!r.paket.length) n = { obyektId: r.obyektId, nom: r.nom, holat: 'bosh', qatorSoni: 0 };
      else if (!op) n = { obyektId: r.obyektId, nom: r.nom, holat: 'xato', qatorSoni: 0, xabar: 'operation_id yo‘q' };
      else {
        const jamiIdlar = jamiIdlari(r.kirit, r.smetalar).filter((id) => r.paket.some((x) => x.qator_id === id));
        let z: number[] = [];
        let oqilmadi = false;
        if (jamiIdlar.length) {
          const server = await d.serverFakt(r.obyektId, jamiIdlar);
          if (!server) oqilmadi = true; else z = casZiddiyat(jamiIdlar, r.faktlar, server).map((x) => x.id);
        }
        if (oqilmadi) n = { obyektId: r.obyektId, nom: r.nom, holat: 'xato', qatorSoni: 0, xabar: 'Joriy faktni tekshirib bo‘lmadi' };
        else if (z.length) n = { obyektId: r.obyektId, nom: r.nom, holat: 'ziddiyat', qatorSoni: 0, ziddiyatIdlar: z };
        else {
          const y = await d.yoz(r.obyektId, r.paket, op);
          n = y.ok ? { obyektId: r.obyektId, nom: r.nom, holat: 'yozildi', qatorSoni: r.paket.length }
            : { obyektId: r.obyektId, nom: r.nom, holat: 'xato', qatorSoni: 0, xabar: y.xato };
        }
      }
    } catch (e) { n = { obyektId: r.obyektId, nom: r.nom, holat: 'xato', qatorSoni: 0, xabar: e instanceof Error ? e.message : undefined }; }
    out.push(n); d.progress?.(n);
  }
  return out;
}
