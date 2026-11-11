import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MarkaziyBerdimForm, type BerdimServis } from './MarkaziyBerdimForm';
import { berdimMiqdor } from '../../lib/ombor-kunlik/berdim';

afterEach(cleanup);

const OBYEKTLAR = [{ id: 41, nom: 'Obyekt 41' }, { id: 42, nom: 'Obyekt 42' }];
function servis(over: Partial<BerdimServis> = {}): BerdimServis {
  return {
    qoldiq: vi.fn().mockResolvedValue({ ok: true, qatorlar: [{ nomi: 'Sement M400', birligi: 't', qoldiq: 7.5 }] }),
    berdim: vi.fn().mockResolvedValue({ ok: true, markaz_harakat_id: 9, obyekt_harakat_id: 8 }),
    operationId: vi.fn().mockReturnValueOnce('op-1').mockReturnValueOnce('op-2').mockReturnValue('op-n'),
    ...over,
  };
}
async function tayyorla(s: BerdimServis, onYozildi = vi.fn()) {
  render(<MarkaziyBerdimForm kompaniyaId={17} skladId={5} skladNomi="Markaz" obyektlar={OBYEKTLAR} boshObyektId={41} onYop={vi.fn()} onYozildi={onYozildi} servis={s} />);
  fireEvent.click(await screen.findByRole('option', { name: /Sement M400/ }));
  return onYozildi;
}
const tugma = () => screen.getByRole('button', { name: 'Berdim → obyekt' }) as HTMLButtonElement;

describe('berdimMiqdor', () => {
  it('accepts positive decimals only and never fixes bad input silently', () => {
    expect(berdimMiqdor('2,5')).toBe('2.5');
    expect(berdimMiqdor(' 3 ')).toBe('3');
    for (const bad of ['', '0', '-1', 'abc', '1.2.3', '1e3', '0.0000001']) expect(berdimMiqdor(bad)).toBeNull();
  });
});

describe('MarkaziyBerdimForm', () => {
  it('stays disabled until material and a valid quantity are chosen, and blocks more than the central balance', async () => {
    const s = servis(); await tayyorla(s);
    expect(tugma().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Miqdor/), { target: { value: '8' } });
    expect(tugma().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('7,5');
    fireEvent.change(screen.getByLabelText(/^Miqdor/), { target: { value: '3' } });
    expect(tugma().disabled).toBe(false);
    expect(s.berdim).not.toHaveBeenCalled();
  });

  it('posts exactly the chosen company, warehouse, object, material and stable operation id, then reports success once', async () => {
    const s = servis(); const done = await tayyorla(s);
    fireEvent.change(screen.getByLabelText(/^Miqdor/), { target: { value: '3' } });
    fireEvent.click(tugma());
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(s.berdim).toHaveBeenCalledWith(expect.objectContaining({
      kompaniyaId: 17, skladId: 5, obyektId: 41, nomi: 'Sement M400', birligi: 't', miqdor: '3', operationId: 'op-1' }));
  });

  it('keeps the same operation id when pressed again after an unknown result and creates a new one when the data changes', async () => {
    const berdim = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    const s = servis({ berdim }); await tayyorla(s);
    fireEvent.change(screen.getByLabelText(/^Miqdor/), { target: { value: '3' } });
    fireEvent.click(tugma());
    await waitFor(() => expect(berdim).toHaveBeenCalledTimes(1));
    await screen.findByText(/qayta bosing/);
    fireEvent.click(tugma());
    await waitFor(() => expect(berdim).toHaveBeenCalledTimes(2));
    expect(berdim.mock.calls[1][0].operationId).toBe(berdim.mock.calls[0][0].operationId);
    await screen.findByText(/qayta bosing/);
    fireEvent.change(screen.getByLabelText(/^Miqdor/), { target: { value: '2' } });
    fireEvent.click(tugma());
    await waitFor(() => expect(berdim).toHaveBeenCalledTimes(3));
    expect(berdim.mock.calls[2][0].operationId).not.toBe(berdim.mock.calls[0][0].operationId);
  });

  it('shows the server insufficient-stock rejection and does not report success', async () => {
    const s = servis({ berdim: vi.fn().mockResolvedValue({ ok: false, code: 'QOLDIQ_YETMAYDI', qoldiq: 1 }) });
    const done = await tayyorla(s);
    fireEvent.change(screen.getByLabelText(/^Miqdor/), { target: { value: '3' } });
    fireEvent.click(tugma());
    await screen.findByText(/qoldiqni tekshiring/);
    expect(done).not.toHaveBeenCalled();
  });

  it('shows a read error instead of an empty list when the central balance cannot be read', async () => {
    const s = servis({ qoldiq: vi.fn().mockResolvedValue({ ok: false, code: 'NETWORK' }) });
    render(<MarkaziyBerdimForm kompaniyaId={17} skladId={5} skladNomi="Markaz" obyektlar={OBYEKTLAR} onYop={vi.fn()} onYozildi={vi.fn()} servis={s} />);
    await screen.findByText(/Qoldiqni o.qib bo.lmadi/);
    expect(screen.queryByText(/qoldiq topilmadi/)).toBeNull();
  });
});
