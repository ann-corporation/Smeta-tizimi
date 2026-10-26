import { z } from 'zod';
import { lokalAudit } from './audit';
import { xatoMatni } from './maxfiy';
import type { Muhit } from './muhit';

export type ToolTarif<S extends z.ZodRawShape = z.ZodRawShape> = {
  nom: string;
  tavsif: string;
  kirish: S;
  yozadi: boolean;
  bajar: (a: z.objectOutputType<S, z.ZodTypeAny>, mu: Muhit) => Promise<unknown>;
};

export const tool = <S extends z.ZodRawShape>(t: ToolTarif<S>): ToolTarif => t as unknown as ToolTarif;

/** Umumiy maydonlar. */
export const dryRun = z.boolean().optional().describe('true — preview qaytaradi va ROLLBACK (bazaga yozilmaydi). Standart: false.');
export const obyektIdS = z.number().int().positive().describe('t2_obyekt.id');

export type ToolJavob = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/** Natijani matnga: satr — o'zi (markdown), qolgani — ixcham JSON. */
export function matnga(x: unknown): string {
  if (typeof x === 'string') return x;
  return JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v));
}

/** Tool chaqiruvi: zod tekshiruvi → bajarish → lokal audit; xato matni maxfiy qiymatsiz. Server ham, testlar ham shuni ishlatadi. */
export async function toolChaqir(t: ToolTarif, mu: Muhit, xom: unknown): Promise<ToolJavob> {
  const t0 = Date.now();
  let args: unknown = xom;
  try {
    args = z.object(t.kirish).strict().parse(xom ?? {});
    const natija = await t.bajar(args as never, mu);
    const text = matnga(natija);
    const sid = natija && typeof natija === 'object' && 'snapshot_id' in natija ? (natija as { snapshot_id: number | null }).snapshot_id : undefined;
    const dry = natija && typeof natija === 'object' && 'dry_run' in natija ? (natija as { dry_run: boolean }).dry_run : undefined;
    await lokalAudit(mu.sozlama.auditFayl, { vaqt: new Date().toISOString(), tool: t.nom, args, ok: true, natija: text, snapshot_id: sid, dry_run: dry, ms: Date.now() - t0 });
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    const msg = e instanceof z.ZodError ? `Argument xatosi: ${e.issues.map((i) => `${i.path.join('.') || '(ildiz)'}: ${i.message}`).join('; ')}` : xatoMatni(e);
    await lokalAudit(mu.sozlama.auditFayl, { vaqt: new Date().toISOString(), tool: t.nom, args, ok: false, natija: msg, ms: Date.now() - t0 });
    return { content: [{ type: 'text', text: msg }], isError: true };
  }
}
