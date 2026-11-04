import { ObyektOmbor, type OmborHolat } from './obyekt-ombor';
import { doiraKaliti, type OmborDoira, type Saqlash } from './saqlash';
import type { PaketXom } from './paket';

export type ObyektDoira = OmborDoira & { obyektId: number };
/** Trusted adapter must perform a CURRENT online check for the entire package scope.
 * A user permission boolean, cached membership or D7 lease is not this port. */
export type ObyektRuxsatPort = (doira: Readonly<ObyektDoira>) => Promise<
  | { ok: true; doira: ObyektDoira }
  | { ok: false; status: number }
>;
export type SessiyaOqish = {
  joriy: () => boolean;
  och: () => Promise<OmborHolat | undefined>;
  serverdan: (paket: PaketXom) => Promise<void>;
};
export type SessiyaRuxsat =
  | { ok: true; oqish: SessiyaOqish }
  | { ok: false; status: number; eskiJoriy?: () => boolean };

/** D1b standalone prerequisite. No auth wiring, tokens, persistent key or offline lease. */
export class OmborSessiya {
  private davr = 0;
  private sorov = 0;
  private ombor?: ObyektOmbor;
  private doira?: OmborDoira;
  private tugaydi = 0;
  private monoTugaydi = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private tozalash: Promise<void> = Promise.resolve();
  private tozalashXato = false;
  private disk: Saqlash;
  private ruxsat: ObyektRuxsatPort;
  private bekor: () => void;

  constructor(
    disk: Saqlash,
    ruxsat: ObyektRuxsatPort,
    /** Must synchronously clear rendered data on logout/revoke/refresh/switch/expiry. */
    bekor: () => void,
  ) { this.disk = disk; this.ruxsat = ruxsat; this.bekor = bekor; }

  get tozalashXatosi(): boolean { return this.tozalashXato; }

  /** Fresh non-extractable key on login AND refresh/switch; never resume old ciphertext. */
  async boshlash(doira: OmborDoira, tugaydi: number): Promise<boolean> {
    const tozalash = this.yop();
    const e = this.davr;
    doira = { ...doira };
    doiraKaliti(doira);
    if (!Number.isFinite(tugaydi) || tugaydi <= Date.now()) return false;
    const monoTugaydi = performance.now() + tugaydi - Date.now();
    await tozalash;
    if (e !== this.davr || this.tozalashXato) return false;
    const secret = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    if (e !== this.davr || tugaydi <= Date.now() || performance.now() >= monoTugaydi) return false;
    this.doira = { ...doira };
    this.tugaydi = tugaydi;
    this.monoTugaydi = monoTugaydi;
    this.ombor = new ObyektOmbor(this.disk, doira, secret);
    const tekshir = () => {
      if (!this.faol()) return;
      this.timer = setTimeout(tekshir, Math.min(2_147_483_647, Math.max(1,
        Math.min(this.tugaydi - Date.now(), this.monoTugaydi - performance.now()))));
    };
    tekshir();
    return true;
  }

  private faol(): boolean {
    if (!this.ombor) return false;
    if (Date.now() >= this.tugaydi || performance.now() >= this.monoTugaydi) {
      void this.yop();
      return false;
    }
    return true;
  }

  /** Every open reauthorizes online, before any memory/disk read. New opens supersede old. */
  async tekshirObyekt(id: number, kompaniyaId: number): Promise<SessiyaRuxsat> {
    this.sorov++;
    if (!this.faol() || !this.doira) return { ok: false, status: 401 };
    if (!Number.isSafeInteger(id) || id <= 0 || kompaniyaId !== this.doira.kompaniyaId) {
      void this.yop();
      return { ok: false, status: 0 };
    }
    const e = this.davr, s = this.sorov, ombor = this.ombor!;
    const doira = { ...this.doira, obyektId: id };
    const joriy = () => e === this.davr && s === this.sorov && this.faol();
    let javob: Awaited<ReturnType<ObyektRuxsatPort>>;
    try { javob = await this.ruxsat(Object.freeze({ ...doira })); }
    catch { if (joriy()) void this.yop(); return { ok: false, status: 0 }; }
    if (!joriy()) return { ok: false, status: 0 };
    if (!javob?.ok) {
      const status = javob?.status ?? 0;
      const eskiJoriy = this.paketRad();
      return { ok: false, status, eskiJoriy: status === 403 ? eskiJoriy : undefined };
    }
    if (!javob.doira || javob.doira.kompaniyaId !== doira.kompaniyaId ||
      javob.doira.foydalanuvchiId !== doira.foydalanuvchiId || javob.doira.obyektId !== id) {
      void this.yop();
      return { ok: false, status: 0 };
    }
    return { ok: true, oqish: {
      joriy,
      och: async () => {
        if (!joriy()) return undefined;
        const h = await ombor.och(id);
        return joriy() ? h : undefined;
      },
      serverdan: async x => {
        if (!joriy()) return;
        if (x.obyekt_id !== id || x.kompaniya_id !== doira.kompaniyaId) {
          void this.yop();
          throw new Error('OMBOR_SCOPE_MISMATCH');
        }
        await ombor.serverdan(x);
      },
    } };
  }

  /** Convenience cache-only API: denied authorization never returns a cache handle. */
  async obyekt(id: number, kompaniyaId: number): Promise<SessiyaOqish | undefined> {
    const r = await this.tekshirObyekt(id, kompaniyaId);
    return r.ok ? r.oqish : undefined;
  }

  /** Package 403 can mean missing f2/narx, not smeta. Clear cache immediately,
   * retain only a narrow legacy-result ticket; logout/switch/new open kills it. */
  paketRad(): () => boolean {
    const tugaydi = this.tugaydi, monoTugaydi = this.monoTugaydi;
    const e = this.davr + 1, s = this.sorov + 1;
    void this.yop();
    // Legacy rows may be published after cache revocation. Their UI must still expire.
    const muddat = () => {
      if (e !== this.davr) return;
      const left = Math.min(tugaydi - Date.now(), monoTugaydi - performance.now());
      if (left <= 0) { void this.yop(); return; }
      this.timer = setTimeout(muddat, Math.min(2_147_483_647, Math.max(1, left)));
    };
    muddat();
    return () => e === this.davr && s === this.sorov && Date.now() < tugaydi && performance.now() < monoTugaydi;
  }

  /** Immediate memory/UI invalidation; queued disk deletion follows every delayed write.
   * Cleanup failure poisons this manager (fail closed); inspect tozalashXatosi after await. */
  yop(): Promise<void> {
    this.davr++; this.sorov++;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const old = this.ombor;
    this.ombor = undefined; this.doira = undefined;
    const cleanup = old?.yop(); // ObyektOmbor clears memory synchronously before its first await.
    const previous = this.tozalash;
    this.tozalash = Promise.all([previous, cleanup]).then(() => {}).catch(() => { this.tozalashXato = true; });
    this.bekor();
    return this.tozalash;
  }
}
