import { paketDekod, type PaketXom } from '../ombor/paket';
import type { ObyektOmbor } from '../ombor/obyekt-ombor';

type ExtendedPacket = PaketXom & {
  h: { f2_summa_yoq: Array<number | null> };
  meta: { akt_podval: unknown[] };
};
type CheckedPacket =
  | { ok: true; notModified: true; etag: string }
  | { ok: true; notModified: false; etag: string | null; paket: PaketXom }
  | { ok: false; status: number };

/** Scope belongs to one authorized desktop session. Destroy on logout/switch/revoke. */
export class DesktopPacketRefresh {
  private revision = 0;
  private previous?: { id: number; etag: string; f2SummaYoq: ReadonlyArray<number | null> };
  private closed = false;
  private busy = false;
  private readonly companyId: number;
  private readonly store: ObyektOmbor;
  private readonly read: (id: number, etag?: string) => Promise<CheckedPacket>;

  constructor(
    companyId: number,
    store: ObyektOmbor,
    read: (id: number, etag?: string) => Promise<CheckedPacket>,
  ) {
    this.companyId = companyId;
    this.store = store;
    this.read = read;
  }

  async refresh(id: number) {
    if (this.busy) throw new Error('DESKTOP_PACKET_BUSY');
    this.busy = true;
    try { return await this.refreshOnce(id); }
    finally { this.busy = false; }
  }

  private async refreshOnce(id: number) {
    if (this.closed || !Number.isSafeInteger(id) || id <= 0) throw new Error('DESKTOP_PACKET_SCOPE');
    const revision = ++this.revision;
    const prior = this.previous?.id === id ? this.previous : undefined;
    const etag = prior?.etag;
    const current = () => !this.closed && revision === this.revision;
    const response = await this.read(id, etag);
    if (!current()) return;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) await this.close();
      throw new Error('DESKTOP_PACKET_UNAVAILABLE');
    }
    if (response.notModified) {
      if (!prior || !etag || response.etag !== etag) throw new Error('DESKTOP_PACKET_ETAG');
      // Only an authorized 304 may unlock the scoped snapshot. Never fall back on a network error.
      const saved = await this.store.och(id);
      if (!current()) return;
      if (!saved?.paket) {
        this.previous = undefined;
        return;
      }
      return { paket: saved.paket, f2SummaYoq: prior.f2SummaYoq, serverTasdiq: true as const };
    }
    const raw = response.paket as ExtendedPacket;
    if (raw.kompaniya_id !== this.companyId || raw.obyekt_id !== id) {
      await this.close();
      throw new Error('DESKTOP_PACKET_SCOPE');
    }
    if (!Array.isArray(raw.h?.f2_summa_yoq) || raw.h.f2_summa_yoq.length !== raw.soni ||
        raw.h.f2_summa_yoq.some(v => v !== null && (!Number.isSafeInteger(v) || v < 0)) ||
        !Array.isArray(raw.meta?.akt_podval)) throw new Error('DESKTOP_PACKET_SCHEMA');
    const paket = paketDekod(raw);
    await this.store.serverdan(raw);
    if (!current()) return;
    const f2SummaYoq = Object.freeze([...raw.h.f2_summa_yoq]);
    this.previous = response.etag ? { id, etag: response.etag, f2SummaYoq } : undefined;
    return { paket, f2SummaYoq, serverTasdiq: true as const };
  }

  async close() {
    this.closed = true;
    this.revision++;
    this.previous = undefined;
    await this.store.yop();
  }
}
