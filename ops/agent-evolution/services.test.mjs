import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePatch, safePath, previewEvidence, fetchPreview } from './services.mjs';
import { createAdapters } from './github-pages-adapters.mjs';
test('patch scope, duplicates and byte budget are enforced',()=>{
 assert.throws(()=>validatePatch([{path:'secrets',content:'x'}],['a']),/PATCH_SCOPE/);
 assert.throws(()=>validatePatch([{path:'a',content:'x'},{path:'a',content:'y'}],['a']),/PATCH_SCOPE/);
 assert.throws(()=>validatePatch([{path:'a',content:'abc'}],['a'],2),/PATCH_SIZE/);
 assert.equal(validatePatch([{path:'a',content:'x'}],['a']).length,1);
});
test('path traversal and symlink writes are rejected',async t=>{
 const root=await mkdtemp(join(tmpdir(),'evolution-path-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const p of ['../x','/x','a\\b','C:x','a//b'])await assert.rejects(safePath(root,p),/UNSAFE_PATH/);
 await mkdir(join(root,'real'));await symlink(join(root,'real'),join(root,'link'),'junction');
 await assert.rejects(safePath(root,'link/x'),/SYMLINK_REJECTED/);
});
test('preview proof requires exact SHA, provider and project',()=>{
 const sha='a'.repeat(40),c={id:1,name:'Cloudflare Pages',app:{slug:'cloudflare-workers-and-pages'},head_sha:sha,conclusion:'success',output:{summary:'https://1234abcd.smeta-tizimi.pages.dev'}};
 assert.equal(previewEvidence([c],sha,'smeta-tizimi').checkId,1);
 assert.equal(previewEvidence([c],'b'.repeat(40),'smeta-tizimi'),null);
 assert.equal(previewEvidence([c],sha,'other'),null);
 assert.equal(previewEvidence([{...c,app:{slug:'fake'}}],sha,'smeta-tizimi'),null);
});
test('smoke refuses arbitrary hosts before sending requests',async()=>{
 for(const url of ['http://1234abcd.smeta-tizimi.pages.dev','https://example.com','https://user:pw@1234abcd.smeta-tizimi.pages.dev'])await assert.rejects(fetchPreview(url,'smeta-tizimi'),/PREVIEW_HOST_REJECTED/);
});
test('service scope cannot include frontend, credentials or workflows',()=>{
 for(const path of ['.env','.github/workflows/a.yml','frontend/src/a.mjs'])assert.throws(()=>createAdapters({repo:'a/b',project:'p',sourceFiles:[path]}),/SOURCE_SCOPE_REQUIRED/);
});

test('smoke bounds streamed response and verifies shell',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>new Response('<html><div id="root"></div></html>');
 const evidence=await fetchPreview('https://1234abcd.smeta-tizimi.pages.dev','smeta-tizimi');assert.equal(evidence.sha256.length,64);
 globalThis.fetch=async()=>new Response('x'.repeat(3_000_001));
 await assert.rejects(fetchPreview('https://1234abcd.smeta-tizimi.pages.dev','smeta-tizimi'),/PREVIEW_SIZE_LIMIT/);
});
