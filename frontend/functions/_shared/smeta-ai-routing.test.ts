import { describe, expect, it } from 'vitest';
import { exactPriceChoice, priceLane, studioModelRequest, utilityPriceAccepted, UTILITY_MODEL } from './smeta-ai-routing';
import type { NarxSorovi, NarxTanlov } from '../../src/lib/smeta-ai/protokol';

const q = (): NarxSorovi => ({ id:'r1',nom:'Бетон B15',birlik:'м3',kat:'МАТ',nomzodlar:[{id:'n1',nom:'Бетон B15',birlik:'м3',narx:0,manba:'Katalog 2026'}] });
const t = (): NarxTanlov => ({id:'r1',tanlov:'n1',ishonch:'yuqori',sabab:'x'});
describe('Studio model duties: primary is not replaced by the utility model',()=>{
 it.each(['smeta_suhbat','smeta_ish_tanlash','smeta_koef_tanlash','smeta_kp_oqish','smeta_narx_internet'])('%s preserves selected expert',amal=>{
  expect(studioModelRequest({},'smeta_ai',amal,{text:'x',tier:'fast',workload:'utility'},'owner/gemini-3.1')).toMatchObject({model:'owner/gemini-3.1'});
 });
 it('price utility uses independent server model, planner unchanged',()=>{
  expect(studioModelRequest({},'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'utility'},'owner/expert'))
   .toMatchObject({model:UTILITY_MODEL,reasoning:{effort:'none'}});
  expect(studioModelRequest({},'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'primary'},'owner/expert').model).toBe('owner/expert');
 });
 it('a fast tier alone does not override company choice',()=>expect(studioModelRequest({},'smeta_ai','smeta_narx_tanlash',{text:'x',tier:'fast'},'owner/expert').model).toBe('owner/expert'));
 it('server utility configuration and kill switch',()=>{
  expect(studioModelRequest({OPENROUTER_MODEL_FAST:'owner/expensive'},'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'utility'},'owner/expensive').model).toBe(UTILITY_MODEL);
  expect(studioModelRequest({SMETA_AI_UTILITY_MODEL:'vendor/helper'},'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'utility'},'expert')).toMatchObject({model:'vendor/helper',reasoning:{effort:'minimal'}});
  expect(studioModelRequest({SMETA_AI_UTILITY_ENABLED:'0'},'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'utility'},'expert').model).toBe('expert');
 });
 it('explicit web model, attachment and unrelated profile are not downgraded',()=>{
  expect(studioModelRequest({},'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'utility',model:'web:online'},'expert').model).toBe('web:online');
  expect(studioModelRequest({},'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'utility',attachment:{mimeType:'application/pdf',data:'eA=='}},'expert').model).toBe('expert');
  expect(studioModelRequest({},'accountant','smeta_narx_tanlash',{text:'x',workload:'utility'},'expert').model).toBe('expert');
 });
});
describe('Conservative price gates, not AI self-confidence',()=>{
 it('one exact reference uses local identity, actual zero preserved',()=>{expect(priceLane(q())).toBe('local');expect(exactPriceChoice(q()).tanlov).toBe('n1');});
 it('only formatting normalization, not semantic guessing',()=>{const s=q();s.nom='  бетон   B15 ';expect(priceLane(s)).toBe('local');});
 it.each(['Бетон B25','Бетон B15 фракция 20','Бетон В15'])('different identity %s needs primary',name=>{const s=q();s.nomzodlar[0].nom=name;expect(priceLane(s)).toBe('primary');expect(utilityPriceAccepted(s,t())).toBe(false);});
 it.each([null,'т','100м3'])('unknown/different unit %s needs primary',unit=>{const s=q();s.nomzodlar[0].birlik=unit;expect(priceLane(s)).toBe('primary');});
 it.each(['kompaniya smetasi (obosnovaniya emas)','Смета компании',''])('source %s is not an authoritative exact reference',source=>{const s=q();s.nomzodlar[0].manba=source;expect(priceLane(s)).toBe('primary');});
 it('dimension formula needs primary even with exact names',()=>{const s=q();s.nomzodlar[0].birlikBoshqa=true;expect(priceLane(s)).toBe('primary');});
 it('competing exact references may use helper but never medium confidence',()=>{
  const s=q();s.nomzodlar.push({...s.nomzodlar[0],id:'n2'});expect(priceLane(s)).toBe('utility');
  expect(utilityPriceAccepted(s,t())).toBe(true);
  expect(utilityPriceAccepted(s,{...t(),ishonch:'orta'})).toBe(false);
  expect(utilityPriceAccepted(s,{...t(),tanlov:'invented'})).toBe(false);
  expect(utilityPriceAccepted(s,{...t(),qayta_hisob:{ifoda:'999',izoh:'x'}})).toBe(false);
 });
 it('different price/supplier priority stays with expert despite exact product names',()=>{const s=q();s.nomzodlar.push({...s.nomzodlar[0],id:'n2',narx:20});expect(priceLane(s)).toBe('primary');expect(utilityPriceAccepted(s,t())).toBe(false);});
 it('without profile choice the explicit primary uses reasoning tier, not cheap fast default',()=>expect(studioModelRequest({OPENROUTER_MODEL_REASONING:'owner/strong'},'smeta_ai','smeta_narx_tanlash',{text:'x',workload:'primary',tier:'fast'})).toMatchObject({tier:'reasoning'}));
 it('empty catalogue permits search phrases only, never a fictional price',()=>{
  const s=q();s.nomzodlar=[];expect(priceLane(s)).toBe('utility');
  expect(utilityPriceAccepted(s,{...t(),tanlov:null,qidiruv:['Бетон B15']})).toBe(true);
  expect(utilityPriceAccepted(s,t())).toBe(false);expect(utilityPriceAccepted(s,{...t(),tanlov:null})).toBe(false);
 });
 it('unsafe local gate cannot be invoked directly',()=>{const s=q();s.nomzodlar=[];expect(()=>exactPriceChoice(s)).toThrow('EXACT_PRICE_GATE_REQUIRED');});
});
