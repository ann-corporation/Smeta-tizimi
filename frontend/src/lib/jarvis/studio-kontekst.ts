/** Untrusted browser draft, bounded per explicit question. Never canonical truth. */
export const STUDIO_CONTEXT_MAX = 6000;
export type StudioKontekst = { schema: 1; companyId: number; draftId: string; title: string; summary: string };
const studioPage = (path: string) => path.replace(/\/$/, '') === '/admin/smeta-studio';
export function studioKontekstTekshir(raw: unknown, companyId: number, path: string): StudioKontekst | null {
  if (!raw || typeof raw !== 'object' || !studioPage(path)) return null;
  const x = raw as Record<string, unknown>;
  if (x.schema !== 1 || x.companyId !== companyId || !Number.isSafeInteger(companyId) || companyId <= 0
    || typeof x.draftId !== 'string' || !x.draftId.trim() || x.draftId.length > 100
    || typeof x.title !== 'string' || x.title.length > 240
    || typeof x.summary !== 'string' || !x.summary.trim() || x.summary.length > STUDIO_CONTEXT_MAX) return null;
  return { schema: 1, companyId, draftId: x.draftId, title: x.title, summary: x.summary };
}
type Source = { companyId: number; draftId: string; read: () => StudioKontekst | null };
let source: Source | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const f of listeners) f(); };
export function studioKontekstUla(next: Source): () => void {
  source = next; emit();
  return () => { if (source === next) { source = null; emit(); } };
}
export function studioKontekstObuna(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export function studioKontekstScope(companyId: number | null, path: string): string {
  return source && source.companyId === companyId && studioPage(path) ? `${source.companyId}:${source.draftId}` : '';
}
export function studioKontekstOl(companyId: number | null, path: string): StudioKontekst | null {
  if (!companyId || !studioKontekstScope(companyId, path)) return null;
  try { const snapshot = studioKontekstTekshir(source?.read(), companyId, path);
    return snapshot?.draftId === source?.draftId ? snapshot : null;
  } catch { return null; }
}
