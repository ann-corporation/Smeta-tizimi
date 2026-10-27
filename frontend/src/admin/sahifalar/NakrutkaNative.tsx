import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { Fragment, useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { sbT2ShartnomalarOl, type Shartnoma } from '../../api/t2-shartnoma';
import {
  t2NakrutkaKoefOl, t2NakrutkaKoefSaqla, t2ObyektNakrutka,
  NAKRUTKA_KOEF_KODLAR, NAKRUTKA_KOEF_IZOH,
  type NakrutkaKoefKod, type NakrutkaKoeffitsientlar,
  type NakrutkaKaskad, type NakrutkaKategoriyaJadval, type NakrutkaManba,
} from '../../api/t2-nakrutka';
import {
  t2ShartnomaQamrovOl, t2ShartnomaQamrovSaqla,
  type ShartnomaQamrovQatori,
} from '../../api/t2-shartnoma-qamrov';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { kaskadZinapoya, umumiyUstama } from '../../lib/narx-korinish';
import { KaskadZinapoya, ZinapoyaLegenda } from '../../components/narx/NarxKorinish';
import { PodvalKonstruktor } from './PodvalKonstruktor';
import { NakrutkaManbaChip } from './SmetaPodvalNakrutka';
import type { SvodYaxlit } from '../../lib/svod-yaxlit';

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
  { key: 'yaxlit', label: 'Svod yaxlit bo‘limlari (ustamasiz, ҚҚС siz)' },
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

  const sarlavha = contractId ? t('Shartnoma uchun koeffitsientlar') : t('Kompaniya standart koeffitsientlari');
  const maxFoiz = Math.max(1, ...NAKRUTKA_KOEF_KODLAR.map((k) => Number(koef?.[k] ?? 0)));
  return (
    <section className="fz-card">
      <div className="fz-card__head">
        <div><h3 className="fz-card__title">{sarlavha}</h3><p className="fz-card__sub">{t('Har foiz kaskadning bir qadamini beradi — pastdagi zinapoyada ko‘rinadi.')}</p></div>
        <button type="button" onClick={() => void yukla()} disabled={busy} className="fz-btn fz-btn--ghost fz-btn--sm">
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> {t('Yangilash')}
        </button>
      </div>
      {xato && <p className="fz-note fz-note--danger m-3">{xato}</p>}
      {busy && !koef ? <p className="p-5 text-[13px] text-text-mute">{t('Koeffitsientlar yuklanmoqda…')}</p> :
        <div className="overflow-x-auto">
          <table className="fz-table">
            <thead><tr><th>{t('Koeffitsient')}</th><th style={{ width: 180 }}>{t('Ulushi')}</th><th className="fz-c-num" style={{ width: 130 }}>%</th><th style={{ width: 120 }} /></tr></thead>
            <tbody>
              {NAKRUTKA_KOEF_KODLAR.map(kod => {
                const saqlangan = koef?.[kod] ?? 0;
                const qiymat = dirty[kod] ?? String(saqlangan);
                const ozgargan = dirty[kod] != null && dirty[kod] !== String(saqlangan);
                const malumot = kod === 'ЗТР_СОЦСТРАХ';
                return (
                  <tr key={kod} className={malumot ? 'fz-row-res' : ''}>
                    <td title={kod}><div>{NAKRUTKA_KOEF_IZOH[kod]}</div><div className="font-mono text-[11px] text-text-mute">{kod}</div></td>
                    <td><span className="fz-bars__q" style={{ display: 'block' }}><i style={{ display: 'block', ['--w' as string]: `${Math.min(100, (Number(saqlangan) / maxFoiz) * 100)}%` }} /></span></td>
                    <td className="fz-c-num">
                      <input aria-label={kod} className={`h-7 w-24 rounded-[var(--radius-sm)] px-2 text-right tabular-nums ${ozgargan ? 'border-accent' : ''}`}
                        value={qiymat} onChange={e => setDirty(d => ({ ...d, [kod]: e.target.value }))} />
                    </td>
                    <td className="text-right">
                      <button type="button" disabled={!ozgargan || saving === kod} onClick={() => void saqla(kod)} className={`fz-btn fz-btn--sm ${ozgargan ? 'fz-btn--primary' : ''}`}>
                        <Save size={12} /> {saving === kod ? t('Saqlanmoqda…') : t('Saqlash')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
    </section>
  );
}

const KAT_BOLAK: { kalit: 'chel' | 'mash' | 'mat' | 'ob'; nom: string; cls: string }[] = [
  { kalit: 'chel', nom: 'ЧЕЛ — mehnat', cls: 'fz-bg-chel' }, { kalit: 'mash', nom: 'МАШ — mexanizmlar', cls: 'fz-bg-mash' },
  { kalit: 'mat', nom: 'МАТ — materiallar', cls: 'fz-bg-mat' }, { kalit: 'ob', nom: 'ОБ — jihozlar', cls: 'fz-bg-ob' },
];

function ObyektKaskad({ obyektId, contractId }: { obyektId: number; contractId: number | null }) {
  const [busy, setBusy] = useState(false);
  const [xato, setXato] = useState('');
  const [cats, setCats] = useState<{ chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number } | null>(null);
  const [kaskad, setKaskad] = useState<NakrutkaKaskad | null>(null);
  const [jadval, setJadval] = useState<NakrutkaKategoriyaJadval | null>(null);
  const [manba, setManba] = useState<NakrutkaManba | null>(null);
  const [svodYaxlit, setSvodYaxlit] = useState<SvodYaxlit | null>(null);

  useEffect(() => {
    let active = true;
    setBusy(true); setXato('');
    void t2ObyektNakrutka(obyektId, contractId).then(r => {
      if (!active) return;
      if (!r.ok) { setXato(r.error || r.code || 'Hisoblanmadi'); setCats(null); setKaskad(null); setJadval(null); return; }
      setCats(r.cats ?? null); setKaskad(r.nakrutka ?? null); setJadval(r.jadval ?? null); setManba(r.nk_manba ?? null); setSvodYaxlit(r.svod_yaxlit ?? null);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [obyektId, contractId]);

  if (busy) return <div className="skel h-48 rounded-[var(--radius-md)]" role="status" aria-label={t('Hisoblanmoqda…')} />;
  if (xato) return <p className="fz-note fz-note--danger">{xato}</p>;
  if (!kaskad || !cats) return null;

  // Svod yaxlit qatori faqat belgilangan bo'lim bo'lsa (server nakrutka.yaxlit).
  const qadamlar = kaskadZinapoya(kaskad as unknown as Record<string, unknown>, KASKAD_QATORLAR
    .filter((q) => q.key !== 'yaxlit' || kaskad.yaxlit != null)
    .map((q) => ({ ...q, label: t(q.label) })));
  const ustama = umumiyUstama(kaskad.pryamye, kaskad.vsego);
  const katJami = KAT_BOLAK.reduce((a, k) => a + Math.max(0, cats[k.kalit] ?? 0), 0);
  const jadvalMax = jadval ? Math.max(1e-9, ...Object.values(jadval)) : 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="fz-doc__panels">
        <section className="fz-panel" aria-label={t('Ustama natijasi')}>
          <div className="fz-panel__h"><span>{t('Ustama natijasi')}</span></div>
          <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-[13px]">
            <span className="text-text-dim">{t('To‘g‘ri xarajat (ustamasiz)')}</span><b className="text-right tabular-nums"><FmtN val={kaskad.pryamye} /></b>
            <span className="text-text-dim">{t('ВСЕГО (ustamali, ҚҚС bilan)')}</span><b className="text-right font-[family-name:var(--font-display)] text-[18px] tabular-nums text-text"><FmtN val={kaskad.vsego} /></b>
          </div>
          <NakrutkaManbaChip manba={manba} />
          {svodYaxlit && (
            <p className="fz-note fz-note--info text-[12px]" data-testid="svod-yaxlit">
              {t('Svod yaxlit bo‘limlari ({n}) ustamasiz qo‘shildi: {s} so‘m (ҚҚС siz) — summa svodning o‘zidan, ustama hisoblanmaydi.', { n: String(svodYaxlit.bolimlar.length), s: svodYaxlit.qqssiz.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) })}
            </p>
          )}
          <span className="fz-chip fz-chip--accent self-start" data-testid="umumiy-ustama">{t('Umumiy ustama')}: {ustama == null ? '—' : `+${ustama.toFixed(2)}%`}</span>
        </section>
        <section className="fz-panel" aria-label={t('Kategoriyalar bo‘yicha')}>
          <div className="fz-panel__h"><span>{t('To‘g‘ri xarajat kategoriyalar bo‘yicha')}</span><span>{t('ustamasiz')}</span></div>
          <div className="fz-split" role="img" aria-label={KAT_BOLAK.map((k) => `${k.nom}: ${cats[k.kalit]}`).join(', ')}>
            {KAT_BOLAK.filter((k) => cats[k.kalit] > 0).map((k) => <i key={k.kalit} className={k.cls} style={{ flexGrow: cats[k.kalit] }} />)}
          </div>
          <div className="fz-legend">
            {KAT_BOLAK.map((k) => <Fragment key={k.kalit}>
              <i className={k.cls} style={{ width: 10, height: 10, borderRadius: 2, display: 'block' }} />
              <span>{t(k.nom)}</span>
              <span className="fz-c-num"><FmtN val={cats[k.kalit]} kasr={0} /></span>
              <small>{katJami > 0 ? `${Math.round((Math.max(0, cats[k.kalit]) / katJami) * 100)}%` : '—'}</small>
            </Fragment>)}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11.5px] text-text-mute">
            <span>{t('МАТ ichida:')}</span>
            {([['М/К', cats.mk], ['КАБ', cats.kab], ['БЕЗСКЛАД', cats.bez]] as const).map(([label, val]) => <span key={label} className="fz-chip">{label} <FmtN val={val} kasr={0} /></span>)}
          </div>
        </section>
      </div>
      <ZinapoyaLegenda />
      <KaskadZinapoya qadamlar={qadamlar} />
      {jadval && (
        <section className="fz-panel" aria-label={t('Kategoriya bo‘yicha yakuniy koeffitsient jadvali')}>
          <div className="fz-panel__h"><span>{t('Kategoriya bo‘yicha yakuniy koeffitsient jadvali')}</span></div>
          <div className="fz-bars">
            {Object.entries(jadval).map(([kat, k]) => (
              <div key={kat} className="fz-bars__q">
                <span>{kat}</span><b>{(k * 100).toFixed(2)}%</b>
                <i style={{ ['--w' as string]: `${Math.max(0, (k / jadvalMax) * 100)}%` }} />
              </div>
            ))}
          </div>
        </section>
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
  const qamrovda = hisobgaKiradigan.filter(q => q.amalda_qamrovda).length;
  const ulush = hisobgaKiradigan.length ? qamrovda / hisobgaKiradigan.length : null;
  return (
    <section className="fz-card">
      <div className="fz-card__head">
        <div>
          <h3 className="fz-card__title">{t('Shartnoma qamrovi')}</h3>
          <p className="fz-card__sub">{t('Smeta qatori o‘chmaydi. Faqat shu shartnoma hisobidan kiritiladi yoki chiqariladi.')}</p>
        </div>
        <div className="flex min-w-[220px] flex-col items-end gap-1 text-[12px] text-text-dim">
          <span className="tabular-nums">{t('{a} / {b} resurs qatori hisobda', { a: String(qamrovda), b: String(hisobgaKiradigan.length) })}</span>
          <span className="fz-meter w-full"><span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${(ulush ?? 0) * 100}%` }} /></span><span className="fz-meter__f">{ulush == null ? '—' : `${Math.round(ulush * 100)}%`}</span></span>
        </div>
      </div>
      <div className="fz-card__body flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr]">
          <input aria-label="Qamrov qidiruvi" className="h-8 px-2 text-[13px]"
            placeholder={t('Obyekt, kod yoki nom bo‘yicha qidirish')} value={qidiruv}
            onChange={e => setQidiruv(e.target.value)} />
          <input aria-label="Qamrov o'zgarish sababi" className="h-8 px-2 text-[13px]"
            placeholder={t('O‘zgarish sababi')} value={sabab} onChange={e => setSabab(e.target.value)} />
        </div>
        {xato && <p className="fz-note fz-note--danger">{xato}</p>}
        <div className="fz-table-wrap max-h-[420px]">
          <table className="fz-table min-w-[820px]">
            <thead><tr>
              <th>{t('Obyekt')}</th><th>{t('Kod / nom')}</th><th>{t('Birlik')}</th>
              <th className="fz-c-num">{t('Smeta hajmi')}</th><th className="fz-c-num">{t('Shartnoma hajmi')}</th><th className="fz-c-num">{t('Summa')}</th>
              <th>{t('Holat')}</th><th className="fz-c-num">{t('Amal')}</th>
            </tr></thead>
            <tbody>
              {rows.map(q => {
                const parent = !q.hisobga_kiradi;
                const muhr = parent ? <span className="fz-stamp">{t('Tarkib qatori')}</span>
                  : q.amalda_qamrovda ? <span className="fz-stamp fz-stamp--ok">{t('Kiritilgan')}</span> : <span className="fz-stamp fz-stamp--draft">{t('Chiqarilgan')}</span>;
                return (
                  <tr key={q.qator_id} className={parent ? 'fz-row-bl' : q.amalda_qamrovda ? '' : 'fz-row-res'}>
                    <td>{q.obyekt_nom}</td>
                    <td>
                      <div className="fz-c-shifr">{q.kod || '—'}</div>
                      <div className="max-w-[340px] truncate" title={q.nom || ''}>{q.nom || t('Nomsiz qator')}</div>
                    </td>
                    <td className="fz-c-unit">{q.birlik || '—'}</td>
                    <td className="fz-c-num">{q.hajm == null ? '—' : <FmtN val={q.hajm} />}</td>
                    <td className="fz-c-num">
                      {!parent ? <input
                        aria-label={`Shartnoma hajmi ${q.qator_id}`}
                        className="h-7 w-24 px-2 text-right tabular-nums"
                        inputMode="decimal" min="0" step="any"
                        placeholder={t('Smeta bilan bir xil')}
                        value={hajmDraft[q.qator_id] ?? (q.hajm_override == null ? '' : String(q.hajm_override))}
                        onChange={e => setHajmDraft(d => ({ ...d, [q.qator_id]: e.target.value }))}
                      /> : '—'}
                    </td>
                    <td className="fz-c-num">{q.summa == null ? '—' : <FmtN val={q.summa} />}</td>
                    <td>{muhr}</td>
                    <td className="fz-c-num">
                      {!parent && <div className="flex justify-end gap-1">
                        <button type="button" disabled={savingId === q.qator_id}
                          onClick={() => void saqlaQamrov(q, q.amalda_qamrovda ? 'chiqarilgan' : 'kiritilgan')}
                          className={`fz-btn fz-btn--sm ${q.amalda_qamrovda ? 'fz-btn--danger' : ''}`}>
                          {savingId === q.qator_id ? t('Saqlanmoqda…') : q.amalda_qamrovda ? t('Chiqarish') : t('Kiritish')}
                        </button>
                        {(hajmDraft[q.qator_id] !== undefined || q.hajm_override !== null) &&
                          <button type="button" disabled={savingId === q.qator_id}
                            onClick={() => void saqlaQamrov(q, q.amalda_qamrovda ? 'kiritilgan' : 'chiqarilgan')}
                            className="fz-btn fz-btn--sm fz-btn--primary">
                            {t('Hajmni saqlash')}
                          </button>}
                      </div>}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={8} className="py-5 text-center text-text-mute">{t('Qator topilmadi')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
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
  const qamrovBlok = qamrovBusy ? <p className="text-[13px] text-text-mute">{t('Shartnoma qamrovi yuklanmoqda…')}</p>
    : qamrovXato ? <p className="fz-note fz-note--danger">{qamrovXato}</p>
      : contractId ? <QamrovTahrirchi companyId={companyId} contractId={contractId} qatorlar={qamrov} onRefresh={qamrovYukla} /> : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="fz-card fz-card__body flex flex-wrap items-end gap-4">
        <label className="flex min-w-[260px] flex-col gap-1.5 text-[12px] font-medium text-text-dim">{t('Hisob qo‘llanadigan shartnoma')}
          <select aria-label="Shartnoma" className="h-9 px-2 text-[13px] font-normal"
            value={contractId ?? ''} onChange={e => setContractId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('Kompaniya standarti')}</option>
            {contracts.map(s => <option key={s.id} value={s.id}>{s.raqam}{s.nom ? ` — ${s.nom}` : ''}</option>)}
          </select>
        </label>
        <label className="flex min-w-[260px] flex-col gap-1.5 text-[12px] font-medium text-text-dim">{t('Obyekt (nakrutka hisobini ko‘rish uchun)')}
          <select aria-label="Obyekt" className="h-9 px-2 text-[13px] font-normal"
            value={objectId} onChange={e => setObjectId(e.target.value)}>
            <option value="">{t('Tanlang')}</option>
            <ObyektOptionlari obyektlar={visibleObjects} />
          </select>
        </label>
        <p className="max-w-[60ch] text-[12px] text-text-mute">{t('Shartnoma tanlansa, uning nakrutka koeffitsientlari va qamrov qarorlari barcha ulangan obyektlarga bir xil qo‘llanadi.')}</p>
      </section>
      {objectId
        ? <ObyektKaskad key={`${objectId}:${contractId ?? 'default'}`} obyektId={Number(objectId)} contractId={contractId} />
        : <p className="fz-note fz-note--info">{t('Obyekt tanlang — to‘g‘ri xarajatdan ВСЕГО gacha ustama zinapoyasi shu yerda chiziladi.')}</p>}
      <KoefTahrirchi companyId={companyId} contractId={contractId} />
      {qamrovBlok}
      <PodvalKonstruktor companyId={companyId} contractId={contractId} objectId={objectId ? Number(objectId) : null} />
    </div>
  );
}

export default function NakrutkaNative() {
  const { joriy, yuklanmoqda } = useKompaniya();
  const ichki = yuklanmoqda ? <p className="text-[13px] text-text-dim">{t('Kompaniya yuklanmoqda…')}</p>
    : !joriy?.id ? <p className="fz-note fz-note--info">{t('Kompaniyani tanlang.')}</p>
      : <Sessiya key={joriy.id} companyId={joriy.id} />;
  return <Sahifa sarlavha="Nakrutka (ustama)" tavsif="Koeffitsientlar, shartnoma qamrovi va podval: to‘g‘ridan-to‘g‘ri xarajatdan ВСЕГО gacha har qadam ko‘rinadi">{ichki}</Sahifa>;
}
