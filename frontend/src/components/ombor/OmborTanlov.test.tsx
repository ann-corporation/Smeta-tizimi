import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {OmborTanlov} from './OmborTanlov';
afterEach(cleanup);
it('opens searchable choices, matches Latin/Cyrillic and changes only after explicit choice',()=>{
 const changed=vi.fn();render(<OmborTanlov label="Obyekt" value="" options={[{value:'1',label:'Щебень bazasi'},{value:'2',label:'Sinov bino'}]} onChange={changed}/>);
 fireEvent.click(screen.getByRole('combobox'));expect(changed).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Variantlarni qidirish'),{target:{value:'sheb'}});
 expect(screen.queryByRole('option',{name:'Sinov bino'})).toBeNull();
 fireEvent.click(screen.getByRole('option',{name:'Щебень bazasi'}));expect(changed).toHaveBeenCalledWith('1');expect(screen.queryByRole('dialog')).toBeNull();
});
it('supports keyboard opening, option focus and Escape without silently changing selection',()=>{
 const changed=vi.fn();render(<OmborTanlov label="Obyekt" value="1" options={[{value:'1',label:'A'},{value:'2',label:'B'}]} onChange={changed}/>);
 const trigger=screen.getByRole('combobox');fireEvent.keyDown(trigger,{key:'ArrowDown'});
 fireEvent.keyDown(screen.getByLabelText('Variantlarni qidirish'),{key:'ArrowDown'});
 expect(document.activeElement).toBe(screen.getByRole('option',{name:'A'}));
 fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();expect(changed).not.toHaveBeenCalled();expect(document.activeElement).toBe(trigger);
});
