import { beforeEach, expect, it, vi } from 'vitest';
import { smetaMcpClient, type McpService } from './mcp-client';

const schema = { type: 'object', additionalProperties: false, properties: { obyekt_id: { type: 'integer' } } };
let calls: Array<{ method: string; params: Record<string, unknown>; request: Request }>;
let change: (method: string, value: Record<string, unknown>) => Record<string, unknown>;
const service: McpService = { fetch: vi.fn(async request => {
  const { id, method, params } = await request.json() as { id?: number; method: string; params: Record<string, unknown> };
  calls.push({ method, params, request });
  if (method === 'notifications/initialized') return new Response(null, { status: 202 });
  const result = method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} } }
    : method === 'tools/list' ? { tools: [
      { name: 'fakt_jurnal', inputSchema: schema, annotations: { readOnlyHint: true } },
      { name: 'sql_oqish', inputSchema: schema, annotations: { readOnlyHint: true } },
      { name: 'fakt_yoz', inputSchema: schema, annotations: { readOnlyHint: false } },
    ] } : method === 'resources/read' ? { contents: [{ uri: 'smeta://qoidalar', text: 'NULL != 0. Minus hajm saqlanadi.' }] }
    : { content: [{ type: 'text', text: 'Sinov: −3 m³; narx noma’lum; ma’lum narx 0.' }] };
  return Response.json({ jsonrpc: '2.0', id, result: change(method, result) });
}) };
const request = () => new Request('https://app.example/api/agent-ish', { headers: { Cookie: 'sess=synthetic',
  Authorization: 'Bearer must-not-forward', 'X-Jarvis-Company': '999' } });
beforeEach(() => { calls = []; change = (_method, value) => value; vi.clearAllMocks(); });

it('uses existing MCP discovery/resource/call with original session and server company, keeping source values', async () => {
  const client = smetaMcpClient(service, request(), 902)!;
  const found = await client.open();
  expect(found.tools.map(tool => tool.name)).toEqual(['fakt_jurnal']);
  expect(found.rules).toContain('NULL != 0');
  const reply = await client.call('fakt_jurnal', { obyekt_id: 903 });
  expect(reply.javob).toBe('Sinov: −3 m³; narx noma’lum; ma’lum narx 0.');
  expect(reply.dalil).toEqual({ tur: 'smeta-mcp', vosita: 'fakt_jurnal', kompaniya_id: 902 });
  expect(calls.map(c => c.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'resources/read', 'tools/call']);
  for (const c of calls) {
    expect(c.request.url).toBe('https://smeta-mcp.internal/jarvis/mcp');
    expect(c.request.headers.get('Cookie')).toBe('sess=synthetic');
    expect(c.request.headers.get('X-Jarvis-Company')).toBe('902');
    expect(c.request.headers.has('Authorization')).toBe(false);
  }
});
it.each(['sql_oqish', 'fakt_yoz', 'f2_tasdiq', 'aktor_tanla', 'missing'])('never calls disallowed operation %s', async name => {
  await expect(smetaMcpClient(service, request(), 902)!.call(name, {})).rejects.toThrow('MCP_CALL_DENIED');
  expect(calls.some(c => c.method === 'tools/call')).toBe(false);
});
it.each(['actor_id', 'p_actor_id', 'kompaniya_id', 'tasdiq', 'dry_run', 'narx_override'])('blocks context/write override %s', async key => {
  await expect(smetaMcpClient(service, request(), 902)!.call('fakt_jurnal', { [key]: 999 })).rejects.toThrow();
  expect(calls.some(c => c.method === 'tools/call')).toBe(false);
});
it('has no anonymous, unconfigured or cross-request shared client state', async () => {
  expect(smetaMcpClient(undefined, request(), 902)).toBeUndefined();
  expect(smetaMcpClient(service, new Request('https://app.example'), 902)).toBeUndefined();
  expect(smetaMcpClient(service, request(), -1)).toBeUndefined();
  await smetaMcpClient(service, request(), 902)!.open();
  await smetaMcpClient(service, request(), 904)!.open();
  expect(calls.filter(c => c.method === 'tools/list')).toHaveLength(2);
  expect(calls.at(-1)!.request.headers.get('X-Jarvis-Company')).toBe('904');
});
it.each(['duplicate', 'writable', 'pagination', 'missing_rules'])('fails closed on broken discovery %s', async variant => {
  change = (method, value) => {
    if (method === 'tools/list' && variant === 'duplicate') return { tools: [value.tools as unknown[]].flatMap(t => [t[0], t[0]]) };
    if (method === 'tools/list' && variant === 'writable') return { tools: [{ name: 'fakt_jurnal', inputSchema: schema, annotations: { readOnlyHint: false } }] };
    if (method === 'tools/list' && variant === 'pagination') return { ...value, nextCursor: 'more' };
    if (method === 'resources/read' && variant === 'missing_rules') return { contents: [] };
    return value;
  };
  await expect(smetaMcpClient(service, request(), 902)!.open()).rejects.toThrow();
});
it('keeps a too-large source unknown rather than cutting a number, and never retries a failed call', async () => {
  change = (method, value) => method === 'tools/call' ? { content: [{ type: 'text', text: '1'.repeat(24001) }] } : value;
  await expect(smetaMcpClient(service, request(), 902)!.call('fakt_jurnal', {})).rejects.toThrow('MCP_NARROW_QUERY');
  expect(calls.filter(c => c.method === 'tools/call')).toHaveLength(1);
});
it('does not expose remote error bodies as source evidence', async () => {
  change = (method, value) => method === 'tools/call' ? { isError: true, content: [{ type: 'text', text: 'untrusted failure' }] } : value;
  await expect(smetaMcpClient(service, request(), 902)!.call('fakt_jurnal', {})).rejects.toThrow('MCP_TOOL_ERROR');
});
it('rejects a different protocol before discovering tools', async () => {
  change = (method, value) => method === 'initialize' ? { ...value, protocolVersion: 'unsupported' } : value;
  await expect(smetaMcpClient(service, request(), 902)!.open()).rejects.toThrow('MCP_VERSION_ERROR');
  expect(calls.map(c => c.method)).toEqual(['initialize']);
});
it.each(['wrong_id', 'oversized'])('rejects invalid transport response %s', async kind => {
  vi.mocked(service.fetch).mockResolvedValueOnce(kind === 'wrong_id'
    ? Response.json({ jsonrpc: '2.0', id: 999, result: {} })
    : new Response('x'.repeat(220001), { headers: { 'Content-Type': 'application/json' } }));
  await expect(smetaMcpClient(service, request(), 902)!.open()).rejects.toThrow();
});
it('bounds a late tool call by the absolute deadline even when the service ignores abort', async () => {
  vi.useFakeTimers();
  try {
    const client = smetaMcpClient(service, request(), 902, Date.now() + 45000)!;
    await client.open(); await vi.advanceTimersByTimeAsync(44999);
    let signal: AbortSignal | undefined;
    vi.mocked(service.fetch).mockImplementationOnce(r => { signal = r.signal; return new Promise(() => undefined); });
    const failed = expect(client.call('fakt_jurnal', {})).rejects.toThrow('MCP_DEADLINE');
    await vi.advanceTimersByTimeAsync(1); await failed;
    expect(signal?.aborted).toBe(true);
    const count = vi.mocked(service.fetch).mock.calls.length;
    await expect(client.call('fakt_jurnal', {})).rejects.toThrow('MCP_DEADLINE');
    expect(service.fetch).toHaveBeenCalledTimes(count);
  } finally { vi.useRealTimers(); }
});
it('also bounds stalled response bodies and cancels the source stream', async () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    vi.mocked(service.fetch).mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    const failed = expect(smetaMcpClient(service, request(), 902, Date.now() + 10)!.open()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10); await failed;
    expect(cancel).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
it('disposes a response that arrives after an ignored cancellation', async () => {
  vi.useFakeTimers();
  try {
    let release: (response: Response) => void = () => undefined;
    vi.mocked(service.fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
    const failed = expect(smetaMcpClient(service, request(), 902, Date.now() + 10)!.open()).rejects.toThrow('MCP_DEADLINE');
    await vi.advanceTimersByTimeAsync(10); await failed;
    const cancel = vi.fn(); release(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
