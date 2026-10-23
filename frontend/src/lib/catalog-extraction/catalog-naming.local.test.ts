// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {RemoteNormCatalog} from './norm-remote';
import {NormLibraryCatalog} from './norm-library';

const root=process.env.NORM_LIBRARY_FIXTURE_ROOT;
describe.skipIf(!root)('complete named hierarchy from actual source libraries',()=>{
 it('has no blank or code-only nodes and preserves every work and parent',async()=>{
  const audit=resolve(root!,'..');
  const raw=async(file:string)=>{const b=await readFile(resolve(audit,file));return b[0]===31&&b[1]===139?gunzipSync(b):b;};
  const legacy=await RemoteNormCatalog.open(async url=>{
   const f=new URL(url,'https://local').searchParams.get('f');
   if(f==='current')return Response.json({revision:'feaaa9e06cb91f03'});
   return new Response(new Uint8Array(await raw(f==='manifest.json'?'R2_runtime_manifest.json':f==='tree.json'?'R2_runtime_tree.bin':'R2_runtime_works.bin')));
  });
  const current=await NormLibraryCatalog.open(async url=>new Response(new Uint8Array(await readFile(resolve(root!,new URL(url,'https://local').searchParams.get('f')!)))));
  expect(legacy.allWorks()).toHaveLength(54013);expect(current.allWorks()).toHaveLength(48083);
  const roots=current.childNodes(-1).nodes;
  expect(roots.map(n=>n.name)).toEqual(['Строительные работы','Монтажные работы','Ремонтно-строительные работы','Пусконаладочные работы']);
  expect(roots.reduce((sum,n)=>sum+n.workCount,0)).toBe(48083);
  const tables=new Map(current.nodes.map((n,i)=>[n[4],i] as const).filter(([key])=>key!=null));
  for(const work of current.allWorks()){
   const path=current.breadcrumb(tables.get(work.tableCode)!);
   expect(current.nodes[path[1].index][0]).toBe(`norm-library:66bb1a23bd18c63006d447b5:${work.collection}`);
   const family=work.collection?.startsWith('У')?'Пусконаладочные работы':work.collection?.startsWith('Ц')?'Монтажные работы':Number(work.collection?.slice(1))>=51?'Ремонтно-строительные работы':'Строительные работы';
   expect(path[0].name).toBe(family);
  }
  const report=[];
  for(const [source,catalog] of [['feaaa9e06cb91f03',legacy],['66bb1a23bd18c63006d447b5',current]] as const){
   const names=catalog.nodes.map((_,index)=>catalog.node(index));
   expect(names.filter(n=>!n.name.trim())).toEqual([]);
   expect(names.filter(n=>/^[A-Za-zА-ЯЁа-яё]{0,3}\d+(?:[-./]\d+)*$/.test(n.name))).toEqual([]);
   expect(names.filter(n=>/без названия|unnamed|nomsiz|nomi yo.q/i.test(n.name))).toEqual([]);
   expect(catalog.allWorks().filter(w=>!w.name?.trim())).toEqual([]);
   report.push({source,works:catalog.allWorks().length,nodes:catalog.nodes.length,blank:0,code_only:0,
    editorial:names.filter(n=>n.labelOrigin==='EDITORIAL').length,
    tree:catalog.nodes.map((n,index)=>({id:n[0],parent:n[1],name:n[2],workCount:n[3],tableKey:n[4],sourceLinkStatus:n[5],labelOrigin:catalog.node(index).labelOrigin??'SOURCE'}))});
  }
  const original=JSON.parse((await raw('R2_runtime_tree.bin')).toString()).nodes as unknown[][];
  expect(legacy.nodes.map(n=>[n[0],n[1],n[3],n[4],n[5]])).toEqual(original.map(n=>[n[0],n[1],n[3],n[4],n[5]]));
  expect(current.collectionTitle('Е40')).toBe('Е40 · Опоры, настилы, ограждения и конструкции коллекторов');
  if(process.env.NORM_NAMING_REPORT)await writeFile(process.env.NORM_NAMING_REPORT,JSON.stringify({schema:'named-catalog-navigation-view-v1',source_values_changed:false,libraries:report},null,2)+'\n');
 },120_000);
});
