/**
 * Muhit: sozlama + (dangasa) ulanish hovuzi + sessiya aktori; o'qish/yozish ishchilari.
 *
 * YOZISH (har yozuvchi tool shu yerdan o'tadi): bitta tranzaksiya →
 *   1) obyekt aniqlanadi (berilgan yoki argumentlardan) → 2) `snapshot.ol(obyekt,'mcp_oldi',…)` (mavjud bo'lsa; dry_run'da
 *   olinmaydi) → 3) amal → 4) bazadagi audit (dry_run'da yo'q) → COMMIT; dry_run — preview + ROLLBACK.
 * Himoya = snapshot va audit, rad etish emas.
 */
import pg from 'pg';
import { bazaAudit } from './audit';
import type { Sozlama } from './config';
import { pgHovuz, tranzaksiya, type Hovuz, type Mijoz } from './db';
import { snapshotOl } from './snapshot';

let turlarOrnatildi = false;
/** bigint/numeric → number (xavfsiz chegarada), aks holda matn qoladi. */
export function pgTurlariniOrnat(): void {
  if (turlarOrnatildi) return;
  turlarOrnatildi = true;
  const raqam = (v: string) => { const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : v; };
  pg.types.setTypeParser(20, raqam); // int8
  pg.types.setTypeParser(1700, raqam); // numeric
  // date — matn holida (JS Date vaqt mintaqasi bilan oyni siljitib yubormasin: «2025-09-01» → «2025-08-31T19:00Z»).
  pg.types.setTypeParser(1082, (v: string) => v);
}

export class Muhit {
  private _hovuz: Hovuz | null = null;
  aktorId: number | null;
  /**
   * Tenant doirasi: null — cheklovsiz (lokal stdio, egasining o'z kaliti). Masofaviy (Worker) serverda — OAuth bilan kirgan
   * foydalanuvchining kompaniyalari; ro'yxat beruvchi toollar (obyektlar) shu bilan filtrlanadi.
   */
  kompaniyaDoira: number[] | null = null;
  constructor(readonly sozlama: Sozlama, private readonly hovuzYasa: (s: Sozlama) => Hovuz = (s) => { pgTurlariniOrnat(); return pgHovuz(s); }) {
    this.aktorId = sozlama.aktorId;
  }
  hovuz(): Hovuz {
    if (!this._hovuz) this._hovuz = this.hovuzYasa(this.sozlama);
    return this._hovuz;
  }
  async yop(): Promise<void> { if (this._hovuz) await this._hovuz.end(); this._hovuz = null; }

  /** Aktor talab qilinadigan joyda: yo'q bo'lsa — aniq ko'rsatma. */
  aktorKerak(): number {
    if (this.aktorId == null) throw new Error('Aktor (t2_foydalanuvchi.id) o\'rnatilmagan. `aktor` tooli bilan foydalanuvchini toping va `aktor_tanla(id)` ni chaqiring, yoki SMETA_AKTOR_ID muhit o\'zgaruvchisini o\'rnating.');
    return this.aktorId;
  }

  oqish<T>(fn: (m: Mijoz) => Promise<T>): Promise<T> {
    return tranzaksiya(this.hovuz(), { readOnly: true, kontekst: { aktorId: this.aktorId }, timeoutMs: this.sozlama.timeoutMs, dbRol: this.sozlama.dbRol }, fn);
  }

  async yozish<T>(p: YozishParam, fn: (m: Mijoz, ogoh: string[]) => Promise<T>): Promise<YozishNatija<T>> {
    const ogoh: string[] = [];
    const dryRun = p.dryRun === true;
    return tranzaksiya(this.hovuz(), { rollback: dryRun, kontekst: { aktorId: this.aktorId }, timeoutMs: this.sozlama.timeoutMs, dbRol: this.sozlama.dbRol }, async (m) => {
      const obyektId = typeof p.obyektId === 'function' ? await p.obyektId(m) : p.obyektId ?? null;
      let snapshotId: number | null = null;
      if (obyektId != null && !dryRun && p.snapshot !== false) {
        const s = await snapshotOl(m, obyektId, 'mcp_oldi', `${p.tool}${p.izoh ? ': ' + p.izoh : ''}`.slice(0, 500), this.aktorId ? `mcp:actor:${this.aktorId}` : 'mcp');
        snapshotId = s.id;
        if (s.ogohlantirish) ogoh.push(s.ogohlantirish);
      } else if (obyektId == null && !dryRun && p.snapshot !== false) {
        ogoh.push('obyekt aniqlanmadi — snapshot olinmadi (obyekt_id bering).');
      }
      const natija = await fn(m, ogoh);
      let auditBaza = false;
      if (!dryRun) auditBaza = await bazaAudit(m, { obyektId, tool: p.tool, args: p.args, natija: JSON.stringify(natija ?? null).slice(0, 1000), aktorId: this.aktorId });
      return {
        dry_run: dryRun,
        ...(dryRun ? { izoh: 'dry_run: o\'zgarishlar ROLLBACK qilindi (bazaga yozilmadi), snapshot olinmadi.' } : {}),
        obyekt_id: obyektId, snapshot_id: snapshotId, audit_baza: auditBaza, ogohlantirishlar: ogoh, natija,
      };
    });
  }
}

export type YozishParam = {
  tool: string;
  args: unknown;
  dryRun?: boolean;
  /** Snapshot uchun obyekt (yoki uni tranzaksiya ichida aniqlovchi funksiya). */
  obyektId?: number | null | ((m: Mijoz) => Promise<number | null>);
  izoh?: string;
  /** false — snapshot so'ralmaydi (masalan snapshot_qaytar o'zi). */
  snapshot?: boolean;
};

export type YozishNatija<T> = {
  dry_run: boolean; izoh?: string; obyekt_id: number | null; snapshot_id: number | null; audit_baza: boolean;
  ogohlantirishlar: string[]; natija: T;
};
