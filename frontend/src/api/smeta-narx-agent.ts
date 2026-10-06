/** Client for /api/smeta-narx-agent (AI pricing agent — proposals only, never a DB write). */
import type { KatalogSnapshot } from '../../functions/_shared/narx-katalog-snapshot';

export type AgentItem = { key: string; nom: string; birlik: string | null; nomzodlar: number[] };
export type AgentResult = { key: string; tanlov: KatalogSnapshot | null; ishonch: 'yuqori' | 'orta' | 'past'; sabab: string };
export type AgentResponse = { ok: true; items: AgentResult[]; model: string | null } | { ok: false; code: string; message?: string };

export async function narxAgentSora(kompaniyaId: number, hudud: string | null, items: AgentItem[]): Promise<AgentResponse> {
  try {
    const r = await fetch('/api/smeta-narx-agent', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kompaniya_id: kompaniyaId, hudud, items }) });
    const j = await r.json().catch(() => null) as AgentResponse | null;
    return j ?? { ok: false, code: 'NETWORK' };
  } catch { return { ok: false, code: 'NETWORK' }; }
}
