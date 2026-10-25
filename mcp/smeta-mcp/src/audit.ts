/**
 * Audit: (1) lokal JSONL (%LOCALAPPDATA%\smeta-mcp\audit.jsonl) — HAR tool chaqiruvi; (2) bazadagi mavjud audit jurnali
 * (public.t2_audit_yoz → t2_audit_log, modul='mcp') — yozish toollari, o'sha tranzaksiya ichida (dry_run'da yozilmaydi).
 * Ikkalasida ham argumentlar `argYashir` dan o'tadi — kalit/parol tushmaydi.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { savepoint, type Mijoz } from './db';
import { argYashir, yashir } from './maxfiy';

export type AuditYozuv = {
  vaqt: string; tool: string; args: unknown; ok: boolean; natija: string;
  snapshot_id?: number | null; dry_run?: boolean; ms: number; obyekt_id?: number | null;
};

export function auditQator(y: Omit<AuditYozuv, 'args' | 'natija'> & { args: unknown; natija: string }): string {
  const yozuv: AuditYozuv = { ...y, args: argYashir(y.args), natija: yashir(y.natija.length > 500 ? y.natija.slice(0, 500) + '…' : y.natija) };
  return JSON.stringify(yozuv) + '\n';
}

/** Lokal audit — hech qachon xato tashlamaydi (audit ishlamasa ham tool ishlaydi). */
export async function lokalAudit(fayl: string, y: Parameters<typeof auditQator>[0]): Promise<void> {
  try {
    await mkdir(path.dirname(fayl), { recursive: true });
    await appendFile(fayl, auditQator(y), 'utf8');
  } catch { /* jim */ }
}

/** Bazadagi audit (t2_audit_yoz mavjud bo'lsa). SAVEPOINT ichida — audit xatosi asosiy amalni buzmaydi. */
export async function bazaAudit(m: Mijoz, p: { obyektId: number | null; tool: string; args: unknown; natija: string; aktorId: number | null }): Promise<boolean> {
  const bor = await m.query<{ bor: boolean }>("select to_regprocedure('public.t2_audit_yoz(bigint,text,text,bigint,text,text,text)') is not null as bor");
  if (!bor.rows[0]?.bor) return false;
  const tafsilot = yashir(JSON.stringify({ tool: p.tool, args: argYashir(p.args), natija: p.natija.slice(0, 1000) }));
  const r = await savepoint(m, 'mcp_audit', async () => {
    const k = p.obyektId != null
      ? (await m.query<{ kompaniya_id: string | null }>('select kompaniya_id from public.t2_obyekt where id = $1', [p.obyektId])).rows[0]?.kompaniya_id ?? null
      : null;
    await m.query('select public.t2_audit_yoz(p_kompaniya_id => $1::bigint, p_amal_turi => $2::text, p_modul => $3::text, p_obyekt_id => $4::bigint, p_tafsilot => $5::text, p_kim => $6::text, p_ip => $7::text)',
      [k, `mcp.${p.tool}`, 'mcp', p.obyektId, tafsilot, p.aktorId ? `mcp:actor:${p.aktorId}` : 'mcp', null]);
  });
  return r.ok;
}
