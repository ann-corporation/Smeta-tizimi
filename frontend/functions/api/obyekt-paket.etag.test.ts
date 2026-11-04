import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './obyekt-paket';
import { imzola } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { muhrMos } from '../_shared/obyekt-etag';

const A='W/"t2-paket-1-'+ 'a'.repeat(32)+'"';
const B='W/"t2-paket-1-'+ 'b'.repeat(32)+'"';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_KEY:'synthetic',SESSIYA_KALIT:'k'.repeat(32),OBYEKT_PAKET_ETAG:'1'};
const rights=['company.read','smeta.read','f2.read','narx.read'];
afterEach(()=>{vi.unstubAllGlobals();vakolatKeshTozala();otaKeshTozala();});
function fixture(opts: {probe?:unknown;bodyTag?:string;rights?:string[];probeStatus?:number}={}) {
  const calls:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(raw:string)=>{
    const u=new URL(String(raw)); calls.push(u.pathname+u.search);
    if(u.pathname.endsWith('/rpc/t2_men_v1'))return Response.json({ok:true,platform_role:'none',foydalanuvchi:{holat:'faol'},
      azoliklar:[{kompaniya_id:8,rol:'pto',faol:true}],context_kompaniyalar:[{kompaniya_id:8,effective_role:'pto',permissions:opts.rights??rights}]});
    if(u.pathname==='/rest/v1/t2_obyekt')return Response.json([{kompaniya_id:8}]);
    if(u.pathname.endsWith('/rpc/t2_obyekt_paket_muhr_v1'))return Response.json(opts.probe??A,{status:opts.probeStatus??200});
    if(u.pathname.endsWith('/rpc/t2_obyekt_paket_etag_v1'))return new Response('UNPARSED_PACKET_STREAM',{headers:{ETag:opts.bodyTag??B}});
    if(u.pathname.endsWith('/rpc/t2_obyekt_paket_v1'))return new Response('LEGACY_PACKET');
    throw new Error('Unexpected upstream '+u.pathname);
  }));
  return calls;
}
async function request(tag?:string,authed=true,flag='1'){
  const headers=new Headers();
  if(authed)headers.set('Cookie','sess='+await imzola({rol:'pto',foydalanuvchi_id:7,kompaniyalar:[{kompaniya_id:8,rol:'pto'}]},env.SESSIYA_KALIT));
  if(tag)headers.set('If-None-Match',tag);
  return onRequestGet({request:new Request('https://fixture/api/obyekt-paket?obyekt_id=4&p_actor_id=999',{headers}),env:{...env,OBYEKT_PAKET_ETAG:flag},data:{}} as never);
}
describe('D2 conditional GET',()=>{
  it.each([A,A.replace('W/',''),`"unknown", ${A}`,'*'])('304 faqat joriy auth/scope tekshirilgach: %s',async tag=>{
    const calls=fixture(); const r=await request(tag);
    expect(r.status).toBe(304);expect(await r.text()).toBe('');expect(r.headers.get('ETag')).toBe(A);
    expect(calls.some(x=>x.includes('paket_etag_v1'))).toBe(false);
    expect(calls.find(x=>x.includes('paket_muhr_v1'))).toContain('p_actor_id=7');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  it('miss: tananing o‘z snapshot muhrini oladi, oldingi probe muhrini emas',async()=>{
    fixture();const r=await request('W/"t2-paket-1-'+ 'c'.repeat(32)+'"');
    expect(r.status).toBe(200);expect(r.headers.get('ETag')).toBe(B);expect(await r.text()).toBe('UNPARSED_PACKET_STREAM');
  });
  it('birinchi GET probe qilmaydi, wrapper tanasi parse qilinmaydi',async()=>{
    const calls=fixture();const r=await request();expect(r.status).toBe(200);
    expect(calls.some(x=>x.includes('paket_muhr_v1'))).toBe(false);expect(await r.text()).toBe('UNPARSED_PACKET_STREAM');
  });
  it('401: conditional validator ma’lumot bermaydi',async()=>{
    const calls=fixture();const r=await request(A,false);expect(r.status).toBe(401);expect(calls).toEqual([]);expect(r.headers.has('ETag')).toBe(false);
  });
  it('403: yangi permission snapshot rad etsa muhr ham o‘qilmaydi',async()=>{
    const calls=fixture({rights:['company.read','smeta.read']});const r=await request(A);
    expect(r.status).toBe(403);expect(calls.some(x=>x.includes('paket_muhr_v1'))).toBe(false);expect(r.headers.has('ETag')).toBe(false);
  });
  it('probe xato — 304 uydirilmaydi',async()=>{
    fixture({probeStatus:500});const r=await request(A);expect(r.status).toBe(502);expect(r.headers.has('ETag')).toBe(false);
  });
  it('buzilgan probe/header fail-closed',async()=>{
    fixture({probe:'INVALID'});expect((await request(A)).status).toBe(502);
    vakolatKeshTozala();otaKeshTozala();fixture({bodyTag:'INVALID'});expect((await request()).status).toBe(502);
  });
  it('bayroq o‘chiq: eski RPC va ETag yo‘q',async()=>{
    const calls=fixture();const r=await request(A,true,'0');expect(r.status).toBe(200);expect(await r.text()).toBe('LEGACY_PACKET');
    expect(r.headers.has('ETag')).toBe(false);expect(calls.some(x=>x.includes('paket_muhr_v1'))).toBe(false);
  });
  it('noto‘g‘ri va qisman opaque tag mos emas',()=>{
    expect(muhrMos('"'+ 'a'.repeat(32)+'"',A)).toBe(false);expect(muhrMos('W/"t2-paket-1-a"',A)).toBe(false);
  });
});
