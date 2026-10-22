import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequest } from './_middleware';
import { PERMISSIONS } from '../../src/lib/company-authorization/effective-authorization';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_KEY:'server-only',SESSIYA_KALIT:'k'.repeat(32)};
const all=PERMISSIONS.filter(p=>!p.startsWith('control.global'));
async function run({denied=[],company=17,entityCompany=17,cookieRole='superadmin',platform='none',type='application/json',path='/api/sb-yoz',body={amal:'akt_tasdiqlash',akt_id:9},second=false,moduleState='on',modullarOff}:any={}) {
  vakolatKeshTozala(); // har run — yangi DB holati (60 s kesh testda bitta foydalanuvchining turli ruxsatlarini aralashtirmasin)
  const upstream:string[]=[];const next=vi.fn(async()=>Response.json({ok:true,reached:true}));
  vi.stubGlobal('fetch',vi.fn(async(raw:string)=>{
    const url=new URL(raw); upstream.push(url.pathname);
    if(url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ok:true,platform_role:platform,foydalanuvchi:{holat:'faol'},context_kompaniyalar:[{kompaniya_id:company,effective_role:platform==='superadmin'?'superadmin':'pto',permissions:all.filter(p=>!denied.includes(p)),explicit_denials:denied,...(modullarOff?{modullar_off:modullarOff}:{})},...(second?[{kompaniya_id:18,effective_role:'pto',permissions:all,explicit_denials:[]}]:[])]});
    if(url.pathname.endsWith('/rpc/t2_modul_holat_v1')) return moduleState==='unavailable' ? Response.json({ok:false},{status:503}) : Response.json({ok:true,modullar:['narx','erp','loyiha','aosr'].map(k=>({kod:'module.'+k,holat:moduleState}))});
    return Response.json([{kompaniya_id:entityCompany}]);
  }));
  const token=await imzola({rol:cookieRole,foydalanuvchi_id:7,kompaniyalar:[{kompaniya_id:17,rol:'superadmin'}]},env.SESSIYA_KALIT);
  const request=new Request('https://site'+path,{method:'POST',headers:{Cookie:'sess='+token,'Content-Type':type},body:JSON.stringify(body)});
  const data:Record<string,unknown>={};
  const response=await onRequest({request,env,data,next} as never);
  return {response,next,upstream,data};
}
afterEach(()=>vi.unstubAllGlobals());
describe('individual permission request gate',()=>{
  it('unregistered write is denied even to a platform superadmin',async()=>{
    const {response,next}=await run({platform:'superadmin',body:{amal:'unregistered_future_command',kompaniya_id:17}});
    expect(response.status).toBe(403);expect(next).not.toHaveBeenCalled();
  });
  it('module state is never fetched per request (menu-only, L0 2026-10-22); permission check unchanged',async()=>{
    const a=await run({moduleState:'off',body:{amal:'narx_belgila',kompaniya_id:17}});
    expect(a.response.status).toBe(200);expect(a.upstream.some(p=>p.endsWith('/t2_modul_holat_v1'))).toBe(false);
    expect((await run({denied:['narx.write'],body:{amal:'narx_belgila',kompaniya_id:17}})).response.status).toBe(403);
  });
  it('T4: disabled module blocks only its writes, from cached authority (no extra request)',async()=>{
    const a=await run({modullarOff:['module.narx'],body:{amal:'narx_belgila',kompaniya_id:17}});
    expect(a.response.status).toBe(403);expect(await a.response.json()).toMatchObject({code:'MODULE_DISABLED',modul:'module.narx'});
    expect(a.next).not.toHaveBeenCalled();expect(a.upstream.some(p=>p.endsWith('/t2_modul_holat_v1'))).toBe(false);
    // PTO yadrosi va o'qish modulga bog'lanmaydi.
    expect((await run({modullarOff:['module.narx','module.loyiha','module.erp']})).response.status).toBe(200);
    expect((await run({modullarOff:['module.narx'],path:'/api/sb',body:{jadval:'t2_narx',kompaniya_id:17}})).response.status).toBe(200);
    // Boshqa modul o'chirilgan — narx yozish ochiq; eski DB javobi (maydon yo'q) — cheklov yo'q.
    expect((await run({modullarOff:['module.erp'],body:{amal:'narx_belgila',kompaniya_id:17}})).response.status).toBe(200);
    expect((await run({body:{amal:'narx_belgila',kompaniya_id:17}})).response.status).toBe(200);
  });
  it('PTO denied approve is refused before domain execution despite old superadmin cookie',async()=>{
    const {response,next}=await run({denied:['f2.approve']}); expect(response.status).toBe(403);expect(next).not.toHaveBeenCalled();
  });
  it.each(['text/plain','application/json'])('changing Content-Type %s cannot hide a write command',async type=>{
    const {response,next}=await run({denied:['f2.approve'],type});expect(response.status).toBe(403);expect(next).not.toHaveBeenCalled();
  });
  it('trailing slash cannot bypass the gate',async()=>{
    expect((await run({denied:['f2.approve'],path:'/api/sb-yoz/'})).response.status).toBe(403);
  });
  it('allowed PTO reaches domain exactly once with fresh actor facts',async()=>{
    const {response,next,data}=await run();expect(response.status).toBe(200);expect(next).toHaveBeenCalledTimes(1);expect(data.roleAuthority).toMatchObject({foydalanuvchi_id:7,rol:'pto'});
  });
  it('platform superadmin cannot be downgraded by a company override',async()=>{
    const {response,next}=await run({platform:'superadmin',denied:['f2.approve']});expect(response.status).toBe(200);expect(next).toHaveBeenCalledTimes(1);
  });
  it('forged company A plus entity B cannot borrow A permission',async()=>{
    const {response,next}=await run({company:17,entityCompany:18,body:{amal:'akt_tasdiqlash',akt_id:9,kompaniya_id:17}});expect(response.status).toBe(403);expect(next).not.toHaveBeenCalled();
  });
  it('missing target never chooses a more privileged company',async()=>{
    expect((await run({second:true,denied:['narx.write'],body:{amal:'narx_belgila'}})).response.status).toBe(403);
  });
  it('cancel/approve permissions are distinct even through lifecycle aliases',async()=>{
    expect((await run({denied:['f2.cancel'],body:{amal:'akt_lifecycle_transition_v1',to_status:'cancelled',kompaniya_id:17}})).response.status).toBe(403);
    expect((await run({denied:['f2.approve'],body:{amal:'akt_lifecycle_transition_v1',to_status:'submitted',kompaniya_id:17}})).response.status).toBe(200);
    expect((await run({denied:['f2.approve'],body:{amal:'akt_lifecycle_transition_v1',holat:'approved',kompaniya_id:17}})).response.status).toBe(403);
  });
  it('universal AI cannot disclose explicitly denied company domains',async()=>{
    expect((await run({denied:['financial.read'],path:'/api/ai-savol',body:{kompaniya_id:17,savol:'pul'}})).response.status).toBe(403);
  });
  it('write-only deny does not disable read-only Jarvis, but blocks unrestricted agent execution',async()=>{
    expect((await run({denied:['f2.approve'],path:'/api/ai-savol',body:{kompaniya_id:17,savol:'holat'}})).response.status).toBe(200);
    expect((await run({denied:['f2.approve'],path:'/api/agent-ish',body:{kompaniya_id:17,amal:'harakat_qaror'}})).response.status).toBe(403);
  });
  it('membership manager is not forged from cookie role',async()=>{
    expect((await run({denied:['company.member.manage'],path:'/api/company',body:{action:'azolik_ruxsat_set',kompaniya_id:17}})).response.status).toBe(403);
  });
});
