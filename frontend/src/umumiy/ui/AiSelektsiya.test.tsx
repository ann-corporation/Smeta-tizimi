// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
import { AiSelektsiya, selektsiyaMatni } from './AiSelektsiya';

afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); });
function belgila(el: Node) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r); }

it('oddiy matn belgilansa «AI: tushuntir» chiqadi va bosilganda ai:ochish hodisasi (belgilangan matn bilan) yuboriladi', () => {
  const eshit = vi.fn(); window.addEventListener('ai:ochish', eshit as EventListener);
  render(<div><p data-testid="p">Nakopitelniy vedomost 150 026 606,32</p><AiSelektsiya /></div>);
  act(() => { belgila(screen.getByTestId('p').firstChild!); fireEvent.mouseUp(document); });
  fireEvent.click(screen.getByTestId('ai-selektsiya'));
  expect(eshit).toHaveBeenCalledTimes(1);
  expect((eshit.mock.calls[0][0] as CustomEvent<{ savol: string }>).detail.savol).toContain('«Nakopitelniy vedomost 150 026 606,32»');
  expect(screen.queryByTestId('ai-selektsiya')).toBeNull();
  window.removeEventListener('ai:ochish', eshit as EventListener);
});

it('kiritish maydonlari (parol, forma, tahrirlanadigan joy, data-ai-yashir) ichidagi matn HECH QACHON taklif qilinmaydi', () => {
  render(<div>
    <div contentEditable suppressContentEditableWarning data-testid="ce">maxfiy matn bor</div>
    <div data-ai-yashir=""><span data-testid="yashir">yashirin hudud</span></div>
    <textarea defaultValue="maxfiy izoh" data-testid="ta" /><AiSelektsiya />
  </div>);
  for (const id of ['ce', 'yashir']) { act(() => { belgila(screen.getByTestId(id).firstChild!); fireEvent.mouseUp(document); }); expect(screen.queryByTestId('ai-selektsiya')).toBeNull(); }
  const ta = screen.getByTestId('ta') as HTMLTextAreaElement; ta.focus(); ta.setSelectionRange(0, 6);
  act(() => { fireEvent.mouseUp(document); });
  expect(screen.queryByTestId('ai-selektsiya')).toBeNull();
});

it('juda qisqa yoki juda uzun belgilash e‘tiborsiz; selektsiyaMatni null holatlar', () => {
  expect(selektsiyaMatni(null)).toBeNull();
  render(<div><p data-testid="a">x</p><p data-testid="b">{'u'.repeat(300)}</p><AiSelektsiya /></div>);
  for (const id of ['a', 'b']) { act(() => { belgila(screen.getByTestId(id).firstChild!); fireEvent.mouseUp(document); }); expect(screen.queryByTestId('ai-selektsiya')).toBeNull(); }
});
