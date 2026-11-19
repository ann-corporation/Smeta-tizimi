import { tekshir, type Sess } from '../_shared/auth';
import { cachedAuthority, yopiqModul } from '../_shared/permission-policy';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { telemetriyaYoz } from '../_shared/ai-telemetriya';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; ELEVENLABS_API_KEY?: string; ELEVENLABS_COMPANY_IDS?: string; AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> } };
type Context = Parameters<PagesFunction<Env>>[0];
const MAX_BODY = 8 * 1024 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, {status,headers:{'Cache-Control':'no-store'}});
const fail = (code: string, status: number) => json({ok:false,code},status);
function providerScope(env:Env,kid:number):Response|null {
  if(!env.ELEVENLABS_API_KEY)return fail('VOICE_NOT_CONFIGURED',503);
  const ids=env.ELEVENLABS_COMPANY_IDS?.trim();
  if(!ids||!/^\d+(\s*,\s*\d+)*$/.test(ids))return fail('VOICE_SCOPE_NOT_CONFIGURED',503);
  return ids.split(',').some(id=>Number(id)===kid)?null:fail('VOICE_COMPANY_NOT_ENABLED',403);
}

async function actor(ctx: Context): Promise<Sess | Response> {
  const cached = cachedAuthority(ctx);
  if (cached) return cached;
  if (!ctx.env.SESSIYA_KALIT) return fail('VOICE_CONFIG_UNAVAILABLE',503);
  let signed:Sess|null;
  try {signed = await tekshir(ctx.request.headers.get('Cookie'),ctx.env.SESSIYA_KALIT);}
  catch {return fail('AUTHORITY_UNAVAILABLE',503);}
  if (!signed) return fail('AUTH_REQUIRED',401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return fail('AUTHORITY_UNAVAILABLE',503);
  const current = await roleAuthority(signed,ctx.env);
  if (!current && sessiyaYaroqsizmi(signed)) return yaroqsizSessiyaJavob();
  return current ?? fail('AUTHORITY_UNAVAILABLE',503);
}

function access(session: Sess, kid: number): Response | null {
  if (!Number.isSafeInteger(kid) || kid<=0) return fail('COMPANY_REQUIRED',400);
  if (!session.foydalanuvchi_id || !session.permissionsByCompany) return fail('AUTHORITY_UNAVAILABLE',503);
  /* Omborchi (warehouse.write) ham ovoz bilan ishlay oladi; aniq rad etilgan ruxsat ustun. */
  const perm=['document.write','warehouse.write'].find(p=>session.permissionsByCompany?.[kid]?.includes(p)&&!session.explicitDenialsByCompany?.[kid]?.includes(p));
  if (!session.kompaniyalar?.some(c=>c.kompaniya_id===kid) || !perm) return fail('PERMISSION_DENIED',403);
  if (yopiqModul(perm,[kid],session.modullarOffByCompany)) return fail('MODULE_DISABLED',403);
  return null;
}

/** Bound unknown-length multipart bodies before formData allocates them. */
async function multipart(req: Request): Promise<FormData | Response> {
  if (!/multipart\/form-data\s*;/i.test(req.headers.get('Content-Type')??'')) return fail('AUDIO_FORM_REQUIRED',400);
  const length = Number(req.headers.get('Content-Length'));
  if (length>MAX_BODY) return fail('AUDIO_TOO_LARGE',413);
  if (!req.body) return fail('AUDIO_REQUIRED',400);
  const reader=req.body.getReader(); const chunks:Uint8Array[]=[]; let total=0;
  try {
    for (;;) {
      const next=await reader.read(); if(next.done)break;
      total+=next.value.byteLength;
      if(total>MAX_BODY){await reader.cancel();return fail('AUDIO_TOO_LARGE',413);}
      chunks.push(next.value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  try {return await new Request(req.url,{method:'POST',headers:req.headers,body:bytes.buffer}).formData();}
  catch {return fail('AUDIO_FORM_REQUIRED',400);}
}

/** Native apps (mobil BFF carries JSON only): { kompaniya_id, language, mime, audio_b64 } becomes the same FormData as the web multipart upload. */
export async function jsonForm(req: Request): Promise<FormData | Response> {
  const text=await req.text();
  if(text.length>Math.ceil(MAX_BODY*4/3)+512)return fail('AUDIO_TOO_LARGE',413);
  let o:Record<string,unknown>;
  try {o=JSON.parse(text) as Record<string,unknown>;}catch{return fail('AUDIO_FORM_REQUIRED',400);}
  if(typeof o.audio_b64!=='string'||!o.audio_b64)return fail('AUDIO_REQUIRED',400);
  const type=String(o.mime??'').split(';')[0].trim().toLowerCase();
  let bytes:Uint8Array;
  try {bytes=Uint8Array.from(atob(o.audio_b64.replace(/\s+/g,'')),c=>c.charCodeAt(0));}catch{return fail('AUDIO_INVALID',400);}
  const form=new FormData();
  form.set('kompaniya_id',String(o.kompaniya_id??''));form.set('language',String(o.language??'auto'));
  form.set('audio',new Blob([bytes],{type}),'audio');
  return form;
}

export const onRequestGet: PagesFunction<Env> = async ctx => {
  const session=await actor(ctx);if(session instanceof Response)return session;
  const denied=access(session,Number(new URL(ctx.request.url).searchParams.get('kompaniya_id')));
  return denied ?? json({ok:true,enabled:providerScope(ctx.env,Number(new URL(ctx.request.url).searchParams.get('kompaniya_id')))===null||!!ctx.env.AI,provider:providerScope(ctx.env,Number(new URL(ctx.request.url).searchParams.get('kompaniya_id')))===null?'elevenlabs':'workers-ai',draft_only:true});
};

type Meta = { actor?: number; kid?: number; model?: string };

/** STT telemetriyasi (faqat sonlar/kodlar; audio va matn yozilmaydi): ruxsatdan o'tgan so'rovlar uchun kechikish + ok/xato kodi. */
export const onRequestPost: PagesFunction<Env> = async ctx => {
  const t0=Date.now();const meta:Meta={};
  const res=await ovozPost(ctx,meta);
  if(meta.kid){
    let kod:string|null=null;
    if(!res.ok){try{kod=String((await res.clone().json() as {code?:unknown}).code??'')||null;}catch{kod=null;}}
    const yoz=telemetriyaYoz(ctx.env,{actor:meta.actor,kompaniyaId:meta.kid,yuza:'ombor_ovoz',model:meta.model,kechikishMs:Date.now()-t0,ok:res.ok,xatoKod:kod??`HTTP_${res.status}`,niyat:'stt',manba:'model'});
    if(typeof ctx.waitUntil==='function')ctx.waitUntil(yoz);else await yoz;
  }
  return res;
};

async function ovozPost(ctx: Context, meta: Meta): Promise<Response> {
  const origin=ctx.request.headers.get('Origin');
  if(ctx.request.headers.get('Sec-Fetch-Site')==='cross-site'||(origin&&origin!==new URL(ctx.request.url).origin))return fail('ORIGIN_INVALID',403);
  const session=await actor(ctx);if(session instanceof Response)return session;
  let form:FormData|Response;
  try {form=/application\/json/i.test(ctx.request.headers.get('Content-Type')??'')?await jsonForm(ctx.request):await multipart(ctx.request);}catch{return fail('AUDIO_FORM_REQUIRED',400);}
  if(form instanceof Response)return form;
  const denied=access(session,Number(form.get('kompaniya_id')));if(denied)return denied;
  // ElevenLabs sozlangan va kompaniya ruxsat etilgan bo'lsa — u; aks holda Cloudflare Workers AI (Whisper); ikkalasi yo'q bo'lsa — eski xato kodi.
  const scope=providerScope(ctx.env,Number(form.get('kompaniya_id')));if(scope&&!ctx.env.AI)return scope;
  meta.actor=Number(session.foydalanuvchi_id);meta.kid=Number(form.get('kompaniya_id'));meta.model=scope?'whisper-large-v3-turbo':'elevenlabs-scribe_v2';
  const audio:unknown=form.get('audio');
  if(!(audio instanceof Blob)||audio.size===0)return fail('AUDIO_REQUIRED',400);
  if(audio.size>MAX_BODY)return fail('AUDIO_TOO_LARGE',413);
  if(!/^audio\/(?:webm|ogg|mp4|mpeg|wav|x-wav|aac|flac)(?:;|$)/i.test(audio.type))return fail('AUDIO_FORMAT_UNSUPPORTED',400);
  const language=String(form.get('language')??'auto');
  if(!['auto','uzb','rus','eng'].includes(language))return fail('LANGUAGE_INVALID',400);
  if(scope)return whisper(ctx,audio,language);
  const upload=new FormData();upload.set('file',audio,'ombor-audio');upload.set('model_id','scribe_v2');
  upload.set('tag_audio_events','false');upload.set('diarize','false');
  if(language!=='auto')upload.set('language_code',language);
  try {
    // Provider transcription only: this endpoint never creates stock, expenses or payments.
    const r=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{
      method:'POST',headers:{'xi-api-key':ctx.env.ELEVENLABS_API_KEY!},body:upload,
      signal:AbortSignal.any([ctx.request.signal,AbortSignal.timeout(60_000)]),
    });
    if(!r.ok){await r.body?.cancel();return fail(r.status===429?'VOICE_BUSY':'VOICE_PROVIDER_ERROR',r.status===429?503:502);}
    if(!r.body)return fail('VOICE_PROVIDER_ERROR',502);
    const reader=r.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
      if(size>2*1024*1024){await reader.cancel();return fail('VOICE_RESULT_TOO_LARGE',502);}chunks.push(next.value);
    }}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
    const result=JSON.parse(new TextDecoder().decode(bytes)) as {text?:unknown;language_code?:unknown};
    if(typeof result.text!=='string'||!result.text.trim())return fail('VOICE_NO_SPEECH',422);
    if(result.text.length>60_000)return fail('VOICE_RESULT_TOO_LARGE',502);
    return json({ok:true,text:result.text.trim(),language:typeof result.language_code==='string'?result.language_code.slice(0,8):null,draft_only:true});
  } catch {return fail(ctx.request.signal.aborted?'VOICE_CANCELED':'VOICE_UNAVAILABLE',ctx.request.signal.aborted?499:503);}
}

/** Zaxira STT: Cloudflare Workers AI (kalitsiz binding). Kirish: base64 audio + til ishorasi; chiqish — faqat matn (hech narsa yozilmaydi). */
async function whisper(ctx: Context, audio: Blob, language: string): Promise<Response> {
  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const hint: Record<string, string> = { uzb: 'uz', rus: 'ru', eng: 'en' };
    const out = await ctx.env.AI!.run('@cf/openai/whisper-large-v3-turbo', { audio: btoa(bin), ...(hint[language] ? { language: hint[language] } : {}) }) as { text?: unknown } | null;
    const text = typeof out?.text === 'string' ? out.text.trim() : '';
    if (!text) return fail('VOICE_NO_SPEECH', 422);
    if (text.length > 60_000) return fail('VOICE_RESULT_TOO_LARGE', 502);
    return json({ ok: true, text, language: hint[language] ?? null, draft_only: true });
  } catch { return fail(ctx.request.signal.aborted ? 'VOICE_CANCELED' : 'VOICE_UNAVAILABLE', ctx.request.signal.aborted ? 499 : 503); }
}