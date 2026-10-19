import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),ai:vi.fn(),Xato:class extends Error{}}));
vi.mock('../_shared/auth',()=>({tekshir:m.auth}));
vi.mock('../_shared/ai-hisobli',()=>({aiHisobli:m.ai,AiByudjetXatosi:m.Xato}));
import { onRequestPost, narxSorovlariniTayyorla } from './smeta-ai';
import type { NarxSorovi } from '../../src/lib/smeta-ai/protokol';
type Result = { tanlovlar: Array<{id:string;tanlov:string|null}>; routing:{local:number;utility:number;primary:number;escalated:number} };
const body = async (r: Response) => await r.json() as Result;
const row=(id='r1'):NarxSorovi=>({id,nom:'Бетон B15',birlik:'м3',kat:'МАТ',nomzodlar:[{id:'n1',nom:'Бетон B15',birlik:'м3',narx:0,manba:'Katalog 2026'}]});
const run=(rows:unknown,kid=17,extra:Record<string,unknown>={},env:Record<string,string>={})=>onRequestPost({request:new Request('https://test/api/smeta-ai',{method:'POST',body:JSON.stringify({amal:'narx_tanla',kompaniya_id:kid,sorovlar:rows,...extra})}),env:{SESSIYA_KALIT:'test',...env}} as never);
const answer=(id:string,confidence='yuqori')=>({provider:'openrouter',model:'test-model',text:JSON.stringify({tanlovlar:[{id,tanlov:'n1',ishonch:confidence,sabab:'x'}]})});
beforeEach(()=>{m.auth.mockResolvedValue({foydalanuvchi_id:7,kompaniyalar:[{kompaniya_id:17}]});m.ai.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
describe('Price route integration',()=>{
 it('exact reference requires no model, even zero; browser cannot force model',async()=>{
  const r=await run([row()],17,{model:'attacker/expensive',workload:'primary'});const j=await r.json();
  expect(j).toMatchObject({ok:true,model:'local',routing:{local:1,utility:0,primary:0},tanlovlar:[{id:'r1',tanlov:'n1'}]});expect(m.ai).not.toHaveBeenCalled();
 });
 it('different grade goes directly to primary, not cheap then expert',async()=>{
  const q=row();q.nomzodlar[0].nom='Бетон B25';m.ai.mockResolvedValue(answer('r1'));
  await run([q]);expect(m.ai).toHaveBeenCalledTimes(1);expect(m.ai.mock.calls[0][5].workload).toBe('primary');
 });
 it('helper medium confidence escalates only that subset and preserves input order',async()=>{
  const local=row('local'),help=row('helper');help.nomzodlar.push({...help.nomzodlar[0],id:'n2'});
  m.ai.mockResolvedValueOnce(answer('helper','orta')).mockResolvedValueOnce(answer('helper'));
  const j=await body(await run([help,local]));expect(m.ai.mock.calls.map(x=>x[5].workload)).toEqual(['utility','primary']);
  expect(m.ai.mock.calls[1][5].text).not.toContain('"local"');
  expect(j.tanlovlar.map((x:{id:string})=>x.id)).toEqual(['helper','local']);expect(j.routing).toMatchObject({local:1,utility:1,primary:1,escalated:1});
 });
 it('helper high confidence on all-exact references avoids primary call',async()=>{
  const q=row();q.nomzodlar.push({...q.nomzodlar[0],id:'n2'});m.ai.mockResolvedValue(answer('r1'));
  const j=await body(await run([q]));expect(m.ai).toHaveBeenCalledTimes(1);expect(j.routing.primary).toBe(0);
 });
 it('missing/forged candidate is not silently accepted, even high confidence',async()=>{
  const q=row();q.nomzodlar.push({...q.nomzodlar[0],id:'n2'});
  m.ai.mockResolvedValueOnce({...answer('r1'),text:'{"tanlovlar":[{"id":"r1","tanlov":"forged","ishonch":"yuqori"}]}'}).mockResolvedValueOnce(answer('r1'));
  const j=await body(await run([q]));expect(j.routing.escalated).toBe(1);expect(j.tanlovlar[0].tanlov).toBe('n1');
 });
 it('helper may propose search terms when the catalogue is empty, not a price',async()=>{
  const q=row();q.nomzodlar=[];m.ai.mockResolvedValue({...answer('r1'),text:'{"tanlovlar":[{"id":"r1","tanlov":null,"qidiruv":["Бетон B15"]}]}'});
  const j=await body(await run([q]));expect(j.routing.primary).toBe(0);expect(j.tanlovlar[0].tanlov).toBeNull();
 });
 it('company isolation is checked before local bypass too',async()=>{expect((await run([row()],99)).status).toBe(403);expect(m.ai).not.toHaveBeenCalled();});
 it('kill switch restores expert-only path',async()=>{m.ai.mockResolvedValue(answer('r1'));const j=await body(await run([row()],17,{}, {SMETA_AI_UTILITY_ENABLED:'0'}));expect(j.routing.local).toBe(0);expect(m.ai.mock.calls[0][5].workload).toBe('primary');});
 it('duplicate source and candidate IDs are rejected before a model call',async()=>{
  expect((await run([null])).status).toBe(400);
  expect((await run([row(),row()])).status).toBe(400);const q=row();q.nomzodlar.push({...q.nomzodlar[0]});expect((await run([q])).status).toBe(400);expect(m.ai).not.toHaveBeenCalled();
 });
 it.each([null,'',false])('unknown price %s is not a free zero-priced match',async price=>{
  const q=row();(q.nomzodlar[0] as unknown as {narx:unknown}).narx=price;m.ai.mockResolvedValue({...answer('r1'),text:'{"tanlovlar":[{"id":"r1","tanlov":null,"qidiruv":["Бетон"]}]}'});
  const j=await body(await run([q]));expect(j.routing.local).toBe(0);expect(j.tanlovlar[0].tanlov).toBeNull();
 });
 it.each(['truncated','malformed','unavailable'])('one failed helper (%s) goes directly to expert, no helper repair loop',async kind=>{
  const q=row();q.nomzodlar.push({...q.nomzodlar[0],id:'n2'});
  if(kind==='unavailable')m.ai.mockRejectedValueOnce(new Error('provider unavailable'));
  else m.ai.mockResolvedValueOnce({...answer('r1'),...(kind==='truncated'?{finishReason:'length'}:{text:'not-json'})});
  m.ai.mockResolvedValueOnce(answer('r1'));
  const j=await body(await run([q]));expect(m.ai.mock.calls.map(x=>x[5].workload)).toEqual(['utility','primary']);expect(j.routing.escalated).toBe(1);
 });
 it('oversized source cannot become an apparently exact local match after clipping',async()=>{
  const q=row();q.nom='A'.repeat(300);q.nomzodlar[0].nom=q.nom+' B25';m.ai.mockResolvedValue(answer('r1'));
  const j=await body(await run([q]));expect(j.routing.local).toBe(0);expect(j.routing.primary).toBe(1);
 });
 it('more than 15 candidates do not become a falsely unique local source after slicing',()=>{
  const q=row();q.nomzodlar=Array.from({length:16},(_,i)=>({...q.nomzodlar[0],id:'n'+i}));expect(narxSorovlariniTayyorla([q])?.[0].sourceComplete).toBe(false);
 });
 it('helper budget denial stops before expert, no escape through escalation',async()=>{
  const q=row();q.nomzodlar.push({...q.nomzodlar[0],id:'n2'});m.ai.mockRejectedValueOnce(new m.Xato('wallet denied'));
  expect((await run([q])).status).not.toBe(200);expect(m.ai).toHaveBeenCalledTimes(1);
 });
 it('40 exact references cost zero model calls, responses remain one-to-one',async()=>{
  const rows=Array.from({length:40},(_,i)=>row('r'+i));const j=await body(await run(rows));expect(j.routing.local).toBe(40);expect(j.tanlovlar).toHaveLength(40);expect(m.ai).not.toHaveBeenCalled();
 });
});
