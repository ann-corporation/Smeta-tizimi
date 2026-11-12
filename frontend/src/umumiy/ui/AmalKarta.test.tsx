import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AmalKarta, type AmalXolati } from './AmalKarta';

const x = (faza: AmalXolati['faza'], tasdiq: AmalXolati['tasdiq'] = 'ikkiTasdiq', natija?: AmalXolati['natija']): AmalXolati => ({ kalit: 'moliya.tolov', nom: 'To‘lov kiritish', faza, tasdiq, natija });
afterEach(cleanup);

describe('AmalKarta', () => {
  it('ko‘rinish fazasi: Tasdiqlash + Bekor; pul amali haqida ogohlantirish', () => {
    const t = vi.fn(); const b = vi.fn();
    render(<AmalKarta x={x('korinish')} onTasdiq={t} onBekor={b} onOchish={() => undefined} />);
    fireEvent.click(screen.getByText('Tasdiqlash'));
    expect(t).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/ikki marta tasdiqlanadi/)).toBeTruthy();
    fireEvent.click(screen.getByText('Bekor qilish'));
    expect(b).toHaveBeenCalled();
  });
  it('ikkinchi faza: alohida «Tasdiqlayman» tugmasi', () => {
    render(<AmalKarta x={x('ikki')} onTasdiq={() => undefined} onBekor={() => undefined} onOchish={() => undefined} />);
    expect(screen.getByText('Tasdiqlayman')).toBeTruthy();
    expect(screen.queryByText('Tasdiqlash')).toBeNull();
  });
  it('natija: havola ochiladi; takror bajarilgani aytiladi; bekor/ruxsatsiz fazada tugma yo‘q', () => {
    const och = vi.fn();
    render(<AmalKarta x={x('bajarildi', 'karta', { ok: true, xabar: 'ok', havola: '/admin/nakopitelniy', takror: true })} onTasdiq={() => undefined} onBekor={() => undefined} onOchish={och} />);
    fireEvent.click(screen.getByText('Natijani ochish'));
    expect(och).toHaveBeenCalledWith('/admin/nakopitelniy');
    expect(screen.getByText(/qayta yozilmadi/)).toBeTruthy();
    cleanup();
    render(<AmalKarta x={x('bekor')} onTasdiq={() => undefined} onBekor={() => undefined} onOchish={() => undefined} />);
    expect(screen.queryByText('Tasdiqlash')).toBeNull();
  });
});