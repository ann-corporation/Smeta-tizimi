import { afterEach, expect, it, vi } from 'vitest';
import { prixodKitobFonda } from './read-fonda';
const mocks = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('./kitob', () => ({ prixodKitobOqi: mocks.parse }));
afterEach(() => { vi.unstubAllGlobals(); mocks.parse.mockReset(); });
const options = { faylNomi: 'synthetic.xlsx', kompaniyaId: 2, skladId: 7 };

it('an already canceled attempt never starts reading a file', async () => {
  const abort = new AbortController(); abort.abort();
  await expect(prixodKitobFonda(new Uint8Array(), options, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.parse).not.toHaveBeenCalled();
});
it('canceling the fallback discards an already running result', async () => {
  vi.stubGlobal('Worker', undefined);
  let finish!: (v: unknown) => void;
  mocks.parse.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const abort = new AbortController();
  const pending = prixodKitobFonda(new Uint8Array(), options, abort.signal);
  const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(1));
  abort.abort(); finish({ marker: 'stale-result' }); await check;
});
it('canceling a worker terminates it and releases the current attempt', async () => {
  const terminate = vi.fn();
  class FakeWorker {
    onmessage: unknown; onerror: unknown;
    postMessage = vi.fn(); terminate = terminate;
  }
  vi.stubGlobal('Worker', FakeWorker);
  const abort = new AbortController();
  const pending = prixodKitobFonda(new Uint8Array(), options, abort.signal);
  const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  abort.abort(); await check;
  expect(terminate).toHaveBeenCalledTimes(1); expect(mocks.parse).not.toHaveBeenCalled();
});
