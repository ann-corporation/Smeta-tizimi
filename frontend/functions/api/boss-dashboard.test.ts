import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:{foydalanuvchi_id:42} as any}));
vi.mock('../_shared/auth',()=>({tekshir:async()=>m.session}));
import {onRequestGet} from './boss-dashboard';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_KEY:'test-service',SESSIYA_KALIT:'test'};
function request(id='17'){return onRequestGet({request:new Request('https://example.test/api/boss-dashboard?kompaniya_id='+id),env} as any);}
beforeEach(()=>{m.session={foydalanuvchi_id:42};});afterEach(()=>vi.unstubAllGlobals());
it('requires authenticated session before touching upstream',async()=>{m.session=null;const f=vi.fn();vi.stubGlobal('fetch',f);expect((await request()).status).toBe(401);expect(f).not.toHaveBeenCalled();});
it.each(['-1','1.5','0','NaN'])('rejects invalid company %s',async id=>{const f=vi.fn();vi.stubGlobal('fetch',f);expect((await request(id)).status).toBe(400);expect(f).not.toHaveBeenCalled();});
it('uses named read RPC with session actor, never arbitrary RPC input',async()=>{const f=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',f);expect((await request()).status).toBe(200);expect(f.mock.calls[0][0]).toContain('/rest/v1/rpc/t2_boss_decision_v1');expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({p_kompaniya_id:17,p_actor_id:42});});
it('falls back only when new RPC is absent',async()=>{const f=vi.fn().mockResolvedValueOnce(Response.json({code:'PGRST202'},{status:404})).mockResolvedValueOnce(Response.json({ok:true}));vi.stubGlobal('fetch',f);expect((await request()).status).toBe(200);expect(f.mock.calls[1][0]).toContain('/rest/v1/rpc/t2_boss_dashboard_v1');});
it('never falls back on membership failure',async()=>{const f=vi.fn().mockResolvedValue(Response.json({code:'42501',message:'actor membership denied'},{status:403}));vi.stubGlobal('fetch',f);expect((await request()).status).not.toBe(200);expect(f).toHaveBeenCalledTimes(1);});

it('rejects an oversized upstream snapshot and prevents caching tenant financials',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('x'.repeat(4*1024*1024+1))));expect((await request()).status).toBe(500);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ok:true})));expect((await request()).headers.get('Cache-Control')).toBe('no-store');});
