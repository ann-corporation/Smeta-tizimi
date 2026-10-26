/**
 * Obyekt, qator, F2 va pereraschet o'qishlari. Hisob frontend sof mantig'idan (bolimSummalari, jurnalQur, pereraschetHisobla,
 * ustamaliHisobla) — UI ko'rsatadigan raqamlar bilan bir xil. Pul: NDS siz; ustamasiz + ustamali (NDS alohida).
 */
import { z } from 'zod';
import { bolimSummalari, bosKatKesim, jurnalQur, katKesimgaQosh, pereraschetHisobla, PERERASCHET_USTUNLAR, type BolimSumma, type JurnalHolat, type PNatijaQator, type PQator } from '../frontend';
import { qatorTozala, sahifala, son, summaJuft } from '../format';
import { holatlarOl, kesimJami, obyektBormi, qatorlarOl, ustamaOl, type HolatRow, type QatorRow, type Ustama } from '../malumot';
import { obyektIdS, tool } from '../tool';

type T2QatorFE = Parameters<typeof jurnalQur>[0][number];
const fe = (rows: QatorRow[]) => rows as unknown as T2QatorFE[];
const holatFe = (h: HolatRow[]) => h as unknown as JurnalHolat[];

export const obyektlar = tool({
  nom: 'obyektlar',
  tavsif: 'Obyektlar ro\'yxati (t2_obyekt + t2_obyekt_jami): id, nom, kompaniya, holat, loyiha, qator soni, smeta jami (ustamasiz, NDS siz).',
  kirish: { kompaniya_id: z.number().int().positive().optional(), qidir: z.string().optional(), limit: z.number().int().positive().max(2000).optional() },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const r = await m.query(`select o.id, o.nom, o.kompaniya_id, k.nom as kompaniya, o.holat, o.loyiha_id, j.qator_soni, j.jami as smeta_jami_ustamasiz, j.narxsiz
                               from public.t2_obyekt o left join public.t2_kompaniya k on k.id = o.kompaniya_id left join public.t2_obyekt_jami j on j.id = o.id
                              where ($1::bigint is null or o.kompaniya_id = $1) and ($2::text is null or o.nom ilike '%'||$2||'%')
                              order by o.kompaniya_id, o.id limit $3`, [a.kompaniya_id ?? null, a.qidir ?? null, a.limit ?? 500]);
    return { soni: r.rows.length, obyektlar: r.rows.map(qatorTozala) };
  }),
});

function juftlar(b: BolimSumma | undefined, u: Ustama) {
  if (!b) return null;
  const j = (k: BolimSumma['smeta']) => summaJuft(k.ustamasiz ?? kesimJami(k.kesim), u.hisobla(k.kesim));
  // qoshimcha — qo'shimcha/zamena ishlar smetasi («smeta» ga kirmaydi; Nakopitelniy smeta = smeta + qoshimcha).
  return { smeta: j(b.smeta), qoshimcha: b.qoshimcha ? j(b.qoshimcha) : null, f2: j(b.f2), fakt: j(b.fakt), qoldiq: j(b.qoldiq) };
}

export const obyektHolat = tool({
  nom: 'obyekt_holat',
  tavsif: 'Obyekt holati bo\'lim (rz) daraxti bo\'yicha: smeta / fakt / F2 / qoldiq / almashtirilgan — har biri ustamasiz va ustamali (ИТОГО-4, NDS siz; NDS alohida), '
    + 'bajarilish ulushi, ish soni. Manba: t2_qator + t2_qator_holat (frontend bolimSummalari/jurnalQur bilan bir xil) va Nakopitelniy jami (t2_nakopitelniy_v2) solishtirish uchun. '
    + '`daraja` — ildiz/`bolim_id` dan necha daraja pastgacha (standart 1).',
  kirish: { obyekt_id: obyektIdS, daraja: z.number().int().min(0).max(10).optional(), bolim_id: z.number().int().positive().optional(), nakopitelniy: z.boolean().optional().describe('false — Nakopitelniy jami o\'qilmaydi') },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const ob = await obyektBormi(m, a.obyekt_id);
    const [rows, states] = await Promise.all([qatorlarOl(m, a.obyekt_id), holatlarOl(m, a.obyekt_id)]);
    const u = await ustamaOl(m, a.obyekt_id, mu.aktorId);
    const sum = bolimSummalari(fe(rows), holatFe(states));
    const { bolimlar } = jurnalQur(fe(rows), holatFe(states));
    // Almashtirilgan (zamena qoplagan) summa — bo'limlar bo'yicha (bolimSummalari da yo'q ko'rsatkich).
    const byId = new Map(rows.map((r) => [r.id, r]));
    const holat = new Map(states.map((s) => [s.qator_id, s]));
    const alm = new Map<number, ReturnType<typeof bosKatKesim>>();
    for (const r of rows) {
      if (!['rs', 'mat', 'ob'].includes(r.tur ?? '')) continue;
      const v = son(holat.get(r.id)?.almashtirilgan_summa);
      if (v == null || v === 0) continue;
      const ids = [0];
      let p = r.ota_id != null ? byId.get(r.ota_id) : undefined; let n = 0;
      while (p && n++ < 60) { if (p.tur === 'rz') ids.push(p.id); p = p.ota_id != null ? byId.get(p.ota_id) : undefined; }
      for (const id of ids) { const k = alm.get(id) ?? bosKatKesim(); katKesimgaQosh(k, r.kat, v); alm.set(id, k); }
    }
    const almJuft = (id: number) => { const k = alm.get(id); return k ? summaJuft(kesimJami(k), u.hisobla(k)) : null; };
    const ildiz = a.bolim_id ?? null;
    const dar = a.daraja ?? 1;
    const chuqur = new Map<number | null, number>([[ildiz, 0]]);
    const tanlangan = [] as Array<{ id: number; nom: string; daraja: number; ulush: number | null; ishSoni: number; tugaganSoni: number }>;
    for (const b of bolimlar) {
      const ota = b.otaId ?? null;
      if (b.id === ildiz) continue;
      if (!chuqur.has(ota)) continue;
      const d = chuqur.get(ota)! + 1;
      chuqur.set(b.id, d);
      if (d <= dar) tanlangan.push({ id: b.id, nom: b.nom, daraja: d, ulush: b.ulush, ishSoni: b.ishSoni, tugaganSoni: b.tugaganSoni });
    }
    let nak: unknown;
    if (a.nakopitelniy !== false && mu.aktorId != null) {
      const r = await m.query<{ n: { ok?: boolean; jami?: unknown; code?: string } }>('select public.t2_nakopitelniy_v2(p_obyekt_id => $1::bigint, p_actor_id => $2::bigint, p_davr => null, p_limit => 1, p_faqat_faol => true, p_offset => 0) as n', [a.obyekt_id, mu.aktorId]);
      nak = r.rows[0]?.n?.ok ? r.rows[0].n.jami : { xato: r.rows[0]?.n?.code ?? 'o\'qilmadi' };
    }
    const ildizKalit = ildiz ?? 0;
    const ildizB = ildiz != null ? bolimlar.find((b) => b.id === ildiz) : null;
    if (ildiz != null && !ildizB) throw new Error(`Bo'lim #${ildiz} bu obyektda topilmadi (rz bo'lishi kerak).`);
    return {
      obyekt: ob, ustama: u.holat === 'tayyor' ? (u.izoh ?? 'standart kaskad') : u.izoh,
      qatorlar_soni: rows.length,
      [ildiz != null ? 'bolim' : 'jami']: { ...(ildizB ? { id: ildizB.id, nom: ildizB.nom, ulush: ildizB.ulush } : {}), ...juftlar(sum.get(ildizKalit), u), almashtirilgan: almJuft(ildizKalit) },
      bolimlar: tanlangan.map((b) => ({ ...b, ...juftlar(sum.get(b.id), u), almashtirilgan: almJuft(b.id) })),
      ...(nak !== undefined ? { nakopitelniy_jami: nak } : {}),
      izoh: 'summalar NDS siz; «ustamali» — ИТОГО-4 (kat noma\'lum qism ustamasiz qo\'shilgan); nds — alohida. null — noma\'lum (0 emas).',
    };
  }),
});

const QATOR_TO_LIQ = `select q.*, h.smeta_hajm, h.smeta_narx, h.smeta_summa, h.fakt_hajm, h.fakt_summa, h.f2_hajm, h.f2_summa, h.qoldiq_hajm, h.qoldiq_summa,
       h.f2_mumkin_hajm, h.almashtirilgan_hajm, h.almashtirilgan_summa, h.fakt_manbasi
  from public.t2_qator q left join public.t2_qator_holat h on h.qator_id = q.id`;

export const qator = tool({
  nom: 'qator',
  tavsif: 'Bitta smeta qatori: to\'liq maydonlar + holat (smeta/fakt/F2/qoldiq), ota zanjiri (ildizgacha), bolalari (holati bilan), fakt va F2 tarixi (t2_akt_qator × t2_akt).',
  kirish: { id: z.number().int().positive(), tarix_limit: z.number().int().positive().max(1000).optional() },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const q = (await m.query(`${QATOR_TO_LIQ} where q.id = $1`, [a.id])).rows[0];
    if (!q) throw new Error(`Qator #${a.id} topilmadi.`);
    const [zanjir, bolalar, tarix] = await Promise.all([
      m.query(`with recursive z as (select id, ota_id, tur, kod, nom, daraja, 0 as n from public.t2_qator where id = (select ota_id from public.t2_qator where id = $1)
                 union all select p.id, p.ota_id, p.tur, p.kod, p.nom, p.daraja, z.n + 1 from public.t2_qator p join z on p.id = z.ota_id where z.n < 60)
               select id, tur, kod, nom, daraja from z order by n desc`, [a.id]),
      m.query(`${QATOR_TO_LIQ} where q.ota_id = $1 order by q.tartib nulls last, q.id limit 500`, [a.id]),
      m.query(`select k.id as akt_id, k.tur, k.raqam, k.oy, k.sana, k.holat, k.lifecycle_status, aq.id as akt_qator_id, aq.hajm, aq.narx, aq.summa,
                      aq.certified_quantity, aq.certified_unit_price, aq.certified_amount, aq.izoh, aq.change_type
                 from public.t2_akt_qator aq join public.t2_akt k on k.id = aq.akt_id where aq.qator_id = $1 order by coalesce(k.sana, k.oy) desc nulls last, k.id desc limit $2`, [a.id, a.tarix_limit ?? 200]),
    ]);
    const ogoh = q.replaces_line_id == null && !q.qoshimcha && !q.zamena ? undefined : 'qo\'shimcha/zamena qatori (asl smeta emas)';
    return { qator: qatorTozala(q), ...(ogoh ? { belgi: ogoh } : {}), ota_zanjiri: zanjir.rows, bolalar: bolalar.rows.map(qatorTozala), tarix: tarix.rows.map(qatorTozala) };
  }),
});

export const qatorQidir = tool({
  nom: 'qator_qidir',
  tavsif: 'Obyekt ichida qator qidirish: `matn` (nom ilike, bo\'shliqlar bo\'yicha har so\'z), `kod` (prefiks/ilike), `tur` (rz/bl/rs/mat/ob). Holat summalari bilan.',
  kirish: { obyekt_id: obyektIdS, matn: z.string().optional(), kod: z.string().optional(), tur: z.enum(['rz', 'bl', 'rs', 'mat', 'ob']).optional(), limit: z.number().int().positive().max(1000).optional(), offset: z.number().int().min(0).optional() },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const sozlar = (a.matn ?? '').split(/\s+/).filter(Boolean).slice(0, 8);
    const params: unknown[] = [a.obyekt_id];
    const shart = ['q.obyekt_id = $1'];
    for (const s of sozlar) { params.push(`%${s}%`); shart.push(`q.nom ilike $${params.length}`); }
    if (a.kod) { params.push(`%${a.kod}%`); shart.push(`q.kod ilike $${params.length}`); }
    if (a.tur) { params.push(a.tur); shart.push(`q.tur = $${params.length}`); }
    const limit = a.limit ?? 50, offset = a.offset ?? 0;
    const r = await m.query(`${QATOR_TO_LIQ} where ${shart.join(' and ')} order by q.tartib nulls last, q.id limit ${limit + 1} offset ${offset}`, params);
    const yana = r.rows.length > limit;
    return { qatorlar: r.rows.slice(0, limit).map(qatorTozala), yana_bor: yana, keyingi_offset: yana ? offset + limit : null };
  }),
});

export const f2Royxat = tool({
  nom: 'f2_royxat',
  tavsif: 'Obyektning aktlari (standart tur=f2; `tur:"fakt"` — fakt hujjatlari): raqam, oy, holat, lifecycle, hujjat jami, qator soni va qatorlar summasi (NDS siz).',
  kirish: { obyekt_id: obyektIdS, tur: z.string().optional(), holat: z.string().optional(), limit: z.number().int().positive().max(5000).optional() },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const r = await m.query(`select k.id, k.tur, k.raqam, k.oy, k.sana, k.holat, k.lifecycle_status, k.hujjat_jami, k.manba, k.versiya, k.shartnoma_id, k.correction_of_akt_id,
                                    count(aq.id)::int as qator_soni, sum(coalesce(aq.certified_amount, aq.summa)) as qatorlar_summa
                               from public.t2_akt k left join public.t2_akt_qator aq on aq.akt_id = k.id
                              where k.obyekt_id = $1 and k.tur = $2 and ($3::text is null or k.holat = $3)
                              group by k.id order by k.oy desc nulls last, k.id desc limit $4`, [a.obyekt_id, a.tur ?? 'f2', a.holat ?? null, a.limit ?? 500]);
    return { soni: r.rows.length, aktlar: r.rows.map(qatorTozala) };
  }),
});

export const f2 = tool({
  nom: 'f2',
  tavsif: 'Bitta akt (F2 yoki fakt): sarlavha + qatorlar (smeta qatori kodi/nomi/birligi/kat bilan), jami ustamasiz va ustamali (NDS siz). Sahifalash: limit/offset.',
  kirish: { akt_id: z.number().int().positive(), limit: z.number().int().positive().max(20000).optional(), offset: z.number().int().min(0).optional() },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const akt = (await m.query('select * from public.t2_akt where id = $1', [a.akt_id])).rows[0] as Record<string, unknown> | undefined;
    if (!akt) throw new Error(`Akt #${a.akt_id} topilmadi.`);
    const r = await m.query<Record<string, unknown> & { kat: string | null; s: number | null }>(
      `select aq.id, aq.qator_id, q.tur, q.kod, q.nom, q.birlik, q.kat, aq.hajm, aq.narx, aq.summa, aq.certified_quantity, aq.certified_unit_price, aq.certified_amount,
              aq.baseline_narx, aq.izoh, aq.change_type, aq.provenance_status, coalesce(aq.certified_amount, aq.summa) as s
         from public.t2_akt_qator aq left join public.t2_qator q on q.id = aq.qator_id where aq.akt_id = $1 order by q.tartib nulls last, aq.id`, [a.akt_id]);
    const kesim = bosKatKesim();
    for (const q of r.rows) katKesimgaQosh(kesim, q.kat, son(q.s));
    const u = await ustamaOl(m, Number(akt.obyekt_id), mu.aktorId, akt.shartnoma_id == null ? null : Number(akt.shartnoma_id));
    const s = sahifala(r.rows.map(({ s: _s, ...x }) => qatorTozala(x)), a.limit ?? 300, a.offset ?? 0);
    return { akt: qatorTozala(akt), summa: summaJuft(kesimJami(kesim), u.hisobla(kesim)), ...s };
  }),
});

const pQator = (q: PNatijaQator) => ({
  qator_id: q.qatorId, kod: q.kod, nom: q.nom, birlik: q.birlik, kat: q.kat, smeta_hajm: q.smetaHajm, smeta_narx: q.smetaNarx, fakt: q.faktHajm, f2_hajm: q.f2Hajm,
  f2_summa: q.f2Summa, almashtirilgan: q.almashtirilgan, bolim: q.bolimYol.join(' › '), bandlar: q.bandlar, sof: q.sof,
  ...(q.tekshir.length ? { tekshir: q.tekshir } : {}), ...(q.eslatma.length ? { eslatma: q.eslatma } : {}),
});

export const pereraschet = tool({
  nom: 'pereraschet',
  tavsif: 'Pereraschet (frontend lib/pereraschet.ts — aynan o\'sha hisob): ortiqcha olingan (minus), olinmagan (plus), narx farqi, chegirma; '
    + 'tekshirish kerak qatorlar alohida (pulga kirmaydi). Jami ustamasiz va ustamali (NDS siz). `bolim_id` — filtr.',
  kirish: { obyekt_id: obyektIdS, bolim_id: z.number().int().positive().optional(), limit: z.number().int().positive().max(5000).optional(), offset: z.number().int().min(0).optional() },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    await obyektBormi(m, a.obyekt_id);
    const [h, z] = await Promise.all([
      m.query<PQator>(`select ${PERERASCHET_USTUNLAR} from public.t2_qator_holat where obyekt_id = $1`, [a.obyekt_id]),
      m.query<{ id: number; replaces_line_id: number }>('select id, replaces_line_id from public.t2_qator where obyekt_id = $1 and replaces_line_id is not null', [a.obyekt_id]),
    ]);
    const n = pereraschetHisobla(h.rows, { zamenaIdlar: new Set(z.rows.map((r) => Number(r.id))), aslIdlar: new Set(z.rows.map((r) => Number(r.replaces_line_id))), bolimId: a.bolim_id ?? null });
    const u = await ustamaOl(m, a.obyekt_id, mu.aktorId);
    const plus = summaJuft(n.jami.plus, u.hisobla(n.plusKesim));
    const minus = summaJuft(n.jami.minus, u.hisobla(n.minusKesim));
    const limit = a.limit ?? 50, offset = a.offset ?? 0;
    return {
      jami: { ...n.jami, plus_juft: plus, minus_juft: minus, izoh: 'plus — olish mumkin; minus — qaytarish (mutlaq qiymat); sof = plus − minus. NDS siz.' },
      tur_boyicha: n.turBoyicha, fakt_norma_plus: n.faktNormaPlus, tekshirish_taxminiy: n.tekshirTaxminiy,
      bolimlar: n.bolimlar.slice(0, 40),
      hisobda: sahifala(n.hisobda.map(pQator), limit, offset),
      tekshirish: sahifala(n.tekshirish.map(pQator), limit, offset),
    };
  }),
});
