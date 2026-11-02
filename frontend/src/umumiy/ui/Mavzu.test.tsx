import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MavzuTanlagich, useMavzu, _mavzuniQaytaOqi } from './Mavzu';

describe('useMavzu', () => {
  beforeEach(() => {
    localStorage.clear();
    _mavzuniQaytaOqi();
  });

  it('standart — firuza, atribut yo‘q', () => {
    const { result } = renderHook(() => useMavzu());
    expect(result.current.mavzu).toBe('firuza');
    expect(result.current.amaldagi).toBe('firuza');
    expect(document.documentElement.dataset.mavzu).toBeUndefined();
  });

  it('ganch: saqlaydi va data-mavzu qo‘yadi, firuzada olib tashlaydi', () => {
    const { result } = renderHook(() => useMavzu());
    act(() => result.current.setMavzu('ganch'));
    expect(localStorage.getItem('fz-mavzu')).toBe('ganch');
    expect(document.documentElement.dataset.mavzu).toBe('ganch');
    expect(result.current.amaldagi).toBe('ganch');
    act(() => result.current.setMavzu('firuza'));
    expect(document.documentElement.dataset.mavzu).toBeUndefined();
  });

  it('saqlangan qiymatni o‘qiydi', () => {
    localStorage.setItem('fz-mavzu', 'ganch');
    _mavzuniQaytaOqi();
    const { result } = renderHook(() => useMavzu());
    expect(result.current.mavzu).toBe('ganch');
    expect(document.documentElement.dataset.mavzu).toBe('ganch');
  });

  it('MavzuTanlagich: bosilganda almashtiradi', () => {
    render(<MavzuTanlagich />);
    fireEvent.click(screen.getByRole('radio', { name: /Yorug/ }));
    expect(document.documentElement.dataset.mavzu).toBe('ganch');
    expect(screen.getByRole('radio', { name: /Yorug/ }).getAttribute('aria-checked')).toBe('true');
  });
});
