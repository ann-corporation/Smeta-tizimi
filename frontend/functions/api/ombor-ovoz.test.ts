// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPost } from './ombor-ovoz';
import { imzola, type Sess } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_KEY:'synthetic-service',SESSIYA_KALIT:'k'.repeat(32),ELEVENLABS_API_KEY:'synthetic-provider-secret',ELEVENLABS_COMPANY_IDS:'123'};
type TestEnv=Omit<typeof env,'ELEVENLABS_API_KEY'|'ELEVENLABS_COMPANY_IDS'>&{ELEVENLABS_API_KEY?:string;ELEVENLABS_COMPANY_IDS?:string};
const session:Sess={rol:'pto',exp:Date.now()+600000,jti:'synthetic',foydalanuvchi_id:183,kompaniyalar:[{kompaniya_id:123,rol:'pto'}],permissionsByCompany:{123:['document.write']}};
const data=()=>({roleAuthority:structuredClone(session)});
afterEach(()=>{vi.unstubAllGlobals();vakolatKeshTozala();});
const request=(form?:FormData,headers:Record<string,string>={})=>new Request('https://smeta.example/api/ombor-ovoz', {method:'POST',headers,body:form});
function audio(company='123',mime='audio/webm') {const f=new FormData();f.set('kompaniya_id',company);f.set('audio',new Blob(['synthetic audio'],{type:mime}),'voice.webm');return f;}
const post=(req:Request,d:unknown=data(),e:TestEnv=env)=>onRequestPost({request:req,env:e,data:d} as never);
const get=(company='123',d:unknown=data(),e:TestEnv=env)=>onRequestGet({request:new Request('https://smeta.example/api/ombor-ovoz?kompaniya_id='+company),env:e,data:d} as never);

it('anonymous requests fail before any provider or database call',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect((await get('123',{})).status).toBe(401);expect((await post(request(audio()),{})).status).toBe(401);
  expect(f).not.toHaveBeenCalled();
});
it('foreign tenant and explicit denials cannot spend provider credits',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect((await post(request(audio('999')))).status).toBe(403);
  const denied=data();denied.roleAuthority.explicitDenialsByCompany={123:['document.write']};
  expect((await post(request(audio()),denied)).status).toBe(403);expect(f).not.toHaveBeenCalled();
});
it('a global provider secret is not automatically available to every company',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect((await post(request(audio()),data(),{...env,ELEVENLABS_COMPANY_IDS:undefined})).status).toBe(503);
  expect((await post(request(audio()),data(),{...env,ELEVENLABS_COMPANY_IDS:'999'})).status).toBe(403);
  expect((await get('123',data(),{...env,ELEVENLABS_COMPANY_IDS:'999'})).status).toBe(200);
  expect(await(await get('123',data(),{...env,ELEVENLABS_COMPANY_IDS:'999'})).json()).toMatchObject({enabled:false});
  expect(f).not.toHaveBeenCalled();
});
it('signed role alone is not current authority when the database is unavailable',async()=>{
  const cookie='sess='+await imzola({rol:'boss',foydalanuvchi_id:183,kompaniyalar:[{kompaniya_id:123,rol:'boss'}]},env.SESSIYA_KALIT);
  const f=vi.fn(async(_url:unknown)=>new Response('',{status:503}));vi.stubGlobal('fetch',f);
  const res=await post(request(audio(),{Cookie:cookie}),{});
  expect(res.status).toBe(503);expect(f).toHaveBeenCalledTimes(1);
  expect(String(f.mock.calls[0]?.[0])).toContain('/rpc/t2_men_v1');
});
it('configuration status reveals no secret and missing configuration never fabricates transcription',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);const missing={...env,ELEVENLABS_API_KEY:undefined};
  expect(await(await get('123',data(),missing)).json()).toMatchObject({ok:true,enabled:false,draft_only:true});
  const r=await post(request(audio()),data(),missing);expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ok:false,code:'VOICE_NOT_CONFIGURED'});expect(f).not.toHaveBeenCalled();
});
it('cross-origin, oversized and non-audio requests are rejected without provider calls',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect((await post(request(audio(),{Origin:'https://evil.example'}))).status).toBe(403);
  expect((await post(request(audio(),{'Content-Length':String(9*1024*1024)}))).status).toBe(413);
  expect((await post(request(audio('123','application/pdf')))).status).toBe(400);expect(f).not.toHaveBeenCalled();
});
it('transcribes through the fixed provider and returns an editable draft only',async()=>{
  let upstream:RequestInit|undefined;let target='';
  const f=vi.fn(async(url:unknown,init?:RequestInit)=>{target=String(url);upstream=init;return Response.json({text:'  50 qop sement keldi  ',language_code:'uzb',words:[{text:'50'}]});});vi.stubGlobal('fetch',f);
  const form=audio();form.set('language','uzb');form.set('actor_id','1');form.set('cloud_storage_url','https://evil.example');
  const res=await post(request(form));expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ok:true,text:'50 qop sement keldi',language:'uzb',draft_only:true});
  expect(target).toBe('https://api.elevenlabs.io/v1/speech-to-text');
  const sent=upstream!.body as FormData;expect(sent.get('model_id')).toBe('scribe_v2');expect(sent.get('language_code')).toBe('uzb');
  expect(sent.get('cloud_storage_url')).toBeNull();expect(sent.get('actor_id')).toBeNull();expect(f).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(await(await get()).json())).not.toContain(env.ELEVENLABS_API_KEY);
});
it('provider errors and silence do not leak raw provider messages or create fake records',async()=>{
  const f=vi.fn(async()=>new Response('secret raw upstream body',{status:500}));vi.stubGlobal('fetch',f);
  const bad=await post(request(audio()));expect(bad.status).toBe(502);expect(await bad.text()).not.toContain('secret');
  f.mockImplementation(async()=>Response.json({text:'  '}));
  const silence=await post(request(audio()));expect(silence.status).toBe(422);expect(await silence.json()).toMatchObject({code:'VOICE_NO_SPEECH'});
});
it('unknown-length uploads are bounded while streaming, not only by Content-Length',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);const canceled=vi.fn();
  const pull=vi.fn((c:ReadableStreamDefaultController<Uint8Array>)=>c.enqueue(new Uint8Array(1024*1024)));
  const body=new ReadableStream<Uint8Array>({pull,cancel:canceled});
  const init:RequestInit&{duplex:'half'}={method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=synthetic'},body,duplex:'half'};
  const r=await post(new Request('https://smeta.example/api/ombor-ovoz',init));
  expect(r.status).toBe(413);expect(canceled).toHaveBeenCalled();expect(pull.mock.calls.length).toBeLessThan(20);expect(f).not.toHaveBeenCalled();
});
it('large provider responses are bounded before JSON allocation',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('x'.repeat(2*1024*1024+1))));
  const r=await post(request(audio()));expect(r.status).toBe(502);
  expect(await r.json()).toEqual({ok:false,code:'VOICE_RESULT_TOO_LARGE'});
});

// Zaxira: Cloudflare Workers AI (Whisper), ElevenLabs sozlanmagan yoki kompaniya ruxsat etilmagan bo'lsa.
const ai=()=>({run:vi.fn(async(_m:string,_i:Record<string,unknown>)=>({text:'  50 qop sement keldi  '}))});
it('falls back to Workers AI Whisper when ElevenLabs is not configured or the company is not enabled',async()=>{
  for (const e of [{...env,ELEVENLABS_API_KEY:undefined,ELEVENLABS_COMPANY_IDS:undefined},{...env,ELEVENLABS_COMPANY_IDS:'999'}]) {
    const f=vi.fn();vi.stubGlobal('fetch',f);const a=ai();
    const form=audio();form.set('language','uzb');
    const res=await post(request(form),data(),{...e,AI:a} as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ok:true,text:'50 qop sement keldi',language:'uz',draft_only:true});
    expect(a.run).toHaveBeenCalledTimes(1);
    const [model,input]=a.run.mock.calls[0];
    expect(model).toBe('@cf/openai/whisper-large-v3-turbo');
    expect(input).toEqual({audio:btoa('synthetic audio'),language:'uz'});
    expect(f).not.toHaveBeenCalled(); // tashqi provayderga chiqilmaydi
  }
  expect(await(await get('123',data(),{...env,ELEVENLABS_API_KEY:undefined,AI:ai()} as never)).json()).toMatchObject({enabled:true,provider:'workers-ai'});
});
it('ElevenLabs stays preferred when configured for the company; Workers AI is not called',async()=>{
  const f=vi.fn(async()=>Response.json({text:'x',language_code:'uzb'}));vi.stubGlobal('fetch',f);const a=ai();
  const res=await post(request(audio()),data(),{...env,AI:a} as never);
  expect(res.status).toBe(200);expect(f).toHaveBeenCalledTimes(1);expect(a.run).not.toHaveBeenCalled();
});
it('Workers AI fallback keeps auth, format and error codes; no provider at all keeps the old codes',async()=>{
  const a=ai();const noEl={...env,ELEVENLABS_API_KEY:undefined,AI:a} as never;
  expect((await post(request(audio('999')),data(),noEl)).status).toBe(403);
  expect((await post(request(audio('123','application/pdf')),data(),noEl)).status).toBe(400);
  expect((await post(request(audio()),{},noEl)).status).toBe(401);
  expect(a.run).not.toHaveBeenCalled();
  const empty={run:vi.fn(async()=>({text:' '}))};
  expect((await post(request(audio()),data(),{...env,ELEVENLABS_API_KEY:undefined,AI:empty} as never)).status).toBe(422);
  const boom={run:vi.fn(async()=>{throw new Error('x');})};
  expect((await post(request(audio()),data(),{...env,ELEVENLABS_API_KEY:undefined,AI:boom} as never)).status).toBe(503);
  expect((await post(request(audio()),data(),{...env,ELEVENLABS_API_KEY:undefined})).status).toBe(503); // AI ham yo'q
});