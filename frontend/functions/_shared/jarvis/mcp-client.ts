import { SMETA_MCP_READS } from '../../../src/lib/jarvis/mcp-contract';

export type McpService = { fetch(request: Request): Promise<Response> };
type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const names: readonly string[] = SMETA_MCP_READS;
const maxBytes = 220_000;
const forbidden = new Set(['actor', 'actor_id', 'p_actor_id', 'aktor', 'kompaniya_id', 'p_kompaniya_id', 'tasdiq', 'dry_run', 'narx_override']);

/** Request-scoped client of the EXISTING stateless Smeta MCP. Never connects to a caller URL. */
export function smetaMcpClient(service: McpService | undefined, request: Request, company: number) {
  const cookie = request.headers.get('Cookie');
  if (!service || !cookie || !Number.isSafeInteger(company) || company <= 0) return undefined;
  let sequence = 0;
  async function rpc(method: string, params: RecordValue = {}): Promise<RecordValue> {
    const id = method.startsWith('notifications/') ? undefined : ++sequence;
    const signal = AbortSignal.timeout(6000);
    const response = await service!.fetch(new Request('https://smeta-mcp.internal/jarvis/mcp', {
      method: 'POST', signal, headers: { Cookie: cookie!, 'X-Jarvis-Company': String(company),
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }));
    if (id === undefined && response.status === 202) { await response.body?.cancel(); return {}; }
    if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json') || !response.body) throw new Error('MCP_UNAVAILABLE');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > maxBytes) throw new Error('MCP_RESULT_LIMIT');
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!record(body) || body.jsonrpc !== '2.0' || body.id !== id || body.error || !record(body.result)) throw new Error('MCP_PROTOCOL_ERROR');
    return body.result;
  }
  let loaded: Promise<{ tools: Tool[]; rules: string }> | undefined;
  const open = () => loaded ??= (async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'qurai-jarvis', version: '1' } });
    if (init.protocolVersion !== '2025-06-18' || !record(init.capabilities) || !record(init.capabilities.tools)) throw new Error('MCP_VERSION_ERROR');
    await rpc('notifications/initialized');
    const [list, resource] = await Promise.all([rpc('tools/list'), rpc('resources/read', { uri: 'smeta://qoidalar' })]);
    if (!Array.isArray(list.tools) || list.nextCursor != null || !Array.isArray(resource.contents)) throw new Error('MCP_DISCOVERY_ERROR');
    const tools: Tool[] = [];
    for (const t of list.tools) {
      if (!record(t) || typeof t.name !== 'string' || !names.includes(t.name)) continue;
      if (tools.some(old => old.name === t.name) || !record(t.inputSchema) || t.inputSchema.type !== 'object' ||
          !record(t.annotations) || t.annotations.readOnlyHint !== true) throw new Error('MCP_TOOL_SCHEMA');
      const properties = record(t.inputSchema.properties) ? Object.fromEntries(Object.entries(t.inputSchema.properties)
        .filter(([key]) => !forbidden.has(key))) : {};
      if (Array.isArray(t.inputSchema.required) && t.inputSchema.required.some(key => typeof key === 'string' && forbidden.has(key))) throw new Error('MCP_TOOL_SCHEMA');
      tools.push({ name: t.name, description: typeof t.description === 'string' ? t.description.slice(0, 1800) : t.name,
        inputSchema: { ...t.inputSchema, properties } });
    }
    const rules = resource.contents.filter(record).filter(r => r.uri === 'smeta://qoidalar' && typeof r.text === 'string')
      .map(r => r.text as string).join('\n');
    if (!tools.length || !rules || rules.length > 18000) throw new Error('MCP_DISCOVERY_ERROR');
    return { tools, rules };
  })();
  return { open, async call(name: string, args: unknown) {
    const { tools } = await open();
    if (!names.includes(name) || !tools.some(t => t.name === name) || !record(args) ||
        Object.keys(args).some(key => forbidden.has(key))) throw new Error('MCP_CALL_DENIED');
    const result = await rpc('tools/call', { name, arguments: args });
    if (result.isError === true || !Array.isArray(result.content)) throw new Error('MCP_TOOL_ERROR');
    const content = result.content;
    if (content.some(item => !record(item) || item.type !== 'text' || typeof item.text !== 'string')) throw new Error('MCP_CONTENT_ERROR');
    const text = content.map(item => (item as { text: string }).text).join('\n\n');
    // Never cut a number or JSON record midway and turn a partial value into evidence.
    if (!text || text.length > 24000) throw new Error('MCP_NARROW_QUERY');
    return { javob: text, dalil: { tur: 'smeta-mcp', vosita: name, kompaniya_id: company } };
  } };
}
export type JarvisMcpClient = NonNullable<ReturnType<typeof smetaMcpClient>>;
