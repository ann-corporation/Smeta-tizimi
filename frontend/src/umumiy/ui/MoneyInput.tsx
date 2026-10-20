import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { displayOffset, formatMoneyInput, isCompleteMoney, moneyConstraint, moneyValueToRaw, parseMoneyEdit, parseMoneyInput, rawOffset, sameMoney } from '../../lib/money-input';
import { t } from '../../i18n/til';

export interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  value?: string | number | null;
  defaultValue?: string | number | null;
  onValueChange: (raw: string) => void;
  grouping?: boolean;
  /** Buffer incomplete money drafts for numeric consumers, including blank/null values. */
  numericValue?: boolean;
  /** Native input semantics in passthrough mode only. */
  ungroupedType?: InputHTMLAttributes<HTMLInputElement>['type'];
}

/**
 * Text editor, not a financial calculator. Callback drafts include '', '-', '.', '-.'.
 * null and '' both display blank without emitting; explicit 0 displays '0'. The caller
 * retains the distinction between unknown and blank. grouping=false passes text verbatim.
 * Use strings for exact amounts;
 * numbers can only preserve precision already present in the JS number.
 * Native form submission contains the DISPLAY value; persist onValueChange's raw value.
 * Numeric values or numericValue=true buffer incomplete drafts without callback, including
 * initial blank/null values; acknowledged numeric
 * echoes retain decimal spelling. Empty still emits '' (the caller must handle null explicitly).
 * min/max/step use exact custom validity; omitted step means 'any' for monetary precision.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput({
  value, defaultValue, onValueChange, grouping = true, numericValue = false, ungroupedType = 'text',
  onKeyDown, onPaste, onDrop, onCompositionStart, onCompositionEnd, onCompositionUpdate,
  inputMode, ...props
}, forwardedRef) {
  const controlled = value !== undefined;
  const toRaw = (v: typeof value) => grouping ? moneyValueToRaw(v) : v == null ? '' : String(v);
  const [local, setLocal] = useState(() => toRaw(defaultValue));
  const [numericDraft, setNumericDraft] = useState<{ text: string; base: typeof value } | null>(null);
  const external = controlled ? toRaw(value) : local;
  const numeric = grouping && (numericValue || typeof value === 'number');
  const draftActive = numeric && numericDraft && (sameMoney(numericDraft.text, external)
    || (!isCompleteMoney(numericDraft.text) && Object.is(numericDraft.base, value)));
  const raw = draftActive ? numericDraft.text : external;
  const display = formatMoneyInput(raw, grouping);
  const input = useRef<HTMLInputElement | null>(null);
  const [revision, render] = useState(0);
  const [composition, setComposition] = useState<{ text: string; base: typeof value; raw: string } | null>(null);
  const composing = composition !== null && Object.is(composition.base, value) && composition.raw === raw;
  const pending = useRef<{ raw: string; start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null>(null);
  const selection = useRef({ start: 0, end: 0, direction: 'none' as 'forward' | 'backward' | 'none' });

  useLayoutEffect(() => {
    if (!draftActive && numericDraft) setNumericDraft(null);
  }, [draftActive, numericDraft]);

  useLayoutEffect(() => {
    input.current?.setCustomValidity(grouping && moneyConstraint(raw, props.min, props.max, props.step, defaultValue)
      ? t('Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.') : '');
  }, [raw, grouping, props.min, props.max, props.step, defaultValue]);

  useLayoutEffect(() => {
    if (composition && !composing) setComposition(null);
    if (composing) return;
    const element = input.current;
    const next = pending.current;
    pending.current = null;
    if (element && document.activeElement === element && element.selectionStart !== null) {
      const target = next?.raw === raw ? next : selection.current;
      const offset = (n: number) => grouping ? displayOffset(display, n) : Math.min(n, display.length);
      element.setSelectionRange(offset(target.start), offset(target.end), target.direction);
      selection.current = { start: target.start, end: target.end, direction: target.direction };
    }
  }, [raw, display, grouping, composing, composition, revision]);

  function rememberSelection() {
    const element = input.current;
    if (element) selection.current = {
      start: grouping ? rawOffset(element.value, element.selectionStart ?? 0) : element.selectionStart ?? 0,
      end: grouping ? rawOffset(element.value, element.selectionEnd ?? 0) : element.selectionEnd ?? 0,
      direction: element.selectionDirection ?? 'none',
    };
  }

  function commit(next: string | null, start: number, end = start, direction: 'forward' | 'backward' | 'none' = 'none') {
    if (next === null) {
      pending.current = { raw, ...selection.current };
    } else {
      pending.current = { raw: next, start, end, direction };
      if (!controlled) setLocal(next);
      if (numeric) setNumericDraft({ text: next, base: value });
    }
    render(n => n + 1);
    if (next !== null && next !== raw && !(numeric && next !== '' && !isCompleteMoney(next))) onValueChange(next);
  }

  function insert(text: string) {
    const element = input.current;
    if (!element) return;
    rememberSelection();
    const pasted = parseMoneyInput(text);
    if (pasted === null) { commit(null, 0); return; }
    const { start, end } = selection.current;
    const next = parseMoneyInput(raw.slice(0, start) + pasted + raw.slice(end));
    commit(next, start + pasted.length);
  }

  return <input {...props} type={grouping ? 'text' : ungroupedType} inputMode={inputMode ?? (grouping ? 'decimal' : undefined)}
    data-money-input={grouping ? '' : undefined}
    ref={element => {
      input.current = element;
      if (typeof forwardedRef === 'function') return forwardedRef(element);
      if (forwardedRef) forwardedRef.current = element;
    }}
    value={composing ? composition.text : display}
    onSelect={event => { rememberSelection(); props.onSelect?.(event); }}
    onChange={event => {
      if (props.readOnly || props.disabled) return;
      if (composing) { setComposition({ ...composition, text: event.currentTarget.value }); return; }
      const element = event.currentTarget;
      if (!grouping) {
        commit(element.value, element.selectionStart ?? element.value.length, element.selectionEnd ?? element.value.length, element.selectionDirection ?? 'none');
        return;
      }
      const inputType = (event.nativeEvent as InputEvent).inputType;
      const caret = element.selectionStart ?? element.value.length;
      if (element.value.replace(/ /g, '') === raw && element.value.length === display.length - 1
        && (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward')) {
        const at = rawOffset(element.value, caret) - (inputType === 'deleteContentBackward' ? 1 : 0);
        commit(raw.slice(0, at) + raw.slice(at + 1), at);
        return;
      }
      commit(parseMoneyEdit(display, element.value), rawOffset(element.value, element.selectionStart ?? element.value.length),
        rawOffset(element.value, element.selectionEnd ?? element.value.length), element.selectionDirection ?? 'none');
    }}
    onKeyDown={event => {
      // Numeric consumers may still hold the last valid value while this field
      // displays an incomplete draft. Check before a caller's Enter-save handler.
      if (grouping && event.key === 'Enter' && !event.defaultPrevented
        && !event.nativeEvent.isComposing && !composing && !props.readOnly && !props.disabled
        && !event.currentTarget.reportValidity()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onKeyDown?.(event);
      rememberSelection();
      if (!grouping || event.defaultPrevented || event.nativeEvent.isComposing || composing || props.readOnly || props.disabled
        || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const element = event.currentTarget;
      const caret = element.selectionStart ?? 0;
      if (caret !== element.selectionEnd) return;
      const backward = event.key === 'Backspace' && display[caret - 1] === ' ';
      const forward = event.key === 'Delete' && display[caret] === ' ';
      if (!backward && !forward) return;
      event.preventDefault();
      const offset = rawOffset(display, caret);
      const at = backward ? offset - 1 : offset;
      commit(raw.slice(0, at) + raw.slice(at + 1), at);
    }}
    onPaste={event => {
      onPaste?.(event);
      if (!grouping || event.defaultPrevented || props.readOnly || props.disabled || composing) return;
      event.preventDefault();
      insert(event.clipboardData.getData('text'));
    }}
    onDrop={event => {
      onDrop?.(event);
      // Browser drop placement is platform-dependent. Reject malformed amounts before insertion.
      if (grouping && !event.defaultPrevented && parseMoneyInput(event.dataTransfer.getData('text')) === null) event.preventDefault();
    }}
    onCompositionStart={event => {
      rememberSelection();
      setComposition({ text: event.currentTarget.value, base: value, raw });
      onCompositionStart?.(event);
    }}
    onCompositionUpdate={onCompositionUpdate}
    onCompositionEnd={event => {
      const text = event.currentTarget.value;
      setComposition(null);
      if (composing && !props.readOnly && !props.disabled) {
        commit(grouping ? parseMoneyEdit(display, text) : text, grouping ? rawOffset(text, event.currentTarget.selectionStart ?? text.length) : event.currentTarget.selectionStart ?? text.length);
      }
      onCompositionEnd?.(event);
    }}
  />;
});
