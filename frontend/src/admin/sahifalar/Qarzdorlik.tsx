import { t } from '../../i18n/til';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Download, FileUp, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { yangiOperationId } from '../../api/supabase';
import { qarzdorlikImport, qarzdorlikRoyxatOl, qarzdorlikSaqla, qarzdorlikXato, type QarzRoyxat, type QarzShartnoma } from '../../api/t2-qarzdorlik';
import { ASOS_TURLAR, qarzHisobla, qatorSumma, royxatJami, type AsosQator, type AsosTur, type OgohKod, type QarzNatija } from '../../lib/qarzdorlik/hisob';
import { parseVaraqlar, readWorkbookGrids, sonOl, type ImportNatija } from '../../lib/qarzdorlik/parse';
import { qarzdorlikXlsxYarat } from '../../lib/qarzdorlik/eksport';

const kirit = 'w-full rounded-md border border-border bg-surface px-2 py-1 text-[12.5px] text-text outline-none focus:border-accent';
const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';

const TUR_NOM: Record<AsosTur, () => string> = {
  yetkazib_berish: () => t('Yetkazib berish'),
  bajarilgan_ish: () => t('Bajarilgan ish'),
  tolov: () => t('To‘lov'),
  boshlangich_qoldiq: () => t('Boshlang‘ich qoldiq'),
};
const SH_TURI: Record<string, () => string> = {
  postavshik: () => t('Postavshik'), subpudrat: () => t('Subpudrat'), xizmat: () => t('Xizmat'),
};
const OGOH_MATN: Record<OgohKod, () => string> = {
  avans: () => t('Ortiqcha to‘lov / avans: ular bizdan qarz'),
  qabul_oshgan: () => t('Qabul qilingan shartnoma summasidan oshgan'),
  farq: () => t('Spravka qarzi asoslanmagan farq bor'),
  asossiz_spravka: () => t('Spravkada qarz bor, lekin asos hujjatlar kiritilmagan'),
  summasiz_qator: () => t('Summasi noma‘lum asos qatorlari bor'),
  tolov_spravkadan_kam: () => t('To‘lovlar spravkadagidan kam'),
};

type QatorShakl = {
  key: string; id: number | null; tur: AsosTur; hujjat_raqam: string; sana: string; nomi: string; birlik: string;
  hajm: string; narx: string; summa: string; izoh: string; sklad_harakat_id: number | null; tolov_id: number | null;
};
const strSon = (n: number | null | undefined) => (n == null ? '' : String(n));
let kalitSon = 0;
const yangiKalit = () => `n${++kalitSon}`;

const shakldan = (q: QarzShartnoma['qatorlar'][number]): QatorShakl => ({
  key: `q${q.id}`, id: q.id, tur: q.tur, hujjat_raqam: q.hujjat_raqam ?? '', sana: q.sana ?? '', nomi: q.nomi ?? '', birlik: q.birlik ?? '',
  hajm: strSon(q.hajm), narx: strSon(q.narx), summa: strSon(q.summa), izoh: q.izoh ?? '', sklad_harakat_id: q.sklad_harakat_id ?? null, tolov_id: q.tolov_id ?? null,
});
const asosdan = (s: QatorShakl): AsosQator => ({
  id: s.id, tur: s.tur, hujjat_raqam: s.hujjat_raqam.trim() || null, sana: s.sana.trim() || null, nomi: s.nomi.trim() || null, birlik: s.birlik.trim() || null,
  hajm: sonOl(s.hajm), narx: sonOl(s.narx), summa: sonOl(s.summa), izoh: s.izoh.trim() || null, sklad_harakat_id: s.sklad_harakat_id, tolov_id: s.tolov_id,
});

function hisobOf(sh: QarzShartnoma): QarzNatija {
  return qarzHisobla({ qatorlar: sh.qatorlar, tolovT2: sh.tolov_t2, shartnomaSumma: sh.shartnoma_summa, spravkaQarz: sh.spravka_qarz, spravkaTolangan: sh.spravka_tolangan });
}

/** + biz qarzmiz (qizil), − ular qarz / avans (yashil), noma‘lum — tire. */
function Qarz({ v }: { v: number | null }) {
  if (v == null) return <span className="text-text-mute" title={t('Noma‘lum (asos kiritilmagan)')}>—</span>;
  const rang = 0.5 < v ? 'text-danger' : v < -0.5 ? 'text-ok' : 'text-text';
  return <b className={`tabular-nums ${rang}`}><FmtN val={v} /></b>;
}
function Son({ v }: { v: number | null }) {
  return v == null ? <span className="text-text-mute">—</span> : <span className="tabular-nums"><FmtN val={v} /></span>;
}

/* ---------- Kengaytirilgan qator: asoslar (inline tahrir, bitta Saqlash) ---------- */

function Tafsilot({ sh, kid, onSaqlandi }: { sh: QarzShartnoma; kid: number; onSaqlandi: () => void }) {
  const [qs, setQs] = useState<QatorShakl[]>(() => sh.qatorlar.map(shakldan));
  const [och, setOch] = useState<number[]>([]);
  const [sp, setSp] = useState({ qarz: strSon(sh.spravka_qarz), tolangan: strSon(sh.spravka_tolangan), prognoz: strSon(sh.spravka_prognoz) });
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const opRef = useRef<string>(yangiOperationId());
  const ozgargan = useMemo(() => {
    if (och.length > 0 || qs.length !== sh.qatorlar.length) return true;
    if (sp.qarz !== strSon(sh.spravka_qarz) || sp.tolangan !== strSon(sh.spravka_tolangan) || sp.prognoz !== strSon(sh.spravka_prognoz)) return true;
    return qs.some((q, i) => JSON.stringify(q) !== JSON.stringify(shakldan(sh.qatorlar[i])));
  }, [qs, och, sp, sh]);

  const jonli = useMemo(() => qarzHisobla({
    qatorlar: qs.map(asosdan), tolovT2: sh.tolov_t2, shartnomaSumma: sh.shartnoma_summa, spravkaQarz: sonOl(sp.qarz), spravkaTolangan: sonOl(sp.tolangan),
  }), [qs, sp, sh]);

  const ozgar = (key: string, p: Partial<QatorShakl>) => { setQs((a) => a.map((q) => (q.key === key ? { ...q, ...p } : q))); opRef.current = yangiOperationId(); };
  const qosh = (tur: AsosTur) => { setQs((a) => [...a, { key: yangiKalit(), id: null, tur, hujjat_raqam: '', sana: '', nomi: '', birlik: '', hajm: '', narx: '', summa: '', izoh: '', sklad_harakat_id: null, tolov_id: null }]); opRef.current = yangiOperationId(); };
  const ochir = (q: QatorShakl) => { setQs((a) => a.filter((x) => x.key !== q.key)); if (q.id != null) setOch((a) => [...a, q.id as number]); opRef.current = yangiOperationId(); };

  const saqla = async () => {
    setSaqlanmoqda(true);
    const r = await qarzdorlikSaqla({
      kompaniyaId: kid, shartnomaId: sh.shartnoma_id, kutilganVersiya: sh.versiya, qatorlar: qs.map(asosdan), ochirilgan: och,
      spravka: { qarz: sonOl(sp.qarz), tolangan: sonOl(sp.tolangan), prognoz: sonOl(sp.prognoz) }, operationId: opRef.current,
    });
    setSaqlanmoqda(false);
    if (r.ok) { toast(t('Saqlandi'), 'ok'); onSaqlandi(); } else toast(qarzdorlikXato(r), 'danger');
  };

  return (
    <div className="space-y-3 p-3" aria-label={t('Qarz asoslari')}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([['qarz', 'Spravka qarzi (QQS bilan)'], ['tolangan', 'Spravka: to‘langan'], ['prognoz', 'Spravka: prognoz']] as const).map(([k, nom]) => (
          <label key={k}><span className={yorliq}>{t(nom)}</span>
            <MoneyInput aria-label={t(nom)} inputMode="decimal" className={`${kirit} tabular-nums`} value={sp[k]} onValueChange={(v) => setSp((s) => ({ ...s, [k]: v }))} />
          </label>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[12px]">
          <thead>
            <tr className="text-left text-[11px] uppercase text-text-mute">
              <th className="px-1 py-1">{t('Turi')}</th><th className="px-1 py-1">{t('Hujjat №')}</th><th className="px-1 py-1">{t('Sana')}</th><th className="px-1 py-1">{t('Nomi')}</th>
              <th className="px-1 py-1">{t('Birlik')}</th><th className="px-1 py-1">{t('Hajm')}</th><th className="px-1 py-1">{t('Narx')}</th><th className="px-1 py-1">{t('Summa (QQS bilan)')}</th>
              <th className="px-1 py-1">{t('Izoh')}</th><th className="px-1 py-1" />
            </tr>
          </thead>
          <tbody>
            {qs.length === 0 && <tr><td colSpan={10} className="px-1 py-3 text-center text-text-mute">{t('Asos qatori yo‘q — qarz noma‘lum. Pastdan qo‘shing.')}</td></tr>}
            {qs.map((q) => {
              const hisob = qatorSumma(asosdan(q));
              return (
                <tr key={q.key} className="border-t border-border/50 align-top">
                  <td className="px-1 py-1">
                    <select aria-label={t('Turi')} className={kirit} value={q.tur} onChange={(e) => ozgar(q.key, { tur: e.target.value as AsosTur })}>
                      {ASOS_TURLAR.map((x) => <option key={x} value={x}>{TUR_NOM[x]()}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1"><input aria-label={t('Hujjat №')} className={kirit} value={q.hujjat_raqam} onChange={(e) => ozgar(q.key, { hujjat_raqam: e.target.value })} /></td>
                  <td className="px-1 py-1"><input aria-label={t('Sana')} type="date" className={kirit} value={q.sana} onChange={(e) => ozgar(q.key, { sana: e.target.value })} /></td>
                  <td className="px-1 py-1"><input aria-label={t('Nomi')} className={kirit} value={q.nomi} onChange={(e) => ozgar(q.key, { nomi: e.target.value })} /></td>
                  <td className="px-1 py-1"><input aria-label={t('Birlik')} className={`${kirit} w-16`} value={q.birlik} onChange={(e) => ozgar(q.key, { birlik: e.target.value })} /></td>
                  <td className="px-1 py-1"><MoneyInput aria-label={t('Hajm')} inputMode="decimal" className={`${kirit} w-24 tabular-nums`} value={q.hajm} onValueChange={(v) => ozgar(q.key, { hajm: v })} /></td>
                  <td className="px-1 py-1"><MoneyInput aria-label={t('Narx')} inputMode="decimal" className={`${kirit} w-28 tabular-nums`} value={q.narx} onValueChange={(v) => ozgar(q.key, { narx: v })} /></td>
                  <td className="px-1 py-1">
                    <MoneyInput aria-label={t('Summa (QQS bilan)')} inputMode="decimal" className={`${kirit} w-32 tabular-nums`} value={q.summa} onValueChange={(v) => ozgar(q.key, { summa: v })} placeholder={hisob != null && sonOl(q.summa) == null ? String(hisob) : ''} />
                  </td>
                  <td className="px-1 py-1"><input aria-label={t('Izoh')} className={kirit} value={q.izoh} onChange={(e) => ozgar(q.key, { izoh: e.target.value })} /></td>
                  <td className="px-1 py-1"><button type="button" className="fz-btn fz-btn--sm" aria-label={t('Qatorni o‘chirish')} onClick={() => ochir(q)}><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ASOS_TURLAR.map((x) => <button key={x} type="button" className="fz-btn fz-btn--sm" onClick={() => qosh(x)}><Plus size={13} /> {TUR_NOM[x]()}</button>)}
        <span className="ml-auto text-[12px]">{t('Hisob')}: {t('qabul')} <Son v={jonli.qabul} /> · {t('to‘langan')} <Son v={jonli.tolangan} /> · {t('qarz')} <Qarz v={jonli.qarz} />
          {jonli.farq != null && <> · {t('farq')} <Qarz v={jonli.farq} /></>}</span>
        <button type="button" className="fz-btn fz-btn--primary" disabled={!ozgargan || saqlanmoqda} onClick={() => void saqla()}><Save size={14} /> {t('Saqlash')}</button>
      </div>
      {sh.tolov_t2 != null && <p className="text-[11px] text-text-mute">{t('Tizim to‘lovlari (t2_tolov) alohida hisobga kiritilgan:')} <FmtN val={sh.tolov_t2} /></p>}
    </div>
  );
}

/* ---------- Import oynasi ---------- */

function ImportOyna({ kid, obyektlar, onYop, onTayyor }: { kid: number; obyektlar: QarzRoyxat['obyektlar']; onYop: () => void; onTayyor: () => void }) {
  const [natija, setNatija] = useState<(ImportNatija & { varaq: string | null }) | null>(null);
  const [fayl, setFayl] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [turi, setTuri] = useState<'postavshik' | 'subpudrat' | 'xizmat'>('postavshik');
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [bajarilmoqda, setBajarilmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const opRef = useRef<string>(yangiOperationId());

  const tahlil = useCallback(async (b: ArrayBuffer, tur: typeof turi) => {
    setYuklanmoqda(true); setXato(null);
    try {
      const varaqlar = await readWorkbookGrids(b);
      setNatija(parseVaraqlar(varaqlar, { turi: tur, spravkaSana: new Date().toISOString().slice(0, 10) }));
    } catch (e) { setNatija(null); setXato(e instanceof Error ? e.message : t('Faylni o‘qib bo‘lmadi')); }
    setYuklanmoqda(false);
  }, []);

  const tanla = async (f: File | undefined) => {
    if (!f) return;
    setFayl(f.name); opRef.current = yangiOperationId();
    const b = await f.arrayBuffer(); setBuf(b); await tahlil(b, turi);
  };
  const turOzgar = (v: typeof turi) => { setTuri(v); if (buf) void tahlil(buf, v); };

  const tasdiq = async () => {
    if (!natija || natija.shartnomalar.length === 0) return;
    setBajarilmoqda(true);
    const r = await qarzdorlikImport({ kompaniyaId: kid, shartnomalar: natija.shartnomalar, obyektId, operationId: opRef.current });
    setBajarilmoqda(false);
    if (r.ok) {
      toast(t('Import: {y} yangi, {u} yangilandi, {q} qator qo‘shildi, {k} takror o‘tkazildi', { y: r.shartnoma_yangi ?? 0, u: r.shartnoma_yangilandi ?? 0, q: r.qator_qoshildi ?? 0, k: r.qator_takror ?? 0 }), 'ok');
      onTayyor();
    } else setXato(qarzdorlikXato(r));
  };

  return (
    <div role="dialog" aria-label={t('Excel import')} className="fz-panel space-y-3 border border-accent/40 p-3">
      <div className="flex items-center justify-between">
        <p className="fz-panel__h">{t('Excel import (shablon yoki finansoviy spravka)')}</p>
        <button type="button" className="fz-btn fz-btn--sm" aria-label={t('Yopish')} onClick={onYop}><X size={14} /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label><span className={yorliq}>{t('Fayl (.xlsx)')}</span>
          <input aria-label={t('Fayl (.xlsx)')} type="file" accept=".xlsx" className={kirit} onChange={(e) => void tanla(e.target.files?.[0])} />
        </label>
        <label><span className={yorliq}>{t('Shartnoma turi (standart)')}</span>
          <select aria-label={t('Shartnoma turi (standart)')} className={kirit} value={turi} onChange={(e) => turOzgar(e.target.value as typeof turi)}>
            {Object.keys(SH_TURI).map((k) => <option key={k} value={k}>{SH_TURI[k]()}</option>)}
          </select>
        </label>
        <label><span className={yorliq}>{t('Obyekt (ixtiyoriy)')}</span>
          <select aria-label={t('Obyekt (ixtiyoriy)')} className={kirit} value={obyektId ?? ''} onChange={(e) => setObyektId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('— biriktirilmasin —')}</option>
            {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
      </div>
      {yuklanmoqda && <p className="text-[12px] text-text-mute">{t('Fayl o‘qilmoqda…')}</p>}
      {xato && <p role="alert" className="text-[12px] text-danger">{xato}</p>}
      {natija && (
        <div className="space-y-2">
          <p className="text-[12px] text-text-mute">
            {fayl} · {natija.format === 'shablon' ? t('Format: Обоснование задолженности (shablon)') : natija.format === 'spravka' ? t('Format: finansoviy spravka') : t('Format tanilmadi')}
            {natija.varaq ? ` · ${natija.varaq}` : ''} · {t('{n} ta shartnoma', { n: natija.shartnomalar.length })}
          </p>
          {natija.xatolar.map((x, i) => <p key={i} role="alert" className="text-[12px] text-danger">{x}</p>)}
          {natija.shartnomalar.length > 0 && (
            <div className="max-h-72 overflow-auto">
              <table className="w-full min-w-[760px] text-[12px]" aria-label={t('Import ko‘rinishi')}>
                <thead><tr className="text-left text-[11px] uppercase text-text-mute">
                  <th className="px-1 py-1">{t('Kontragent')}</th><th className="px-1 py-1">{t('Shartnoma')}</th><th className="px-1 py-1">{t('Turi')}</th>
                  <th className="px-1 py-1 text-right">{t('Shartnoma summasi')}</th><th className="px-1 py-1 text-right">{t('Asos qatori')}</th>
                  <th className="px-1 py-1 text-right">{t('Hisob qarzi')}</th><th className="px-1 py-1 text-right">{t('Spravka qarzi')}</th>
                </tr></thead>
                <tbody>
                  {natija.shartnomalar.map((s) => {
                    const h = qarzHisobla({ qatorlar: s.qatorlar, shartnomaSumma: s.summa, spravkaQarz: s.spravka?.qarz ?? null });
                    return (
                      <tr key={s.raqam} className="border-t border-border/50">
                        <td className="px-1 py-1">{s.kontragent}</td>
                        <td className="px-1 py-1">{s.raqam}{s.nom ? ` · ${s.nom}` : ''}</td>
                        <td className="px-1 py-1">{SH_TURI[s.turi]()}</td>
                        <td className="px-1 py-1 text-right"><Son v={s.summa} /></td>
                        <td className="px-1 py-1 text-right tabular-nums">{s.qatorlar.length}</td>
                        <td className="px-1 py-1 text-right"><Qarz v={h.qarz} /></td>
                        <td className="px-1 py-1 text-right"><Son v={s.spravka?.qarz ?? null} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="fz-btn" onClick={onYop}>{t('Bekor qilish')}</button>
            <button type="button" className="fz-btn fz-btn--primary" disabled={natija.shartnomalar.length === 0 || bajarilmoqda} onClick={() => void tasdiq()}>
              <FileUp size={14} /> {t('Saqlash (import)')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Sahifa ---------- */

export function Qarzdorlik() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const [royxat, setRoyxat] = useState<QarzRoyxat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [ochiq, setOchiq] = useState<number | null>(null);
  const [import_, setImport] = useState(false);
  const [filtr, setFiltr] = useState<'hammasi' | 'postavshik' | 'subpudrat' | 'xizmat'>('hammasi');
  const [qidir, setQidir] = useState('');
  const [faqatOgoh, setFaqatOgoh] = useState(false);

  const yukla = useCallback(async () => {
    if (!kid) return;
    setYuklanmoqda(true);
    const r = await qarzdorlikRoyxatOl(kid);
    setYuklanmoqda(false);
    if (r.ok) { setRoyxat(r.natija); setXato(null); } else setXato(r.error);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);

  const qatorlar = useMemo(() => (royxat?.shartnomalar ?? []).map((sh) => ({ sh, h: hisobOf(sh) })), [royxat]);
  const korinadigan = useMemo(() => {
    const q = qidir.trim().toLowerCase();
    return qatorlar.filter(({ sh, h }) => (filtr === 'hammasi' || sh.turi === filtr)
      && (!faqatOgoh || h.ogohlantirishlar.length > 0)
      && (!q || `${sh.kontragent ?? ''} ${sh.raqam} ${sh.nom ?? ''} ${sh.predmet ?? ''}`.toLowerCase().includes(q)));
  }, [qatorlar, filtr, qidir, faqatOgoh]);
  const jami = useMemo(() => royxatJami(korinadigan.map(({ sh, h }) => ({ ...h, shartnomaSumma: sh.shartnoma_summa, spravkaQarz: sh.spravka_qarz }))), [korinadigan]);

  const eksport = async () => {
    const buf = await qarzdorlikXlsxYarat(korinadigan.map(({ sh }) => ({
      kontragent: sh.kontragent ?? '', nom: sh.nom, predmet: sh.predmet, raqam: sh.raqam, summa: sh.shartnoma_summa, spravkaQarz: sh.spravka_qarz, tolovT2: sh.tolov_t2, qatorlar: sh.qatorlar,
    })));
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ОБОСНОВАНИЕ_ЗАДОЛЖЕННОСТИ_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <Sahifa
      sarlavha={t('Qarzdorlik')}
      tavsif={t('Postavshik va subpudratchilar oldidagi qarz — har qarz hujjat bilan asoslanadi. Qarz = qabul qilingan − to‘langan (QQS bilan; + biz qarzmiz, − ular qarz).')}
      onYangila={() => void yukla()}
      yangilanmoqda={yuklanmoqda}
      amallar={(
        <div className="flex gap-2">
          <button type="button" className="fz-btn" onClick={() => setImport(true)} disabled={!kid}><FileUp size={14} /> {t('Excel import')}</button>
          <button type="button" className="fz-btn" onClick={() => void eksport()} disabled={korinadigan.length === 0}><Download size={14} /> {t('Excel eksport')}</button>
          <button type="button" className="fz-btn" aria-label={t('Yangilash')} onClick={() => void yukla()}><RefreshCw size={14} /></button>
        </div>
      )}
    >
      <div className="space-y-3">
        {xato && <p role="alert" className="text-[13px] text-danger">{xato}</p>}
        {import_ && kid && <ImportOyna kid={kid} obyektlar={royxat?.obyektlar ?? []} onYop={() => setImport(false)} onTayyor={() => { setImport(false); void yukla(); }} />}

        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t('Turi')} className={`${kirit} w-40`} value={filtr} onChange={(e) => setFiltr(e.target.value as typeof filtr)}>
            <option value="hammasi">{t('Hamma turlar')}</option>
            {Object.keys(SH_TURI).map((k) => <option key={k} value={k}>{SH_TURI[k]()}</option>)}
          </select>
          <input aria-label={t('Qidiruv')} className={`${kirit} w-56`} placeholder={t('Kontragent, shartnoma…')} value={qidir} onChange={(e) => setQidir(e.target.value)} />
          <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={faqatOgoh} onChange={(e) => setFaqatOgoh(e.target.checked)} /> {t('Faqat ogohlantirishlilar')}</label>
        </div>

        <div className="fz-panel grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-5" aria-label={t('Jami')}>
          <div><span className={yorliq}>{t('Shartnoma summasi')}</span><Son v={jami.shartnomaSumma} /></div>
          <div><span className={yorliq}>{t('Qabul qilingan')}</span><Son v={jami.qabul} /></div>
          <div><span className={yorliq}>{t('To‘langan')}</span><Son v={jami.tolangan} /></div>
          <div><span className={yorliq}>{t('Qarz')}</span><Qarz v={jami.qarz} /></div>
          <div><span className={yorliq}>{t('Farq (asoslanmagan)')}</span><Qarz v={jami.farq} /></div>
          {jami.qarzNomalum > 0 && <p className="col-span-2 text-[11px] text-text-mute sm:col-span-5">{t('{n} ta shartnomada asos yo‘q — qarzi noma‘lum, jamiga kirmagan.', { n: jami.qarzNomalum })}</p>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-[12.5px]" aria-label={t('Qarzdorlik ro‘yxati')}>
            <thead>
              <tr className="text-left text-[11px] uppercase text-text-mute">
                <th className="w-6 px-1 py-2" />
                <th className="px-2 py-2">{t('Kontragent')}</th><th className="px-2 py-2">{t('Shartnoma')}</th><th className="px-2 py-2">{t('Turi')}</th>
                <th className="px-2 py-2 text-right">{t('Shartnoma summasi')}</th><th className="px-2 py-2 text-right">{t('Qabul qilingan')}</th>
                <th className="px-2 py-2 text-right">{t('To‘langan')}</th><th className="px-2 py-2 text-right">{t('Qarz')}</th>
                <th className="px-2 py-2 text-right">{t('Spravka qarzi')}</th><th className="px-2 py-2 text-right">{t('Farq')}</th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {!yuklanmoqda && korinadigan.length === 0 && (
                <tr><td colSpan={11} className="px-2 py-6 text-center text-text-mute">{royxat ? t('Kontragent shartnomalari yo‘q — «Excel import» bilan yuklang.') : t('Yuklanmoqda…')}</td></tr>
              )}
              {korinadigan.map(({ sh, h }) => {
                const ochiqmi = ochiq === sh.shartnoma_id;
                return (
                  <Fragment key={sh.shartnoma_id}>
                    <tr className={`cursor-pointer border-t border-border/60 hover:bg-surface-2 ${ochiqmi ? 'bg-surface-2' : ''}`} onClick={() => setOchiq(ochiqmi ? null : sh.shartnoma_id)}>
                      <td className="px-1 py-2"><button type="button" aria-label={ochiqmi ? t('Yig‘ish') : t('Asoslarni ochish')} aria-expanded={ochiqmi} className="text-text-mute">{ochiqmi ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                      <td className="px-2 py-2 font-medium">{sh.kontragent ?? '—'}</td>
                      <td className="px-2 py-2"><span>{sh.raqam}</span>{(sh.predmet || sh.nom) && <span className="block max-w-[260px] truncate text-[11px] text-text-mute">{sh.predmet ?? sh.nom}</span>}</td>
                      <td className="px-2 py-2">{sh.turi && SH_TURI[sh.turi] ? SH_TURI[sh.turi]() : (sh.turi ?? '—')}</td>
                      <td className="px-2 py-2 text-right"><Son v={sh.shartnoma_summa} /></td>
                      <td className="px-2 py-2 text-right"><Son v={h.qabul} /></td>
                      <td className="px-2 py-2 text-right"><Son v={h.tolangan} /></td>
                      <td className="px-2 py-2 text-right"><Qarz v={h.qarz} /></td>
                      <td className="px-2 py-2 text-right"><Son v={sh.spravka_qarz} /></td>
                      <td className="px-2 py-2 text-right"><Qarz v={h.farq} /></td>
                      <td className="px-2 py-2">
                        {h.ogohlantirishlar.length > 0 && (
                          <span className="flex flex-wrap gap-1">
                            {h.ogohlantirishlar.map((o) => (
                              <span key={o.kod} title={OGOH_MATN[o.kod]()} className={`inline-flex items-center gap-0.5 rounded px-1 text-[10.5px] ${o.daraja === 'xato' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn'}`}>
                                <AlertTriangle size={11} />{OGOH_MATN[o.kod]()}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                    {ochiqmi && kid && (
                      <tr className="border-t border-border/40 bg-surface-2/40"><td colSpan={11}>
                        <Tafsilot key={`${sh.shartnoma_id}:${sh.versiya}`} sh={sh} kid={kid} onSaqlandi={() => void yukla()} />
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Sahifa>
  );
}

export default Qarzdorlik;
