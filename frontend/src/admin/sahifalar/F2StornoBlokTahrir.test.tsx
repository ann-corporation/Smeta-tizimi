import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../api/t2-f2-storno', () => ({
  f2StornoManbaOl: vi.fn(async () => ({ ok: true, qatorlar: [
    { id: 501, qator_id: 1, hajm: 4, certified_quantity: 4, certified_unit_price: 25, certified_amount: 100 },
    { id: 502, qator_id: 2, hajm: 2, certified_quantity: 2, certified_unit_price: 10, certified_amount: 20 },
  ] })),
  f2StornoHolatOl: vi.fn(async () => ({ ok: true, qatorlar: [
    { qator_id: 1, tur: 'bl', fakt_hajm: 4, kod: 'K1', nom: 'Ish 1', birlik: 'м3' },
    { qator_id: 2, tur: 'mat', fakt_hajm: 2, kod: 'K2', nom: 'Mat 2', birlik: 'т' },
  ] })),
  f2StornoDaraxtOl: vi.fn(async () => ({ ok: true, qatorlar: [
    { id: 10, ota_id: null, tur: 'rz', nom: 'Bo‘lim A', tartib: 1 }, { id: 1, ota_id: 10, tur: 'bl', tartib: 2 },
    { id: 20, ota_id: null, tur: 'rz', nom: 'Bo‘lim B', tartib: 3 }, { id: 2, ota_id: 20, tur: 'mat', tartib: 4 },
  ] })),
}));

import { F2StornoBlokTahrir } from './F2StornoBlokTahrir';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
/* Sintetik qoralama: eski F2 №11 ning ikkala qatori to'liq stornolangan. */
const SAQLANGAN = [
  { qator_id: 1, hajm: -4, certified_quantity: -4, certified_unit_price: 25, certified_amount: -100, provenance_status: null, raw_snapshot: { source: 'storno', stornoOf: 11 } },
  { qator_id: 2, hajm: -2, certified_quantity: -2, certified_unit_price: 10, certified_amount: -20, provenance_status: null, raw_snapshot: { source: 'storno', stornoOf: 11 } },
];
const ochish = () => {
  const onOzgar = vi.fn();
  render(<F2StornoBlokTahrir obyektId={8} saqlangan={SAQLANGAN} asl={SAQLANGAN} onOzgar={onOzgar} onBekor={vi.fn()} />);
  return onOzgar;
};

describe('F2StornoBlokTahrir — qoralamadagi storno bloki', () => {
  it('razdelni stornodan olish: qolgan qator aynan saqlangan nusxa, fakt ogohlantirishi', async () => {
    const onOzgar = ochish();
    const a = await screen.findByRole('checkbox', { name: 'Storno bo‘limi: Bo‘lim A' }) as HTMLInputElement;
    expect(a.checked).toBe(true);
    fireEvent.click(a);
    expect(screen.getByTestId('storno-blok-fakt-ogoh').textContent).toContain('1 qator stornodan olindi');
    fireEvent.click(screen.getByTestId('storno-blok-qollash'));
    expect(onOzgar).toHaveBeenCalledTimes(1);
    expect(onOzgar.mock.calls[0][0]).toEqual([SAQLANGAN[1]]);
  });
  it('qisman hajm: −2 (eski 4 dan), summa = hajm × narx yadrodan; chegaradan oshgan qiymat qo‘llanmaydi', async () => {
    const onOzgar = ochish();
    const inp = await screen.findByRole('textbox', { name: 'Storno hajmi: K1 (ko‘pi bilan 4)' }) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: '9' } });
    expect(inp.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(inp, { target: { value: '2' } });
    await waitFor(() => expect(screen.getByTestId('storno-blok-tahrir-jam').textContent).toContain('qisman hajm: 1'));
    fireEvent.click(screen.getByTestId('storno-blok-qollash'));
    const r = onOzgar.mock.calls[0][0];
    expect(r[0]).toMatchObject({ qator_id: 1, certified_quantity: -2, certified_unit_price: 25, certified_amount: -50 });
    expect(r[0].raw_snapshot).toMatchObject({ source: 'storno', stornoOf: 11, manba_akt_qator_id: 501, stornoAslHajm: -4 });
    expect(r[1]).toBe(SAQLANGAN[1]);
  });
});
