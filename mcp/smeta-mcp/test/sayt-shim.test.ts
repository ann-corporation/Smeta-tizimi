/** sayt-shim: frontend yuklovchilarining nisbiy so'rovlari → Postgres (mock pg). Oq ro'yxat, parametrlash, to'liqlik, xatolar. */
import { afterEach, describe, expect, it } from 'vitest';
import { JADVAL_RUXSAT, RPC_RUXSAT, SHIM_BAZA, SORO_RUXSAT, jadvalSql, relativFetchQoriqchi, rpcSql, shimFetch, shimRejimda } from '../src/sayt-shim';
import { mockHovuz } from './mock';

const asl = globalThis.fetch;
afterEach(() => { globalThis.fetch = asl; });

async function ctx(javob: Parameters<typeof mockHovuz>[0]) {
  const h = mockHovuz(javob);
  const m = await h.connect();
  return { h, k: { m, aktorId: 7 } };
}
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

describe('jadvalSql', () => {
  it('oq ro\'yxat tashqarisidagi jadval rad', () => {
    expect(() => jadvalSql({ jadval: 't2_foydalanuvchi', filtrlar: [] })).toThrow(/ochiq emas/);
    expect(JADVAL_RUXSAT.has('t2_akt_qator')).toBe(true);
  });
  it('filtr/tartib/limit: qiymatlar faqat parametr, ustun/jadval nomi tekshirilgan', () => {
    const q = jadvalSql({ jadval: 't2_akt_qator', ustunlar: 'id,akt_id', filtrMatn: 'obyekt_id=eq.5&akt_id=in.(7,8)&id=gt.100', tartib: 'id.asc', limit: 10 });
    expect(q.sql).toBe('select "id", "akt_id" from public."t2_akt_qator" where "obyekt_id" = $1 and "akt_id" in ($2,$3) and "id" > $4 order by "id" asc limit 11');
    expect(q.params).toEqual(['5', '7', '8', '100']);
    expect(q.limit).toBe(10);
  });
  it('in-qiymat tirnoqli va "in" bo\'sh ro\'yxat → false', () => {
    expect(jadvalSql({ jadval: 't2_daraxt', filtrMatn: 'kod=in.("a,b","c")' }).params).toEqual(['a,b', 'c']);
    expect(jadvalSql({ jadval: 't2_daraxt', filtrMatn: 'id=in.()' }).sql).toContain('where false');
  });
  it('SQL in\'ektsiya urinishlari rad: ustun, operator, tartib', () => {
    expect(() => jadvalSql({ jadval: 't2_daraxt', filtrMatn: 'id;drop=eq.1' })).toThrow();
    expect(() => jadvalSql({ jadval: 't2_daraxt', filtrMatn: 'id=like.%a%' })).toThrow(/operator/);
    expect(jadvalSql({ jadval: 't2_daraxt', filtrMatn: 'nom=eq.100%' }).params).toEqual(['100%']);
    expect(() => jadvalSql({ jadval: 't2_daraxt', tartib: 'id.asc;drop' })).toThrow();
    expect(() => jadvalSql({ jadval: 't2_daraxt', ustunlar: 'id,(select 1)' })).toThrow();
  });
  it('t2_qator: sukut bo\'yicha faol versiya (shlyuz qoidasi); versiya:tarix va id=in. — barcha versiya', () => {
    expect(jadvalSql({ jadval: 't2_qator', filtrMatn: 'obyekt_id=eq.5' }).sql).toContain('"versiya_holat" = $2');
    expect(jadvalSql({ jadval: 't2_qator', filtrMatn: 'obyekt_id=eq.5', versiya: 'tarix' }).sql).not.toContain('versiya_holat');
    expect(jadvalSql({ jadval: 't2_qator', filtrMatn: 'id=in.(1,2)' }).sql).not.toContain('versiya_holat');
    expect(jadvalSql({ jadval: 't2_daraxt', filtrMatn: 'obyekt_id=eq.5' }).sql).not.toContain('versiya_holat');
  });
});

describe('rpcSql', () => {
  it('nomlangan argumentlar (PostgREST kabi), obyekt — JSON', () => {
    const q = rpcSql('t2_token_sarfla_v1', { p_actor_id: 7, p_meta: { a: 1 } });
    expect(q.sql).toBe('select public."t2_token_sarfla_v1"("p_actor_id" => $1, "p_meta" => $2) as r');
    expect(q.params).toEqual([7, '{"a":1}']);
    expect(() => rpcSql('x; drop', {})).toThrow();
    expect(() => rpcSql('t2_x', { 'a"b': 1 })).toThrow();
  });
});

describe('shimFetch', () => {
  it('/api/sb soro: oq ro\'yxat, p_actor_id MCP aktoridan, natija o\'ralgan', async () => {
    const { h, k } = await ctx((sql) => (sql.includes('t2_akt_reestr_obyekt_v1') ? [{ r: { ok: true, qatorlar: [{ id: 1 }] } }] : undefined));
    const r = await shimFetch(k)('/api/sb', post({ soro: 'akt_reestr_obyekt_v1', obyekt_id: 5, tur: 'f2' }));
    expect(await r.json()).toEqual({ ok: true, natija: { ok: true, qatorlar: [{ id: 1 }] } });
    const s = h.sorovlar.find((x) => x.sql.includes('t2_akt_reestr_obyekt_v1'))!;
    expect(s.sql).toContain('"p_obyekt_id" => $1, "p_actor_id" => $2, "p_tur" => $3');
    expect(s.params).toEqual([5, 7, 'f2']);
    expect(Object.keys(SORO_RUXSAT)).toContain('obyekt_nakrutka_v1');
  });
  it('/api/sb: ochiq bo\'lmagan soro va noto\'g\'ri id — xato, bazaga bormaydi', async () => {
    const { h, k } = await ctx(() => undefined);
    const f = shimFetch(k);
    expect((await (await f('/api/sb', post({ soro: 'bux_oy_v1', obyekt_id: 5 }))).json() as { ok: boolean }).ok).toBe(false);
    expect((await (await f('/api/sb', post({ soro: 'akt_podval_ol_v1', obyekt_id: 'x' }))).json() as { ok: boolean }).ok).toBe(false);
    expect(h.sorovlar.filter((x) => x.sql.includes('select public.'))).toHaveLength(0);
  });
  it('/api/sb jadval: to\'liq javob va limit oshsa toliq:false (yarim ma\'lumot to\'liq deb berilmaydi)', async () => {
    const { k } = await ctx((sql) => (sql.includes('"t2_daraxt"') ? [{ id: 1 }, { id: 2 }, { id: 3 }] : undefined));
    const f = shimFetch(k);
    const toliq = await (await f('/api/sb', post({ jadval: 't2_daraxt', filtr: 'obyekt_id=eq.5', limit: 3 }))).json() as { toliq: boolean; soni: number };
    expect([toliq.toliq, toliq.soni]).toEqual([true, 3]);
    const kesilgan = await (await f('/api/sb', post({ jadval: 't2_daraxt', filtr: 'obyekt_id=eq.5', limit: 2 }))).json() as { toliq: boolean; soni: number; jamiServerda: number | null };
    expect([kesilgan.toliq, kesilgan.soni, kesilgan.jamiServerda]).toEqual([false, 2, null]);
  });
  it('/api/tomon imzochilar va /api/kompaniya-sozlama; boshqa yo\'l 404; tashqi URL 403', async () => {
    const { k } = await ctx((sql) => (sql.includes('t2_obyekt_imzochilar_v1') ? [{ r: { ok: true, imzochilar: [] } }] : sql.includes('t2_kompaniya_sozlama_ol_v1') ? [{ r: { ok: true, sozlamalar: {} } }] : undefined));
    const f = shimFetch(k);
    expect(await (await f('/api/tomon?bolim=imzochilar&kompaniya_id=1&obyekt_id=5')).json()).toEqual({ ok: true, imzochilar: [] });
    expect((await f('/api/tomon?bolim=aloqalar&kompaniya_id=1')).status).toBe(400);
    expect(await (await f('/api/kompaniya-sozlama?kompaniya_id=1')).json()).toEqual({ ok: true, sozlamalar: {} });
    expect((await f('/api/sb-yoz', post({ amal: 'x' }))).status).toBe(404);
    expect((await f('https://example.com/x')).status).toBe(403);
  });
  it('rest/v1: faqat oq ro\'yxatdagi RPC; jadval GET massiv qaytaradi', async () => {
    const { h, k } = await ctx((sql) => (sql.includes('t2_token_sarfla_v1') ? [{ r: { ok: true, sarflandi: 3 } }] : sql.includes('"t2_token_harakat"') ? [{ operation_id: 'x' }] : undefined));
    const f = shimFetch(k);
    expect(await (await f(`${SHIM_BAZA}/rest/v1/rpc/t2_token_sarfla_v1`, post({ p_actor_id: 7 }))).json()).toEqual({ ok: true, sarflandi: 3 });
    expect((await f(`${SHIM_BAZA}/rest/v1/rpc/t2_audit_yoz`, post({}))).status).toBe(404);
    expect(await (await f(`${SHIM_BAZA}/rest/v1/t2_token_harakat?kompaniya_id=eq.1&tur=eq.qaytarish&select=operation_id&limit=1`)).json()).toEqual([{ operation_id: 'x' }]);
    expect(h.sorovlar.some((x) => x.sql.includes('SAVEPOINT sayt_shim'))).toBe(true);
    expect(RPC_RUXSAT.has('t2_disk_tizim_yoz_v1')).toBe(true);
  });
});

describe('shimRejimda / relativFetchQoriqchi', () => {
  it('ish davomida fetch shimga yo\'naladi, tugagach tiklanadi; xatoda ham; ikki ish ketma-ket', async () => {
    const { k } = await ctx(() => undefined);
    const tartib: string[] = [];
    const ish = (n: string) => shimRejimda(k, async () => { tartib.push(n + '+'); expect((await fetch('/api/yopiq')).status).toBe(404); await new Promise((o) => setTimeout(o, 5)); tartib.push(n + '-'); });
    await Promise.all([ish('a'), ish('b')]);
    expect(tartib).toEqual(['a+', 'a-', 'b+', 'b-']);
    expect(globalThis.fetch).toBe(asl);
    await expect(shimRejimda(k, async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(globalThis.fetch).toBe(asl);
  });
  it('qo\'riqchi: shimdan tashqarida nisbiy fetch — aniq xato (yozuv frontend API orqali bo\'lmaydi)', async () => {
    relativFetchQoriqchi();
    await expect(fetch('/api/sb-yoz', { method: 'POST' })).rejects.toThrow(/Node'da mavjud emas/);
  });
});
