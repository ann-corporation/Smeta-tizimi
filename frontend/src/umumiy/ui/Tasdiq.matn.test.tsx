import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TasdiqContainer, matnSora, tasdiqSora } from './Tasdiq';

afterEach(() => cleanup());

/** Dialog sahifa ichida chiqadi (brauzer oynasi emas) va promise javobi bilan yopiladi. */
describe('matnSora: window.prompt o‘rniga sahifa ichidagi dialog', () => {
  it('matn kiritilib tasdiqlansa — shu matn qaytadi', async () => {
    render(<TasdiqContainer />);
    let javob: Promise<string | null> = Promise.resolve(null);
    await act(async () => { javob = matnSora({ matn: 'Sabab?', tasdiqMatni: 'Saqlash' }); });
    fireEvent.change(await screen.findByTestId('matn-sorov'), { target: { value: 'xato kiritilgan' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Saqlash' })); });
    expect(await javob).toBe('xato kiritilgan');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('bekor (tugma yoki Esc) — null: hech narsa bo‘lmaydi', async () => {
    render(<TasdiqContainer />);
    let javob: Promise<string | null> = Promise.resolve('x');
    await act(async () => { javob = matnSora({ matn: 'Sabab?' }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' })); });
    expect(await javob).toBeNull();
    await act(async () => { javob = matnSora({ matn: 'Sabab?' }); });
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(await javob).toBeNull();
  });

  it('majburiy: bo‘sh matn bilan tasdiqlab bo‘lmaydi; minUzunlik hisobga olinadi', async () => {
    render(<TasdiqContainer />);
    let javob: Promise<string | null> = Promise.resolve(null);
    await act(async () => { javob = matnSora({ matn: 'Rad etish sababi?', majburiy: true, minUzunlik: 3, tasdiqMatni: 'Rad etish' }); });
    const tugma = screen.getByRole('button', { name: 'Rad etish' }) as HTMLButtonElement;
    expect(tugma.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('matn-sorov'), { target: { value: 'ab' } });
    expect(tugma.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('matn-sorov'), { target: { value: 'abc' } });
    expect(tugma.disabled).toBe(false);
    await act(async () => { fireEvent.click(tugma); });
    expect(await javob).toBe('abc');
  });

  it('boshlang‘ich qiymat ko‘rinadi; bir qatorli maydonda Enter tasdiqlaydi', async () => {
    render(<TasdiqContainer />);
    let javob: Promise<string | null> = Promise.resolve(null);
    await act(async () => { javob = matnSora({ matn: 'Yangi nom', boshlangich: 'Eski nom', kopQator: false }); });
    const m = screen.getByTestId('matn-sorov') as HTMLInputElement;
    expect(m.value).toBe('Eski nom');
    await act(async () => { fireEvent.keyDown(m, { key: 'Enter' }); });
    expect(await javob).toBe('Eski nom');
  });

  it('tasdiqSora ham sahifa ichida: «Tasdiqlash» — true, bekor — false', async () => {
    render(<TasdiqContainer />);
    let javob: Promise<boolean> = Promise.resolve(false);
    await act(async () => { javob = tasdiqSora({ matn: 'Davom etamizmi?', tasdiqMatni: 'Ha' }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ha' })); });
    expect(await javob).toBe(true);
    await act(async () => { javob = tasdiqSora('Yana?'); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' })); });
    expect(await javob).toBe(false);
  });

  it('konteyner yo‘qolsa kutayotgan so‘rov bekor bilan yakunlanadi (osilib qolmaydi)', async () => {
    const r = render(<TasdiqContainer />);
    let javob: Promise<string | null> = Promise.resolve('x');
    await act(async () => { javob = matnSora({ matn: 'Sabab?' }); });
    r.unmount();
    expect(await javob).toBeNull();
  });
});
