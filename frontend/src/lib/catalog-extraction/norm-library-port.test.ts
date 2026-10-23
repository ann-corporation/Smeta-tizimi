// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { imzola } from '../../../functions/_shared/auth';
import { normLibraryKey, onRequestGet } from '../../../functions/api/norm-library';

const REV = '66bb1a23bd18c63006d447b5';
const PREFIX = `norm-library/review-releases/${REV}`;
const SECRET = 'norm-library-test-session-secret';

async function request(query: string, cookie?: string, object: object | null = null) {
  const get = vi.fn().mockResolvedValue(object);
  const response = await onRequestGet({
    request: new Request(`https://example.test/api/norm-library?${query}`, {
      headers: cookie ? { Cookie: cookie } : {},
    }),
    env: { SESSIYA_KALIT: SECRET, R2_CANONICAL: { get } },
  } as Parameters<typeof onRequestGet>[0]);
  return { response, get };
}

async function session() {
  return `sess=${await imzola({ rol: 'pto' }, SECRET)}`;
}

describe('norm library pinned key', () => {
  it('allows exactly the release filenames with omitted or exact revision', () => {
    const files = ['manifest.json', 'navigation.json', 'works.jsonl.gz', 'coefficient-rules.json',
      ...Array.from({ length: 112 }, (_, i) => `collection-${String(i).padStart(3, '0')}.json.gz`)];
    for (const f of files) {
      expect(normLibraryKey(null, f)).toBe(`${PREFIX}/${f}`);
      expect(normLibraryKey(REV, f)).toBe(`${PREFIX}/${f}`);
    }
  });

  it.each([null, '', 'current', 'CURRENT.json', 'audit.json', '../manifest.json',
    '/manifest.json', 'x/manifest.json', 'x\\manifest.json', '%2e%2e%2fmanifest.json',
    'manifest.json\n', 'manifest.json\0', 'collection-112.json.gz', 'collection-999.json.gz',
    'collection-00.json.gz', 'collection-0000.json.gz', 'collection-000.json', 'works.json'])
  ('rejects filename %j', f => {
    expect(normLibraryKey(null, f)).toBeNull();
  });

  it.each(['', 'active', 'current', REV.toUpperCase(), `${REV}\n`, `../${REV}`, '0'.repeat(24)])
  ('rejects revision %j', rev => {
    expect(normLibraryKey(rev, 'manifest.json')).toBeNull();
  });
});

describe('norm library authenticated R2 port', () => {
  it.each([undefined, 'sess=forged.invalid'])('rejects unauthenticated cookie %j before R2', async cookie => {
    const { response, get } = await request('f=manifest.json', cookie);
    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it.each(['f=../manifest.json', 'f=current', 'rev=active&f=manifest.json',
    `rev=${REV}&rev=active&f=manifest.json`, 'f=manifest.json&f=audit.json'])
  ('rejects invalid selectors before R2: %s', async query => {
    const { response, get } = await request(query, await session());
    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('returns 404 for an absent pinned object', async () => {
    const { response, get } = await request('f=manifest.json', await session());
    expect(response.status).toBe(404);
    expect(get).toHaveBeenCalledExactlyOnceWith(`${PREFIX}/manifest.json`);
  });

  it.each(['works.jsonl.gz', 'collection-000.json.gz', 'collection-111.json.gz'])
  ('preserves raw compressed bytes despite R2 gzip metadata: %s', async f => {
    const bytes = gzipSync('{"test":true}\n');
    const body = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    const { response, get } = await request(`rev=${REV}&f=${f}`, await session(), {
      body, httpMetadata: { contentEncoding: 'gzip', contentType: 'application/json' },
    });
    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledExactlyOnceWith(`${PREFIX}/${f}`);
    expect(response.body).toBe(body);
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.has('Content-Encoding')).toBe(false);
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(response.headers.get('Cache-Control')).toContain('no-transform');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
  });

  it.each(['manifest.json', 'navigation.json', 'coefficient-rules.json'])
  ('serves plain JSON: %s', async f => {
    const { response } = await request(`f=${f}`, await session(), { body: '{"status":"REVIEW_ONLY"}' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.has('Content-Encoding')).toBe(false);
    expect(await response.json()).toEqual({ status: 'REVIEW_ONLY' });
  });
});
