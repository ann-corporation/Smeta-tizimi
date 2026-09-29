import { afterEach, describe, expect, it, vi } from 'vitest';
import { f2AktlarniOqiFonda } from './fonda';

describe('F2 worker file handoff', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('passes the File/Blob to the worker without opening a full XLSX ArrayBuffer on the UI thread', async () => {
    const blob = new Blob(['large workbook placeholder']);
    const readOnMainThread = vi.spyOn(blob, 'arrayBuffer');
    let posted: unknown;
    let transferList: Transferable[] | undefined;

    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage(message: unknown, transfer: Transferable[] = []) {
        posted = message;
        transferList = transfer;
        const id = (message as { id: number }).id;
        queueMicrotask(() => this.onmessage?.({ data: { id, ok: true, aktlar: [] } } as MessageEvent));
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);

    await expect(f2AktlarniOqiFonda('large.xlsx', blob)).resolves.toEqual([]);
    expect((posted as { source?: Blob }).source).toBe(blob);
    expect(transferList).toEqual([]);
    expect(readOnMainThread).not.toHaveBeenCalled();
  });
});
