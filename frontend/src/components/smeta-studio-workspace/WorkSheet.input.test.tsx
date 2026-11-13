import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { WorkSheet } from './WorkSheet';
import { emptyDoc } from '../../lib/smeta-studio/model';
import { applyCommand, type StudioCommand } from '../../lib/smeta-studio/commands';
import { calcDoc } from '../../lib/smeta-studio/calc';
vi.mock('../../i18n/til',()=>({t:(s:string,p?:Record<string,string|number>)=>p?s.replace(/\{(\w+)\}/g,(_,k:string)=>String(p[k])):s}));
afterEach(cleanup);
function fixture(count=2) {
 let doc=applyCommand(emptyDoc('keyboard'),{type:'ADD_SECTION',sectionId:'s',parentId:null,name:'Qurilish'});
 for(let i=0;i<count;i++)doc=applyCommand(doc,{type:'ADD_OCCURRENCE',occurrenceId:`w${i}`,sectionId:'s',source:{catalogRevision:'r',workId:`w${i}`,code:`E${i}`,name:'Бетон',unitCode:'M3',tableLabel:null},recipe:[],basis:{scale:'1',unitLabel:'m3',origin:'OBSERVED',evidence:'synthetic'},quantity:null});
 return doc;
}
function mount(initial=fixture(),reject=false) {
 const calls=vi.fn();let current=initial;
 function Harness(){const [doc,setDoc]=useState(initial);return <WorkSheet doc={doc} calculation={calcDoc(doc)} command={(c:StudioCommand)=>{calls(c);if(reject)return false;current=applyCommand(current,c);setDoc(current);return true;}} onWork={()=>{}} renderDetails={()=>null}/>;}
 render(<Harness/>);return {calls,doc:()=>current};
}
it('finds Cyrillic work names and Latin section names with the other alphabet',()=>{
 mount();const search=screen.getByLabelText('Jadvaldan qidirish');
 fireEvent.change(search,{target:{value:'beton'}});expect(screen.getByLabelText('Hajm: E0')).toBeTruthy();
 fireEvent.change(search,{target:{value:'қурилиш'}});expect(screen.getByLabelText('Hajm: E1')).toBeTruthy();
});
it('Enter commits a formula once, focuses next quantity, Shift+Enter returns',()=>{
 const h=mount();const first=screen.getByLabelText('Hajm: E0');first.focus();fireEvent.change(first,{target:{value:'0.1+0.2'}});fireEvent.keyDown(first,{key:'Enter'});
 expect(h.doc().occurrences.w0.quantity).toBe('0.3');expect(document.activeElement).toBe(screen.getByLabelText('Hajm: E1'));expect(h.calls).toHaveBeenCalledTimes(1);
 fireEvent.keyDown(document.activeElement!,{key:'Enter',shiftKey:true});expect(document.activeElement).toBe(first);
});
it.each([false,true])('invalid or rejected quantity stays focused without moving (%s)',reject=>{
 const h=mount(fixture(),reject);const first=screen.getByLabelText('Hajm: E0');first.focus();fireEvent.change(first,{target:{value:reject?'2':'1/0'}});fireEvent.keyDown(first,{key:'Enter'});
 expect(document.activeElement).toBe(first);expect(first.getAttribute('aria-invalid')).toBe('true');expect(h.doc().occurrences.w0.quantity).toBeNull();
});
it('removing the last page returns to actual remaining rows',()=>{
 mount(fixture(51));fireEvent.click(screen.getByRole('button',{name:'Keyingi'}));fireEvent.click(screen.getByLabelText('Tanlash: E50'));fireEvent.click(screen.getByRole('button',{name:'Tanlangan ishlarni olib tashlash'}));
 expect(screen.getByLabelText('Hajm: E0')).toBeTruthy();expect(screen.getByText('1–50 / 50')).toBeTruthy();
});
it('Enter moves through the page boundary to the next quantity',()=>{
 mount(fixture(51));const last=screen.getByLabelText('Hajm: E49');last.focus();fireEvent.change(last,{target:{value:'7'}});fireEvent.keyDown(last,{key:'Enter'});
 expect(document.activeElement).toBe(screen.getByLabelText('Hajm: E50'));
});

