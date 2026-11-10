import os from 'node:os';
import path from 'node:path';
import { maxfiyQosh } from './maxfiy';

export type Sozlama = {
  /** Faqat muhitdan (SMETA_DB_URL). Hech qachon chop etilmaydi. */
  dbUrl: string | null;
  /** RPC'larga uzatiladigan aktor (t2_foydalanuvchi.id). Bo'lmasa — `aktor_tanla` bilan sessiyada o'rnatiladi. */
  aktorId: number | null;
  /** Lokal JSONL audit fayli; null — lokal audit yo'q (Cloudflare Worker: audit bazada + Workers Logs). */
  auditFayl: string | null;
  /** Ixtiyoriy: tranzaksiyada `set local role` (masalan service_role). Standart — ulanish roli. */
  dbRol: string | null;
  /** Bitta so'rov uchun vaqt chegarasi (ms). */
  timeoutMs: number;
  /** TLS sertifikatini qat'iy tekshirish (SMETA_DB_SSL=verify). Standart — shifrlangan, sertifikat zanjiri tekshirilmaydi (Supabase pooler). */
  sslVerify: boolean;
};

export function auditStandartYoli(env: NodeJS.ProcessEnv = process.env): string {
  const baza = env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  return path.join(baza, 'smeta-mcp', 'audit.jsonl');
}

export function sozlamaOqi(env: NodeJS.ProcessEnv = process.env): Sozlama {
  const dbUrl = env.SMETA_DB_URL?.trim() || null;
  maxfiyQosh(dbUrl);
  const a = Number(env.SMETA_AKTOR_ID);
  const t = Number(env.SMETA_MCP_TIMEOUT_MS);
  const rol = env.SMETA_DB_ROLE?.trim() || null;
  return {
    dbUrl,
    aktorId: Number.isSafeInteger(a) && a > 0 ? a : null,
    auditFayl: env.SMETA_MCP_AUDIT?.trim() || auditStandartYoli(env),
    dbRol: rol && /^[A-Za-z_][A-Za-z0-9_]*$/.test(rol) ? rol : null,
    timeoutMs: Number.isFinite(t) && t > 0 ? t : 120_000,
    sslVerify: env.SMETA_DB_SSL === 'verify',
  };
}
