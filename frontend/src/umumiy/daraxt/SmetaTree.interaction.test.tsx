import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {TreeNode} from '../../api/types';
vi.mock('@tanstack/react-virtual',()=>({useVirtualizer:({count}:any)=>({getTotalSize:()=>count*36,getVirtualItems:()=>Array.from({length:count},(_,index)=>({index,start:index*36,size:36,key:index}))})}));
vi.mock('../ui/QatorTahrirModal',()=>({QatorTahrirModal:()=>null}));
import {SmetaTree} from './SmetaTree';
const data=[{id:1,type:'rz',nom:'Razdel A',smeta:150,stFakt:50,stF2:30,stOst:100,children:[{id:2,type:'bl',nom:'Ish A',smetaHajm:3,fakt:1,f2ol:0,children:[]}]}] as unknown as TreeNode[];
afterEach(cleanup);
describe('intentional estimate row details',()=>{
 it('selects/expands normally without opening an overlay; details need an explicit action',()=>{
  render(<SmetaTree data={data}/>);fireEvent.click(screen.getByText('Razdel A'));
  expect(screen.queryByLabelText('Qator tafsilotlari')).toBeNull();expect(screen.getByText('Ish A')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button',{name:'Qator tafsilotlarini ochish'})[0]);
  const drawer=screen.getByLabelText('Qator tafsilotlari');expect(within(drawer).getByText('Smeta summasi')).toBeTruthy();expect(within(drawer).queryByText('Smeta hajmi')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Qator tafsilotlarini yopish'}));expect(screen.queryByLabelText('Qator tafsilotlari')).toBeNull();
 });
 it('LRV only opens the dedicated Fakt editor, while that editor retains its canonical save port',()=>{
  const open=vi.fn();render(<SmetaTree data={data} onFaktOpen={open}/>);
  fireEvent.click(screen.getByText('Razdel A'));fireEvent.click(screen.getAllByRole('button',{name:'Qator tafsilotlarini ochish'})[1]);
  fireEvent.click(screen.getByRole('tab',{name:'Fakt'}));expect(screen.queryByRole('button',{name:'Faktni saqlash'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Fakt kiritish oynasini ochish'}));expect(open).toHaveBeenCalledOnce();
 });
 it('removes the mismatched extra heading row for every preset',()=>{
  render(<SmetaTree data={data}/>);expect(screen.queryByText('QIYMATLAR')).toBeNull();
  fireEvent.change(screen.getByLabelText('Ustun preset'),{target:{value:'F2'}});expect(screen.queryByText('Sm. Vol')).toBeNull();expect(screen.getByText('F2 Vol')).toBeTruthy();
 });
});
