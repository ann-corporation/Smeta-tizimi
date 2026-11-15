/**
 * Oflayn Fakt navbati (faqat `fakt_yoz_v2` va `fakt_belgila_v2`): tarmoq yo'q paytda yozuv native shifrlangan navbatga
 * tushadi, aloqa qaytganda TARTIB bilan va o'sha `operation_id` bilan yuboriladi (server takroriy amalni ikki marta
 * bajarmaydi). Server ziddiyati (qator o'zgargan, F-2 tasdiqlangan, akt qulflangan, boshqa rad) JIM yozilmaydi:
 * yozuv navbatda `nizo` bo'lib qoladi va foydalanuvchiga ko'rsatiladi; navbat shu yozuvdan keyin to'xtaydi (tartib saqlanadi).
 * Foto yuklash va F-2/imzo/to'lov/import bu navbatga KIRMAYDI.
 */
import type { Kopri } from './kopri';
import { oflaynYangila, type NavbatNizo } from './holat';

export const NAVBAT_AMALLARI = ['fakt_yoz_v2', 'fakt_belgila_v2'] as const;
export const NAVBAT_URL = '/api/sb-yoz';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NavbatElem = {
  v: 1;
  id: string;
  vaqt: number;
  amal: string;
  body: Record<string, unknown>;
  holat: 'kutmoqda' | 'nizo';
  xato?: string;
  kod?: string | null;
  urinish: number;
};

export type YuborNatija = { yuborildi: number; qoldi: number; toxtadi: 'tarmoq' | 'server' | 'sessiya' | 'nizo' | null };

type Deps = {
  kopri: Kopri;
  /** Tarmoqqa chiqish (interceptorsiz, asl fetch). */
  base: typeof fetch;
  now?: () => number;
  /** 16 ta hex belgi. */
  tasodif?: () => string;
  uuid?: () => string;
  onYuborildi?: () => void;
};

const hex16 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const randomUuid = () => crypto.randomUUID();

export class FaktNavbat {
  private readonly d: Required<Omit<Deps, 'onYuborildi'>> & Pick<Deps, 'onYuborildi'>;
  private oxirgiMs = 0;
  private ishlayapti: Promise<YuborNatija> | null = null;

  constructor(d: Deps) {
    this.d = { now: () => Date.now(), tasodif: hex16, uuid: randomUuid, ...d };
  }

  private yangiId(): string {
    const ms = Math.max(this.d.now(), this.oxirgiMs + 1);
    this.oxirgiMs = ms;
    return `${String(ms).padStart(13, '0')}-${this.d.tasodif()}`;
  }

  async royxat(): Promise<NavbatElem[]> {
    const out: NavbatElem[] = [];
    for (const y of await this.d.kopri.navbatRoyxat()) {
      try {
        const e = JSON.parse(y.qiymat) as NavbatElem;
        if (e?.v === 1 && e.id === y.id && typeof e.body === 'object') out.push(e);
      } catch { /* buzuq yozuv ko'rsatilmaydi */ }
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async yangilaKorinish(): Promise<NavbatElem[]> {
    const l = await this.royxat().catch(() => [] as NavbatElem[]);
    const nizolar: NavbatNizo[] = l.filter((e) => e.holat === 'nizo')
      .map((e) => ({ id: e.id, amal: e.amal, vaqt: e.vaqt, xato: e.xato ?? '', kod: e.kod ?? null }));
    oflaynYangila({ navbat: l.length, nizolar });
    return l;
  }

  /** Yozuvni navbatga qo'yadi. `operation_id` bo'lmasa yaratiladi (server UUID talab qiladi; hali yuborilmagan). */
  async qosh(body: Record<string, unknown>): Promise<NavbatElem> {
    const amal = String(body.amal ?? '');
    if (!(NAVBAT_AMALLARI as readonly string[]).includes(amal)) throw new Error('OFLAYN_AMAL_NAVBATGA_KIRMAYDI');
    const opId = typeof body.operation_id === 'string' && UUID.test(body.operation_id) ? body.operation_id : this.d.uuid();
    const tana = { ...body, operation_id: opId };
    // Bir xil amal ikki marta bosilsa — bitta yozuv.
    const bor = (await this.royxat()).find((e) => e.body.operation_id === opId);
    if (bor) return bor;
    const e: NavbatElem = { v: 1, id: this.yangiId(), vaqt: this.d.now(), amal, body: tana, holat: 'kutmoqda', urinish: 0 };
    await this.d.kopri.navbatQosh(e.id, JSON.stringify(e));
    await this.yangilaKorinish();
    return e;
  }

  private async saqla(e: NavbatElem): Promise<void> {
    await this.d.kopri.navbatQosh(e.id, JSON.stringify(e));
  }

  /** Navbatni tartib bilan yuboradi. Bir vaqtda faqat bitta yuborish yuradi. */
  yubor(): Promise<YuborNatija> {
    if (!this.ishlayapti) {
      oflaynYangila({ yuborilmoqda: true });
      this.ishlayapti = this.yuborIch().finally(() => { this.ishlayapti = null; oflaynYangila({ yuborilmoqda: false }); });
    }
    return this.ishlayapti;
  }

  private async yuborIch(): Promise<YuborNatija> {
    let yuborildi = 0;
    let toxtadi: YuborNatija['toxtadi'] = null;
    for (const e of await this.royxat()) {
      if (e.holat === 'nizo') { toxtadi = 'nizo'; break; }
      let res: Response;
      try {
        res = await this.d.base(NAVBAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e.body) });
      } catch { toxtadi = 'tarmoq'; break; }
      const matn = await res.text().catch(() => '');
      let j: { ok?: boolean; error?: string; code?: string; sabab?: string; xabar?: string } | null = null;
      try { j = JSON.parse(matn); } catch { j = null; }
      if (res.status === 401) { toxtadi = 'sessiya'; break; }
      if (res.ok && j?.ok === true) {
        await this.d.kopri.navbatOchir(e.id);
        yuborildi++;
        continue;
      }
      if (res.status >= 500 || res.status === 429 || res.status === 408) {
        await this.saqla({ ...e, urinish: e.urinish + 1 }).catch(() => undefined);
        toxtadi = 'server';
        break;
      }
      // Server aniq rad etdi (ziddiyat, qulf, validatsiya): jim ustidan yozilmaydi — foydalanuvchiga ko'rsatiladi.
      const xato = j?.error || j?.xabar || j?.code || j?.sabab || `HTTP ${res.status}`;
      await this.saqla({ ...e, holat: 'nizo', xato: String(xato).slice(0, 300), kod: j?.code ?? j?.sabab ?? null, urinish: e.urinish + 1 });
      toxtadi = 'nizo';
      break;
    }
    const l = await this.yangilaKorinish();
    oflaynYangila({ toxtadi: toxtadi === 'sessiya' ? 'sessiya' : null });
    if (yuborildi > 0) this.d.onYuborildi?.();
    return { yuborildi, qoldi: l.length, toxtadi };
  }

  /** Nizoli yozuvni foydalanuvchi qaroriga ko'ra QAYTA yuborishga ochadi (o'sha operation_id). */
  async qayta(id: string): Promise<void> {
    const e = (await this.royxat()).find((x) => x.id === id);
    if (!e) return;
    await this.saqla({ ...e, holat: 'kutmoqda', xato: undefined, kod: undefined });
    await this.yangilaKorinish();
  }

  /** Foydalanuvchi qarori: yozuvni bekor qilish. */
  async bekor(id: string): Promise<void> {
    await this.d.kopri.navbatOchir(id);
    await this.yangilaKorinish();
  }
}
