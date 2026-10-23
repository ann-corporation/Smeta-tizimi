// @vitest-environment node
import { it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { NormLibraryCatalog, LIBRARY_REVISION as rev } from './norm-library';
import { resourceFacts } from '../resource-semantics';
const id = `norm-library:${rev}:R-1`;
async function fixture(corrupt = '', revision = rev, collection = 'R') {
 const w = { key: 'R-1', source_id: id, source: 14, kind: 'R', code: '1', name: 'Concrete repair', table_key: 'flat', collection_key: 'R', section_key: null, measure: '100 м2', calculation_approved: false, acceptance_status: 'REVIEW_ONLY' };
 w.collection_key=collection;
 const recipes = ['labour', 'machinist', 'machine', 'material'].map((grp, pos) => ({ norm_key: w.key, pos, res_code: '1', grp, name: 'Source name', unit: ['чел.-ч','чел.-ч','маш.-ч','т'][pos], qty: pos === 1 ? 1e-7 : pos ? pos : null }));
 const files = new Map([
 ['navigation.json', Buffer.from(JSON.stringify({ revision: rev, collections: [{ key:collection,title:'Repair' }], sections:[], tables:[{key:'flat',title:'Concrete repair',parent:collection}] }))],
 ['works.jsonl.gz', gzipSync(JSON.stringify(w)+'\r\n')],
 ['collection-000.json.gz', gzipSync(JSON.stringify({ revision:rev,key:collection,calculation_approved:false,works:[w],recipes:{[w.key]:recipes} }))]
 ]);
 const objects = [...files].map(([file,b]) => ({file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}));
 if(corrupt==='hash') files.get('works.jsonl.gz')![0]^=1;
 if(corrupt==='bytes') objects[1].bytes++;
 const manifest={schema:'norm-library-release-v1',revision,status:'REVIEW_ONLY',calculation_approved:false,counts:{works:1},objects,collection_shards:{[collection]:{...objects[2],works:1}}};
 const requests:string[]=[];
 const catalog = await NormLibraryCatalog.open(async url => {requests.push(url);const file=new URL(url,'https://local').searchParams.get('f')!;return new Response(file==='manifest.json'?JSON.stringify(manifest):files.get(file));});
 return {catalog,requests};
}
it('preserves explicit flat repair tree, revision/source identity, NULL and manual basis',async()=>{
 const {catalog:c,requests}=await fixture();
 expect(c.allWorks()[0].id).toBe(id);
 expect(c.breadcrumb(1).map(n=>n.name)).toEqual(['Repair','Concrete repair']);
 expect(c.childNodes(-1).nodes[0].workCount).toBe(1);
 expect(c.search('repair concrete',0,0).total).toBe(1);
 expect(c.searchAny(['repair','concrete'])).toHaveLength(1);
 expect(c.tableLabel(id)).toBe('Concrete repair');expect(c.unit('100 м2')).toBeNull();
 expect(()=>c.detail(id)).toThrow('NORM_SHARD_NOT_LOADED');
 await Promise.all([c.load(id),c.load(id)]);
 const d=c.detail(id);expect(d.recipes[0].norm).toBeNull(); expect(d.recipes[1].norm).toBe('0.0000001'); expect(d.recipes[0].resourceIdCode).toBe('1'); expect(d.recipes[0].candidates[0].resourceIdCode).toBe('1');
 expect(d.recipes.every(r=>r.priceCount===0&&r.prices.length===0)).toBe(true);
 expect(new Set(d.recipes.map(r=>r.candidates[0].id)).size).toBe(4);
 expect(d.recipes[0].candidates[0].id).toBe(`${id}:source:14:resource:0:1`);
 expect(d.recipes.map(r=>r.candidates[0].type)).toEqual(['NORM_LABOUR','NORM_MACHINIST','NORM_MACHINE','NORM_MATERIAL']);
 expect(d.recipes[0].candidates[0].unitCode).toBe(`norm-unit:${rev}:${encodeURIComponent('чел.-ч')}`);
 expect(d.recipes.map(r=>resourceFacts(r.candidates[0]).costCategory)).toEqual(['ЧЕЛ','МАШ','МАШ','МАТ']);
 expect(requests.filter(u=>u.includes('collection-000'))).toHaveLength(1);
 expect(requests.every(u=>u.includes(`rev=${rev}`))).toBe(true);
 await expect(c.load('1')).rejects.toThrow('WORK_NOT_FOUND');
 expect(()=>c.detail('norm-library:other:R-1')).toThrow('WORK_NOT_FOUND');
 expect(()=>c.search('',-1)).toThrow('PAGE_INVALID');
});
it.each(['hash','bytes'])('rejects compressed %s corruption',async kind=>{await expect(fixture(kind)).rejects.toThrow('NORM_INTEGRITY_FAILED');});
it('rejects mixed revision',async()=>{await expect(fixture('', 'other')).rejects.toThrow('NORM_MANIFEST_INVALID');});
it.each([['Е06','Строительные работы'],['Ц08','Монтажные работы'],['Е51','Ремонтно-строительные работы'],['У01','Пусконаладочные работы']])('groups %s under its family without changing source identity or table indexes',async(collection,title)=>{
 const {catalog:c}=await fixture('',rev,collection);
 const root=c.childNodes(-1).nodes;
 expect(root.map(n=>n.name)).toEqual([title]);
 expect(root[0].workCount).toBe(1);
 expect(c.childNodes(root[0].index).nodes.map(n=>n.index)).toEqual([0]);
 expect(c.breadcrumb(1).map(n=>n.name)).toEqual([title,'Repair','Concrete repair']);
 expect(c.search('',0,root[0].index).rows.map(w=>w.id)).toEqual([id]);
 await c.load(id); expect(c.detail(id).work.collection).toBe(collection);
});

