import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode,type ReactElement } from 'react';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { KirimKunlikForm } from './KirimKunlikForm';
import type { T2Obyekt } from '../../api/supabase';

const api = vi.hoisted(() => ({ read: vi.fn(), stock: vi.fn(), write: vi.fn(), operationId: vi.fn(() => 'op-stable-1') }));
function render(ui:ReactElement){const view=rtlRender(ui);const details=screen.queryByText('Batafsil tahrirlash');if(details)fireEvent.click(details);return view;}
vi.mock('../../api/supabase', () => ({
  sbOqi: api.read,
  sbSkladQoldiqOl: api.stock,
  sbSkladgaYozish: api.write,
  yangiOperationId: api.operationId,
}));

const object = (id = 41, company = 17): T2Obyekt => ({
  id, kompaniya_id: company, nom: `Obyekt ${id}`, tur: null, qator_soni: null, razdel: null, ish: null, resurs: null,
  jami: null, narxsiz: null, chel: null, mash: null, mat: null, ob: null, yangilandi: null,
  lat: null, lng: null, versiya: 1, loyiha_id: null,
});

function fillReceipt() {
  fireEvent.change(screen.getByLabelText(/^Sana/), { target: { value: '2026-10-27' } });
  fireEvent.change(screen.getByLabelText(/^Material nomi/), { target: { value: 'Sement M400' } });
  fireEvent.change(screen.getByLabelText(/^O‘lchov birligi/), { target: { value: 'qop' } });
  fireEvent.change(screen.getByLabelText(/^Miqdor/), { target: { value: '12.5' } });
  fireEvent.change(screen.getByLabelText(/^Yetkazuvchi/), { target: { value: 'Yetkazuvchi A' } });
  fireEvent.change(screen.getByLabelText(/^Qabul qiluvchi/), { target: { value: 'Qabul qiluvchi B' } });
  fireEvent.change(screen.getByLabelText(/^Sabab \/ maqsad izohi/), { target: { value: 'Obyektga yetkazildi' } });
  fireEvent.change(screen.getByLabelText(/^Hujjat raqami/), { target: { value: 'TTN-77' } });
}

beforeEach(() => {
  sessionStorage.clear(); api.read.mockResolvedValue({ ok: true, qatorlar: [] }); api.stock.mockResolvedValue({ ok: true, qatorlar: [] });
  api.write.mockReset(); api.operationId.mockReturnValue('op-stable-1');
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('KirimKunlikForm', () => {
  it('builds a receipt from one sentence and source choices without opening the full manual form or posting automatically',async()=>{
    api.read.mockResolvedValue({ok:true,qatorlar:[{id:81,kompaniya_id:17,obyekt_id:41,nomi:'Щебень 5-20',birligi:'м3',obyomi:3,postavshik:'Karyer',qabul_qiluvchi:'Anvar',operatsiya:'prixod'}]});
    rtlRender(<KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="prixod" onYop={vi.fn()} onYozildi={vi.fn()}/>);
    expect(screen.getByText('Batafsil tahrirlash').closest('details')?.open).toBe(false);
    fireEvent.change(screen.getByLabelText('Bir gap bilan kiriting'),{target:{value:'10 kub sheben keldi Karyerdan'}});
    fireEvent.click(await screen.findByRole('button',{name:'Щебень 5-20'}));
    fireEvent.click(screen.getByRole('button',{name:'Anvar'}));
    expect(screen.getByRole('region',{name:'To‘liq tasdiqlash ko‘rinishi'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Tasdiqlab yuborish'})).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();expect(api.write).not.toHaveBeenCalled();
  });
  it('keeps real history suggestions available after StrictMode cleanup and remount',async()=>{
    api.read.mockResolvedValue({ok:true,qatorlar:[{id:8,kompaniya_id:17,obyekt_id:41,nomi:'Щебень 5-20',birligi:'м3',postavshik:'Sinov'}]});
    render(<StrictMode><KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="prixod" onYop={vi.fn()} onYozildi={vi.fn()}/></StrictMode>);
    fireEvent.change(screen.getByLabelText(/^Material nomi/),{target:{value:'sheb'}});
    expect(await screen.findByRole('button',{name:'Щебень 5-20'})).toBeTruthy();
  });
  it('shows the complete receipt confirmation then sends explicit fields through the existing named action', async () => {
    api.read.mockResolvedValue({ ok: true, qatorlar: [{ id: 1, kompaniya_id: 17, obyekt_id: 41, operatsiya: 'prixod', sana: '2026-01-01', nomi: 'Sement M400', birligi: 'qop', obyomi: 2, postavshik: 'Yetkazuvchi tarixiy', qabul_qiluvchi: null, qabul_turi: null, izoh: null, operation_id: 'old', holat: 'faol', yaratildi: null, kim: null }] });
    api.write.mockResolvedValue({ ok: true, operation_id: 'op-stable-1' });
    const onYozildi = vi.fn();
    render(<KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="prixod" onYop={vi.fn()} onYozildi={onYozildi} />);

    expect((screen.getByLabelText(/^Sana/) as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((screen.getByLabelText(/^O‘lchov birligi/) as HTMLInputElement).value).toBe('');
    fillReceipt();
    expect(await screen.findByRole('group', { name: 'Manbada uchragan yetkazuvchilar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Barcha qiymatlarni tekshirish' }));
    expect(screen.getByText(/Obyektga yetkazildi\s+Hujjat: TTN-77/)).toBeTruthy();
    expect(screen.getByText('Qabul qiluvchi B')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlab yuborish' }));

    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(1));
    expect(api.write).toHaveBeenCalledWith(17, 'prixod', expect.objectContaining({
      obyekt_id: 41, sana: '2026-10-27', nomi: 'Sement M400', birligi: 'qop', obyomi: 12.5,
      postavshik: 'Yetkazuvchi A', qabul_qiluvchi: 'Qabul qiluvchi B',
      izoh: 'Obyektga yetkazildi\nHujjat: TTN-77', operation_id: 'op-stable-1',
    }));
    expect(onYozildi).toHaveBeenCalledWith({ kompaniyaId: 17, obyektId: 41, operationId: 'op-stable-1' });
    expect(sessionStorage.length).toBe(0);
  });

  it('requires issue recipient, purpose and reason and never truncates combined notes/document reference', () => {
    render(<KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="rasxod" onYop={vi.fn()} onYozildi={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Sana/), { target: { value: '2026-10-27' } });
    fireEvent.change(screen.getByLabelText(/^Material nomi/), { target: { value: 'Armatura' } });
    fireEvent.change(screen.getByLabelText(/^O‘lchov birligi/), { target: { value: 'kg' } });
    fireEvent.change(screen.getByLabelText(/^Miqdor/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/^Sabab \/ maqsad izohi/), { target: { value: 'x'.repeat(490) } });
    fireEvent.change(screen.getByLabelText(/^Hujjat raqami/), { target: { value: 'DOC-123' } });
    expect(screen.getByText('Izoh va hujjat raqami birga 500 belgidan oshmasin; matn qisqartirilmaydi.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Barcha qiymatlarni tekshirish' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Sabab \/ maqsad izohi/), { target: { value: 'Material bo‘limga beriladi' } });
    expect((screen.getByRole('button', { name: 'Barcha qiymatlarni tekshirish' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Qabul qiluvchi/), { target: { value: 'Usta A' } });
    fireEvent.click(screen.getByRole('combobox',{name:'Qabul turi / berish maqsadi'}));
    fireEvent.click(screen.getByRole('option',{name:'Prorabga'}));
    expect((screen.getByRole('button', { name: 'Barcha qiymatlarni tekshirish' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('freezes an ambiguous attempt and retries the exact payload with its original operation ID', async () => {
    let rejectFirst!: (reason?: unknown) => void;
    api.write.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }));
    api.write.mockResolvedValueOnce({ ok: true });
    render(<KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="prixod" onYop={vi.fn()} onYozildi={vi.fn()} />);
    fillReceipt();
    fireEvent.click(screen.getByRole('button', { name: 'Barcha qiymatlarni tekshirish' }));
    const confirm = screen.getByRole('button', { name: 'Tasdiqlab yuborish' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(1));
    const original = api.write.mock.calls[0];
    rejectFirst(new Error('connection lost'));
    expect(await screen.findByText('Oldingi urinish natijasi tasdiqlanmadi.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Ayni urinishni qayta yuborish' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByLabelText(/^Sana/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ayni urinishni qayta yuborish' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[1]).toEqual(original);
    await waitFor(() => expect(sessionStorage.length).toBe(0));
  });

  it('does not submit a restored session attempt automatically and does not clear another scope attempt', async () => {
    let reject!: (reason?: unknown) => void;
    api.write.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(<KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="prixod" onYop={vi.fn()} onYozildi={vi.fn()} />);
    fillReceipt(); fireEvent.click(screen.getByRole('button', { name: 'Barcha qiymatlarni tekshirish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlab yuborish' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(1));
    reject(new Error('response lost'));
    await screen.findByText('Oldingi urinish natijasi tasdiqlanmadi.');
    const stored = sessionStorage.getItem('t2.sklad.pending.v1:17:41');
    expect(stored).toContain('op-stable-1');

    cleanup();
    render(<KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="prixod" onYop={vi.fn()} onYozildi={vi.fn()} />);
    expect(api.write).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Oldingi urinish natijasi tasdiqlanmadi.')).toBeTruthy();
    expect(sessionStorage.getItem('t2.sklad.pending.v1:17:41')).toBe(stored);
  });

  it('refuses an object that belongs to another company', () => {
    render(<KirimKunlikForm kompaniyaId={18} obyekt={object(41, 17)} amal="prixod" onYop={vi.fn()} onYozildi={vi.fn()} />);
    expect(screen.getByText('Tanlangan kompaniya uchun obyektni qayta tanlang.')).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
  });
  it('unlocks editing after a definite no-stock rejection without losing an ambiguous attempt',async()=>{
    api.write.mockResolvedValue({ok:false,error:"Skladda yetarli qoldiq yo'q: 0 qop"});
    render(<KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="prixod" onYop={vi.fn()} onYozildi={vi.fn()}/>);
    fillReceipt();fireEvent.click(screen.getByRole('button',{name:'Barcha qiymatlarni tekshirish'}));
    fireEvent.click(screen.getByRole('button',{name:'Tasdiqlab yuborish'}));
    await screen.findByText("Skladda yetarli qoldiq yo'q: 0 qop");
    expect(screen.getByLabelText(/^Miqdor/)).toBeTruthy();expect(sessionStorage.length).toBe(0);
  });
  it('does not submit when durable retry storage is unavailable',async()=>{
    render(<KirimKunlikForm kompaniyaId={17} obyekt={object()} amal="prixod" onYop={vi.fn()} onYozildi={vi.fn()}/>);
    fillReceipt();fireEvent.click(screen.getByRole('button',{name:'Barcha qiymatlarni tekshirish'}));
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
    fireEvent.click(screen.getByRole('button',{name:'Tasdiqlab yuborish'}));
    await screen.findByText('Urinish qurilmada saqlanmadi. Hozircha yozuv yuborilmadi.');
    expect(api.write).not.toHaveBeenCalled();
  });
});
