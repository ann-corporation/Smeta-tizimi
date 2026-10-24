import { describe, expect, it, vi } from 'vitest';
import { inputdami, kalitNorm, qisqaTugmami, sarlavhaBilan, tugmaKaliti, tugmaMatni, tugmaniBajar, type HotkeyDef } from './core';

const ev = (key: string, o: Partial<KeyboardEvent> & { target?: unknown } = {}) => {
  const e = { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, target: document.body, preventDefault: vi.fn(), ...o } as unknown as KeyboardEvent;
  return e;
};
const def = (id: string, keys: HotkeyDef['keys'], run: HotkeyDef['run'] = () => undefined, o: Partial<HotkeyDef> = {}): HotkeyDef => ({ id, keys, nom: id, run, ...o });

describe('tugma kaliti', () => {
  it('normallashadi: modifikatorlar tartibi, Cmd=Ctrl, belgi tugmalarda Shift qo‘shilmaydi', () => {
    expect(tugmaKaliti(ev('ArrowDown', { shiftKey: true }))).toBe('shift+arrowdown');
    expect(tugmaKaliti(ev('S', { ctrlKey: true }))).toBe('ctrl+s');
    expect(tugmaKaliti(ev('s', { metaKey: true }))).toBe('ctrl+s');
    expect(tugmaKaliti(ev('?', { shiftKey: true }))).toBe('?');
    expect(tugmaKaliti(ev(' '))).toBe('space');
    expect(tugmaKaliti(ev('Escape'))).toBe('esc');
    expect(kalitNorm('Shift+ArrowDown')).toBe('shift+arrowdown');
    expect(kalitNorm('Ctrl+Shift+Z')).toBe('ctrl+shift+z');
  });
  it('kirill klaviaturada jismoniy harf tugmasi (KeyN) lotincha qoidaga mos', () => {
    expect(tugmaKaliti({ ...ev('т'), code: 'KeyN' } as never)).toBe('n');
  });
  it('ko‘rinadigan yozuv va tooltip', () => {
    expect(tugmaMatni('shift+arrowdown')).toBe('Shift+↓');
    expect(tugmaMatni('ctrl+enter')).toBe('Ctrl+Enter');
    expect(sarlavhaBilan('Bog‘lash', 'b')).toBe('Bog‘lash (B)');
  });
});

describe('yozish paytida himoya', () => {
  it('input/textarea/select/contenteditable ichida — yozish; checkbox/button — yo‘q', () => {
    const inp = document.createElement('input');
    const cb = document.createElement('input'); cb.type = 'checkbox';
    expect(inputdami(inp)).toBe(true);
    expect(inputdami(document.createElement('textarea'))).toBe(true);
    expect(inputdami(document.createElement('select'))).toBe(true);
    expect(inputdami(cb)).toBe(false);
    expect(inputdami(document.createElement('div'))).toBe(false);
    expect(qisqaTugmami('n')).toBe(true); expect(qisqaTugmami('shift+n')).toBe(true); expect(qisqaTugmami('?')).toBe(true);
    expect(qisqaTugmami('ctrl+s')).toBe(false); expect(qisqaTugmami('esc')).toBe(false); expect(qisqaTugmami('enter')).toBe(false); expect(qisqaTugmami('arrowdown')).toBe(false);
  });

  it('inputda qisqa harf (N) hech qachon ishlamaydi, inInput belgilangan bo‘lsa ham; Ctrl+S va Esc ishlaydi', () => {
    const n = vi.fn(); const s = vi.fn(); const esc = vi.fn(); const pastga = vi.fn();
    const defs = [def('n', 'n', n, { inInput: true }), def('s', 'ctrl+s', s, { inInput: true }), def('esc', 'esc', esc, { inInput: true }), def('pastga', 'arrowdown', pastga)];
    const input = document.createElement('input');
    tugmaniBajar([defs], ev('n', { target: input }));
    tugmaniBajar([defs], ev('s', { ctrlKey: true, target: input }));
    tugmaniBajar([defs], ev('Escape', { target: input }));
    tugmaniBajar([defs], ev('ArrowDown', { target: input }));          // inInput emas → ishlamaydi
    expect(n).not.toHaveBeenCalled(); expect(s).toHaveBeenCalled(); expect(esc).toHaveBeenCalled(); expect(pastga).not.toHaveBeenCalled();
    tugmaniBajar([defs], ev('n'));                                      // inputdan tashqarida — ishlaydi
    expect(n).toHaveBeenCalledTimes(1);
  });
});

describe('dispetcher', () => {
  it('yuqori ustuvorlik birinchi; run=false keyingisiga o‘tkazadi; preventDefault faqat ishlaganda', () => {
    const past = vi.fn(); const yuqori = vi.fn(() => false);
    const e = ev('x');
    const r = tugmaniBajar([[def('yuqori', 'x', yuqori)], [def('past', 'x', past)]], e);
    expect(yuqori).toHaveBeenCalled(); expect(past).toHaveBeenCalled(); expect(r?.id).toBe('past');
    expect((e.preventDefault as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    const e2 = ev('q');
    expect(tugmaniBajar([[def('a', 'x')]], e2)).toBeNull();
    expect((e2.preventDefault as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
  it('enabled=false va IME kompozitsiyasi o‘tkazib yuboriladi; bir nechta kalit', () => {
    const run = vi.fn();
    expect(tugmaniBajar([[def('a', ['j', 'arrowdown'], run, { enabled: false })]], ev('j'))).toBeNull();
    expect(tugmaniBajar([[def('a', ['j', 'arrowdown'], run, { enabled: () => true })]], ev('ArrowDown'))?.id).toBe('a');
    expect(tugmaniBajar([[def('a', 'j', run)]], ev('j', { isComposing: true }))).toBeNull();
  });
});
