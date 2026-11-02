/** Ixcham chiqish: pul formati (NDS siz; ustamasiz + ustamali), sahifalash, markdown jadval. */
import type { UstamaNatija } from './frontend';

const yaxlit2 = (x: number) => Math.round(x * 100) / 100;

/** 1234567.891 → «1 234 567,89»; null → null (noma'lum ≠ 0). */
export function pul(x: number | null | undefined): string | null {
  if (x == null || !Number.isFinite(x)) return null;
  const [b, k] = Math.abs(yaxlit2(x)).toFixed(2).split('.');
  return `${x < 0 ? '−' : ''}${b.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${k}`;
}

export type SummaJuft = {
  /** To'g'ri xarajat (ustamasiz), NDS siz. */
  ustamasiz: number | null;
  /** ИТОГО-4 (ustamali), NDS siz; kat noma'lum qism ustamasiz qo'shilgan. */
  ustamali: number | null;
  /** NDS alohida (ВСЕГО − ИТОГО-4). */
  nds: number | null;
  /** Formatlangan ko'rinish. */
  matn: string;
  izoh?: string;
};

/** ustamaliHisobla natijasidan juftlik. `jamiUstamasiz` — kesimning hammasi (kat noma'lum ham). */
export function summaJuft(jamiUstamasiz: number | null, u: UstamaNatija | null): SummaJuft {
  const ustamasiz = jamiUstamasiz == null ? null : yaxlit2(jamiUstamasiz);
  if (!u || u.ustamali == null) {
    const izoh = u?.xato === 'KOEF_YOQ' ? 'ustama koeffitsienti yo\'q' : u?.xato ? `ustama hisoblanmadi: ${u.xato}` : 'ustama hisoblanmadi';
    return { ustamasiz, ustamali: null, nds: null, matn: `${pul(ustamasiz) ?? '—'} (ustamali: —)`, izoh };
  }
  const ustamali = yaxlit2(u.ustamali + u.nomalum.summa);
  const nds = u.ndsBilan != null ? yaxlit2(u.ndsBilan - u.ustamali) : null;
  const izoh = u.nomalum.soni ? `kat noma'lum ${u.nomalum.soni} qator (${pul(u.nomalum.summa)}) ustamasiz qo'shildi` : undefined;
  return { ustamasiz, ustamali, nds, matn: `${pul(ustamasiz) ?? '—'} / ustamali ${pul(ustamali)}${nds != null ? ` (+NDS ${pul(nds)})` : ''}`, ...(izoh ? { izoh } : {}) };
}

export type Sahifa<T> = { jami: number; offset: number; korsatildi: number; keyingi_offset: number | null; qatorlar: T[] };

export function sahifala<T>(barcha: readonly T[], limit: number, offset = 0): Sahifa<T> {
  const o = Math.max(0, Math.floor(offset));
  const l = Math.max(1, Math.floor(limit));
  const qatorlar = barcha.slice(o, o + l);
  return { jami: barcha.length, offset: o, korsatildi: qatorlar.length, keyingi_offset: o + l < barcha.length ? o + l : null, qatorlar };
}

/** Qatorlarni markdown jadvalga (uzun katak qisqartiriladi). */
export function markdownJadval(rows: ReadonlyArray<Record<string, unknown>>, ustunlar?: string[]): string {
  if (!rows.length) return '(bo\'sh)';
  const u = ustunlar ?? Object.keys(rows[0]);
  const katak = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return (s.length > 120 ? s.slice(0, 117) + '…' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  };
  return [`| ${u.join(' | ')} |`, `| ${u.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${u.map((k) => katak(r[k])).join(' | ')} |`)].join('\n');
}

/** pg qiymatlari JSON'ga: bigint/numeric matnlari songa (xavfsiz bo'lsa), Date → ISO. */
export function jsonQiymat(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (Buffer.isBuffer(v)) return `<bytea ${v.length} bayt>`;
  return v;
}

export function qatorTozala<T extends Record<string, unknown>>(r: T): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[k] = jsonQiymat(v);
  return o;
}

export const son = (x: unknown): number | null => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
