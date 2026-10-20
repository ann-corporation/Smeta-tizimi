type Env = { GAS_URL?: string; GAS_TOKEN?: string };

const MAX = 2000;
const qisqa = (v: unknown, n: number) => String(v ?? '').slice(0, n);

/**
 * Frontend xato jurnali (sessiyasiz). 2026-10-20: faqat o'z saytidan, cheklangan hajmda qabul qilinadi —
 * aks holda istalgan odam GAS jurnaliga cheksiz matn yuborib kvotani to'ldira olardi.
 */
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) {
    return Response.json({ ok: false, code: 'ORIGIN_INVALID' }, { status: 403 });
  }
  if (Number(ctx.request.headers.get('content-length') ?? 0) > 8000) return Response.json({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
  if (!ctx.env.GAS_URL || !ctx.env.GAS_TOKEN) return Response.json({ ok: false, code: 'NOT_CONFIGURED' }, { status: 503 });
  try {
    const raw = await ctx.request.text();
    if (raw.length > 8000) return Response.json({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
    const req = JSON.parse(raw) as { manba?: unknown; xabar?: unknown; url?: unknown; line?: unknown };
    await fetch(ctx.env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        __api: 1, token: ctx.env.GAS_TOKEN, fn: 'apiXatoYoz',
        args: [qisqa(req.manba || 'FRONTEND', 60), qisqa(req.xabar || 'Noma\'lum xato', MAX), 'Sayt foydalanuvchisi',
          { url: qisqa(req.url, 500), line: Number.isSafeInteger(req.line) ? req.line : null }],
      }),
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
};
