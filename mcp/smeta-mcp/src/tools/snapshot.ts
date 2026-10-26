/** Snapshot toollari — `snapshot` sxemasi funksiyalari (bazada bo'lmasa aniq xabar). */
import { z } from 'zod';
import { SNAPSHOT_YOQ, snapshotChaqir, snapshotOl as olish } from '../snapshot';
import { dryRun, obyektIdS, tool } from '../tool';

export const snapshotOl = tool({
  nom: 'snapshot_ol',
  tavsif: 'Obyektning hozirgi holati snapshoti (snapshot.ol(obyekt, sabab, izoh, muallif)). Yozuvchi toollar buni avtomatik qiladi; bu — qo\'lda nuqta.',
  kirish: { obyekt_id: obyektIdS, izoh: z.string().max(500).optional(), sabab: z.string().max(100).optional() },
  yozadi: true,
  bajar: async (a, mu) => mu.yozish({ tool: 'snapshot_ol', args: a, obyektId: a.obyekt_id, snapshot: false }, async (m) => {
    const s = await olish(m, a.obyekt_id, a.sabab ?? 'mcp_qolda', a.izoh ?? null, mu.aktorId ? `mcp:actor:${mu.aktorId}` : 'mcp');
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
  tavsif: 'Snapshot va hozirgi holat farqi (snapshot.farq).',
  kirish: { snapshot_id: z.number().int().positive(), obyekt_id: obyektIdS.optional() },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => ({ farq: await snapshotChaqir(m, 'farq', { p_snapshot_id: a.snapshot_id, p_obyekt_id: a.obyekt_id }) })),
});

export const snapshotQaytar = tool({
  nom: 'snapshot_qaytar',
  tavsif: 'Obyektni snapshot holatiga qaytarish (snapshot.qaytar(p_snapshot_id, p_tasdiq)). `obyekt_id` berilsa — qaytarishdan oldin joriy holat ham snapshot qilinadi (qaytarishni qaytarish mumkin). dry_run — ROLLBACK.',
  kirish: { snapshot_id: z.number().int().positive(), tasdiq: z.boolean().describe('true — haqiqatan qaytarish'), obyekt_id: obyektIdS.optional(), dry_run: dryRun },
  yozadi: true,
  bajar: async (a, mu) => mu.yozish({ tool: 'snapshot_qaytar', args: a, dryRun: a.dry_run, obyektId: a.obyekt_id ?? null, snapshot: a.obyekt_id != null, izoh: `qaytar ← #${a.snapshot_id}` }, async (m) =>
    ({ qaytarildi: await snapshotChaqir(m, 'qaytar', { p_snapshot_id: a.snapshot_id, p_tasdiq: a.tasdiq }) })),
});
