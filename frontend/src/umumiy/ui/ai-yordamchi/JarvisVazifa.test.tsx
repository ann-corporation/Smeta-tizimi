import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {JarvisVazifa} from './JarvisVazifa';
const m=vi.hoisted(()=>({list:vi.fn(),load:vi.fn(),save:vi.fn(),plan:vi.fn()}));
vi.mock('../../../api/jarvis-vazifa',()=>({vazifaRoyxat:m.list,vazifaOl:m.load,vazifaSaqla:m.save,vazifaReja:m.plan}));
vi.mock('../../../lib/yordamchi/vosita/pto-liniya',()=>({obyektHolatMatni:()=> 'Source summary'}));
import type {JarvisTask} from '../../../lib/ai-yordamchi/vazifa';
import type {VositaApi} from '../../../lib/yordamchi/vosita/tur';
const scope={actorId:7,companyId:17,objectId:101};
beforeEach(()=>{vi.clearAllMocks();m.list.mockResolvedValue({ok:true,tasks:[]});});
it('saves before reads, completes both reads and restores from server on remount',async()=>{
 let saved:JarvisTask|undefined;
 m.save.mockImplementation(async(task:JarvisTask)=>{saved=structuredClone(task);return {ok:true,task:saved};});m.load.mockImplementation(async()=>({ok:true,task:structuredClone(saved)}));
 const read=vi.fn(async()=>{expect(saved?.steps[0].state).toBe('running');return {nom:'Project'};});
 const api={obyektHolat:read,slichitelniyHisob:async()=>({doplata:{soni:0,jami:0},snyatie:{soni:0,jami:0},sigmadi:0,nomalum:2})} as unknown as VositaApi;
 const page=render(<JarvisVazifa scope={scope} api={api}/>);fireEvent.click(screen.getByText('Obyektni tekshirish'));
 await waitFor(()=>expect(saved?.steps.every(s=>s.state==='verified')).toBe(true));expect(read).toHaveBeenCalledTimes(1);
 page.unmount();m.list.mockResolvedValue({ok:true,tasks:[saved]});render(<JarvisVazifa scope={scope} api={api}/>);await screen.findByText('Source summary');expect(read).toHaveBeenCalledTimes(1);
});
it('failed persistence prevents source reads',async()=>{
 m.save.mockResolvedValue({ok:false,error:'offline'});const read=vi.fn();render(<JarvisVazifa scope={scope} api={{obyektHolat:read} as unknown as VositaApi}/>);fireEvent.click(screen.getByText('Obyektni tekshirish'));await screen.findByText('Vazifa yakunlanmadi. Saqlangan holatdan davom ettirish mumkin.');expect(read).not.toHaveBeenCalled();
});

it('natural goal produces a plan before any task executes',async()=>{
 m.plan.mockResolvedValue({ok:true,plan:{supported:true,explanation:'Two verified reads',questions:[],steps:['object.summary','object.discrepancies']}});
 let saved:JarvisTask|undefined;m.save.mockImplementation(async(t:JarvisTask)=>{saved=structuredClone(t);return {ok:true,task:saved};});m.load.mockImplementation(async()=>({ok:true,task:structuredClone(saved)}));
 const read=vi.fn(async()=>({nom:'Project'}));const api={obyektHolat:read,slichitelniyHisob:async()=>({doplata:{soni:0,jami:0},snyatie:{soni:0,jami:0},sigmadi:0,nomalum:0})} as unknown as VositaApi;
 render(<JarvisVazifa scope={scope} api={api}/>);fireEvent.change(screen.getByLabelText('Jarvisga vazifa'),{target:{value:'Smeta va faktni solishtir'}});fireEvent.click(screen.getByText('Reja tuzish'));await screen.findByText('Two verified reads');expect(m.save).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Rejani bajarish'));await waitFor(()=>expect(saved?.steps.every(s=>s.state==='verified')).toBe(true));expect(saved?.goal).toBe('Smeta va faktni solishtir');
});
it('unsupported request never exposes execution button',async()=>{
 m.plan.mockResolvedValue({ok:true,plan:{supported:false,explanation:'Document generation is unavailable in this task',questions:[],steps:[]}});render(<JarvisVazifa scope={scope} api={{} as VositaApi}/>);fireEvent.change(screen.getByLabelText('Jarvisga vazifa'),{target:{value:'Hujjat tayyorla'}});fireEvent.click(screen.getByText('Reja tuzish'));await screen.findByText('Document generation is unavailable in this task');expect(screen.queryByText('Rejani bajarish')).toBeNull();expect(m.save).not.toHaveBeenCalled();
});
