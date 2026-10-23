import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { moveRow, RowOrderControls } from './RowOrderControls';
afterEach(cleanup);
it('moves immutable rows to the final destination without changing identities or amounts', () => {
  const rows = [{id:'a', amount:null}, {id:'b',amount:0}, {id:'c',amount:12}];
  const moved = moveRow(rows, 0, 2);
  expect(moved.map(r=>r.id)).toEqual(['b','c','a']);
  expect(moved[2]).toBe(rows[0]);
  expect(rows.map(r=>r.id)).toEqual(['a','b','c']);
  expect(moveRow(rows, 1, -1)).toEqual(rows);
});
it('validates the one-based position and isolates ordering keys from worksheet navigation', () => {
  const move=vi.fn(), parentKey=vi.fn();
  render(<div onKeyDown={parentKey}><RowOrderControls index={0} count={3} label="A" onMove={move}/></div>);
  expect((screen.getByRole('button',{name:'Yuqoriga: A'}) as HTMLButtonElement).disabled).toBe(true);
  const input=screen.getByRole('spinbutton');
  fireEvent.change(input,{target:{value:'4'}});
  fireEvent.keyDown(input,{key:'Enter'});
  expect(move).not.toHaveBeenCalled();
  fireEvent.change(input,{target:{value:'3'}});
  fireEvent.keyDown(input,{key:'Enter'});
  expect(move).toHaveBeenCalledWith(2);
  parentKey.mockClear();fireEvent.keyDown(input,{key:'ArrowDown'});
  expect(parentKey).not.toHaveBeenCalled();
});

it('supports edge moves and discards a draft when external row position changes',()=>{
 const move=vi.fn();const view=render(<RowOrderControls index={1} count={4} label="B" onMove={move}/>);
 fireEvent.click(screen.getByRole('button',{name:'Boshiga: B'}));expect(move).toHaveBeenLastCalledWith(0);
 fireEvent.keyDown(screen.getByRole('spinbutton'),{key:'End',altKey:true});expect(move).toHaveBeenLastCalledWith(3);
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'4'}});
 view.rerender(<RowOrderControls index={2} count={4} label="B" onMove={move}/>);
 expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('3');
 view.rerender(<RowOrderControls index={1} count={4} label="B" onMove={move}/>);
 expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('2');
});
