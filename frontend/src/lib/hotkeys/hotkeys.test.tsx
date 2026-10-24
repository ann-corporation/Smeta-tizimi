import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HotkeyYordam } from './HotkeyYordam';
import { useHotkeys } from './useHotkeys';

function Sahifa({ onN, onEsc, faol = true }: { onN: () => void; onEsc?: () => void; faol?: boolean }) {
  useHotkeys('sahifa', 'Sahifa', [{ id: 'n', keys: 'n', nom: 'Keyingi hal qilinmagan', run: onN }, { id: 'esc', keys: 'esc', nom: 'Yopish', inInput: true, run: () => onEsc?.() }], faol);
  return <div><input aria-label="matn" /><button type="button">btn</button></div>;
}
afterEach(() => cleanup());

describe('useHotkeys + yordam oynasi', () => {
  it('tugma ishlaydi, inputda yozayotganda ishlamaydi, faol=false bo‘lsa ishlamaydi', () => {
    const n = vi.fn();
    const { rerender } = render(<Sahifa onN={n} />);
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(n).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('matn'), { key: 'n' });
    expect(n).toHaveBeenCalledTimes(1);
    rerender(<Sahifa onN={n} faol={false} />);
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(n).toHaveBeenCalledTimes(1);
  });

  it('? yordam oynasini ochadi: faol sohalar va tugmalar ko‘rinadi; Esc yopadi (sahifa Esc ga o‘tmaydi)', () => {
    const esc = vi.fn();
    render(<><Sahifa onN={vi.fn()} onEsc={esc} /><HotkeyYordam /></>);
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    const oyna = screen.getByRole('dialog');
    expect(oyna.textContent).toContain('Keyingi hal qilinmagan');
    expect(oyna.textContent).toContain('N');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(esc).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(esc).toHaveBeenCalledTimes(1);
  });
});
