/**
 * AiAgentlar.tsx — AI ishchilar (agentlar) boshqaruv markazi (egasi Q11, 2026-10-01:
 * "AI agentlar poydevori — tizimning yuzi, raqobatchidan ustunlik").
 *
 * Poydevor: `t2_agent_*` (migratsiya 20261103120000, production'da 2026-10-01): chegaralangan
 * agent rollari (PTO/Smeta, hujjat nazorati, ta'minot, ombor, moliya, grafik, sifat …),
 * har ishga tushirish — run; ruxsat etilgan buyruq/tool ro'yxati; inson tasdig'i; audit.
 * Agent biznes hisobini o'zi qilmaydi — faqat kanonik buyruqlarni tayyorlaydi.
 */
import { useCallback, useEffect, useState } from 'react';
import { AgentControlCenter } from '../../components/agent-control/AgentControlCenter';
import { agentApprovalDecide, agentControlOl, agentRunTransition } from '../../api/t2-agent-control';
import type { AgentControlReadModel } from '../../lib/agent-control-plane';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { yangiOperationId } from '../../api/supabase';
import { toast } from '../../umumiy/ui/Toast';

export default function AiAgentlar() {
  const { joriy } = useKompaniya();
  const [data, setData] = useState<AgentControlReadModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await agentControlOl(joriy?.id ?? null)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [joriy?.id]);
  useEffect(() => { void yukla(); }, [yukla]);

  const amal = async (fn: () => Promise<unknown>, xabar: string) => {
    try { await fn(); toast(xabar, 'ok'); await yukla(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'danger'); }
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-lg font-semibold">AI ishchilar (agentlar)</h1>
        <p className="text-xs text-text-dim">Har agent faqat o‘z roliga ruxsat etilgan buyruqlarni tayyorlaydi; pul va hujjatga ta’sir qiluvchi amallar — faqat rahbar tasdig‘i bilan. Barcha qadamlar auditda.</p>
      </div>
      <AgentControlCenter
        data={data} loading={loading} error={error}
        onRefresh={() => void yukla()}
        onApprove={(_a, run) => void amal(() => agentApprovalDecide({ run_id: run.run_id, decision: 'approve', expected_version: run.versiya, operation_id: yangiOperationId() }), 'Tasdiqlandi')}
        onReject={(_a, run) => {
          const sabab = window.prompt('Rad etish sababi (majburiy):')?.trim();
          if (!sabab) return;
          void amal(() => agentApprovalDecide({ run_id: run.run_id, decision: 'reject', sabab, expected_version: run.versiya, operation_id: yangiOperationId() }), 'Rad etildi');
        }}
        onTransition={(run, holat) => void amal(() => agentRunTransition({ run_id: run.run_id, new_holat: holat, expected_version: run.versiya, operation_id: yangiOperationId() }), 'Holat o‘zgardi')}
      />
    </div>
  );
}
