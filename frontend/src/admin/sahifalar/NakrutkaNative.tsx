import { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { sbT2ShartnomalarOl, type Shartnoma } from '../../api/t2-shartnoma';
import {
  t2NakrutkaKoefOl, t2NakrutkaKoefSaqla, t2ObyektNakrutka,
  NAKRUTKA_KOEF_KODLAR, NAKRUTKA_KOEF_IZOH,
  type NakrutkaKoefKod, type NakrutkaKoeffitsientlar,
  type NakrutkaKaskad, type NakrutkaKategoriyaJadval,
} from '../../api/t2-nakrutka';
import {
  t2ShartnomaQamrovOl, t2ShartnomaQamrovSaqla,
  type ShartnomaQamrovQatori,
} from '../../api/t2-shartnoma-qamrov';
import { FmtN } from '../../lib/format';
import { PodvalKonstruktor } from './PodvalKonstruktor';

/**
 * T1->T2 PTO gap-close: NAKRUTKA (markup/overhead) sahifasi -- T1 GAS'ning
 * 80_Shartnoma.js dagi koeffitsient tahrirlash + obyekt nakrutka hisobi UI
 * mantiqining native T2 porti (backend: t2_nakrutka_koef_ol_v1 /
 * t2_nakrutka_koef_saqla_v1 / t2_obyekt_nakrutka_v1, supabase/migrations/
 * 20261014090000_t2_nakrutka_v1.sql). Kompaniya standart koeffitsientlari
 * shu yerda tahrirlanadi; obyekt tanlansa -- o'sha obyektning t2_qator
 * summalaridan kategoriya bo'yicha (ЧЕЛ/МАШ/МАТ/ОБ/М/К/КАБ) hisoblangan
 * to'liq kaskad ko'rsatiladi.
 */

const KASKAD_QATORLAR: { key: keyof NakrutkaKaskad; label: string }[] = [
  { key: 'pryamye', label: 'To\'g\'ridan-to\'g\'ri xarajat (ЧЕЛ+МАШ+МАТ+ОБ)' },
  { key: 'tr_mat', label: 'Transport — material' },
  { key: 'skl_mat', label: 'Склад — material' },
  { key: 'tr_kab', label: 'Transport — kabel' },
  { key: 'itogo1', label: 'ИТОГО-1' },
  { key: 'prochie', label: 'Пудратчининг бошқа харажатлари' },
  { key: 'itogo2', label: 'ИТОГО-2' },
  { key: 'tr_ob', label: 'Transport — uskuna' },
  { key: 'zag_ob', label: 'Tayyorlov-склад — uskuna' },
  { key: 'itogo3', label: 'ИТОГО-3' },
  { key: 'strax', label: 'Sug\'urta' },
  { key: 'risk', label: 'Risk' },
  { key: 'itogo4', label: 'ИТОГО-4' },
  { key: 'nds', label: 'ҚҚС' },
  { key: 'vsego', label: 'ВСЕГО', },
];

function KoefTahrirchi({ companyId, contractId }: { companyId: number; contractId: number | null }) {
  const [koef, setKoef] = useState<NakrutkaKoeffitsientlar | null>(null);
  const [dirty, setDirty] = useState<Partial<Record<NakrutkaKoefKod, string>>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<NakrutkaKoefKod | null>(null);
  const [xato, setXato] = useState('');

  const yukla = async () => {
    setBusy(true); setXato('');
    try {
      const r = await t2NakrutkaKoefOl(companyId, contractId);
      if (!r.ok) { setXato(r.error || 'Koeffitsientlar yuklanmadi'); return; }
      setKoef(r.koeffitsientlar); setDirty({});
    } finally { setBusy(false); }
  };

  useEffect(() => { void yukla(); }, [companyId, contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saqla = async (kod: NakrutkaKoefKod) => {
    const raw = dirty[kod];
    if (raw == null) return;
    const qiymat = Number(raw.replace(',', '.'));
    if (!Number.isFinite(qiymat)) { setXato('Qiymat noto\'g\'ri: ' + kod); return; }
    setSaving(kod); setXato('');
    try {
      const r = await t2NakrutkaKoefSaqla({ kompaniyaId: companyId, shartnomaId: contractId, koefKod: kod, qiymat });
      if (!r.ok) { setXato(r.error || r.code || 'Saqlanmadi'); return; }
      await yukla();
    } finally { setSaving(null); }
  };

  if (busy && !koef) return <p className="text-text-mute text-sm">Koeffitsientlar yuklanmoqda…</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">
          {contractId ? 'Shartnoma uchun koeffitsientlar' : 'Kompaniya standart koeffitsientlari'}
        </h3>
        <button type="button" onClick={() => void yukla()} disabled={busy}
          className="text-[12px] flex items-center gap-1 px-2 py-1 border rounded disabled:opacity-40">
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Yangilash
        </button>
      </div>
      {xato && <p className="text-danger text-sm">{xato}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <tbody>
            {NAKRUTKA_KOEF_KODLAR.map(kod => {
              const saqlangan = koef?.[kod] ?? 0;
              const qiymat = dirty[kod] ?? String(saqlangan);
              const ozgargan = dirty[kod] != null && dirty[kod] !== String(saqlangan);
              return (
                <tr key={kod} className="border-t border-border/60">
                  <td className="px-2 py-1.5 text-text-mute" title={kod}>{NAKRUTKA_KOEF_IZOH[kod]}</td>
                  <td className="px-2 py-1.5 w-28">
                    <input aria-label={kod} className="w-full border rounded px-2 py-1 text-right tabular-nums"
                      value={qiymat} onChange={e => setDirty(d => ({ ...d, [kod]: e.target.value }))} />
                  </td>
                  <td className="px-2 py-1.5 w-10 text-center">%</td>
                  <td className="px-2 py-1.5 w-24">
                    <button type="button" disabled={!ozgargan || saving === kod}
                      onClick={() => void saqla(kod)}
                      className="text-[12px] flex items-center gap-1 px-2 py-1 border rounded disabled:opacity-30">
                      <Save size={12} /> {saving === kod ? 'Saqlanmoqda…' : 'Saqlash'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ObyektKaskad({ obyektId, contractId }: { obyektId: number; contractId: number | null }) {
  const [busy, setBusy] = useState(false);
  const [xato, setXato] = useState('');
  const [cats, setCats] = useState<{ chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number } | null>(null);
  const [kaskad, setKaskad] = useState<NakrutkaKaskad | null>(null);
  const [jadval, setJadval] = useState<NakrutkaKategoriyaJadval | null>(null);

  useEffect(() => {
    let active = true;
    setBusy(true); setXato('');
    void t2ObyektNakrutka(obyektId, contractId).then(r => {
      if (!active) return;
      if (!r.ok) { setXato(r.error || r.code || 'Hisoblanmadi'); setCats(null); setKaskad(null); setJadval(null); return; }
      setCats(r.cats ?? null); setKaskad(r.nakrutka ?? null); setJadval(r.jadval ?? null);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [obyektId, contractId]);

  if (busy) return <p className="text-text-mute text-sm">Hisoblanmoqda…</p>;
  if (xato) return <p className="text-danger text-sm">{xato}</p>;
  if (!kaskad || !cats) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-[12px]">
        {([['ЧЕЛ', cats.chel], ['МАШ', cats.mash], ['МАТ', cats.mat], ['ОБ', cats.ob], ['М/К', cats.mk], ['КАБ', cats.kab], ['БЕЗСКЛАД', cats.bez]] as const).map(([label, val]) => (
          <div key={label} className="border rounded px-2 py-1.5">
            <div className="text-text-mute">{label}</div>
            <div className="tabular-nums font-medium"><FmtN val={val} /></div>
          </div>
        ))}
      </div>
      {/* Kaskad jadvali eng keng — tor ekranda o'z konteynerida suriladi. */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[13px] border-collapse">
        <tbody>
          {KASKAD_QATORLAR.map(({ key, label }) => {
            const isItogo = key.startsWith('itogo') || key === 'vsego';
            return (
              <tr key={key} className={'border-t border-border/60' + (isItogo ? ' font-semibold bg-surface-2/40' : '')}>
                <td className="px-2 py-1.5 text-text-mute">{label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums"><FmtN val={kaskad[key]} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {jadval && (
        <div>
          <h4 className="text-sm font-semibold text-text mb-1">Kategoriya bo'yicha yakuniy koeffitsient jadvali</h4>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[13px] border-collapse">
            <tbody>
              {Object.entries(jadval).map(([kat, k]) => (
                <tr key={kat} className="border-t border-border/60">
                  <td className="px-2 py-1.5 text-text-mute">{kat}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{(k * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function QamrovTahrirchi({
  companyId, contractId, qatorlar, onRefresh,
}: {
  companyId: number;
  contractId: number;
  qatorlar: ShartnomaQamrovQatori[];
  onRefresh: () => Promise<void>;
}) {
  const [qidiruv, setQidiruv] = useState('');
  const [sabab, setSabab] = useState('Shartnoma qamrovi PTO tomonidan belgilandi');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [hajmDraft, setHajmDraft] = useState<Record<number, string>>({});
  const [xato, setXato] = useState('');
  const filtr = qidiruv.trim().toLocaleLowerCase();
  const rows = qatorlar.filter(q => !filtr || [q.obyekt_nom, q.kod, q.nom, q.birlik, q.kat]
    .some(v => String(v || '').toLocaleLowerCase().includes(filtr)));

  const saqlaQamrov = async (q: ShartnomaQamrovQatori, holat: 'kiritilgan' | 'chiqarilgan') => {
    if (!sabab.trim()) { setXato('O‘zgarish sababi majburiy.'); return; }
    const draft = hajmDraft[q.qator_id];
    const hajmOverride = draft === undefined
      ? q.hajm_override
      : draft.trim() === '' ? null : Number(draft.replace(',', '.'));
    if (hajmOverride !== null && (!Number.isFinite(hajmOverride) || hajmOverride < 0)) {
      setXato('Shartnomaviy hajm 0 yoki undan katta son bo‘lishi kerak.'); return;
    }
    setSavingId(q.qator_id); setXato('');
    try {
      const r = await t2ShartnomaQamrovSaqla({
        kompaniyaId: companyId, shartnomaId: contractId, obyektId: q.obyekt_id, qatorId: q.qator_id,
        holat, hajmOverride, sabab: sabab.trim(),
        dalilHujjatId: q.dalil_hujjat_id, kutilganVersiya: q.qamrov_versiya || 1,
      });
      if (!r.ok) { setXato(r.error || r.code || 'Qamrov saqlanmadi'); return; }
      setHajmDraft(d => { const n = { ...d }; delete n[q.qator_id]; return n; });
      await onRefresh();
    } finally { setSavingId(null); }
  };

  const hisobgaKiradigan = rows.filter(q => q.hisobga_kiradi);
  return (
    <div className="space-y-2 border rounded-lg p-3 bg-surface-1">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Shartnoma qamrovi</h3>
          <p className="text-xs text-text-mute">Smeta qatori o‘chmaydi. Faqat shu shartnoma hisobidan kiritiladi yoki chiqariladi.</p>
        </div>
        <div className="text-xs text-text-mute">
          {hisobgaKiradigan.filter(q => q.amalda_qamrovda).length} / {hisobgaKiradigan.length} resurs qatori hisobda
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-2">
        <input aria-label="Qamrov qidiruvi" className="border rounded px-2 py-1 text-sm"
          placeholder="Obyekt, kod yoki nom bo‘yicha qidirish" value={qidiruv}
          onChange={e => setQidiruv(e.target.value)} />
        <input aria-label="Qamrov o'zgarish sababi" className="border rounded px-2 py-1 text-sm"
          placeholder="O‘zgarish sababi" value={sabab} onChange={e => setSabab(e.target.value)} />
      </div>
      {xato && <p className="text-danger text-sm">{xato}</p>}
      <div className="overflow-auto max-h-[420px] border rounded">
        <table className="w-full text-xs border-collapse min-w-[760px]">
          <thead className="sticky top-0 bg-surface-2 z-[1]">
            <tr className="border-b border-border">
              <th className="text-left px-2 py-1.5">Obyekt</th>
              <th className="text-left px-2 py-1.5">Kod / nom</th>
              <th className="text-left px-2 py-1.5">Birlik</th>
              <th className="text-right px-2 py-1.5">Smeta hajmi</th>
              <th className="text-right px-2 py-1.5">Shartnoma hajmi</th>
              <th className="text-right px-2 py-1.5">Summa</th>
              <th className="text-left px-2 py-1.5">Holat</th>
              <th className="px-2 py-1.5">Amal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(q => {
              const parent = !q.hisobga_kiradi;
              return (
                <tr key={q.qator_id} className={'border-b border-border/50 ' + (q.amalda_qamrovda ? '' : 'opacity-60')}>
                  <td className="px-2 py-1.5">{q.obyekt_nom}</td>
                  <td className="px-2 py-1.5">
                    <div className={parent ? 'font-medium' : ''}>{q.kod || '—'}</div>
                    <div className="text-text-mute truncate max-w-[340px]" title={q.nom || ''}>{q.nom || 'Nomsiz qator'}</div>
                  </td>
                  <td className="px-2 py-1.5">{q.birlik || '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{q.hajm ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right">
                    {!parent ? <input
                      aria-label={`Shartnoma hajmi ${q.qator_id}`}
                      className="w-24 border rounded px-2 py-1 text-right tabular-nums"
                      inputMode="decimal" min="0" step="any"
                      placeholder="Smeta bilan bir xil"
                      value={hajmDraft[q.qator_id] ?? (q.hajm_override == null ? '' : String(q.hajm_override))}
                      onChange={e => setHajmDraft(d => ({ ...d, [q.qator_id]: e.target.value }))}
                    /> : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{q.summa ?? '—'}</td>
                  <td className="px-2 py-1.5">{parent ? 'Tarkib qatori' : q.amalda_qamrovda ? 'Kiritilgan' : 'Chiqarilgan'}</td>
                  <td className="px-2 py-1.5 text-right">
                    {!parent && <div className="flex justify-end gap-1">
                      <button type="button" disabled={savingId === q.qator_id}
                        onClick={() => void saqlaQamrov(q, q.amalda_qamrovda ? 'chiqarilgan' : 'kiritilgan')}
                        className="border rounded px-2 py-1 disabled:opacity-40">
                        {savingId === q.qator_id ? 'Saqlanmoqda…' : q.amalda_qamrovda ? 'Chiqarish' : 'Kiritish'}
                      </button>
                      {(hajmDraft[q.qator_id] !== undefined || q.hajm_override !== null) &&
                        <button type="button" disabled={savingId === q.qator_id}
                          onClick={() => void saqlaQamrov(q, q.amalda_qamrovda ? 'kiritilgan' : 'chiqarilgan')}
                          className="border border-accent text-accent rounded px-2 py-1 disabled:opacity-40">
                          Hajmni saqlash
                        </button>}
                    </div>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="px-3 py-5 text-center text-text-mute">Qator topilmadi</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sessiya({ companyId }: { companyId: number }) {
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [contracts, setContracts] = useState<Shartnoma[]>([]);
  const [contractId, setContractId] = useState<number | null>(null);
  const [qamrov, setQamrov] = useState<ShartnomaQamrovQatori[]>([]);
  const [qamrovBusy, setQamrovBusy] = useState(false);
  const [qamrovXato, setQamrovXato] = useState('');
  const [objectId, setObjectId] = useState('');

  useEffect(() => {
    let active = true;
    void sbT2ObyektlarOlKomp(companyId).then(r => { if (active && r.ok) setObjects((r.qatorlar || []) as T2Obyekt[]); });
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    let active = true;
    void sbT2ShartnomalarOl(companyId).then(r => {
      if (active && r.ok) setContracts((r.qatorlar || []) as Shartnoma[]);
    });
    return () => { active = false; };
  }, [companyId]);

  const qamrovYukla = async () => {
    if (!contractId) { setQamrov([]); return; }
    setQamrovBusy(true); setQamrovXato('');
    try {
      const r = await t2ShartnomaQamrovOl(contractId);
      if (!r.ok) { setQamrovXato(r.error || r.code || 'Qamrov o‘qilmadi'); setQamrov([]); return; }
      setQamrov(r.qatorlar || []);
    } finally { setQamrovBusy(false); }
  };

  useEffect(() => {
    setObjectId('');
    void qamrovYukla();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const contractObjectIds = new Set(qamrov.map(q => q.obyekt_id));
  const visibleObjects = contractId && qamrov.length
    ? objects.filter(o => contractObjectIds.has(Number(o.id)))
    : objects;

  return (
    <div className="space-y-6 p-1">
      <div className="border rounded-lg p-3 bg-surface-1 space-y-2">
        <label className="block text-sm font-medium">Hisob qo‘llanadigan shartnoma
          <select aria-label="Shartnoma" className="ml-2 border rounded px-2 py-1 font-normal"
            value={contractId ?? ''} onChange={e => setContractId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Kompaniya standarti</option>
            {contracts.map(s => <option key={s.id} value={s.id}>{s.raqam}{s.nom ? ` — ${s.nom}` : ''}</option>)}
          </select>
        </label>
        <p className="text-xs text-text-mute">Shartnoma tanlansa, uning nakrutka koeffitsientlari va qamrov qarorlari barcha ulangan obyektlarga bir xil qo‘llanadi.</p>
      </div>
      <KoefTahrirchi companyId={companyId} contractId={contractId} />
      {contractId && (
        qamrovBusy ? <p className="text-text-mute text-sm">Shartnoma qamrovi yuklanmoqda…</p> : qamrovXato ? <p className="text-danger text-sm">{qamrovXato}</p> :
          <QamrovTahrirchi companyId={companyId} contractId={contractId} qatorlar={qamrov} onRefresh={qamrovYukla} />
      )}
      <div className="space-y-2">
        <label className="block text-sm">Obyekt (nakrutka hisobini ko'rish uchun)
          <select aria-label="Obyekt" className="ml-2 border rounded px-2 py-1"
            value={objectId} onChange={e => setObjectId(e.target.value)}>
            <option value="">Tanlang</option>
            {visibleObjects.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
        {objectId && <ObyektKaskad key={`${objectId}:${contractId ?? 'default'}`} obyektId={Number(objectId)} contractId={contractId} />}
      </div>
      <PodvalKonstruktor companyId={companyId} contractId={contractId} objectId={objectId ? Number(objectId) : null} />
    </div>
  );
}

export default function NakrutkaNative() {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={joriy.id} companyId={joriy.id} />;
}
