/** Snapshot toollari — `snapshot` sxemasi funksiyalari (bazada bo'lmasa aniq xabar). */
import { z } from 'zod';
import { SNAPSHOT_YOQ, snapshotChaqir, snapshotOl as olish } from '../snapshot';
import { dryRun, obyektIdS, tool } from '../tool';

/** snapshot.ol qabul qiladigan sabablar (bazadagi check bilan bir xil). */
export const SABABLAR = ['qolda', 'kunlik', 'mcp_oldi', 'restore_oldi'] as const;
const muallif = (aktorId: number | null | undefined) => (aktorId ? `mcp:actor:${aktorId}` : 'mcp');
/** snapshot.qaytar kutadigan tasdiq matni. */
export const qaytarTasdiq = (snapshotId: number) => `QAYTAR ${snapshotId}`;

export const snapshotOl = tool({
  nom: 'snapshot_ol',
  tavsif: 'Obyektning hozirgi holati snapshoti (snapshot.ol(obyekt, sabab, izoh, muallif)). Yozuvchi toollar buni avtomatik qiladi; bu — qo\'lda nuqta.',
  kirish: { obyekt_id: obyektIdS, izoh: z.string().max(500).optional(), sabab: z.enum(SABABLAR).optional().describe('standart: qolda') },
  yozadi: true,
  bajar: async (a, mu) => mu.yozish({ tool: 'snapshot_ol', args: a, obyektId: a.obyekt_id, snapshot: false }, async (m) => {
    const s = await olish(m, a.obyekt_id, a.sabab ?? 'qolda', a.izoh ?? null, muallif(mu.aktorId));
    if (s.id == null) throw new Error(s.ogohlantirish ?? SNAPSHOT_YOQ);
    return { snapshot_id: s.id };
  }).then((r) => ({ ...r, snapshot_id: (r.natija as { snapshot_id: number }).snapshot_id })),
});

export const snapshotRoyxat = tool({
  nom: 'snapshot_royxat',
  tavsif: 'Obyekt snapshotlari ro\'yxati (snapshot.royxat).',
  kirish: { obyekt_id: obyektIdS },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => ({ snapshotlar: await snapshotChaqir(m, 'royxat', { p_obyekt_id: a.obyekt_id }) })),
});

export const snapshotFarq = tool({
  nom: 'snapshot_farq',
  tavsif: 'Snapshot va hozirgi holat farqi (snapshot.farq): jadval bo\'yicha qo\'shilgan/o\'chirilgan/o\'zgargan. `batafsil` — PK namunalar. '
    + '(snapshot.farq vaqtinchalik jadval ishlatadi — shuning uchun yozish tranzaksiyasida bajariladi va doim ROLLBACK; bazada hech narsa o\'zgarmaydi.)',
  kirish: { snapshot_id: z.number().int().positive(), obyekt_id: obyektIdS.optional(), batafsil: z.boolean().optional() },
  yozadi: false,
  bajar: async (a, mu) => {
    const r = await mu.yozish({ tool: 'snapshot_farq', args: a, dryRun: true, obyektId: null, snapshot: false }, async (m) =>
      snapshotChaqir(m, 'farq', { p_snapshot_id: a.snapshot_id, p_obyekt_id: a.obyekt_id, p_batafsil: a.batafsil }));
    return { farq: r.natija };
  },
});

export const snapshotQaytar = tool({
  nom: 'snapshot_qaytar',
  tavsif: 'Obyektni snapshot holatiga qaytarish (snapshot.qaytar). Baza qaytarishdan oldin joriy holatni o\'zi «restore_oldi» snapshot qiladi '
    + '(qaytarishni ham qaytarish mumkin — natijadagi oldi_snapshot_id). `tasdiq:true` bo\'lmasa rad etiladi. dry_run — ROLLBACK.',
  kirish: { snapshot_id: z.number().int().positive(), tasdiq: z.boolean().describe('true — haqiqatan qaytarish'), obyekt_id: obyektIdS.optional(), dry_run: dryRun },
  yozadi: true,
  bajar: async (a, mu) => mu.yozish({ tool: 'snapshot_qaytar', args: a, dryRun: a.dry_run, obyektId: a.obyekt_id ?? null, snapshot: false, izoh: `qaytar ← #${a.snapshot_id}` }, async (m) => {
    if (a.tasdiq !== true) throw new Error('snapshot_qaytar: tasdiq:true kerak');
    const rows = await snapshotChaqir(m, 'qaytar', { p_snapshot_id: a.snapshot_id, p_tasdiq: qaytarTasdiq(a.snapshot_id), p_muallif: muallif(mu.aktorId) });
    return { qaytarildi: Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined)?.qaytar ?? rows : rows };
  }),
});
