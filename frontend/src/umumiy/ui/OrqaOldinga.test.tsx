import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom';
import { keyingiMax, OrqaOldinga } from './OrqaOldinga';

describe('OrqaOldinga', () => {
  it('keyingiMax: yangi o‘tish oldinga zanjirini kesadi, orqaga qaytish saqlaydi', () => {
    expect(keyingiMax('PUSH', 3, 7)).toBe(3);
    expect(keyingiMax('POP', 2, 7)).toBe(7);
    expect(keyingiMax('REPLACE', 4, 2)).toBe(4);
  });
  it('tarix bo‘sh — ikkala tugma ham o‘chiq', () => {
    render(<MemoryRouter><OrqaOldinga /><Routes><Route path="/" element={<Link to="/b">b</Link>} /></Routes></MemoryRouter>);
    expect((screen.getByRole('button', { name: 'Orqaga' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Oldinga' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('b'));
  });
});
