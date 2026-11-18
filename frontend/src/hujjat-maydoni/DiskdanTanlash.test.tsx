import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  kompaniya: { joriy: null as { id: number; nom: string } | null },
  royxat: vi.fn(), ulashilgan: vi.fn(), qidir: vi.fn(), baytlar: vi.fn(),
}));
vi.mock('../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => m.kompaniya }));
vi.mock('../api/t2-hujjat-maydoni', async (orig) => ({
  ...(await orig<object>()), hmRoyxat: m.royxat, hmUlashilgan: m.ulashilgan, hmQidir: m.qidir, hmBaytlar: m.baytlar,
}));
import { DiskdanTanlash, DiskdanTanlashTugma, faylMos } from './DiskdanTanlash';

const kvota = { ishlatilgan: 0, limit: 100, chegara: 0.8, ortiqcha: false, foiz: 0 };
const fayl = (id: number, nom: string, mime = 'application/octet-stream') => ({ id, nom, mime, bayt: 10, versiya: 2, yangilandi: '2026-01-01T00:00:00Z', savatda: null, qulf_kim: null, qulf_ism: null, izohlar: 0 });
const royxat = (o: Record<string, unknown> = {}) => ({ ok: true, daraja: 5, kompaniya_id: null, shaxsiy: true, yol: [], papkalar: [], fayllar: [], kvota, ...o });

beforeEach(() => {
  m.kompaniya.joriy = { id: 17, nom: 'Test' };
  m.royxat.mockResolvedValue(royxat({ papkalar: [{ id: 5, nom: 'Hujjatlar' }], fayllar: [fayl(1, 'a.xlsx'), fayl(2, 'b.png', 'image/png'), fayl(3, 'c.xlsx')] }));
  m.ulashilgan.mockResolvedValue({ ok: true, royxat: [{ turi: 'fayl', id: 9, daraja: 'korish', tugaydi: null, nom: 'ulashilgan.xlsx', mime: null, bergan: 'Ali' }] });
  m.qidir.mockResolvedValue({ ok: true, royxat: [{ id: 3, nom: 'c.xlsx', mime: 'x', yangilandi: '', papka_id: null }] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('faylMos', () => {
  it('kengaytma va mime maskasi bo‘yicha filtrlaydi', () => {
    expect(faylMos('A.XLSX', '', '.xlsx,.xlsm')).toBe(true);
    expect(faylMos('a.pdf', 'application/pdf', '.xlsx')).toBe(false);
    expect(faylMos('x', 'image/png', 'image/*')).toBe(true);
    expect(faylMos('x', '', undefined)).toBe(true);
  });
});

describe('DiskdanTanlash', () => {
  it('3 tab; accept bo‘yicha faqat mos fayl ko‘rinadi; bitta fayl tanlanadi', async () => {
    const onTanlandi = vi.fn();
    render(<DiskdanTanlash accept=".xlsx" onYop={() => {}} onTanlandi={onTanlandi} />);
    expect(await screen.findByLabelText('a.xlsx')).toBeTruthy();
    expect(screen.queryByLabelText('b.png')).toBeNull();
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Mening diskim', 'Kompaniya diski', 'Ulashilgan']);
    expect(screen.getByRole('button', { name: 'Tanlash' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText('a.xlsx'));
    fireEvent.click(screen.getByLabelText('c.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: 'Tanlash' }));
    expect(onTanlandi).toHaveBeenCalledWith([{ faylId: 3, versiya: 2, nom: 'c.xlsx', mime: 'application/octet-stream', bayt: 10 }]);
  });
  it('kopmi: bir nechta fayl; papkaga kirish va Ulashilgan tabi', async () => {
    const onTanlandi = vi.fn();
    render(<DiskdanTanlash kopmi onYop={() => {}} onTanlandi={onTanlandi} />);
    fireEvent.click(await screen.findByLabelText('a.xlsx')); fireEvent.click(screen.getByLabelText('c.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: 'Tanlash' }));
    expect(onTanlandi.mock.calls[0][0].map((x: { faylId: number }) => x.faylId)).toEqual([1, 3]);
    fireEvent.click(screen.getByRole('button', { name: /Hujjatlar/ }));
    await waitFor(() => expect(m.royxat).toHaveBeenLastCalledWith({ kompaniyaId: null, papkaId: 5 }));
    fireEvent.click(screen.getByRole('tab', { name: 'Ulashilgan' }));
    expect(await screen.findByLabelText('ulashilgan.xlsx')).toBeTruthy();
  });
  it('qidiruv hmQidir orqali', async () => {
    render(<DiskdanTanlash onYop={() => {}} onTanlandi={() => {}} />);
    await screen.findByLabelText('a.xlsx');
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'c.x' } });
    await waitFor(() => expect(m.qidir).toHaveBeenCalledWith('c.x', null));
    await waitFor(() => expect(screen.queryByLabelText('a.xlsx')).toBeNull());
    expect(screen.getByLabelText('c.xlsx')).toBeTruthy();
  });
  it('kompaniyasiz foydalanuvchida Kompaniya diski tabi yo‘q', async () => {
    m.kompaniya.joriy = null;
    render(<DiskdanTanlash onYop={() => {}} onTanlandi={() => {}} />);
    await screen.findByLabelText('a.xlsx');
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Mening diskim', 'Ulashilgan']);
  });
});

describe('DiskdanTanlashTugma', () => {
  it('tanlangan Disk fayli File sifatida handlerga beriladi', async () => {
    m.baytlar.mockResolvedValue({ bayt: new Uint8Array([1, 2, 3]), mime: 'application/octet-stream' });
    const onFayllar = vi.fn();
    render(<DiskdanTanlashTugma accept=".xlsx" onFayllar={onFayllar} />);
    fireEvent.click(screen.getByRole('button', { name: /Diskdan tanlash/ }));
    fireEvent.click(await screen.findByLabelText('a.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: 'Tanlash' }));
    await waitFor(() => expect(onFayllar).toHaveBeenCalled());
    const f = onFayllar.mock.calls[0][0][0] as File;
    expect(f).toBeInstanceOf(File);
    expect(f.name).toBe('a.xlsx'); expect(f.size).toBe(3);
    expect(m.baytlar).toHaveBeenCalledWith(1, 2);
  });
  it('fayl ochilmasa onXato chaqiriladi', async () => {
    m.baytlar.mockResolvedValue(null);
    const onXato = vi.fn(); const onFayllar = vi.fn();
    render(<DiskdanTanlashTugma onFayllar={onFayllar} onXato={onXato} />);
    fireEvent.click(screen.getByRole('button', { name: /Diskdan tanlash/ }));
    fireEvent.click(await screen.findByLabelText('a.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: 'Tanlash' }));
    await waitFor(() => expect(onXato).toHaveBeenCalled());
    expect(onFayllar).not.toHaveBeenCalled();
  });
});
