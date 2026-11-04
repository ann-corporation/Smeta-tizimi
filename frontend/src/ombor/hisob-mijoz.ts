import type { PaketXom } from './paket';
import type { HisobSorov, HisobJavob } from './hisob-protokol';

type Port = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;
export class HisobBekor extends Error {}
type Kutilgan = { resolve: (x: Extract<HisobJavob, {ok:true}>) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; epoch: number; revision: number };

/** Bitta mijoz = bitta active scope. Har hisob oldingisini bekor qiladi (latest wins).
 * Xato/crash/timeoutda osilib qolgan Promise yo‘q; close logout/obyekt switchda majburiy.
 * Hisob javobi serverTasdiqni hech qachon yoqmaydi.
 */
export class HisobMijoz {
  private port: Port | null;
  private seq = 0;
  private pending = new Map<number, Kutilgan>();
  private timeoutMs: number;
  constructor(port?: Port, timeoutMs = 15_000) {
    this.timeoutMs = timeoutMs;
    this.port = port ?? new Worker(new URL('./hisob.worker.ts', import.meta.url), { type: 'module' });
    this.port.onmessage = e => {
      const x = e.data as HisobJavob;
      const k = this.pending.get(x.id);
      if (!k) return;
      clearTimeout(k.timer); this.pending.delete(x.id);
      if (x.epoch !== k.epoch || x.revision !== k.revision) k.reject(new HisobBekor('HISOB_ESKI'));
      else if (x.ok) k.resolve(x);
      else k.reject(new Error('HISOB_PAKET_XATO'));
    };
    this.port.onerror = this.port.onmessageerror = () => this.yop();
  }
  private bekor() {
    for (const k of this.pending.values()) { clearTimeout(k.timer); k.reject(new HisobBekor('HISOB_BEKOR')); }
    this.pending.clear();
  }
  hisobla(paket: PaketXom, epoch: number, revision: number): Promise<Extract<HisobJavob, {ok:true}>> {
    this.bekor();
    if (!this.port) return Promise.reject(new HisobBekor('HISOB_YOPIQ'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.yop(), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, epoch, revision });
      try { this.port!.postMessage({ id, epoch, revision, paket } satisfies HisobSorov); }
      catch { this.yop(); }
    });
  }
  yop() { this.bekor(); this.port?.terminate(); this.port = null; }
}
