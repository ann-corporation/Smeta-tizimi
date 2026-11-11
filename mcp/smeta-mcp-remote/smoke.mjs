// Lokal smoke (faqat o'qish, tokensiz): `npx wrangler dev` ishlab turganda `node smoke.mjs [url]`.
// Tekshiradi: /health, OAuth discovery, dinamik ro'yxat endpointi bor, /mcp tokensiz 401 (anonim kirish yo'q).
// Hech qanday tool chaqirmaydi va hech narsa yozmaydi. Standart url — http://localhost:8787.
const baza = (process.argv[2] || 'http://localhost:8787').replace(/\/$/, '');
let xato = 0;
const tek = (nom, shart, izoh = '') => { console.log(`${shart ? 'OK  ' : 'XATO'} ${nom}${izoh ? ' — ' + izoh : ''}`); if (!shart) xato++; };

const h = await fetch(`${baza}/health`);
tek('/health', h.ok, String(h.status));

const as = await fetch(`${baza}/.well-known/oauth-authorization-server`);
const asj = as.ok ? await as.json() : {};
tek('oauth-authorization-server', as.ok && !!asj.authorization_endpoint && !!asj.token_endpoint, String(as.status));
tek('dinamik mijoz ro\'yxati (registration_endpoint)', !!asj.registration_endpoint);
tek('PKCE S256', Array.isArray(asj.code_challenge_methods_supported) && asj.code_challenge_methods_supported.includes('S256'));

const pr = await fetch(`${baza}/.well-known/oauth-protected-resource/mcp`);
tek('oauth-protected-resource', pr.ok, String(pr.status));

const m = await fetch(`${baza}/mcp`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
});
tek('/mcp tokensiz → 401', m.status === 401, String(m.status));
tek('WWW-Authenticate (resource_metadata)', /resource_metadata/i.test(m.headers.get('WWW-Authenticate') || ''));

const a = await fetch(`${baza}/authorize?response_type=code&client_id=yoq&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&code_challenge=x&code_challenge_method=S256`);
tek('/authorize noma\'lum client_id → 4xx', a.status >= 400 && a.status < 500, String(a.status));

process.exit(xato ? 1 : 0);
