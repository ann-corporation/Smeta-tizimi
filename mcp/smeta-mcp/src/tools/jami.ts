/**
 * F2 portfel jami: kompaniya (ixtiyoriy shartnoma, oy, holat) bo'yicha har F2 akt summasi — YAGONA yadro
 * `t2_akt_summa_paket_v1` (akt o'z podvali, svod/yaxlit, ustamasiz qism) — sayt va f2 tooli bilan bir xil raqam.
 * Faqat o'qish. Masofaviy serverda tenant doirasi `kompaniya_id` orqali tekshiriladi.
 */
import { z } from 'zod';
import { qatorTozala, son } from '../format';
import { tool } from '../tool';

const yaxlit = (x: number) => Math.round(x * 100) / 100;

export const f2Jami = tool({
  nom: 'f2_jami',
  tavsif: 'Kompaniya F2 aktlari bo\'yicha JAMI summa (lot/shartnoma/oy kesimida): har akt — obyekt, holat, ustamasiz, ustamali (QQS siz), QQS, QQS bilan; '
    + 'shartnoma bo\'yicha va umumiy jami. Raqamlar sayt hujjatlari bilan bir xil yadrodan (t2_akt_summa_paket_v1). '
    + 'Misol: «2-lot noyabr F-2 jami» → oy:"2026-11-01", holat:"qoralama", shartnoma_id ixtiyoriy. Obyektlar ro\'yxati va kompaniya_id — `obyektlar` toolidan.',
  kirish: {
    kompaniya_id: z.number().int().positive().describe('kompaniya id (obyektlar tooli natijasida)'),
    oy: z.string().regex(/^\d{4}-\d{2}-01$/).optional().describe('oy boshi, masalan "2026-11-01"'),
    holat: z.string().optional().describe('qoralama | tasdiqlangan | ... (berilmasa — bekor qilinganlardan tashqari hammasi)'),
    shartnoma_id: z.number().int().positive().optional().describe('faqat shu shartnoma (lot)'),
    limit: z.number().int().positive().max(300).optional(),
  },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const aktlar = await m.query<Record<string, unknown>>(
      `select a.id, a.raqam, a.oy, a.holat, a.shartnoma_id, a.obyekt_id, o.nom as obyekt
         from public.t2_akt a join public.t2_obyekt o on o.id = a.obyekt_id
        where a.kompaniya_id = $1 and a.tur = 'f2'
          and ($2::date is null or a.oy = $2::date)
          and (case when $3::text is null then coalesce(a.holat, '') not in ('bekor', 'bekor_qilingan') else a.holat = $3 end)
          and ($4::bigint is null or a.shartnoma_id = $4)
        order by a.shartnoma_id nulls last, o.nom, a.id limit $5`,
      [a.kompaniya_id, a.oy ?? null, a.holat ?? null, a.shartnoma_id ?? null, a.limit ?? 200]);
    const qatorlar: Array<Record<string, unknown>> = [];
    const shart = new Map<string, { aktlar: number; ustamasiz: number; ustamali: number; qqs: number; qqs_bilan: number }>();
    const jami = { aktlar: 0, ustamasiz: 0, ustamali: 0, qqs: 0, qqs_bilan: 0 };
    const xatolar: string[] = [];
    for (const r of aktlar.rows) {
      let p: Record<string, unknown> | null = null;
      try {
        const j = (await m.query<{ j: { ok?: boolean; paket?: Record<string, unknown> } }>('select public.t2_akt_summa_paket_v1($1, $2) as j', [r.id, mu.aktorKerak()])).rows[0]?.j;
        p = j?.ok ? (j.paket ?? null) : null;
      } catch (e) { xatolar.push(`akt ${String(r.id)}: ${(e as Error).message.slice(0, 120)}`); }
      const u = son(p?.ustamasiz) ?? 0; const us = son(p?.ustamali) ?? 0; const q = son(p?.qqs) ?? 0; const qb = son(p?.qqs_bilan) ?? 0;
      qatorlar.push(qatorTozala({ ...r, ustamasiz: yaxlit(u), ustamali: yaxlit(us), qqs: yaxlit(q), qqs_bilan: yaxlit(qb), narxsiz_qator: p?.narxsiz_soni ?? null }));
      const k = r.shartnoma_id == null ? 'shartnomasiz' : String(r.shartnoma_id);
      const s = shart.get(k) ?? { aktlar: 0, ustamasiz: 0, ustamali: 0, qqs: 0, qqs_bilan: 0 };
      s.aktlar++; s.ustamasiz += u; s.ustamali += us; s.qqs += q; s.qqs_bilan += qb; shart.set(k, s);
      jami.aktlar++; jami.ustamasiz += u; jami.ustamali += us; jami.qqs += q; jami.qqs_bilan += qb;
    }
    const yx = (o: typeof jami) => ({ aktlar: o.aktlar, ustamasiz: yaxlit(o.ustamasiz), ustamali: yaxlit(o.ustamali), qqs: yaxlit(o.qqs), qqs_bilan: yaxlit(o.qqs_bilan) });
    return {
      filtr: { kompaniya_id: a.kompaniya_id, oy: a.oy ?? null, holat: a.holat ?? 'bekordan tashqari', shartnoma_id: a.shartnoma_id ?? null },
      jami: yx(jami),
      shartnoma_boyicha: Object.fromEntries([...shart].map(([k, v]) => [k, yx(v)])),
      aktlar: qatorlar,
      ...(xatolar.length ? { xatolar } : {}),
      izoh: 'Pul: ustamasiz va ustamali — QQS siz; qqs_bilan — ustamali + QQS. Foydalanuvchiga avval QQS bilan, keyin ustamali (QQS siz) ko\'rsating.',
    };
  }),
});
