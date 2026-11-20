import { beforeEach, expect, it, vi } from 'vitest';
import { readNormativ } from '../../../frontend/functions/_shared/normativ-read';
import { normativQidir } from '../../smeta-mcp/src/tools/pto';
import { toolChaqir } from '../../smeta-mcp/src/tool';
import { mockMuhit } from '../../smeta-mcp/test/mock';
import { normativUla } from '../src/normativ';

vi.mock('../../../frontend/functions/_shared/normativ-read', () => ({ readNormativ: vi.fn() }));
const r2 = { get: vi.fn(async () => null), put: vi.fn(async () => undefined) };
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic', SNAPSHOT_R2: r2, NORMATIV_R2_PREFIX: 'normativ/synthetic/' };
const authority = { foydalanuvchiId: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] };
const evidence = { hujjat_id: '11111111-1111-4111-8111-111111111111', sha256: 'a'.repeat(64),
  source_sha: 'b'.repeat(64), iqtibos: 'Synthetic reference: source quantity remains unknown.', sahifa_pdf: 3,
  norma_kod: '4.02.06-04', havola: '/api/normativ-qidir?synthetic' };
const fixture = (company = 17) => mockMuhit(sql => sql.includes('t2_obyekt') ? [{ id: 5, nom: 'Synthetic', kompaniya_id: company }] : []);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(readNormativ).mockImplementation(async () => Response.json({ ok: true, natijalar: [evidence] })); });

it('existing MCP tool uses the site R2 reader and preserves source excerpts/hashes/pages', async () => {
  const { mu, h } = fixture(); normativUla(mu, env, authority);
  vi.mocked(readNormativ).mockImplementation(async () => {
    expect(h.ochiq).toBe(0); // No database connection is held while R2 is searched.
    return Response.json({ ok: true, natijalar: [evidence] });
  });
  const reply = await toolChaqir(normativQidir, mu, { obyekt_id: 5, matn: 'synthetic norm', limit: 4, tahrir: '2020' });
  expect(reply.isError).not.toBe(true);
  expect(JSON.parse(reply.content[0].text)).toMatchObject({ tur: 'normativ', natijalar: [evidence] });
  expect(readNormativ).toHaveBeenCalledWith(expect.objectContaining({ NORMATIV_R2: r2,
    NORMATIV_R2_PREFIX: env.NORMATIV_R2_PREFIX }), 7, 17, { q: 'synthetic norm', edition: '2020', doc: null, sha: null, limit: 4, publishedOnly: true });
  expect(h.sorovlar.some(q => q.sql.includes('t2_normativ_qidir_v1'))).toBe(false);
});
it.each([502, 503])('does not silently use stale SQL when the authoritative reader returns %s', async status => {
  const { mu, h } = fixture(); normativUla(mu, env, authority);
  vi.mocked(readNormativ).mockResolvedValue(Response.json({ ok: false, code: 'SEARCH_UNAVAILABLE' }, { status }));
  expect((await toolChaqir(normativQidir, mu, { obyekt_id: 5, matn: 'synthetic' })).isError).toBe(true);
  expect(h.sorovlar.some(q => q.sql.includes('t2_normativ_qidir_v1'))).toBe(false);
});
it('keeps UNKNOWN/edition ambiguity distinct from a verified match', async () => {
  const { mu } = fixture(); normativUla(mu, env, authority);
  vi.mocked(readNormativ).mockResolvedValue(Response.json({ ok: true, code: 'UNKNOWN', sabab: 'EDITION_REQUIRED', natijalar: [] }));
  const reply = await toolChaqir(normativQidir, mu, { obyekt_id: 5, matn: 'synthetic' });
  expect(JSON.parse(reply.content[0].text)).toMatchObject({ code: 'UNKNOWN', sabab: 'EDITION_REQUIRED', natijalar: [] });
});
it('rejects foreign-company and actor-mismatch before accessing the R2 gateway', async () => {
  const { mu } = fixture(99); normativUla(mu, env, authority);
  expect((await toolChaqir(normativQidir, mu, { obyekt_id: 5, matn: 'synthetic' })).isError).toBe(true);
  const same = fixture(); normativUla(same.mu, env, authority); same.mu.aktorId = 8;
  expect((await toolChaqir(normativQidir, same.mu, { obyekt_id: 5, matn: 'synthetic' })).isError).toBe(true);
  expect(readNormativ).not.toHaveBeenCalled();
});
it.each(['ish', 'resurs'])('preserves the existing %s catalogue path', async tur => {
  const { mu, h } = fixture(); normativUla(mu, env, authority);
  expect((await toolChaqir(normativQidir, mu, { obyekt_id: 5, matn: 'synthetic', tur })).isError).not.toBe(true);
  expect(readNormativ).not.toHaveBeenCalled();
  expect(h.sorovlar.some(q => q.sql.includes(tur === 'ish' ? 't2_ish_turi_qidir_v1' : 't2_resurs_qidir_v1'))).toBe(true);
});
it('retains local stdio SQL compatibility when the host has no R2 gateway', async () => {
  const { mu, h } = mockMuhit(sql => sql.includes('t2_obyekt') ? [{ id: 5, nom: 'Synthetic', kompaniya_id: 17 }]
    : sql.includes('t2_normativ_qidir_v1') ? [{ r: { ok: true, natijalar: [{ norma_kod: '4.02.06-04', nom: 'Synthetic' }] } }] : []);
  const reply = await toolChaqir(normativQidir, mu, { obyekt_id: 5, matn: 'synthetic', tahrir: '2020' });
  expect(reply.isError).not.toBe(true); expect(readNormativ).not.toHaveBeenCalled();
  expect(h.sorovlar.find(q => q.sql.includes('t2_normativ_qidir_v1'))?.params).toEqual([7, 17, 'synthetic', '2020', 20]);
});
