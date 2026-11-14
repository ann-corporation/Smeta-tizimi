import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath, lstat, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
export function run(file,args,{cwd,input='',signal,env=process.env}={}) {
 return new Promise((ok,no)=>{
  const child=spawn(file,args,{cwd,env,signal,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',size=0;
  child.on('error',no);child.stdout.on('data',b=>{size+=b.length;if(size>2_000_000){child.kill();no(Error('OUTPUT_LIMIT'));}else stdout+=b;});
  child.stderr.on('data',b=>{if(stderr.length<20000)stderr+=b;});
  child.on('close',code=>code===0?ok(stdout):no(Object.assign(Error(`PROCESS_FAILED:${file}:${code}`),{stderr,stdout,code})));
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export async function safePath(root,path) {
 if(typeof path!=='string'||!path||path.includes('\\')||path.includes(':')||path.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('UNSAFE_PATH');
 const base=await realpath(root),target=resolve(base,path),rel=relative(base,target);
 if(rel.startsWith('..')||isAbsolute(rel))throw Error('UNSAFE_PATH');
 let at=base;for(const part of path.split('/')){at=join(at,part);try{if((await lstat(at)).isSymbolicLink())throw Error('SYMLINK_REJECTED');}catch(e){if(e.code!=='ENOENT')throw e;}}
 return target;
}
export function validatePatch(files,allowed,maxBytes=60000){
 if(!Array.isArray(files)||files.length===0||files.length>8)throw Error('INVALID_PATCH');
 const paths=new Set();let bytes=0;
 for(const f of files){if(!allowed.includes(f.path)||paths.has(f.path)||typeof f.content!=='string')throw Error('PATCH_SCOPE');paths.add(f.path);bytes+=Buffer.byteLength(f.content);}
 if(bytes>maxBytes)throw Error('PATCH_SIZE');return files;
}
export async function modelJson({entry,directory,prompt,schema,signal,model}){
 await mkdir(directory,{recursive:true});const output=join(directory,'answer.json'),schemaFile=join(directory,'schema.json');
 await rm(output,{force:true}); await writeFile(schemaFile,JSON.stringify(schema));
 const args=[entry,'exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--disable','shell_tool','--disable','multi_agent','--disable','apps','--disable','plugins','-c','web_search="disabled"','-c','project_doc_max_bytes=0','-c','model_reasoning_effort="low"','--output-schema',schemaFile,'-o',output,'-C',directory];
 if(model)args.push('-m',model);args.push('-');
 await run(process.execPath,args,{cwd:directory,input:prompt,signal});return JSON.parse(await readFile(output,'utf8'));
}
export function previewEvidence(checks,sha,project){
 const candidates=checks.filter(c=>c.name==='Cloudflare Pages'&&c.app?.slug==='cloudflare-workers-and-pages'&&c.head_sha===sha&&c.conclusion==='success').sort((a,b)=>b.id-a.id);
 for(const c of candidates){const matches=(c.output?.summary??'').match(/https:\/\/[a-f0-9]{8}\.[a-z0-9-]+\.pages\.dev/g)??[];
  for(const u of matches){const url=new URL(u);if(url.hostname.endsWith(`.${project}.pages.dev`))return {url:url.origin,checkId:c.id,headSha:sha};}}
 return null;
}
export async function fetchPreview(url,project,signal){
 if(!/^[a-z0-9-]+$/.test(project))throw Error("INVALID_PROJECT");
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||!new RegExp(`^[a-f0-9]{8}\\.${project.replaceAll('-','\\-')}\\.pages\\.dev$`).test(parsed.hostname)||parsed.port)throw Error('PREVIEW_HOST_REJECTED');
 const response=await fetch(url,{signal,redirect:'error'});if(!response.ok)throw Error('PREVIEW_HTTP_'+response.status);
 const reader=response.body?.getReader();if(!reader)throw Error('PREVIEW_BODY_MISSING');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3_000_000){await reader.cancel();throw Error('PREVIEW_SIZE_LIMIT');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const body=Buffer.concat(chunks).toString('utf8');if(!body.includes('<html')||!body.includes('id="root"'))throw Error('PREVIEW_SHELL_MISSING');
 return {sha256:createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body)};
}
export async function writePatch(root,files){for(const f of files){const target=await safePath(root,f.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,f.content);}}
