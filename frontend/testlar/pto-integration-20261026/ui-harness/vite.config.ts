import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import baseConfig from '../../../vite.config';
import { gasRead, men, rpcResult, session, sizeTreeRows, tableRows, type HarnessRole } from './fixtures';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '../../..');
const roles = new Set<HarnessRole>(['pto', 'bugalter', 'superadmin']);
let activeRole: HarnessRole = 'pto';
let activeSizeWorks: number | null = null;
let activeMarkupMode: 'known' | 'unknown' = 'unknown';

function json(res: import('node:http').ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; if (body.length > 64 * 1024) reject(new Error('Body limit exceeded')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function filterRows(table: string, rows: unknown[], filter: string) {
  const eq = new Map([...filter.split('&')].flatMap(part => {
    const match = /^([a-z_]+)=eq\.(.+)$/.exec(part);
    return match ? [[match[1], decodeURIComponent(match[2])] as const] : [];
  }));
  if (table === 't2_obyekt_jami' && !eq.has('kompaniya_id')) return [];
  if (['t2_daraxt', 't2_qator_holat'].includes(table) && !eq.has('obyekt_id')) return [];
  return rows.filter(value => {
    const row = value as Record<string, unknown>;
    for (const [field, expected] of eq) {
      let actual = row[field];
      if (field === 'obyekt_id' && actual == null && table === 't2_obyekt_jami') actual = row.id;
      if (field === 'kompaniya_id' && actual == null && row.obyekt_id === 801) actual = 701;
      if (String(actual ?? '') !== expected) return false;
    }
    return true;
  });
}

function apiHarness(): Plugin {
  return {
    name: 'pto-synthetic-read-only-harness',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1:5194');
        if (url.pathname === '/__qa/size') {
          if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'GET only; synthetic fixture control.' });
          const requested = url.searchParams.get('works');
          if (requested === null) {
            activeSizeWorks = null;
            return json(res, 200, { ok: true, mode: 'small', works: null, rows: 6, synthetic: true });
          }
          if (!/^[1-9]\d{0,3}$|^2000$/.test(requested) || Number(requested) > 2000)
            return json(res, 400, { ok: false, error: 'Use GET /__qa/size?works=N where N is 1..2000.' });
          activeSizeWorks = Number(requested);
          return json(res, 200, { ok: true, mode: 'scaled', works: activeSizeWorks, rows: sizeTreeRows(activeSizeWorks).length, synthetic: true });
        }
        if (url.pathname === '/__qa/markup') {
          if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'GET only; synthetic fixture control.' });
          const mode = url.searchParams.get('mode');
          if (mode !== 'known' && mode !== 'unknown')
            return json(res, 400, { ok: false, error: 'Use GET /__qa/markup?mode=known|unknown.' });
          activeMarkupMode = mode;
          return json(res, 200, { ok: true, mode, synthetic: true, zero_markup_fixture: mode === 'known' });
        }
        if (url.pathname === '/__qa/role') {
          const requested = url.searchParams.get('role') as HarnessRole | null;
          if (req.method !== 'GET' || !requested || !roles.has(requested))
            return json(res, 400, { ok: false, error: 'Use GET /__qa/role?role=pto|bugalter|superadmin' });
          activeRole = requested;
          return json(res, 200, { ok: true, role: activeRole, reload: true, synthetic: true });
        }

        if (!url.pathname.startsWith('/api/')) return next();
        if (req.method !== 'GET' && req.method !== 'POST')
          return json(res, 405, { ok: false, code: 'SYNTHETIC_METHOD_DENIED', error: 'SINOV API: method denied; no backend/proxy fallback.' });

        if (url.pathname === '/api/sessiya' && req.method === 'GET') return json(res, 200, session(activeRole));
        if (url.pathname === '/api/company' && req.method === 'GET' && url.search === '?me=1') return json(res, 200, men(activeRole));
        if (url.pathname === '/api/company' && req.method === 'GET' && url.searchParams.get('authorize') === '1') {
          const companyId = Number(url.searchParams.get('kompaniya_id'));
          const member = men(activeRole).context_kompaniyalar.find(m => m.kompaniya_id === companyId);
          const permission = url.searchParams.get('permission') ?? '';
          const allowed = !!member && (activeRole === 'superadmin' || member.permissions.includes(permission as never));
          return json(res, 200, { ok: true, allowed, reason: allowed ? undefined : 'PERMISSION_DENIED', company_id: companyId, synthetic: true });
        }

        if (url.pathname === '/api/gas' && req.method === 'POST') {
          let payload: { fn?: unknown };
          try { payload = JSON.parse(await readBody(req)) as { fn?: unknown }; }
          catch { return json(res, 400, { ok: false, error: 'SINOV API: invalid JSON.' }); }
          const result = typeof payload.fn === 'string' ? gasRead(payload.fn) : null;
          if (result !== null) return json(res, 200, result);
          return json(res, 403, { ok: false, code: 'SYNTHETIC_READ_ONLY', error: `SINOV: /api/gas ${String(payload.fn)} is not an allowed read; no GAS or live fallback.` });
        }

        if (url.pathname === '/api/sb' && req.method === 'POST') {
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(await readBody(req)) as Record<string, unknown>; }
          catch { return json(res, 400, { ok: false, code: 'SYNTHETIC_BAD_REQUEST', error: 'SINOV API: invalid JSON.' }); }

          if (typeof payload.amal === 'string' || typeof payload.operatsiya === 'string')
            return json(res, 403, { ok: false, code: 'SYNTHETIC_READ_ONLY', error: 'SINOV: barcha yozish amallari o‘chirib qo‘yilgan; ma’lumot sun’iy.' });

          if (typeof payload.jadval === 'string') {
            const filter = String(payload.filtr || '');
            const rows = tableRows(payload.jadval, filter, activeSizeWorks);
            if (rows === null) return json(res, 404, { ok: false, code: 'SYNTHETIC_CONTRACT_UNHANDLED', error: `SINOV API: unhandled read table ${payload.jadval}; no live fallback.` });
            const filtered = filterRows(payload.jadval, rows, filter);
            return json(res, 200, { ok: true, qatorlar: filtered, soni: filtered.length, jamiServerda: filtered.length, toliq: true, ms: 0, synthetic: true });
          }
          if (typeof payload.soro === 'string') {
            const result = rpcResult(payload.soro, payload, activeMarkupMode);
            if (result === null) return json(res, 404, { ok: false, code: 'SYNTHETIC_CONTRACT_UNHANDLED', error: `SINOV API: unhandled read RPC ${payload.soro}; no live fallback.` });
            return json(res, 200, result);
          }
          return json(res, 400, { ok: false, code: 'SYNTHETIC_CONTRACT_UNHANDLED', error: 'SINOV API: expected a whitelisted read table or RPC; no live fallback.' });
        }

        if (req.method === 'POST') return json(res, 403, { ok: false, code: 'SYNTHETIC_READ_ONLY', error: 'SINOV: barcha yozish amallari o‘chirib qo‘yilgan; ma’lumot sun’iy.' });
        return json(res, 404, { ok: false, code: 'SYNTHETIC_API_UNHANDLED', error: `SINOV API: unhandled ${req.method} ${url.pathname}; no proxy or live fallback.` });
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const banner = '<div id="qa-synthetic-banner" role="status" style="position:fixed;z-index:2147483647;top:0;left:0;right:0;background:#8b1e1e;color:#fff;text-align:center;padding:8px 12px;font:700 14px/1.3 system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 2px 10px #0008">SINOV: SUN’IY MA’LUMOT · FAQAT O‘QISH · YOZISH O‘CHIRILGAN</div><div style="height:36px" aria-hidden="true"></div>';
        return html.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
      },
    },
  };
}

export default defineConfig(async ({ mode, command }) => {
  // Existing config's loadEnv(process.cwd()) is scoped to this empty harness directory.
  // Its GAS proxy and session stub are deliberately removed before Vite starts.
  const previousCwd = process.cwd();
  let inherited: Awaited<ReturnType<typeof baseConfig>>;
  try {
    process.chdir(here);
    inherited = await baseConfig({ mode, command, isSsrBuild: false, isPreview: false });
  } finally {
    process.chdir(previousCwd);
  }
  return {
    ...inherited,
    root: frontendRoot,
    envDir: here,
    server: { ...inherited.server, host: '127.0.0.1', port: 5194, strictPort: true, proxy: undefined },
    plugins: [...(inherited.plugins || []).filter(p => p.name !== 'gas-proxy' && p.name !== 'dev-sessiya-stub'), apiHarness()],
  };
});
