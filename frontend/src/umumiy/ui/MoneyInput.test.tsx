import { createRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { MoneyInput } from './MoneyInput';
import type { MoneyInputProps } from './MoneyInput';

afterEach(cleanup);
function getInput(container: HTMLElement) { return container.querySelector('input')!; }
function Echo({ initial = '', ...props }: Omit<MoneyInputProps, 'value'> & { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return <MoneyInput {...props} value={value} onValueChange={raw => { setValue(raw); props.onValueChange(raw); }} />;
}
function edit(input: HTMLInputElement, value: string, caret = value.length) {
  fireEvent.change(input, { target: { value, selectionStart: caret, selectionEnd: caret } });
}
function select(input: HTMLInputElement, start: number, end = start) {
  input.focus(); input.setSelectionRange(start, end); fireEvent.select(input);
}
function paste(input: HTMLInputElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe('MoneyInput', () => {
  it('blocks invalid Enter before caller/ancestor save handlers and reports validity', () => {
    const caller = vi.fn(); const ancestor = vi.fn(); const invalid = vi.fn();
    const callback = vi.fn();
    const { container } = render(<div onKeyDown={ancestor}>
      <MoneyInput numericValue value="" onValueChange={callback} onKeyDown={caller} onInvalid={invalid} />
    </div>);
    const input = getInput(container);
    input.focus();
    edit(input, '-.');
    const report = vi.spyOn(input, 'reportValidity');
    expect(fireEvent.keyDown(input, { key: 'Enter', cancelable: true })).toBe(false);
    expect(report).toHaveBeenCalledOnce();
    expect(invalid).toHaveBeenCalledOnce();
    expect(caller).not.toHaveBeenCalled();
    expect(ancestor).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(input.value).toBe('-.');
  });
  it.each([
    { value: '1', min: '2' }, { value: '3', max: '2' },
    { value: '1.25', step: '1' }, { value: '', required: true },
  ])('blocks Enter for explicit constraints: %j', props => {
    const caller = vi.fn();
    const { container } = render(<MoneyInput {...props} onValueChange={vi.fn()} onKeyDown={caller} />);
    const input = getInput(container);
    expect(fireEvent.keyDown(input, { key: 'Enter', cancelable: true })).toBe(false);
    expect(caller).not.toHaveBeenCalled();
  });
  it('forwards valid Enter and Escape while preserving native event/ref', () => {
    const caller = vi.fn(); const ref = createRef<HTMLInputElement>();
    const { container } = render(<MoneyInput ref={ref} value="1.250001" onValueChange={vi.fn()} onKeyDown={caller} />);
    const input = getInput(container);
    const report = vi.spyOn(input, 'reportValidity');
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true);
    expect(report).toHaveBeenCalledOnce();
    expect(caller.mock.calls[0][0].target).toBe(input);
    expect(ref.current).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(caller).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledOnce();
  });
  it('does not intercept passthrough Enter or IME confirmation', () => {
    const caller = vi.fn();
    const { container, rerender } = render(<MoneyInput grouping={false} ungroupedType="number" value="3" max="2" onValueChange={vi.fn()} onKeyDown={caller} />);
    const input = getInput(container);
    const report = vi.spyOn(input, 'reportValidity');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(caller).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
    rerender(<MoneyInput value="-" onValueChange={vi.fn()} onKeyDown={caller} />);
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true);
    expect(caller).toHaveBeenCalledTimes(2);
    expect(report).not.toHaveBeenCalled();
  });
  it.each([
    { initial: '', coalesce: true },
    { initial: null, coalesce: true },
    { initial: null, coalesce: false },
  ])('buffers blank-start numeric consumer drafts: %j', ({ initial, coalesce }) => {
    const callback = vi.fn();
    function NumericConsumer() {
      const [narx, setNarx] = useState<string | number | null>(initial);
      return <MoneyInput numericValue value={coalesce ? narx ?? '' : narx} onValueChange={raw => {
        const next = Number(raw);
        callback(raw, next);
        setNarx(next);
      }} />;
    }
    const { container } = render(<NumericConsumer />);
    const input = getInput(container);
    expect(input.value).toBe('');
    expect(input.hasAttribute('numericValue')).toBe(false);
    select(input, 0);
    edit(input, '-');
    expect(input.value).toBe('-');
    expect(input.selectionStart).toBe(1);
    expect(input.checkValidity()).toBe(false);
    edit(input, '-.');
    expect(input.value).toBe('-.');
    expect(input.selectionStart).toBe(2);
    expect(callback).not.toHaveBeenCalled();
    edit(input, '-.50');
    expect(input.value).toBe('-.50');
    expect(input.selectionStart).toBe(4);
    expect(input.checkValidity()).toBe(true);
    expect(callback).toHaveBeenCalledExactlyOnceWith('-.50', -0.5);
    edit(input, '-1234.0500');
    expect(input.value).toBe('-1 234.0500');
    expect(callback).toHaveBeenLastCalledWith('-1234.0500', -1234.05);
    expect(callback.mock.calls.every(([, next]) => Number.isFinite(next))).toBe(true);
  });
  it('numericValue does not alter grouping=false passthrough', () => {
    const callback = vi.fn();
    const { container } = render(<Echo numericValue grouping={false} onValueChange={callback} />);
    const input = getInput(container);
    edit(input, '-.');
    expect(input.value).toBe('-.');
    expect(callback).toHaveBeenCalledExactlyOnceWith('-.');
  });
  it('buffers numeric-parent transient signs and retains acknowledged decimal spelling', () => {
    const callback = vi.fn();
    function NumericParent() {
      const [value, setValue] = useState(12);
      return <MoneyInput value={value} onValueChange={raw => { callback(raw); setValue(Number(raw)); }} step="any" />;
    }
    const { container } = render(<NumericParent />);
    const input = getInput(container);
    select(input, 0, input.value.length);
    edit(input, '-');
    expect(input.value).toBe('-');
    expect(input.selectionStart).toBe(1);
    expect(input.checkValidity()).toBe(false);
    edit(input, '-.');
    expect(input.value).toBe('-.');
    expect(callback).not.toHaveBeenCalled();
    edit(input, '-.5');
    expect(input.value).toBe('-.5');
    expect(callback).toHaveBeenLastCalledWith('-.5');
    edit(input, '-0.500');
    expect(input.value).toBe('-0.500');
    expect(input.selectionStart).toBe(6);
    expect(input.checkValidity()).toBe(true);
    expect(callback).toHaveBeenLastCalledWith('-0.500');
    expect(callback.mock.calls.every(([raw]) => Number.isFinite(Number(raw)))).toBe(true);
  });
  it('numeric external replacements discard draft; string parents receive incomplete drafts', () => {
    const callback = vi.fn();
    const { container, rerender } = render(<MoneyInput value={12} onValueChange={callback} />);
    const input = getInput(container);
    input.focus();
    edit(input, '-');
    expect(input.value).toBe('-');
    rerender(<MoneyInput value={99} onValueChange={callback} />);
    expect(input.value).toBe('99');
    expect(callback).not.toHaveBeenCalled();
    rerender(<MoneyInput value="99" onValueChange={callback} />);
    edit(input, '-.');
    expect(callback).toHaveBeenLastCalledWith('-.');
  });
  it('enforces exact min/max/step and required through native form validation', () => {
    const callback = vi.fn();
    const { container, rerender } = render(<form><MoneyInput value="1.23" min="0.01" max="2.01" step="0.02" required onValueChange={callback} /></form>);
    const input = getInput(container);
    const form = container.querySelector('form')!;
    expect(form.checkValidity()).toBe(true);
    for (const value of ['0', '3.01', '1.24', '-.', '']) {
      rerender(<form><MoneyInput value={value} min="0.01" max="2.01" step="0.02" required onValueChange={callback} /></form>);
      expect(form.checkValidity()).toBe(false);
    }
    rerender(<form><MoneyInput value="1.24000" min="0.01" max="2.01" step="any" onValueChange={callback} /></form>);
    expect(form.checkValidity()).toBe(true);
    expect(input.validity.customError).toBe(false);
    rerender(<form><MoneyInput grouping={false} ungroupedType="number" value="3" max="2" onValueChange={callback} /></form>);
    expect(input.validity.rangeOverflow).toBe(true);
    expect(input.validity.customError).toBe(false);
  });
  it('allows six-decimal prices by default without weakening explicit step', () => {
    const callback = vi.fn();
    const { container, rerender } = render(<MoneyInput value="1234.123456" onValueChange={callback} />);
    const input = getInput(container);
    expect(input.value).toBe('1 234.123456');
    expect(input.checkValidity()).toBe(true);
    rerender(<MoneyInput value="1234.123456" step="0.01" onValueChange={callback} />);
    expect(input.checkValidity()).toBe(false);
  });
  it('types exact negative decimals, comma, trailing separator and zeros', () => {
    const callback = vi.fn();
    const { container } = render(<Echo onValueChange={callback} />);
    const input = getInput(container);
    input.focus();
    edit(input, '-123456789012345678901,');
    expect(input.value).toBe('-123 456 789 012 345 678 901.');
    edit(input, '-123 456 789 012 345 678 901.00900');
    expect(callback).toHaveBeenLastCalledWith('-123456789012345678901.00900');
    expect(input.value).toBe('-123 456 789 012 345 678 901.00900');
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('decimal');
  });
  it('does not coerce null or blank to zero or emit on external updates; parent may reject edits', () => {
    const callback = vi.fn();
    const { container, rerender } = render(<MoneyInput value={null} onValueChange={callback} />);
    const input = getInput(container);
    expect(input.value).toBe('');
    rerender(<MoneyInput value={0} onValueChange={callback} />);
    expect(input.value).toBe('0');
    rerender(<MoneyInput value="" onValueChange={callback} />);
    expect(input.value).toBe('');
    expect(callback).not.toHaveBeenCalled();
    rerender(<MoneyInput value="0" onValueChange={callback} />);
    edit(input, '');
    expect(callback).toHaveBeenLastCalledWith('');
    expect(input.value).toBe('0');
  });
  it('uses defaultValue only initially', () => {
    const callback = vi.fn();
    const { container, rerender } = render(<MoneyInput defaultValue="1234.00" onValueChange={callback} />);
    const input = getInput(container);
    expect(input.value).toBe('1 234.00');
    edit(input, '1 234.005');
    rerender(<MoneyInput defaultValue="9" onValueChange={callback} />);
    expect(input.value).toBe('1 234.005');
    expect(callback).toHaveBeenCalledExactlyOnceWith('1234.005');
  });
  it('pastes NBSP amounts into a selection and rejects malformed pastes atomically', () => {
    const callback = vi.fn();
    const { container } = render(<Echo initial="99" onValueChange={callback} />);
    const input = getInput(container);
    select(input, 0, 2);
    paste(input, '-1\u00a0234,0500');
    expect(input.value).toBe('-1 234.0500');
    expect(callback).toHaveBeenLastCalledWith('-1234.0500');
    for (const malformed of ['1,234.56', '12 34', 'USD 100', '1.2.3']) {
      select(input, 0, input.value.length);
      paste(input, malformed);
      expect(input.value).toBe('-1 234.0500');
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    }
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid typing without losing the selection', () => {
    const callback = vi.fn();
    const { container } = render(<Echo initial="1234" onValueChange={callback} />);
    const input = getInput(container);
    select(input, 3);
    edit(input, '1 2x34', 4);
    expect(input.value).toBe('1 234');
    expect(input.selectionStart).toBe(3);
    expect(callback).not.toHaveBeenCalled();
  });
  it('keeps middle caret after regrouping, deletion and range replacement', () => {
    const { container } = render(<Echo initial="1234567.00" onValueChange={vi.fn()} />);
    const input = getInput(container);
    select(input, 4);
    edit(input, '1 2394 567.00', 5);
    expect(input.value).toBe('12 394 567.00');
    expect(input.selectionStart).toBe(5);
    edit(input, '12 94 567.00', 3);
    expect(input.value).toBe('1 294 567.00');
    expect(input.selectionStart).toBe(3);
    select(input, 2, 5);
    paste(input, '80');
    expect(input.value).toBe('180 567.00');
    expect(input.selectionStart).toBe(3);
  });
  it.each([['Backspace', 2, '234', 0], ['Delete', 1, '134', 1]] as const)('%s next to space removes adjacent digit', (key, caret, result, at) => {
    const callback = vi.fn();
    const { container } = render(<Echo initial="1234" onValueChange={callback} />);
    const input = getInput(container);
    select(input, caret);
    fireEvent.keyDown(input, { key });
    expect(input.value).toBe(result);
    expect(input.selectionStart).toBe(at);
    expect(callback).toHaveBeenLastCalledWith(result);
  });
  it.each([['deleteContentBackward', '234', 0], ['deleteContentForward', '134', 1]] as const)('handles mobile %s removing a space', (inputType, result, caret) => {
    const { container } = render(<Echo initial="1234" onValueChange={vi.fn()} />);
    const input = getInput(container);
    select(input, inputType === 'deleteContentBackward' ? 2 : 1);
    fireEvent.input(input, { inputType, target: { value: '1234', selectionStart: 1, selectionEnd: 1 } });
    expect(input.value).toBe(result);
    expect(input.selectionStart).toBe(caret);
  });
  it('preserves caret through external updates without callbacks', () => {
    const callback = vi.fn();
    const { container, rerender } = render(<MoneyInput value="12345.00" onValueChange={callback} />);
    const input = getInput(container);
    select(input, 4);
    rerender(<MoneyInput value="9876543.000" onValueChange={callback} />);
    expect(input.value).toBe('9 876 543.000');
    expect(input.selectionStart).toBe(4);
    expect(callback).not.toHaveBeenCalled();
  });
  it('forwards native ref/blur/keydown and respects preventDefault/readonly', () => {
    const ref = createRef<HTMLInputElement>();
    const blur = vi.fn(); const callback = vi.fn();
    const key = vi.fn((event: KeyboardEvent<HTMLInputElement>) => event.preventDefault());
    const { container, rerender } = render(<MoneyInput ref={ref} defaultValue="1234" onValueChange={callback} onBlur={blur} onKeyDown={key} />);
    const input = getInput(container);
    expect(ref.current).toBe(input);
    select(input, 2);
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(input.value).toBe('1 234');
    expect(key).toHaveBeenCalledOnce();
    fireEvent.blur(input);
    expect(blur.mock.calls[0][0].target).toBe(input);
    rerender(<MoneyInput ref={ref} defaultValue="1234" readOnly onValueChange={callback} />);
    paste(input, '7');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(callback).not.toHaveBeenCalled();
  });
  it('buffers composition, commits once, and rejects malformed composition', () => {
    const callback = vi.fn();
    const { container } = render(<Echo initial="1234" onValueChange={callback} />);
    const input = getInput(container);
    select(input, input.value.length);
    fireEvent.compositionStart(input);
    edit(input, '12345,00');
    expect(input.value).toBe('12345,00');
    expect(callback).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    expect(input.value).toBe('12 345.00');
    expect(callback).toHaveBeenCalledExactlyOnceWith('12345.00');
    edit(input, '12 345.00');
    expect(callback).toHaveBeenCalledTimes(1);
    fireEvent.compositionStart(input);
    edit(input, '漢字');
    fireEvent.compositionEnd(input);
    expect(input.value).toBe('12 345.00');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('external update wins over an active composition', () => {
    const callback = vi.fn();
    const { container, rerender } = render(<MoneyInput value="1234" onValueChange={callback} />);
    const input = getInput(container);
    fireEvent.compositionStart(input);
    edit(input, '99');
    rerender(<MoneyInput value="9876.00" onValueChange={callback} />);
    expect(input.value).toBe('9 876.00');
    fireEvent.compositionEnd(input);
    expect(callback).not.toHaveBeenCalled();
  });
  it('passes arbitrary text, spaces, comma and numeric literals verbatim without grouping', () => {
    const callback = vi.fn();
    const { container } = render(<Echo grouping={false} initial="arbitrary  text" onValueChange={callback} />);
    const input = getInput(container);
    expect(input.value).toBe('arbitrary  text');
    for (const literal of ['1e3', '+12,00', '1\u00a0234', 'USD unknown', '']) {
      edit(input, literal);
      expect(input.value).toBe(literal);
      expect(callback).toHaveBeenLastCalledWith(literal);
    }
  });
  it('retains native numeric type only in ungrouped mode', () => {
    const callback = vi.fn();
    const { container, rerender } = render(<Echo grouping={false} ungroupedType="number" initial="1e3" onValueChange={callback} min="0" step="any" />);
    const input = getInput(container);
    expect(input.type).toBe('number');
    expect(input.value).toBe('1e3');
    fireEvent.change(input, { target: { value: '1.2500' } });
    expect(callback).toHaveBeenLastCalledWith('1.2500');
    rerender(<MoneyInput ungroupedType="number" value="1234" onValueChange={callback} />);
    expect(getInput(container).type).toBe('text');
    expect(getInput(container).value).toBe('1 234');
  });
});
