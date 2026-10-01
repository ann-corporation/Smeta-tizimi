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
import { agentApprovalDecide, agentControlOl, agentRunStart, agentRunTransition, agentWorkerRun } from '../../api/t2-agent-control';
import type { AgentControlReadModel } from '../../lib/agent-control-plane';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt } from '../../api/supabase';
import { toast } from '../../umumiy/ui/Toast';

/** Ishga tushiriladigan ishchi agentlar (server: functions/api/agent-control.ts ISHCHILAR). */
const ISHCHILAR = {
  quality_handover: { nom: 'Sifat/Topshirish agenti — АОСР qamrovi va laboratoriya', buyruq: 'quality.handover.prepare' },
  pto_smeta: { nom: 'Narx auditori — smeta narxlari dalili (НАПУ himoyasi)', buyruq: 'price.evidence.audit' },
  warehouse: { nom: 'Ombor agenti — БЕЗСКЛАД nomzodlari (beton, qorishma)', buyruq: 'warehouse.bezsklad.audit' },
} as const;

export default function AiAgentlar() {
  const { joriy } = useKompaniya();
  const [data, setData] = useState<AgentControlReadModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [natija, setNatija] = useState<Record<string, unknown> | null>(null);
  const [ishchi, setIshchi] = useState<keyof typeof ISHCHILAR>('quality_handover');
  useEffect(() => {
    if (!joriy?.id) return;
    void sbT2ObyektlarOlKomp(joriy.id).then((r) => { const q = r.ok ? r.qatorlar ?? [] : []; setObyektlar(q); setObyektId(q[0]?.id ?? null); });
  }, [joriy?.id]);

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
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
        <select className="border rounded px-2 py-1 text-sm" value={ishchi} onChange={(e) => setIshchi(e.target.value as keyof typeof ISHCHILAR)}>
          {Object.entries(ISHCHILAR).map(([k, v]) => <option key={k} value={k}>{v.nom}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm" value={obyektId ?? ''} onChange={(e) => setObyektId(Number(e.target.value))}>
          {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
        </select>
        <button type="button" disabled={!obyektId || !joriy?.id} className="rounded-md border border-accent/40 px-3 py-1 text-accent hover:bg-accent/10 disabled:opacity-40"
          onClick={() => {
            const o = obyektlar.find((x) => x.id === obyektId);
            if (!o || !joriy?.id) return;
            void amal(() => agentRunStart({ agent_kod: ishchi, command_kod: ISHCHILAR[ishchi].buyruq, kompaniya_id: joriy.id, loyiha_id: (o as T2Obyekt & { loyiha_id?: number | null }).loyiha_id ?? null, obyekt_id: o.id, operation_id: yangiOperationId() }), 'Tahlil so‘rovi yaratildi — tasdiqlang');
          }}>Obyektni tahlil qilish</button>
        <span className="text-xs text-text-dim">So‘rov → rahbar tasdig‘i → «Boshlash» → natija ko‘rib chiqishga.</span>
      </div>
      {natija && (
        <div className="rounded-lg border border-border bg-surface p-3 text-sm space-y-1">
          <div className="font-medium">Agent xulosasi</div>
          <p>{String(natija.xulosa ?? '')}</p>
          {Array.isArray(natija.katta_ogish) && natija.katta_ogish.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-text-dim">{(natija.katta_ogish as Array<{ qator_id: number; nom: string; smeta_narx: number; manba_narx: number; ogish_foiz: number }>).slice(0, 30).map((x) => <li key={x.qator_id}>{x.nom}: smeta {x.smeta_narx} → manba {x.manba_narx} ({x.ogish_foiz}%)</li>)}</ul>
          )}
          {Array.isArray(natija.nomzodlar) && natija.nomzodlar.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-text-dim">{(natija.nomzodlar as Array<{ nom: string; birlik: string | null; qatorlar: number; summa: number | null }>).slice(0, 30).map((x, i) => <li key={i}>{x.nom}{x.birlik ? `, ${x.birlik}` : ''} — {x.qatorlar} qator{x.summa != null ? `, ${Math.round(x.summa).toLocaleString('ru-RU')} so‘m` : ''}</li>)}</ul>
          )}
          {Array.isArray(natija.yashirin_aktsiz) && natija.yashirin_aktsiz.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-text-dim">{(natija.yashirin_aktsiz as Array<{ qator_id: number; nom: string; fakt_hajm: number; birlik: string }>).slice(0, 30).map((x) => <li key={x.qator_id}>{x.nom} — {x.fakt_hajm} {x.birlik}</li>)}</ul>
          )}
        </div>
      )}
      <AgentControlCenter
        data={data} loading={loading} error={error}
        onRefresh={() => void yukla()}
        onApprove={(_a, run) => void amal(() => agentApprovalDecide({ run_id: run.run_id, decision: 'approve', expected_version: run.versiya, operation_id: yangiOperationId() }), 'Tasdiqlandi')}
        onReject={(_a, run) => {
          const sabab = window.prompt('Rad etish sababi (majburiy):')?.trim();
          if (!sabab) return;
          void amal(() => agentApprovalDecide({ run_id: run.run_id, decision: 'reject', sabab, expected_version: run.versiya, operation_id: yangiOperationId() }), 'Rad etildi');
        }}
        onTransition={(run, holat) => {
          // Ishchi agent bor bo'lsa — «Boshlash» uni ishga tushiradi (tahlil → ko'rib chiqishga).
          if (holat === 'running' && run.agent_kod in ISHCHILAR) {
            void amal(async () => { const r = await agentWorkerRun({ agent_kod: run.agent_kod, run_id: run.run_id, expected_version: run.versiya, operation_id: yangiOperationId() }); setNatija(r.result); }, 'Tahlil tayyor — ko‘rib chiqing');
            return;
          }
          void amal(() => agentRunTransition({ run_id: run.run_id, new_holat: holat, expected_version: run.versiya, operation_id: yangiOperationId() }), 'Holat o‘zgardi');
        }}
      />
    </div>
  );
}
