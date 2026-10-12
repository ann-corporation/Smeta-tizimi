import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { T2Obyekt } from '../../api/supabase';
import { ProjectNavigator } from './ProjectNavigator';
const m = vi.hoisted(() => ({ line: {} as unknown, open: vi.fn() }));
vi.mock('./useLineage', () => ({useCompanyLineage: () => ({data:m.line,isPending:false,error:null,refetch:vi.fn()})}));
vi.mock('./useMarkupTotals',()=>({useMarkupTotals:()=>({loading:false,failed:false,sum:()=>({known:150,present:1,unknown:1,total:2})})}));
const objects = [{id:10,nom:'Obyekt A',loyiha_id:1,jami:100,qator_soni:20,razdel:2,ish:5,resurs:13,narxsiz:0},{id:11,nom:'Obyekt B',loyiha_id:1,jami:null,qator_soni:10,razdel:1,ish:2,resurs:7,narxsiz:3}] as T2Obyekt[];
beforeEach(() => { m.open.mockReset(); m.line={loyihalar:[{id:1,nom:'Bog‘'}],shartnomalar:[{id:100,loyiha_id:1,raqam:'1',nom:'Asosiy',obyektlar:[10,11],tomonlar:[]}],obyektlar:objects}; });
afterEach(cleanup);
function start(url='/admin/obyektlar') { render(<MemoryRouter initialEntries={[url]}><ProjectNavigator companyId={17} objects={objects} onOpen={m.open} onEdit={vi.fn()} onArchive={vi.fn()} /></MemoryRouter>); }
describe('project → contract → object navigator', () => {
  it('drills through canonical levels, shows aggregated columns and opens the exact object ID', () => {
    start(); expect(screen.queryByText('Smetani ochish')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:/Bog‘/}));
    const row=screen.getByRole('row',{name:/№ 1 · Asosiy/}); expect(row.textContent).toContain('100'); expect(row.textContent).toContain('Jami to‘liq emas');
    fireEvent.click(within(row).getByRole('button'));
    fireEvent.click(screen.getAllByRole('button',{name:'Smetani ochish'})[0]);
    expect(m.open).toHaveBeenCalledWith(objects[0],100);
    expect(screen.getByText('Obyekt B')).toBeTruthy();
    expect(screen.getAllByText('Noma’lum').length).toBeGreaterThan(0);
  });
  it('supports direct links without inventing an unknown project/contract', () => {
    start('/admin/obyektlar?loyiha=1&shartnoma=999');
    expect(screen.getByRole('alert').textContent).toContain('topilmadi'); expect(m.open).not.toHaveBeenCalled();
  });
  it('filters object cards inside the selected contract without changing totals', () => {
    start('/admin/obyektlar?loyiha=1&shartnoma=100');
    fireEvent.change(screen.getByLabelText('Navigator qidiruvi'),{target:{value:'Obyekt B'}});
    expect(screen.queryByText('Obyekt A')).toBeNull(); expect(screen.getByText('Obyekt B')).toBeTruthy();
    expect(screen.getAllByText(/Jami to‘liq emas/).length).toBeGreaterThan(0);
  });
});
