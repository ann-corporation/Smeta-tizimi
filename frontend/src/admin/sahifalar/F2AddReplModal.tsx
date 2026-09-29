import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { T2Qator } from '../../api/supabase';
import { yangiOperationId } from '../../api/supabase';
import { sbT2IshResurslarBilanYarat, sbT2QoshimchaIshYarat, sbT2ZamenaIshYarat, sbT2ResursBolaQosh } from '../../api/t2-additional-replacement';

/**
 * T2-PTO-OWNER-CRITICAL-CLOSURE: the old system's F2-import gesture the
 * owner asked to restore -- drop an unmatched F2 source line onto the Smeta
 * tree to CREATE the missing canonical row and bind it in one motion,
 * instead of a disconnected form. This modal is the confirm/adjust step
 * ("bu qanaqa ish yoki material, qo'shimchami yoki zamenami" -- the system
 * would ask) between the drop gesture and the actual write.
 *
 * Reuses the exact same commands AdditionalReplacementNative.tsx already
 * calls (t2_qoshimcha_ish_yarat_v1 / t2_zamena_ish_yarat_v1 /
 * t2_resurs_bola_qosh_v1) -- OLD+NEW law unchanged: replacement NEVER
 * mutates the old row, it inserts a new one with replaces_line_id.
 */
export type DropAction =
  | { kind: 'replacement'; oldRow: T2Qator; parent: T2Qator }
  | { kind: 'additional'; parent: T2Qator }
  | { kind: 'resource'; parent: T2Qator };

export interface F2AddReplModalProps {
  action: DropAction;
  companyId: number;
  objectId: number;
  initialNom: string;
  initialKod?: string;
  initialBirlik?: string;
  initialHajm?: number;
  onClose: () => void;
  /** Ish yaratilganda F2 dagi resurslari — BIR so'rovda birga yaratiladi (egasi: zamena kuttirmasin). */
  resurslar?: Array<{ tur: 'rs' | 'mat' | 'ob'; nom: string; birlik: string; hajm?: number | null; kod?: string | null }>;
  onCreated: (qatorId: number, resursQatorIdlar?: number[]) => void;
}

const TUR_LABEL: Record<string, string> = { rs: 'Resurs (RS)', mat: 'Material (MAT)', ob: 'Uskuna (OB)' };

export function F2AddReplModal(p: F2AddReplModalProps) {
  const { action } = p;
  const [nom, setNom] = useState(p.initialNom);
  const [kod, setKod] = useState(p.initialKod || '');
  const [birlik, setBirlik] = useState(p.initialBirlik || '');
  const [hajm, setHajm] = useState(p.initialHajm != null ? String(+p.initialHajm.toPrecision(12)) : '');
  const [resTur, setResTur] = useState<'rs' | 'mat' | 'ob'>('rs');
  const [sabab, setSabab] = useState(
    action.kind === 'replacement' ? 'F2 importda topilgan zamena' : 'F2 importda topilgan qo‘shimcha ish',
  );
  const [busy, setBusy] = useState(false);
  /* Qayta urinishda AYNI operatsiya — tarmoq uzilsa ham dublikat yaratilmaydi. */
  const opRef = useRef(yangiOperationId());
  const resurslar = action.kind !== 'resource' ? (p.resurslar ?? []) : [];
  const [error, setError] = useState('');

  const sarlavha =
    action.kind === 'replacement' ? `Zamena — "${action.oldRow.nom}" o‘rniga`
      : action.kind === 'additional' ? `Qo‘shimcha ish — "${action.parent.nom}" ostiga`
        : `Resurs qo‘shish — "${action.parent.nom}" ostiga`;

  async function submit() {
    if (!nom.trim() || !birlik.trim() || !sabab.trim()) { setError('Nom, birlik va sabab majburiy.'); return; }
    const hajmSoni = hajm.trim() === '' ? undefined : Number(hajm.replace(',', '.'));
    if (action.kind !== 'resource' && (hajmSoni === undefined || !Number.isFinite(hajmSoni) || hajmSoni <= 0)) {
      setError('Hajm musbat son bo‘lishi shart.'); return;
    }
    setBusy(true); setError('');
    const asos = {
      kompaniyaId: p.companyId, obyektId: p.objectId, otaQatorId: action.parent.id,
      nom: nom.trim(), birlik: birlik.trim(), hajm: hajmSoni as number,
      kod: kod.trim() || undefined, sabab: sabab.trim(),
      operationId: opRef.current, expectedVersion: action.parent.versiya,
    };
    try {
      if (resurslar.length && action.kind !== 'resource') {
        const rr = await sbT2IshResurslarBilanYarat({
          ...asos, command: action.kind === 'replacement' ? 'replacement' : 'additional',
          almashtirilayotganQatorId: action.kind === 'replacement' ? action.oldRow.id : undefined,
          resurslar,
        });
        if (!rr.ok || rr.qator_id == null) { setError(rr.xabar || rr.error || 'Saqlanmadi.'); return; }
        p.onCreated(rr.qator_id, rr.resurs_qator_idlar ?? []);
        return;
      }
      const r = action.kind === 'replacement'
        ? await sbT2ZamenaIshYarat({ ...asos, almashtirilayotganQatorId: action.oldRow.id })
        : action.kind === 'additional'
          ? await sbT2QoshimchaIshYarat(asos)
          : await sbT2ResursBolaQosh({ ...asos, tur: resTur, hajm: hajmSoni });
      if (!r.ok || r.qator_id == null) { setError(r.xabar || r.error || 'Saqlanmadi.'); return; }
      p.onCreated(r.qator_id);
    } catch { setError('Tarmoq xatosi — qayta urinib ko‘ring.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={p.onClose}>
      <div className="bg-surface border border-border p-5 rounded-2xl w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[15px] text-text">{sarlavha}</h3>
          <button onClick={p.onClose} className="text-text-mute hover:text-text" aria-label="Yopish"><X size={18} /></button>
        </div>
        {action.kind === 'resource' && (
          <label className="block text-sm mb-3">
            <span className="text-text-dim text-[12px]">Turi</span>
            <select value={resTur} onChange={e => setResTur(e.target.value as 'rs' | 'mat' | 'ob')}
              className="mt-1 w-full bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500">
              {Object.entries(TUR_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm mb-3">
          <span className="text-text-dim text-[12px]">Kod (ixtiyoriy)</span>
          <input value={kod} onChange={e => setKod(e.target.value)}
            className="mt-1 w-full bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500" />
        </label>
        <label className="block text-sm mb-3">
          <span className="text-text-dim text-[12px]">Nomi</span>
          <input value={nom} onChange={e => setNom(e.target.value)} autoFocus
            className="mt-1 w-full bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500" />
        </label>
        <div className="flex gap-3 mb-3">
          <label className="block text-sm flex-1">
            <span className="text-text-dim text-[12px]">Birlik</span>
            <input value={birlik} onChange={e => setBirlik(e.target.value)}
              className="mt-1 w-full bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500" />
          </label>
          <label className="block text-sm flex-1">
            <span className="text-text-dim text-[12px]">Hajm{action.kind === 'resource' ? ' (ixtiyoriy)' : ''}</span>
            <input type="number" value={hajm} onChange={e => setHajm(e.target.value)}
              className="mt-1 w-full bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500" />
          </label>
        </div>
        <label className="block text-sm mb-4">
          <span className="text-text-dim text-[12px]">Sabab</span>
          <input value={sabab} onChange={e => setSabab(e.target.value)}
            className="mt-1 w-full bg-bg border border-border rounded-xl p-2.5 text-sm text-text outline-none focus:border-sky-500" />
        </label>
        {resurslar.length > 0 && <p className="mb-3 text-[12px] text-text-dim">F2 dagi <b>{resurslar.length}</b> ta resurs ham shu ish ostida birga yaratiladi va bog‘lanadi (bitta amal).</p>}
        {error && <p role="alert" className="text-danger text-[12px] mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={p.onClose} className="px-5 py-2 rounded-xl text-sm font-medium text-text-dim hover:bg-surface-2 transition-colors">Bekor qilish</button>
          <button onClick={() => void submit()} disabled={busy}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/80 transition-colors shadow-lg shadow-accent/20 disabled:opacity-50">
            {busy ? 'Yaratilmoqda…' : 'Yaratish va bog‘lash'}
          </button>
        </div>
      </div>
    </div>
  );
}
