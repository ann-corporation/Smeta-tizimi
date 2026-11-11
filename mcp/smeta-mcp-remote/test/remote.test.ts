import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { dryRunT } from '../../smeta-mcp/src/tools/ish-oqimi';
import { tool, type ToolTarif } from '../../smeta-mcp/src/tool';
import { mockMuhit, type Javobchi } from '../../smeta-mcp/test/mock';
import { havolalarYig } from '../src/doira';
import { masofaviyServer, tanaOqi } from '../src/mcp';
import { MASOFAVIY_TOOLLAR, masofaviyChaqir, TAQIQLANGAN, yozishArgs } from '../src/siyosat';
import { propsSess, vakolatOl, type Vakolat } from '../src/vakolat';
import { resursUrl } from '../src/url';
import { authorizePost, sahifa } from '../src/kirish';

const vakolat = (kompaniyalar: Array<{ kompaniya_id: number; rol: string }>, foydalanuvchiId = 7): Vakolat => ({
  foydalanuvchiId, superadmin: false, kompaniyalar, sess: { rol: 'pto', exp: Date.now() + 1e6, jti: 'x', foydalanuvchi_id: foydalanuvchiId, kompaniyalar },
});
const PTO17 = vakolat([{ kompaniya_id: 17, rol: 'pto' }]);
const RAHBAR17 = vakolat([{ kompaniya_id: 17, rol: 'rahbar' }]);

/** Obyekt → kompaniya: 153 → 17, 900 → 99 (boshqa kompaniya). */
const OBYEKT_KOMP: Record<number, number> = { 153: 17, 900: 99 };
const doiraJavob = (qolgan?: Javobchi): Javobchi => (sql, params) => {
  if (sql.includes('from public.t2_obyekt o where o.id = any')) return (params[0] as number[]).filter((id) => OBYEKT_KOMP[id]).map((id) => ({ id, kompaniya_id: OBYEKT_KOMP[id] }));
  return qolgan?.(sql, params);
};

/** Soxta yozuvchi tool — umumiy Muhit.yozish orqali (snapshot/audit/ROLLBACK yo'li haqiqiy). */
function soxtaYozuvchi(spy: (a: unknown) => void): ToolTarif {
  return tool({
    nom: 'soxta_yoz', tavsif: 'test', yozadi: true,
    kirish: { obyekt_id: z.number().int().positive(), dry_run: dryRunT },
    bajar: async (a, mu) => { spy(a); return mu.yozish({ tool: 'soxta_yoz', args: a, dryRun: a.dry_run !== false, obyektId: a.obyekt_id, snapshot: false }, async (m) => { await m.query('update public.t2_qator set x = 1 where false'); return { ok: true }; }); },
  });
}
const jim = () => undefined;

describe('tool ro\'yxati', () => {
  it('domen toollari ochiq, xom SQL/RPC va lokal-fayl toollari yo\'q', async () => {
    const nomlar = MASOFAVIY_TOOLLAR.map((t) => t.nom);
    for (const n of ['obyektlar', 'obyekt_holat', 'qator', 'qator_qidir', 'f2_royxat', 'f2', 'nakopitelniy', 'ostatka', 'fakt_jurnal', 'normativ_qidir', 'shartnoma_moslash',
      'fakt_yoz', 'f2_qoralama_yarat', 'f2_qoralama_tahrir', 'f2_qoralama_yangila', 'f2_yarat', 'zamena_qosh', 'ish_ochir', 'akt_bekor', 'forma3', 'snapshot_ol', 'snapshot_royxat', 'snapshot_farq', 'snapshot_qaytar']) {
      expect(nomlar).toContain(n);
    }
    for (const n of TAQIQLANGAN) expect(nomlar).not.toContain(n);
    expect(new Set(nomlar).size).toBe(nomlar.length);
  });

  it('MCP tools/list: yozuvchilarda tasdiq maydoni va qoida tavsifi; qoidalar resursi bor', async () => {
    const { mu } = mockMuhit(() => undefined);
    const server = masofaviyServer(mu, PTO17);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const c = new Client({ name: 't', version: '1' });
    await c.connect(b);
    const { tools } = await c.listTools();
    expect(tools.length).toBe(MASOFAVIY_TOOLLAR.length + 2); // + ChatGPT uchun search/fetch (src/chatgpt.ts)
    const fakt = tools.find((t) => t.name === 'fakt_yoz')!;
    expect(Object.keys((fakt.inputSchema as { properties: object }).properties)).toEqual(expect.arrayContaining(['tasdiq', 'dry_run', 'obyekt_id']));
    expect(fakt.description).toContain('tasdiq:true');
    expect(fakt.annotations?.readOnlyHint).toBe(false);
    expect(tools.find((t) => t.name === 'obyektlar')!.annotations?.readOnlyHint).toBe(true);
    const r = await c.readResource({ uri: 'smeta://qoidalar' });
    expect(String((r.contents[0] as { text: string }).text)).toContain('NDS');
    await c.close();
  });
});

describe('dry_run standart va tasdiq', () => {
  it('yozishArgs: dry_run berilmasa — true; false tasdiqsiz — rad; false+tasdiq — haqiqiy', () => {
    const t = soxtaYozuvchi(jim);
    expect(yozishArgs(t, { obyekt_id: 1 })).toEqual({ args: { obyekt_id: 1, dry_run: true }, haqiqiy: false });
    expect(yozishArgs(t, { obyekt_id: 1, dry_run: false })).toHaveProperty('xato');
    expect(yozishArgs(t, { obyekt_id: 1, dry_run: false, tasdiq: true })).toEqual({ args: { obyekt_id: 1, dry_run: false }, haqiqiy: true });
  });

  it('dry_runsiz chaqiruv ROLLBACK bilan tugaydi (bazaga yozilmaydi)', async () => {
    const spy = vi.fn();
    const { mu, h } = mockMuhit(doiraJavob());
    const j = await masofaviyChaqir(soxtaYozuvchi(spy), mu, PTO17, { obyekt_id: 153 }, jim);
    expect(j.isError).toBeFalsy();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ dry_run: true }));
    const s = h.sorovlar.map((x) => x.sql);
    expect(s).toContain('ROLLBACK');
    expect(s.filter((x) => x === 'COMMIT')).toHaveLength(0);
  });

  it('dry_run:false tasdiqsiz — tool chaqirilmaydi, bazaga so\'rov yo\'q', async () => {
    const spy = vi.fn();
    const { mu, h } = mockMuhit(doiraJavob());
    const j = await masofaviyChaqir(soxtaYozuvchi(spy), mu, PTO17, { obyekt_id: 153, dry_run: false }, jim);
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toContain('tasdiq:true');
    expect(spy).not.toHaveBeenCalled();
    expect(h.sorovlar).toHaveLength(0);
  });

  it('dry_run:false + tasdiq:true — COMMIT', async () => {
    const spy = vi.fn();
    const { mu, h } = mockMuhit(doiraJavob());
    const j = await masofaviyChaqir(soxtaYozuvchi(spy), mu, PTO17, { obyekt_id: 153, dry_run: false, tasdiq: true }, jim);
    expect(j.isError).toBeFalsy();
    expect(h.sorovlar.map((x) => x.sql)).toContain('COMMIT');
  });

  it('preview rejimi yo\'q tool (snapshot_ol) — tasdiqsiz rad', () => {
    const t = MASOFAVIY_TOOLLAR.find((x) => x.nom === 'snapshot_ol')!;
    expect(yozishArgs(t, { obyekt_id: 1 })).toHaveProperty('xato');
    expect(yozishArgs(t, { obyekt_id: 1, tasdiq: true })).toEqual({ args: { obyekt_id: 1 }, haqiqiy: true });
  });
});

describe('tenant doirasi', () => {
  it('boshqa kompaniya obyekti — rad, tool so\'rovi bajarilmaydi', async () => {
    const t = MASOFAVIY_TOOLLAR.find((x) => x.nom === 'obyekt_holat')!;
    const { mu, h } = mockMuhit(doiraJavob());
    const j = await masofaviyChaqir(t, mu, PTO17, { obyekt_id: 900 }, jim);
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toContain('RUXSAT_YOQ');
    expect(h.sorovlar.some((x) => x.sql.includes('t2_qator_holat'))).toBe(false);
  });

  it('mavjud bo\'lmagan id — xuddi shu javob (mavjudlik oshkor qilinmaydi)', async () => {
    const t = MASOFAVIY_TOOLLAR.find((x) => x.nom === 'obyekt_holat')!;
    const { mu } = mockMuhit(doiraJavob());
    const j = await masofaviyChaqir(t, mu, PTO17, { obyekt_id: 12345 }, jim);
    expect(j.content[0].text).toContain('RUXSAT_YOQ');
  });

  it('obyekt_idlar ichida bitta begona bo\'lsa ham — rad', async () => {
    const spy = vi.fn();
    const t = tool({ nom: 'soxta_kop', tavsif: 't', yozadi: false, kirish: { obyekt_idlar: z.array(z.number()) }, bajar: async (a) => { spy(a); return {}; } });
    const { mu } = mockMuhit(doiraJavob());
    const j = await masofaviyChaqir(t, mu, PTO17, { obyekt_idlar: [153, 900] }, jim);
    expect(j.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rahbar: preview mumkin, haqiqiy yozish rad', async () => {
    const spy = vi.fn();
    const { mu } = mockMuhit(doiraJavob());
    expect((await masofaviyChaqir(soxtaYozuvchi(spy), mu, RAHBAR17, { obyekt_id: 153 }, jim)).isError).toBeFalsy();
    const j = await masofaviyChaqir(soxtaYozuvchi(spy), mu, RAHBAR17, { obyekt_id: 153, dry_run: false, tasdiq: true }, jim);
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toContain('yozish huquqingiz yo\'q');
  });

  it('obyektlar — begona kompaniya_id rad; doirasiz chaqiruvda foydalanuvchi kompaniyalari bilan filtrlanadi', async () => {
    const t = MASOFAVIY_TOOLLAR.find((x) => x.nom === 'obyektlar')!;
    const { mu: mu1 } = mockMuhit((sql, p) => (sql.includes('from public.t2_kompaniya k where k.id = any') ? (p[0] as number[]).map((id) => ({ id, kompaniya_id: id })) : undefined));
    expect((await masofaviyChaqir(t, mu1, PTO17, { kompaniya_id: 99 }, jim)).isError).toBe(true);
    const { mu, h } = mockMuhit(() => []);
    const j = await masofaviyChaqir(t, mu, PTO17, {}, jim);
    expect(j.isError).toBeFalsy();
    const q = h.sorovlar.find((x) => x.sql.includes('from public.t2_obyekt o left join'))!;
    expect(q.params[3]).toEqual([17]);
  });

  it('id siz yozish/o\'qish (doira aniqlanmagan) — rad', async () => {
    const t = MASOFAVIY_TOOLLAR.find((x) => x.nom === 'shartnoma_moslash')!;
    const { mu } = mockMuhit(() => []);
    const j = await masofaviyChaqir(t, mu, PTO17, { pozitsiyalar: [{ nom: 'beton' }] }, jim);
    expect(j.isError).toBe(true);
  });

  it('havolalarYig: ichki qator_id, narx_override kalitlari, ildiz id (qator tooli)', () => {
    const h = havolalarYig('f2_qoralama_tahrir', { akt_id: 5, ozgartir: [{ qator_id: 11 }], narx_override: { '12': { narx: 1 } } });
    expect([...h.akt]).toEqual([5]);
    expect([...h.qator].sort()).toEqual([11, 12]);
    expect([...havolalarYig('qator', { id: 44 }).qator]).toEqual([44]);
    expect(havolalarYig('f2', { id: 44 }).qator.size).toBe(0);
  });
});

describe('vakolat va transport', () => {
  it('vakolatOl: tokendagi iat sessiya shakliga o\'tadi; roleAuthority null bo\'lsa — null', async () => {
    const ra = vi.fn(async (s: { foydalanuvchi_id?: number }) => ({ ...s, rol: 'pto', kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }));
    const v = await vakolatOl({ foydalanuvchi_id: 7, login: 'x', iat: 1000 }, { SUPABASE_URL: 'u', SUPABASE_KEY: 'k' }, ra as never);
    expect(v?.kompaniyalar).toEqual([{ kompaniya_id: 17, rol: 'pto' }]);
    expect(propsSess({ foydalanuvchi_id: 7, login: 'x', iat: 1000 }).exp).toBeGreaterThan(1000);
    expect(await vakolatOl({ foydalanuvchi_id: 7, login: 'x', iat: 1 }, { SUPABASE_URL: 'u', SUPABASE_KEY: 'k' }, (async () => null) as never)).toBeNull();
    expect(await vakolatOl({ foydalanuvchi_id: 0, login: 'x', iat: 1 }, { SUPABASE_URL: 'u', SUPABASE_KEY: 'k' }, ra as never)).toBeNull();
  });

  it('tanaOqi: chegaradan katta tana — null', async () => {
    expect(await tanaOqi(new Request('https://x/mcp', { method: 'POST', body: 'a'.repeat(20) }), 10)).toBeNull();
    expect(await tanaOqi(new Request('https://x/mcp', { method: 'POST', body: 'abc' }), 10)).toBe('abc');
  });

  it('login sahifasi: HTML escape; holat cookie mos kelmasa — parol tekshirilmaydi', async () => {
    expect(sahifa({ klient: '<script>x</script>', redirectHost: 'a"b', holat: 'h' })).not.toContain('<script>x');
    const env = { OAUTH_KV: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } } as never;
    const fd = new URLSearchParams({ holat: '00000000-0000-4000-8000-000000000000', login: 'a', parol: 'b' });
    const r = await authorizePost(new Request('https://x/authorize', { method: 'POST', body: fd, headers: { Cookie: 'mcp_holat=boshqa' } }), env);
    expect(r.status).toBe(400);
    expect((env as { OAUTH_KV: { get: ReturnType<typeof vi.fn> } }).OAUTH_KV.get).not.toHaveBeenCalled();
  });

  it('resursUrl: https majburiy, /mcp qo\'shiladi', () => {
    expect(resursUrl({ MCP_PUBLIC_URL: 'https://mcp.example.uz/' })).toBe('https://mcp.example.uz/mcp');
    expect(() => resursUrl({ MCP_PUBLIC_URL: 'http://mcp.example.uz' })).toThrow();
  });
});
