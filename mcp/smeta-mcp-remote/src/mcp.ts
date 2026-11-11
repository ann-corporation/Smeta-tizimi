/**
 * MCP endpoint (Streamable HTTP, stateless JSON): har so'rovga yangi McpServer + Muhit (lokal server bilan bir xil SDK va
 * tool kodi). OAuthProvider tokenni tekshirib `ctx.props` beradi; vakolat t2_men_v1 dan jonli olinadi.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { KORSATMA, QOIDALAR } from '../../smeta-mcp/src/korsatma';
import { olish, qidir, SECURITY_META } from './chatgpt';
import { Muhit } from '../../smeta-mcp/src/muhit';
import type { Env, Props } from './env';
import { hyperdriveHovuz } from './hovuz';
import { MASOFAVIY_TOOLLAR, masofaviyChaqir, masofaviyKirish, masofaviyTavsif } from './siyosat';
import { vakolatOl, type Vakolat } from './vakolat';

export const VERSIYA = '0.1.0';
/** So'rov tanasi chegarasi (f2_yarat 5000 qator ≈ 0,5 MB). */
export const SOROV_MAX = 1_000_000;

export const KORSATMA_MASOFAVIY = `${KORSATMA.replace(/ RPC aktori:.*$/, '')} Aktor — OAuth bilan kirgan foydalanuvchi; faqat uning kompaniyalari ko'rinadi. `
  + 'Yozuvchi toollar standart dry_run:true; haqiqiy yozish — dry_run:false + tasdiq:true (foydalanuvchi roziligidan keyin). Domen qoidalari: `smeta://qoidalar` resursi.';

export function masofaviyServer(mu: Muhit, v: Vakolat, sayt?: string): McpServer {
  const s = new McpServer({ name: 'smeta-remote', version: VERSIYA }, { instructions: KORSATMA_MASOFAVIY });
  s.registerResource('qoidalar', 'smeta://qoidalar', { title: 'Smeta tizimi domen qoidalari', description: 'NDS siz narx, ustamasiz/ustamali, asl smeta const, F2 narxi = max(smeta, xarid), dry_run/tasdiq.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: QOIDALAR }] }));
  for (const t of MASOFAVIY_TOOLLAR) {
    s.registerTool(t.nom, {
      description: masofaviyTavsif(t),
      inputSchema: masofaviyKirish(t),
      annotations: { readOnlyHint: !t.yozadi, destructiveHint: t.yozadi, openWorldHint: false },
      _meta: SECURITY_META,
    }, async (args: unknown) => masofaviyChaqir(t, mu, v, args));
  }
  // ChatGPT deep research / company knowledge: ikkita o'qish tooli (tenant doirasi mavjud toollar orqali).
  const ro = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  s.registerTool('search', {
    title: 'Qidirish', description: 'Foydalanuvchi kompaniyalaridagi obyektlarni nom bo\'yicha qidiradi (id — fetch uchun). [faqat o\'qish]',
    inputSchema: { query: z.string().min(1).max(200).describe('Obyekt nomi yoki so\'z') },
    outputSchema: { results: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })) },
    annotations: ro, _meta: SECURITY_META,
  }, async ({ query }) => qidir(query, mu, v, sayt));
  s.registerTool('fetch', {
    title: 'Olish', description: 'Obyekt holati (smeta / fakt / F2 / qoldiq bo\'limlar bo\'yicha, NDS siz): `search` natijasidagi id bo\'yicha. [faqat o\'qish]',
    inputSchema: { id: z.string().min(1).max(40).describe('search natijasidagi id («obyekt:<son>»)') },
    outputSchema: { id: z.string(), title: z.string(), text: z.string(), url: z.string(), metadata: z.record(z.string()).optional() },
    annotations: ro, _meta: SECURITY_META,
  }, async ({ id }) => olish(id, mu, v, sayt));
  return s;
}

const jsonXato = (status: number, message: string, code = -32000) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), { status, headers: { 'Content-Type': 'application/json' } });

/** Tanani chegaralangan holda o'qiydi (Content-Length yolg'on bo'lsa ham). */
export async function tanaOqi(req: Request, max = SOROV_MAX): Promise<string | null> {
  const cl = Number(req.headers.get('Content-Length') ?? '0');
  if (cl > max) return null;
  if (!req.body) return '';
  const r = req.body.getReader(); const qism: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await r.cancel().catch(() => undefined); return null; }
    qism.push(value);
  }
  const b = new Uint8Array(n); let o = 0;
  for (const q of qism) { b.set(q, o); o += q.byteLength; }
  return new TextDecoder().decode(b);
}

export type McpCtx = { props: Props; waitUntil(p: Promise<unknown>): void };

export async function mcpFetch(request: Request, env: Env, ctx: McpCtx): Promise<Response> {
  if (request.method !== 'POST') return jsonXato(405, 'Faqat POST (Streamable HTTP, stateless).');
  const props = ctx.props;
  if (!props?.foydalanuvchi_id) return jsonXato(401, 'Kirish talab qilinadi.');
  const rl = await env.MCP_RATE.limit({ key: `u:${props.foydalanuvchi_id}` });
  if (!rl.success) return jsonXato(429, 'Juda ko\'p so\'rov — bir daqiqadan so\'ng qayta urinib ko\'ring.');
  const tana = await tanaOqi(request);
  if (tana == null) return jsonXato(413, `So'rov hajmi ${SOROV_MAX} baytdan katta.`);
  const v = await vakolatOl(props, env);
  if (!v) return jsonXato(403, 'Hisob faol emas yoki vakolatni tekshirib bo\'lmadi — tizimga qayta ulaning (connector qayta avtorizatsiya).');
  const t = Number(env.SMETA_MCP_TIMEOUT_MS);
  const mu = new Muhit({ dbUrl: null, aktorId: v.foydalanuvchiId, auditFayl: null, dbRol: null, timeoutMs: Number.isFinite(t) && t > 0 ? t : 25_000, sslVerify: false },
    () => hyperdriveHovuz(env.HYPERDRIVE.connectionString));
  const server = masofaviyServer(mu, v, env.SAYT_URL);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const ichki = new Request(request.url, { method: 'POST', headers: request.headers, body: tana });
    return await transport.handleRequest(ichki);
  } finally {
    ctx.waitUntil(Promise.allSettled([transport.close(), server.close(), mu.yop()]));
  }
}
