import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const api = vi.hoisted(() => ({ suhbat: vi.fn() }));
vi.mock('../../../api/smeta-ai', () => ({ sahifaSuhbat: api.suhbat }));
vi.mock('../ModelChip', () => ({ ModelChip: () => null }));
import { AiYordamchiPanel } from './AiYordamchiPanel';
import type { SahifaVositalar } from '../../../lib/ai-yordamchi/sikl';

beforeEach(() => { api.suhbat.mockReset(); localStorage.clear(); });

describe('AiYordamchiPanel — AI faqat taklif qiladi', () => {
  it('vosita natijasi bilan javob; yaroqsiz taklif belgilanmaydi; Bajarish faqat tanlanganlarni bajaradi', async () => {
    api.suhbat.mockResolvedValueOnce({ ok: true, model: 'm', javob: '', savollar: [], oqish: [{ vosita: 'qidir', arg: 'beton' }], amallar: [] })
      .mockResolvedValueOnce({ ok: true, model: 'm', javob: 'Beton ishi: [#2]. Qoldiq 20.', savollar: ['Bugun qancha quyildi?'], oqish: [],
        amallar: [{ tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: 'aytilgan hajm' }, { tur: 'fakt_hajm', qator: 999, qiymat: '+1', izoh: '' }] });
    const bajar = vi.fn(async () => ['✓ 1 ta fakt hajmi kiritmaga tushdi']);
    const v: SahifaVositalar = { sahifa: 'fakt', kontekst: () => 'X', oqi: async () => '[#2] Beton', tekshir: (a) => (a.qator === 999 ? 'Qator topilmadi' : null), nomi: (a) => `Fakt #${a.qator}`, bajar };
    render(<AiYordamchiPanel kompaniyaId={17} vositalar={v} saqlashKalit="t" sarlavha="Fakt AI" namunalar={[]} />);
    fireEvent.click(screen.getByTestId('ai-yordamchi-ochish'));
    fireEvent.change(screen.getByLabelText('AI yordamchiga xabar'), { target: { value: 'beton qayerda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await screen.findByText(/Beton ishi: \[#2\]/);
    expect(screen.getByText(/Bugun qancha quyildi/)).toBeTruthy();
    const cb = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(cb.map((c) => c.checked)).toEqual([true, false]);
    expect(screen.getByText('Qator topilmadi')).toBeTruthy();
    expect(bajar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bajarish' }));
    await waitFor(() => expect(bajar).toHaveBeenCalledWith([{ tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: 'aytilgan hajm' }]));
    await screen.findByText(/kiritmaga tushdi/);
  });
  it('byudjet xatosi tushunarli matn bilan', async () => {
    api.suhbat.mockResolvedValue({ ok: false, code: 'BYUDJET_YOQ' });
    const v: SahifaVositalar = { sahifa: 'fakt', kontekst: () => 'X', oqi: async () => '', tekshir: () => null, nomi: () => '', bajar: async () => [] };
    render(<AiYordamchiPanel kompaniyaId={17} vositalar={v} saqlashKalit="t2" sarlavha="Fakt AI" namunalar={['Fakt nega kam?']} />);
    fireEvent.click(screen.getByTestId('ai-yordamchi-ochish'));
    fireEvent.click(screen.getByRole('button', { name: 'Fakt nega kam?' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/limit/);
  });
});

it('changing object scope removes old proposals before they can be executed',async()=>{
 api.suhbat.mockResolvedValue({ok:true,model:'m',javob:'Proposal',savollar:[],oqish:[],amallar:[{tur:'fakt_hajm',qator:2,qiymat:'+5',izoh:''}]});
 const bajar=vi.fn(async()=>[]);const v:SahifaVositalar={sahifa:'fakt',kontekst:()=>'',oqi:async()=>'',tekshir:()=>null,nomi:()=> 'Volume',bajar};
 const ui=(key:string)=><AiYordamchiPanel kompaniyaId={17} vositalar={v} saqlashKalit={key} sarlavha="AI" namunalar={[]} ochiq/>;
 const page=render(ui('object-a'));fireEvent.change(screen.getByLabelText('AI yordamchiga xabar'),{target:{value:'Hajm'}});fireEvent.click(screen.getByRole('button',{name:'Yuborish'}));await screen.findByRole('checkbox');
 page.rerender(ui('object-b'));expect(screen.queryByRole('checkbox')).toBeNull();expect(bajar).not.toHaveBeenCalled();
});
it('proposal is revalidated immediately before applying',async()=>{
 api.suhbat.mockResolvedValue({ok:true,model:'m',javob:'Proposal',savollar:[],oqish:[],amallar:[{tur:'fakt_hajm',qator:2,qiymat:'+5',izoh:''}]});
 let changed=false;const bajar=vi.fn(async()=>[]);const v:SahifaVositalar={sahifa:'fakt',kontekst:()=>'',oqi:async()=>'',tekshir:()=>changed?'Changed':null,nomi:()=> 'Volume',bajar};
 render(<AiYordamchiPanel kompaniyaId={17} vositalar={v} saqlashKalit="validate" sarlavha="AI" namunalar={[]} ochiq/>);
 fireEvent.change(screen.getByLabelText('AI yordamchiga xabar'),{target:{value:'Hajm'}});fireEvent.click(screen.getByRole('button',{name:'Yuborish'}));await screen.findByRole('checkbox');changed=true;
 fireEvent.click(screen.getByRole('button',{name:'Bajarish'}));expect(bajar).not.toHaveBeenCalled();expect(screen.getByRole('status').textContent).toContain('Ma’lumot o‘zgardi');
});

it('failed execution clears unsafe retry proposals and allows a new request',async()=>{
 api.suhbat.mockResolvedValue({ok:true,model:'m',javob:'Proposal',savollar:[],oqish:[],amallar:[{tur:'fakt_hajm',qator:2,qiymat:'+5',izoh:''}]});
 const bajar=vi.fn(async()=>{throw new Error('private failure')});const v:SahifaVositalar={sahifa:'fakt',kontekst:()=>'',oqi:async()=>'',tekshir:()=>null,nomi:()=> 'Volume',bajar};
 render(<AiYordamchiPanel kompaniyaId={17} vositalar={v} saqlashKalit="retry" sarlavha="AI" namunalar={[]} ochiq/>);
 const send=()=>{fireEvent.change(screen.getByLabelText('AI yordamchiga xabar'),{target:{value:'Hajm'}});fireEvent.click(screen.getByRole('button',{name:'Yuborish'}));};
 send();await screen.findByRole('checkbox');fireEvent.click(screen.getByRole('button',{name:'Bajarish'}));
 expect((await screen.findByRole('status')).textContent).toContain('Amal yakunlanmadi');expect(screen.queryByRole('checkbox')).toBeNull();
 send();await waitFor(()=>expect(api.suhbat).toHaveBeenCalledTimes(2));expect(bajar).toHaveBeenCalledTimes(1);
});
