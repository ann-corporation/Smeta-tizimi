import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola, type Rol } from '../_shared/auth';
import { onRequestPost } from './sb-yoz';
const env = { SUPABASE_URL:'https://test.supabase.co', SUPABASE_KEY:'test-key', SESSIYA_KALIT:'k'.repeat(32) };
const op = '11111111-1111-4111-8111-111111111111';
async function run(role: string, cookieRole: Rol, targetCompany = 17, approve = false) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const url = new URL(String(raw)); calls.push(url.pathname);
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok:true, platform_role:role==='superadmin'?'superadmin':'none',foydalanuvchi:{holat:'faol'},context_kompaniyalar:[{kompaniya_id:17,effective_role:role}] });
    if (url.pathname.endsWith('/rpc/t2_actor_kompaniya_azo_tekshir')) return Response.json(role);
    if (url.pathname === '/rest/v1/t2_qator' || url.pathname === '/rest/v1/t2_akt') return Response.json([{id:9,kompaniya_id:targetCompany}]);
    if (url.pathname.startsWith('/rest/v1/rpc/')) return Response.json({ok:true});
    throw new Error('Unexpected upstream '+url.pathname);
  }));
  const token = await imzola({ rol:cookieRole,foydalanuvchi_id:7,kompaniyalar:[{kompaniya_id:999,rol:'superadmin'}]},env.SESSIYA_KALIT);
  const body = approve ? {amal:'akt_tasdiqlash',akt_id:9,kutilgan_versiya:1,operation_id:op} : {amal:'qator_tahrir',qator_id:9,maydon:'hajm',qiymat:'1.25',kutilgan_versiya:1};
  const res = await onRequestPost({request:new Request('https://test/api/sb-yoz',{method:'POST',headers:{Cookie:'sess='+token},body:JSON.stringify(body)}),env} as never);
  return {res,calls};
}
afterEach(()=>vi.unstubAllGlobals());
describe('native write gateway uses current target role, not login cookie',()=>{
  it('boss can write despite an old rahbar cookie',async()=>{
    const {res,calls}=await run('boss','rahbar'); expect(res.status).toBe(200); expect(calls).toContain('/rest/v1/rpc/t2_qator_tahrir');
  });
  it.each(['rahbar','kuzatuvchi','buyurtmachi','pudratchi'])('current %s cannot write by row ID despite a superadmin cookie',async role=>{
    const {res,calls}=await run(role,'superadmin'); expect(res.status).toBe(403); expect(calls).not.toContain('/rest/v1/rpc/t2_qator_tahrir');
  });
  it('forged cross-company entity ID is refused',async()=>{
    const {res,calls}=await run('boss','superadmin',18); expect(res.status).toBe(403); expect(calls).not.toContain('/rest/v1/rpc/t2_qator_tahrir');
  });
  it('boss can reach canonical F2 approval (no historical mutation / alternate route)',async()=>{
    const {res,calls}=await run('boss','boss',17,true); expect(res.status).toBe(200); expect(calls).toContain('/rest/v1/rpc/t2_akt_tasdiqlash');
  });
});
