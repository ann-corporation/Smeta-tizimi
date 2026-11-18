import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {SmetaAiChat} from './SmetaAiChat';
import {emptyDoc} from '../../lib/smeta-studio/model';
import {agentRegister} from './studioAgent';
const cleanups:Array<()=>void>=[];
afterEach(()=>{cleanup();cleanups.splice(0).forEach(f=>f());vi.unstubAllGlobals();localStorage.clear();});
async function setup(actions:unknown[],command=vi.fn(()=>false)){
 vi.stubGlobal('fetch',vi.fn(async(_u,init)=>{const b=JSON.parse(String(init?.body));return Response.json(b.amal==='suhbat'?{ok:true,model:'test',javob:'Plan',savollar:[],ishlar:[],amallar:actions}:{ok:true,yozuvlar:[],superadmin:false});}));
 render(<SmetaAiChat doc={emptyDoc('test')} katalog={null} kompaniyaId={7} command={command} newId={()=>'new'}/>);
 fireEvent.change(screen.getByLabelText('Smetachiga xabar'),{target:{value:'Reja'}});fireEvent.click(screen.getByRole('button',{name:'Yuborish'}));await screen.findByRole('button',{name:'Bajarish'});return command;
}
it('failed draft batch prevents pricing and document execution',async()=>{const price=vi.fn(async()=> 'price');const docs=vi.fn(async()=> 'doc');cleanups.push(agentRegister('narxla',price),agentRegister('hujjat',docs));const cmd=await setup([{tur:'bolim',qiymat:'New'},{tur:'narxla'},{tur:'hujjat'}]);fireEvent.click(screen.getByRole('button',{name:'Bajarish'}));await waitFor(()=>expect(cmd).toHaveBeenCalledTimes(1));expect(price).not.toHaveBeenCalled();expect(docs).not.toHaveBeenCalled();expect(screen.getAllByText(/Smeta o‘zgarmadi/).length).toBeGreaterThan(0);});
it('failed stage stops dependent document and preserves unfinished proposals',async()=>{const docs=vi.fn(async()=> 'doc');cleanups.push(agentRegister('narxla',async()=>{throw Error('PRICE_SOURCE_FAILED')}),agentRegister('hujjat',docs));await setup([{tur:'narxla'},{tur:'hujjat'}]);fireEvent.click(screen.getByRole('button',{name:'Bajarish'}));await screen.findAllByText(/PRICE_SOURCE_FAILED/);expect(docs).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Bajarish'})).toBeTruthy();});
it('rapid repeated confirmation invokes the handler once',async()=>{let finish!:(value:string)=>void;const price=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));cleanups.push(agentRegister('narxla',price));await setup([{tur:'narxla'}]);const button=screen.getByRole('button',{name:'Bajarish'});fireEvent.click(button);fireEvent.click(button);expect(price).toHaveBeenCalledTimes(1);finish('Done');await screen.findByText(/Done/);});
it('missing ready works prevents dependent pricing',async()=>{const price=vi.fn(async()=> 'price');cleanups.push(agentRegister('narxla',price));await setup([{tur:'qosh'},{tur:'narxla'}]);fireEvent.click(screen.getByRole('button',{name:'Bajarish'}));await screen.findAllByText(/Ishlar to‘liq qo‘shilmadi/);expect(price).not.toHaveBeenCalled();});
