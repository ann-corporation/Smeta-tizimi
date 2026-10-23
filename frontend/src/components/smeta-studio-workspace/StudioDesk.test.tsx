import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { emptyDoc } from '../../lib/smeta-studio/model';
import { calcDoc } from '../../lib/smeta-studio/calc';
import { WorkSheet } from './WorkSheet';
import { StudioCommandMenu } from './StudioCommandMenu';

vi.mock('../../i18n/til',()=>({t:(text:string)=>text}));
afterEach(cleanup);
it('keeps keyboard focus across the worksheet page boundary and continues to the next work',()=>{
  const doc=emptyDoc('keyboard');
  doc.rootOrder=['s'];doc.sections.s={id:'s',name:'Section',parentId:null,children:[],items:[]};
  for(let i=0;i<52;i++){
    const id=`w${i}`;doc.sections.s.items.push(id);
    doc.occurrences[id]={id,sectionId:'s',source:{workId:id,catalogRevision:'test',code:`W${i}`,name:`Work ${i}`,unitCode:'m3',tableLabel:null},quantity:'1',basis:{scale:'1',unitLabel:'m3',evidence:'test source',origin:'OBSERVED'},recipe:[],overrides:{}};
  }
  function Harness(){const [active,setActive]=useState('w49');return <WorkSheet docked activeWorkId={active} doc={doc} calculation={calcDoc(doc)} command={()=>true} onWork={setActive} renderDetails={()=>null}/>;}
  render(<Harness/>);
  const button=screen.getByText('Work 49').closest('button')!;button.focus();fireEvent.keyDown(button,{key:'ArrowDown'});
  const sheet=screen.getByRole('region',{name:'Smeta ishlar jadvali'});
  expect(document.activeElement).toBe(sheet);
  expect(screen.getByText('Work 50').closest('tr')?.getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(sheet,{key:'ArrowDown'});
  expect(screen.getByText('Work 51').closest('tr')?.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(sheet);
});

it('does not substitute the highlighted command for an Enter key on a focused result button',()=>{
  const action=vi.fn();
  const show=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal');
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  try{
    render(<StudioCommandMenu doc={emptyDoc('commands')} onWork={()=>{}} onAction={action} onClose={()=>{}}/>);
    const target=screen.getByRole('button',{name:/^Smetachi AI bilan ishlash/});target.focus();
    fireEvent.keyDown(target,{key:'Enter'});
    expect(action).not.toHaveBeenCalled(); // Browser owns the focused button's native activation.
    fireEvent.click(target);expect(action).toHaveBeenCalledWith('ai');
    fireEvent.keyDown(screen.getByRole('textbox',{name:'Amal yoki ish qidirish'}),{key:'Enter'});
    expect(action).toHaveBeenLastCalledWith('catalog');
  }finally{if(show)Object.defineProperty(HTMLDialogElement.prototype,'showModal',show);else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;}
});

