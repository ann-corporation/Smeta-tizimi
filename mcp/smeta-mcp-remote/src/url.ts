/** Protected resource URI (RFC 9728) — barqaror ommaviy URL: wrangler.toml `MCP_PUBLIC_URL` (masalan https://mcp.example.uz). */
export function resursUrl(env: { MCP_PUBLIC_URL?: string }): string {
  const u = new URL(String(env.MCP_PUBLIC_URL || '').trim());
  const lokal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !lokal) throw new Error('MCP_PUBLIC_URL https bo\'lishi kerak');
  return `${u.origin}/mcp`;
}
