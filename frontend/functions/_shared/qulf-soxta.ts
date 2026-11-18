/** Test yordamchisi: soxta PostgREST (t2_qulf_* jadvallari + RPC), JSON orqali aylanadi -- supabaseStore'ni haqiqiy kod yo'lida sinash uchun. Productionda ishlatilmaydi. */
type Row = Record<string, unknown>;

export function soxtaSupabase() {
  const qator = new Map<number, Row>();
  const log: string[] = [];
  const fn = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(String(input));
    const yol = u.pathname.replace('/rest/v1/', '');
    const body = init.body ? JSON.parse(String(init.body)) as Row : {};
    const R = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    log.push(`${init.method ?? 'GET'} ${yol}`);
    if (yol === 't2_qulf_foydalanuvchi') {
      if ((init.method ?? 'GET') === 'GET') {
        const id = Number(/eq\.(\d+)/.exec(u.search)?.[1]);
        const r = qator.get(id);
        return R(r ? [{ yaratildi: 'x', ...r }] : []);
      }
      if (init.method === 'POST') { // upsert (merge-duplicates)
        const id = Number(body.foydalanuvchi_id);
        qator.set(id, { xato_soni: 0, jami_xato: 0, bloklangan_gacha: null, qayta_kirish_vaqti: null, bosh_vaqt_daq: 10, ...(qator.get(id) ?? {}), ...body });
        return new Response(null, { status: 201 });
      }
      if (init.method === 'PATCH') { const id = Number(/eq\.(\d+)/.exec(u.search)?.[1]); qator.set(id, { ...(qator.get(id) ?? {}), ...body }); return new Response(null, { status: 204 }); }
    }
    if (yol === 't2_qulf_kalit') return R([]);
    if (yol === 'rpc/t2_qulf_talab_v1') { const r = qator.get(Number(body.p_foydalanuvchi_id)); return R({ rejim: 'pin', pin: !!r?.pin_hash, kalit: false, talab: !!r?.pin_hash }); }
    if (yol === 'rpc/t2_qulf_urinish_v1') {
      const id = Number(body.p_foydalanuvchi_id); const r = qator.get(id);
      if (!r) return R({ ok: false, code: 'PIN_YOQ' });
      if (body.p_ok) { qator.set(id, { ...r, xato_soni: 0, jami_xato: 0, bloklangan_gacha: null }); return R({ ok: true }); }
      let xs = Number(r.xato_soni) + 1; let bg = r.bloklangan_gacha as string | null;
      if (xs >= 5) { bg = new Date(Date.now() + 15 * 60_000).toISOString(); xs = 0; }
      qator.set(id, { ...r, xato_soni: xs, jami_xato: Number(r.jami_xato) + 1, bloklangan_gacha: bg });
      return R({ ok: false, code: bg ? 'BLOKLANGAN' : 'PIN_NOTOGRI' });
    }
    return R([]);
  };
  return { fn, qator, log };
}
