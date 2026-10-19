import { afterEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('./ai',()=>({aiCall:m.call}));
import { aiHisobli } from './ai-hisobli';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_KEY:'fake-test',OPENROUTER_API_KEY:'fake-test'};
afterEach(()=>{vi.unstubAllGlobals();m.call.mockReset();});
function setup(deny=false){
 const fetch=vi.fn(async(url:string)=>Response.json(url.endsWith('t2_agent_muhit_v1')?{ok:true,model:'owner/gemini-3.1'}:url.endsWith('t2_agent_sarf_tekshir_v1')&&deny?{ok:false,code:'BYUDJET_TUGADI'}:{ok:true}));
 vi.stubGlobal('fetch',fetch);m.call.mockResolvedValue({text:'ok',model:'worker',provider:'openrouter',usage:{inputTokens:20,outputTokens:10,cost:0.001}});return fetch;
}
describe('Metered task routing',()=>{
 it('primary selected model survives reasoning and all calls are metered',async()=>{
  const fetch=setup();await aiHisobli(env,7,17,'smeta_ai','smeta_suhbat',{text:'x',tier:'reasoning'});
  expect(m.call.mock.calls[0][1].model).toBe('owner/gemini-3.1');
  const logs=fetch.mock.calls.filter(x=>x[0].endsWith('t2_agent_sarf_yoz_v1'));expect(logs).toHaveLength(1);
 });
 it('utility and escalated expert pass budget and usage accounting individually',async()=>{
  const fetch=setup();
  await aiHisobli(env,7,17,'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'utility'});
  await aiHisobli(env,7,17,'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'primary'});
  expect(m.call.mock.calls.map(x=>x[1].model)).toEqual(['google/gemini-2.5-flash-lite','owner/gemini-3.1']);
  expect(fetch.mock.calls.filter(x=>x[0].endsWith('t2_agent_sarf_tekshir_v1'))).toHaveLength(2);
  expect(fetch.mock.calls.filter(x=>x[0].endsWith('t2_agent_sarf_yoz_v1'))).toHaveLength(2);
 });
 it('budget denial blocks utility too',async()=>{setup(true);await expect(aiHisobli(env,7,17,'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'utility'})).rejects.toMatchObject({kod:'BYUDJET_TUGADI'});expect(m.call).not.toHaveBeenCalled();});
});
