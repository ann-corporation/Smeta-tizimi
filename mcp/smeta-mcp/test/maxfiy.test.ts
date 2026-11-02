import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditQator } from '../src/audit';
import { sozlamaOqi } from '../src/config';
import { argYashir, maxfiyQosh, maxfiyTozala, xatoMatni, yashir } from '../src/maxfiy';
import { toolChaqir } from '../src/tool';
import { sqlOqish } from '../src/tools/oqish';
import { rpc } from '../src/tools/yozish';
import { mockMuhit } from './mock';

const URL_ = 'postgresql://postgres.abcdefgh:Juda-Maxfiy-Parol_42@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

afterEach(() => maxfiyTozala());

describe('maxfiy qiymatlar', () => {
  it('ulanish satri va paroli har qanday matndan yashiriladi', () => {
    maxfiyQosh(URL_);
    const s = yashir(`ulanmadi: ${URL_} (parol Juda-Maxfiy-Parol_42)`);
    expect(s).not.toContain('Juda-Maxfiy-Parol_42');
    expect(s).not.toContain(URL_);
  });
  it('ro\'yxatsiz ham naqsh bo\'yicha: postgres URL paroli, password=, JWT, sb_secret', () => {
    const s = yashir('postgres://user:boshqaParol@host/db password=abc123 eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJlX3h4eA sb_secret_ABCDEFGHIJ');
    expect(s).not.toMatch(/boshqaParol|abc123|eyJhbGci|sb_secret_ABCDEFGHIJ/);
  });
  it('argYashir: maxfiy nomli kalitlar va ichki qiymatlar', () => {
    maxfiyQosh(URL_);
    const a = argYashir({ sql: `select '${URL_}'`, password: 'x', ichki: { db_url: 'y', ok: 1 } }) as Record<string, unknown>;
    expect(JSON.stringify(a)).not.toMatch(/Juda-Maxfiy|"x"|"y"/);
    expect((a.ichki as Record<string, unknown>).ok).toBe(1);
  });
  it('xatoMatni: pg xatosi detail bilan, parolsiz', () => {
    maxfiyQosh(URL_);
    const e = Object.assign(new Error(`connect failed for ${URL_}`), { code: '28P01', detail: 'password=Juda-Maxfiy-Parol_42' });
    const m = xatoMatni(e);
    expect(m).toContain('28P01');
    expect(m).not.toContain('Juda-Maxfiy-Parol_42');
  });
  it('config SMETA_DB_URL ni maxfiy ro\'yxatga oladi', () => {
    const s = sozlamaOqi({ SMETA_DB_URL: URL_, SMETA_AKTOR_ID: '12', LOCALAPPDATA: 'C:\\L' });
    expect(s.aktorId).toBe(12);
    expect(s.auditFayl).toMatch(/smeta-mcp[\\/]audit\.jsonl$/);
    expect(yashir(URL_)).toBe('***');
  });
});

describe('kalit loglarga tushmaydi (to\'liq oqim)', () => {
  it('xato javobi va lokal audit faylida parol yo\'q', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'smeta-mcp-'));
    const audit = path.join(dir, 'audit.jsonl');
    maxfiyQosh(URL_);
    const { mu } = mockMuhit((sql) => (sql.includes('_mcp_q') ? new Error(`server closed: ${URL_}`) : []), { auditFayl: audit, dbUrl: URL_ });
    const j = await toolChaqir(sqlOqish, mu, { sql: 'select 1', params: [] });
    expect(j.isError).toBe(true);
    expect(j.content[0].text).not.toContain('Juda-Maxfiy-Parol_42');
    const yoz = readFileSync(audit, 'utf8');
    expect(yoz).toContain('"tool":"sql_oqish"');
    expect(yoz).not.toContain('Juda-Maxfiy-Parol_42');
  });
  it('audit qatori: argumentdagi maxfiy kalit yashiriladi', () => {
    const q = auditQator({ vaqt: 't', tool: 'rpc', args: { nom: 'x', args: { p_token: 'SIR' } }, ok: true, natija: 'ok', ms: 1 });
    expect(q).not.toContain('SIR');
  });
  it('rpc xatosi (mock) — natijada ulanish satri yo\'q', async () => {
    maxfiyQosh(URL_);
    const { mu } = mockMuhit((sql) => (sql.includes('pg_proc p join pg_namespace') && sql.includes('proargnames') ? new Error(`timeout ${URL_}`) : sql.includes('snapshot') ? [{ bor: false }] : []), { dbUrl: URL_ });
    const j = await toolChaqir(rpc, mu, { nom: 't2_x', args: {} });
    expect(j.isError).toBe(true);
    expect(j.content[0].text).not.toContain('Maxfiy');
  });
});
