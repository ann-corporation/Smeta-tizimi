import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { updateDesktopReadStatus } from './read-status';
import { useQaytaUlanish } from './qayta-ulanish';

function Probe({ cb }: { cb: () => void }) { useQaytaUlanish(cb); return null; }
afterEach(() => { cleanup(); updateDesktopReadStatus(false); });

describe('useQaytaUlanish', () => {
  it('window online hodisasida chaqiriladi', () => {
    const cb = vi.fn();
    render(<Probe cb={cb} />);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('desktop o‘qish holati offline -> online bo‘lganda chaqiriladi; offline o‘tishda emas', () => {
    const cb = vi.fn();
    render(<Probe cb={cb} />);
    act(() => updateDesktopReadStatus(true));
    expect(cb).not.toHaveBeenCalled();
    act(() => updateDesktopReadStatus(false));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unmountdan keyin chaqirilmaydi', () => {
    const cb = vi.fn();
    const r = render(<Probe cb={cb} />);
    r.unmount();
    window.dispatchEvent(new Event('online'));
    expect(cb).not.toHaveBeenCalled();
  });
});
