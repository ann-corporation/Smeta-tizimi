import { paketDekod, type Paket, type PaketXom } from './paket';
import { shifrla, shifrOch } from './ombor-idb';
import { doiraKaliti, type OmborDoira, type Saqlash } from './saqlash';

export type OmborHolat = { paket: Paket | null; serverTasdiq: boolean };
/** D1a: faqat server snapshot. Offline buyruqlar D5 da qo'shiladi. */
export class ObyektOmbor {
  private xotira = new Map<number, OmborHolat>();
  private tinglovchilar = new Set<() => void>();
  private davr = 0;
  private yopiq = false;
  private navbat: Promise<void> = Promise.resolve();
  private prefix: string;
  private kompaniyaId: number;
  private disk: Saqlash;
  private secret: CryptoKey;
  constructor(disk: Saqlash, doira: OmborDoira, secret: CryptoKey) {
    this.disk = disk; this.secret = secret;
    this.prefix = `paket/${doiraKaliti(doira)}/`;
    this.kompaniyaId = doira.kompaniyaId;
  }
  private kalit(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('OMBOR_OBJECT_INVALID');
    return this.prefix + id;
  }
  private tekshir(x: PaketXom, id: number) {
    if (x.kompaniya_id !== this.kompaniyaId || x.obyekt_id !== id) throw new Error('OMBOR_SCOPE_MISMATCH');
    return paketDekod(x);
  }
  private joyla(id: number, holat: OmborHolat) {
    this.xotira.delete(id); this.xotira.set(id, holat);
    while (this.xotira.size > 3) this.xotira.delete(this.xotira.keys().next().value!);
    for (const f of this.tinglovchilar) f();
  }
  subscribe = (f: () => void) => { this.tinglovchilar.add(f); return () => { this.tinglovchilar.delete(f); }; };
  getSnapshot(id: number): OmborHolat | undefined { return this.xotira.get(id); }
  /** Har ochilish avvalgi server tasdig'ini bekor qiladi. */
  async och(id: number): Promise<OmborHolat | undefined> {
    if (this.yopiq) return undefined;
    const k = this.kalit(id), e = this.davr;
    const old = this.xotira.get(id);
    if (old) { const h = { paket: old.paket, serverTasdiq: false }; this.joyla(id, h); return h; }
    await this.navbat;
    const bytes = await this.disk.ol(k);
    if (!bytes || e !== this.davr || this.yopiq) return undefined;
    // Buzilgan yoki begona sessiya ciphertext'i ekranga chiqmaydi.
    let x: PaketXom;
    try { x = await shifrOch(k, bytes, this.secret) as PaketXom; this.tekshir(x, id); }
    catch { return undefined; }
    if (e !== this.davr || this.yopiq) return undefined;
    // Kechikkan disk javobi yangi server javobini bosmaydi.
    const current = this.xotira.get(id);
    if (current) return current;
    const h = { paket: this.tekshir(x, id), serverTasdiq: false }; this.joyla(id, h); return h;
  }
  async serverdan(x: PaketXom): Promise<void> {
    if (this.yopiq) throw new Error('OMBOR_CLOSED');
    x = structuredClone(x);
    const id = x.obyekt_id, k = this.kalit(id), paket = this.tekshir(x, id), e = this.davr;
    this.joyla(id, { paket, serverTasdiq: true });
    // Chiqish va yozuvlar bitta navbatda: kech yozuv chiqishdan keyin tiklanmaydi.
    const job = this.navbat.then(async () => {
      const bytes = await shifrla(k, x, this.secret);
      if (e !== this.davr || this.yopiq) return;
      await this.disk.yoz(k, bytes);
      const ks = (await this.disk.kalitlar()).filter(v => v.startsWith(this.prefix) && v !== k);
      for (const old of ks.slice(0, Math.max(0, ks.length - 29))) await this.disk.ochir(old);
    });
    this.navbat = job.catch(() => {});
    await job;
  }
  /** Logout/access revoke: shu session ombori qayta ishlatilmaydi. */
  async yop(): Promise<void> {
    this.yopiq = true; this.davr++; this.xotira.clear();
    for (const f of this.tinglovchilar) f();
    await this.navbat;
    for (const k of (await this.disk.kalitlar()).filter(v => v.startsWith(this.prefix))) await this.disk.ochir(k);
    this.tinglovchilar.clear();
  }
}
