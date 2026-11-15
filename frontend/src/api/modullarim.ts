/**
 * Modullarim klienti — `/api/modullarim` (Android, Windows va Telegram bot bilan BIR XIL server mantig'i).
 * Mahalliy nusxa (localStorage) — zaxira: server hali yangilanmagan (migratsiya qo'llanmagan), oflayn yoki xato bo'lsa ham
 * tanlov ishlaydi. Server javob bersa u haqiqat manbai. Ruxsatni O'ZGARTIRMAYDI (faqat ko'rinish).
 */
import { useQuery } from '@tanstack/react-query';
import { BOSH_TANLOV, type Tanlov } from '../lib/modullarim/modullarim';

export const MODUL_TANLOV_KALIT = 'modullarim';
const mahalliyKalit = (kid: number) => `fz-modullarim:${kid}`;
const korildiKalit = (kid: number) => `fz-modullarim-korildi:${kid}`;

const royxat = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function mahalliyOl(kid: number): Tanlov | null {
  try {
    const raw = localStorage.getItem(mahalliyKalit(kid));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<Tanlov>;
    return { tanlangan: royxat(j.tanlangan), tartib: royxat(j.tartib), versiya: Number.isSafeInteger(j.versiya) ? Number(j.versiya) : 0 };
  } catch { return null; }
}
function mahalliyYoz(kid: number, t: Tanlov): void {
  try { localStorage.setItem(mahalliyKalit(kid), JSON.stringify(t)); } catch { /* brauzer xotirasi yopiq */ }
}

/** Birinchi marta ko'rsatiladigan tanlash oynasi ko'rilganmi (tanlandi yoki «keyinroq»). Faqat qulaylik — server holati emas. */
export function korildiOl(kid: number): boolean {
  try { return localStorage.getItem(korildiKalit(kid)) === '1'; } catch { return false; }
}
export function korildiYoz(kid: number): void {
  try { localStorage.setItem(korildiKalit(kid), '1'); } catch { /* ixtiyoriy */ }
}

export type TanlovNatija = Tanlov & { manba: 'server' | 'mahalliy' };

export async function tanlovOl(kid: number): Promise<TanlovNatija> {
  try {
    const r = await fetch(`/api/modullarim?kompaniya_id=${encodeURIComponent(String(kid))}`, { credentials: 'same-origin' });
    const j = await r.json().catch(() => null) as { ok?: boolean; tanlangan?: unknown; tartib?: unknown; versiya?: number } | null;
    if (r.ok && j?.ok === true) {
      const t: Tanlov = { tanlangan: royxat(j.tanlangan), tartib: royxat(j.tartib), versiya: Number.isSafeInteger(j.versiya) ? Number(j.versiya) : 0 };
      /* Server bo'sh (versiya 0), mahalliy nusxa bor — mahalliyni ko'rsatamiz (server hali yozilmagan bo'lishi mumkin). */
      const m = mahalliyOl(kid);
      if (t.versiya === 0 && m && m.tanlangan.length) return { ...m, versiya: 0, manba: 'mahalliy' };
      mahalliyYoz(kid, t);
      return { ...t, manba: 'server' };
    }
  } catch { /* oflayn — mahalliy nusxa */ }
  return { ...(mahalliyOl(kid) ?? BOSH_TANLOV), manba: 'mahalliy' };
}

/** Avval mahalliy (darhol), keyin serverga (STALE_VERSION bo'lsa bir marta qayta). Server yo'q bo'lsa mahalliy qoladi. */
export async function tanlovSaqla(kid: number, t: Tanlov): Promise<TanlovNatija> {
  mahalliyYoz(kid, t);
  let joriy = t;
  for (let urinish = 0; urinish < 2; urinish++) {
    try {
      const r = await fetch('/api/modullarim', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kompaniya_id: kid, tanlangan: joriy.tanlangan, tartib: joriy.tartib, expected_version: joriy.versiya }),
      });
      const j = await r.json().catch(() => null) as { ok?: boolean; versiya?: number; code?: string } | null;
      if (r.ok && j?.ok === true) {
        joriy = { ...joriy, versiya: Number.isSafeInteger(j.versiya) ? Number(j.versiya) : joriy.versiya };
        mahalliyYoz(kid, joriy);
        return { ...joriy, manba: 'server' };
      }
      if (r.status === 409 && Number.isSafeInteger(j?.versiya)) { joriy = { ...joriy, versiya: Number(j?.versiya) }; continue; }
    } catch { /* tarmoq — mahalliy qoladi */ }
    break;
  }
  return { ...joriy, manba: 'mahalliy' };
}

export function useModulTanlov(kid: number | null | undefined) {
  return useQuery({
    queryKey: [MODUL_TANLOV_KALIT, kid ?? 0],
    queryFn: () => tanlovOl(kid as number),
    enabled: !!kid && kid > 0,
    staleTime: 60_000,
    retry: false,
  });
}
