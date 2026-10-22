import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { emptyDoc, type Occurrence } from '../../lib/smeta-studio/model';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { agentChaqir } from './studioAgent';
import { KoeffitsientlarPaneli } from './StudioKoeffitsientlar';
vi.mock('../../lib/smeta-studio/koef-katalog', async () => {
 const actual = await vi.importActual<typeof import('../../lib/smeta-studio/koef-katalog')>('../../lib/smeta-studio/koef-katalog');
 return { ...actual, koefKatalogi: async () => ({ schema:'koef-katalog-v1',manba:'Construct',jadval:{'1-1-1':['K-8']},koef:{'K-8':{a:'ABC ТНҚ',t:'Construct',s:'TNQ PTO-UZ',q:'',k:{ЧЕЛ:1.2},op:'MUL'}} }) };
});
it('work-bound suggestion applies in one click without accepting before the click or exposing raw provenance', async () => {
 const doc=emptyDoc('test');
 doc.occurrences.o={ id:'o',sectionId:'s',source:{catalogRevision:'test',workId:'n',code:'E1-1-1-1',name:'TEST WORK',unitCode:'m3',tableLabel:null},quantity:'1',basis:{scale:'1',unitLabel:'m3',evidence:'TEST',origin:'OBSERVED'},recipe:[],overrides:{} } as Occurrence;
 const command=vi.fn((_c: StudioCommand)=>true);
 const view=render(<KoeffitsientlarPaneli doc={doc} command={command} workId="o" sourceLabel={()=>'Smeta tizimi · ШНҚ 4.02.01 asosida'} />);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Qo‘llash'})).toBeTruthy());
 expect(command).not.toHaveBeenCalled();
 expect(view.container.textContent).not.toMatch(/ABC|АВС|\bTN|ТНҚ|Construct|PTO-UZ/);
 fireEvent.click(screen.getByRole('button',{name:'Qo‘llash'}));
 expect(command).toHaveBeenCalledTimes(1);
 expect(command.mock.calls[0][0]).toMatchObject({type:'SET_COEFFICIENTS',occurrenceId:'o',coefficients:[{accepted:true,value:'1.2',scope:'ЧЕЛ'}]});
});

it('confirmed AI action uses the same command as one-click manual apply',async()=>{
 const doc=emptyDoc('test');doc.rootOrder=['s'];doc.sections.s={id:'s',parentId:null,name:'TEST',children:[],items:['o']};
 doc.occurrences.o={id:'o',sectionId:'s',source:{catalogRevision:'test',workId:'n',code:'E1-1-1-1',name:'TEST',unitCode:'m3',tableLabel:null},quantity:'1',basis:{scale:'1',unitLabel:'m3',evidence:'TEST',origin:'OBSERVED'},recipe:[],overrides:{}};
 const command=vi.fn((_c:StudioCommand)=>true);
 const view=render(<><KoeffitsientlarPaneli doc={doc} command={command} agentOnly/><KoeffitsientlarPaneli doc={doc} command={command} workId="o"/></>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Qo‘llash'})).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'Qo‘llash'}));const manual=command.mock.calls[0][0];command.mockClear();
 await agentChaqir('koef_qolla',{tur:'koef_qolla',ish:'[i1]',qiymat:'K-8',manba:'TEST CONFIRMED CONDITION',izoh:'TEST'},()=>{});
 const ai=command.mock.calls[0][0];expect(ai.type).toBe(manual.type);
 if(ai.type==='SET_COEFFICIENTS' && manual.type==='SET_COEFFICIENTS'){
  expect(ai.occurrenceId).toBe(manual.occurrenceId);expect(ai.coefficients.map(x=>[x.id,x.scope,x.value,x.accepted])).toEqual(manual.coefficients.map(x=>[x.id,x.scope,x.value,x.accepted]));
 }
 expect(view.container.textContent).not.toMatch(/ABC|АВС|\bTN|ТНҚ|Construct|PTO-UZ/);
});
