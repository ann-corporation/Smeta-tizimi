/** Compact immutable R2 sidecar: source rule lookup; no approved calculation rules. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node build-suggestions.mjs REFERENCE_DIR NEW_OUTPUT_DIR');
if (existsSync(output)) throw new Error('OUTPUT_EXISTS');
const sha = b => createHash('sha256').update(b).digest('hex');
const sourceManifest = JSON.parse(readFileSync(join(source,'version-support-gz/manifest.json')));
const hashes = {};
function rows(name) {
  const b=readFileSync(join(source,name));
  if(sha(b)!==sourceManifest.files[name]?.sha256 || b.length!==sourceManifest.files[name]?.bytes) throw new Error('SOURCE_HASH_MISMATCH:'+name);
  hashes[name]=sha(b);return b.toString('utf8').trimEnd().split('\n').filter(Boolean).map(line=>JSON.parse(line));
}
const scopes=rows('STRUCTURED_SCOPE.jsonl'),rules=rows('COEFFICIENT_RULES.jsonl'),links=rows('COEFFICIENT_LINKS.jsonl');
const scopeMap=new Map(),ruleMap=new Map();
for(const s of scopes) {if(scopeMap.has(s.archiveOccurrenceId))throw new Error('SCOPE_ID_DUPLICATE');scopeMap.set(s.archiveOccurrenceId,s);}
for(const r of rules) {if(ruleMap.has(r.factReferenceId))throw new Error('RULE_ID_DUPLICATE');ruleMap.set(r.factReferenceId,r);}
const buckets=Array.from({length:16},()=>Object.create(null));
const unresolved=[], linkIds=new Set(); let resolved=0,associations=0;
for(const l of links) {
  if(linkIds.has(l.factReferenceId))throw new Error('LINK_ID_DUPLICATE');linkIds.add(l.factReferenceId);
  const missingRules=(l.coefficientFactReferenceIds??[]).filter(id=>!ruleMap.has(id));
  const targets=(l.workArchiveOccurrenceIds??[]).map(id=>scopeMap.get(id)).filter(s=>s && s.codeRaw===l.source.KODE && s.tableRaw===l.source.KODTAB);
  if(!targets.length || missingRules.length) unresolved.push({link:l,reason:!targets.length?'SOURCE_WORK_SCOPE_MISSING':'SOURCE_RULE_MISSING',missingRules});
  if(!targets.length)continue;
  resolved++;
  for(const s of targets) {
    const key=JSON.stringify([s.bookTypeRaw,s.collectionRaw,s.tableRaw,s.codeRaw]);
    const bucket=parseInt(sha(key).slice(0,2),16)%16;
    const list=buckets[bucket][key]??(buckets[bucket][key]=[]);
    list.push({linkId:l.factReferenceId,archiveOccurrenceId:s.archiveOccurrenceId,ruleIds:l.coefficientFactReferenceIds,
      officialEditionId:s.officialEditionId,officialSupplementIds:s.officialSupplementIds,
      status:'SOURCE_RULE_REVIEW_REQUIRED',canApply:false});associations++;
  }
}
mkdirSync(output,{recursive:true});const files={};
function emit(name,value) {
  const b=Buffer.from(JSON.stringify(value));const compressed=gzipSync(b,{level:9});
  writeFileSync(join(output,name+'.gz'),compressed);
  files[name+'.gz']={sha256:sha(b),bytes:b.length,compressedSha256:sha(compressed),compressedBytes:compressed.length};
}
for(let i=0;i<16;i++) {
  const sorted=Object.fromEntries(Object.keys(buckets[i]).sort().map(k=>[k,buckets[i][k].sort((a,b)=>a.linkId-b.linkId || a.archiveOccurrenceId-b.archiveOccurrenceId)]));
  emit(`lookup-${i.toString(16)}`,sorted);
}
emit('rules',Object.fromEntries([...ruleMap.entries()].sort((a,b)=>a[0]-b[0]).map(([id,r])=>[id,r])));
emit('unresolved-links',unresolved.sort((a,b)=>a.link.factReferenceId-b.link.factReferenceId));
const manifest={schema:'norm-suggestion-support-v1',status:'REVIEW_ONLY',sourceVersionRevision:sourceManifest.revision,
  sourceHashes:hashes,lookupKey:['bookTypeRaw','collectionRaw','tableRaw','codeRaw'],
  bucketAlgorithm:'SHA256(JSON.stringify(key)) first byte modulo16; hex suffix',
  counts:{rules:rules.length,links:links.length,scopes:scopes.length,linksWithSourceScope:resolved,associations,unresolvedLinks:unresolved.length},
  files,canExecuteCoefficients:false,officialEditionVerified:false,
  alternatives:{source:'Existing norm-catalog shards; do not duplicate corpus',status:'LEXICAL_CANDIDATES_ONLY',
    resourceHardGates:['same nonempty resource type','same nonempty unitCode'],
    workHardGates:['explicit source book type/collection/table context','confirmed compatible quantity basis'],
    automatedSubstitutionAllowed:false},
  coverage:{allSourceRulesRetained:ruleMap.size===rules.length,allSourceLinksVisited:linkIds.size===links.length},
  totalCompressedBytes:Object.values(files).reduce((a,f)=>a+f.compressedBytes,0)};
manifest.revision=sha(JSON.stringify(manifest));
writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({revision:manifest.revision,counts:manifest.counts,bytes:manifest.totalCompressedBytes,coverage:manifest.coverage}));
