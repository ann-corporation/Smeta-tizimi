import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { T2Obyekt } from '../../api/supabase';
import { ProjectNavigator } from './ProjectNavigator';
import { aggregateFinancials } from './financials';
import type { ObjectFinancials } from '../../api/t2-object-financials';
const m = vi.hoisted(() => ({ line: {} as unknown, open: vi.fn(), failed: false, retry: vi.fn(), rows: [] as ObjectFinancials[] }));
vi.mock('./useLineage', () => ({useCompanyLineage: () => ({data:m.line,isPending:false,error:null,refetch:vi.fn()})}));
vi.mock('./useMarkupTotals',()=>({useMarkupTotals:()=>({loading:false,failed:false,sum:()=>({known:150,present:1,unknown:1,total:2})})}));
vi.mock('./useObjectFinancials', () => ({useObjectFinancials: () => ({loading:false,failed:m.failed,retry:m.retry,sum:(ids:number[])=>aggregateFinancials(ids,m.rows)})}));
const objects = [{id:10,nom:'Obyekt A',loyiha_id:1,jami:100,qator_soni:20,razdel:2,ish:5,resurs:13,narxsiz:0},{id:11,nom:'Obyekt B',loyiha_id:1,jami:null,qator_soni:10,razdel:1,ish:2,resurs:7,narxsiz:3}] as T2Obyekt[];
beforeEach(() => { m.open.mockReset(); m.failed=false; m.retry.mockReset(); m.rows=[{obyekt_id:10,smeta:{known:100,unknown:0},fakt:{known:65,unknown:0},f2:{known:25,unknown:0},ostatka:{known:42,unknown:0}},{obyekt_id:11,smeta:{known:null,unknown:3},fakt:{known:0,unknown:0},f2:{known:0,unknown:0},ostatka:{known:null,unknown:1}}]; m.line={loyihalar:[{id:1,nom:'Bog‘'}],shartnomalar:[{id:100,loyiha_id:1,raqam:'1',nom:'Asosiy',obyektlar:[10,11],tomonlar:[]}],obyektlar:objects}; });
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

describe('owner financial overview acceptance', () => {
  it('shows exactly four main indicators and financial-only table columns', () => {
    start();
    const cards=screen.getByLabelText('Moliyaviy ko‘rsatkichlar');
    expect(cards.children).toHaveLength(4);
    for(const label of ['Smeta','Fakt','Tasdiqlangan F2','Ostatka']) expect(within(cards).getByText(label)).toBeTruthy();
    for(const label of ['Qatorlar','Bo‘limlar','Ishlar','Resurslar','Narxsiz qatorlar']) expect(within(cards).queryByText(label)).toBeNull();
    expect(screen.getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Loyiha','Smeta','Fakt','Tasdiqlangan F2','Ostatka']);
    expect(within(cards).getByText('25')).toBeTruthy(); // supplied approved F2, not 65 Fakt or raw smeta
    expect(within(cards).getByText('42')).toBeTruthy(); // supplied remaining work, not smeta minus F2
  });
  it('keeps technical counts collapsed and opens scope/object details with the exact basis', () => {
    start('/admin/obyektlar?loyiha=1&shartnoma=100');
    const scope=screen.getByLabelText('Tarkib va tekshiruv: Asosiy') as HTMLDetailsElement;
    expect(scope.open).toBe(false); fireEvent.click(within(scope).getByText('Tarkib va tekshiruv')); expect(scope.open).toBe(true);
    expect(within(scope).getByText(/^Qatorlar:/)).toBeTruthy();
    expect(within(scope).getByText(/aktlar shartnomalar bo‘yicha taqsimlanmagan/)).toBeTruthy();
    expect(within(scope).getByText(/Smeta − F2 emas/)).toBeTruthy();
    const object=screen.getByLabelText('Tarkib va tekshiruv: Obyekt B') as HTMLDetailsElement;
    expect(object.open).toBe(false);fireEvent.click(within(object).getByText('Tarkib va tekshiruv'));expect(object.open).toBe(true);
  });
  it('shows null as unknown and explicit zero as zero on an object card', () => {
    start('/admin/obyektlar?loyiha=1&shartnoma=100');
    const card=screen.getByText('Obyekt B').closest('article')!;
    expect(within(card).getAllByText('Noma’lum').length).toBeGreaterThan(0);
    expect(within(card).getAllByText('0')).toHaveLength(2);
    expect(within(card).getAllByText('Jami to‘liq emas').length).toBeGreaterThan(0);
  });
  it('deduplicates company/project scope while showing the whole shared object in each contract row', () => {
    (m.line as any).shartnomalar.push({id:101,loyiha_id:1,raqam:'2',nom:'Ikkinchi',obyektlar:[10,10],tomonlar:[]});
    start('/admin/obyektlar?loyiha=1');
    const cards=screen.getByLabelText('Moliyaviy ko‘rsatkichlar');expect(within(cards).getByText('25')).toBeTruthy();
    for(const name of [/№ 1 · Asosiy/,/№ 2 · Ikkinchi/]) {
      const row=screen.getByRole('row',{name}); expect(within(row).getByText('25')).toBeTruthy();
      expect(row.querySelector('td')?.title).toContain('loyiha va kompaniya jamida bir marta');
    }
  });
  it('keeps navigation/actions available on read failure and exposes retry', () => {
    m.failed=true;m.rows=[];start('/admin/obyektlar?loyiha=1&shartnoma=100');
    expect(screen.getByText('Moliyaviy ko‘rsatkichlar o‘qilmadi.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Qayta urinish'}));expect(m.retry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole('button',{name:'Smetani ochish'})[0]);expect(m.open).toHaveBeenCalledWith(objects[0],100);
  });
});
