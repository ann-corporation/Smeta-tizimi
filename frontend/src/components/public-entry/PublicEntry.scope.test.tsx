import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PublicEntry } from './PublicEntry';
import { productDomains, productRoles } from './product-scope';
import { tilQoy } from '../../i18n/til';

beforeEach(() => tilQoy('uz'));
afterEach(() => { cleanup(); tilQoy('uz'); });
describe('Public intro mahsulot qamrovi', () => {
  it('barcha 8 yo‘nalish batafsil va ichki login URLga majburan kirmasdan ko‘rsatiladi', () => {
    render(<PublicEntry onChooseAuth={vi.fn()}><input aria-label="Login" /></PublicEntry>);
    for (const d of productDomains) {
      expect(screen.getByRole('heading', { name: d.title[0] })).toBeTruthy();
      expect(document.getElementById(`entry-domain-${d.id}`)?.textContent).toContain(d.items[0]);
      expect(screen.getByRole('link', { name: new RegExp(d.title[0]) }).getAttribute('href')).toBe(`#entry-domain-${d.id}`);
    }
    expect(screen.getByLabelText('Login')).toBeTruthy();
  });
  it('har bir lavozimning vazifasi va natijasi tanlov bilan almashadi', () => {
    render(<PublicEntry onChooseAuth={vi.fn()}>Form</PublicEntry>);
    for (const r of productRoles) {
      fireEvent.click(screen.getByRole('button', { name: r.title[0] }));
      expect(screen.getByText(r.task[0])).toBeTruthy();
      expect(screen.getByText(r.result[0])).toBeTruthy();
      expect(screen.getByRole('button', { name: r.title[0] }).getAttribute('aria-pressed')).toBe('true');
    }
  });
  it('rivojlanayotgan qismlar va moliya/AI chegaralari yashirilmaydi', () => {
    render(<PublicEntry onChooseAuth={vi.fn()}>Form</PublicEntry>);
    expect(screen.getByText(/To‘liq buxgalteriya/)).toBeTruthy();
    expect(screen.getByText(/avtomatik yakuniy tasdiq va’da qilinmaydi/)).toBeTruthy();
    expect(screen.getByText(/koeffitsient tavsiyalari takomillashtirilmoqda/)).toBeTruthy();
    expect(document.querySelectorAll('.entry-chain li').length).toBe(5);
  });
  it.each(['ru', 'en'] as const)('%s da yo‘nalishlar va lavozimlar tarjima qilinadi', lang => {
    tilQoy(lang); const idx = lang === 'ru' ? 1 : 2;
    render(<PublicEntry onChooseAuth={vi.fn()}>Form</PublicEntry>);
    for (const d of productDomains) expect(screen.getByRole('heading', { name: d.title[idx] })).toBeTruthy();
    expect(screen.getByText(productRoles[1].task[idx])).toBeTruthy();
  });
});
