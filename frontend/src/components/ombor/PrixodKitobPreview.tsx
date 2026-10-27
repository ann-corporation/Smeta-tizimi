import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, FileSpreadsheet, LoaderCircle, Search, ShieldAlert, X } from 'lucide-react';
import { t, raqamFormatla } from '../../i18n/til';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { prixodKitobFonda } from '../../lib/ombor-prixod/read-fonda';
import type { PrixodKitob, PrixodQator, PrixodXato, PrixodOgoh } from '../../lib/ombor-prixod/turlar';

const SAHIFA_HAJMI = 50;
type Filtr = 'hammasi' | 'yangi' | 'takror' | 'xato';
type Holat = {
  scope: { kompaniyaId: number; skladId: number | null };
  faylNomi: string;
  kitob: PrixodKitob | null;
  yuklanmoqda: boolean;
  xato: string | null;
};

function joriySorovniBekorQil(ref: { current: AbortController | null }): void {
  const controller = ref.current;
  if (!controller) return;
  ref.current = null;
  controller.abort();
}

function sorovniEskirtirVaBekorQil(
  avlodRef: { current: number }, sorovRef: { current: AbortController | null },
): void {
  avlodRef.current++;
  joriySorovniBekorQil(sorovRef);
}

const XATO_MATN: Record<PrixodXato, string> = {
  SANA_YOQ: 'Sana kiritilmagan', SANA_XATO: 'Sana formati noto‘g‘ri', NOM_YOQ: 'Tovar nomi kiritilmagan',
  BIRLIK_YOQ: 'O‘lchov birligi kiritilmagan', MIQDOR_YOQ: 'Miqdor kiritilmagan', MIQDOR_XATO: 'Miqdor musbat son bo‘lishi kerak',
  MIQDOR_SANA: 'Miqdor sana ko‘rinishida; ustunni tekshiring',
};
const OGOH_MATN: Record<PrixodOgoh, string> = {
  YETKAZUVCHI_YOQ: 'Yetkazuvchi ko‘rsatilmagan', MIQDOR_FORMULA: 'Miqdor formuladan olingan',
  NOM_SARLAVHASI: 'Nom ustuni sarlavhasi o‘zgargan — nomlar D ustunidan olindi.', RAQAM_YOQ: 'Manba raqami ko‘rsatilmagan',
};
const PARSER_XATO_MATNI: Record<string, string> = {
  PRIXOD_SHEET_REQUIRED: 'Faylda «Приход» varag‘i topilmadi.',
  PRIXOD_HEADER_REQUIRED: 'Kirim ustunlari topilmadi. Sana, nom, birlik va miqdor ustunlarini tekshiring.',
  PRIXOD_SCOPE_INVALID: 'Avval kompaniya va omborni tanlang.',
};

function parserXatoMatni(error: unknown): string {
  const kod = error instanceof Error ? error.message : '';
  return t(PARSER_XATO_MATNI[kod] ?? 'Excel faylini o‘qib bo‘lmadi. XLSX faylini qayta tanlang.');
}

function holatNomi(q: PrixodQator): string {
  return q.holat === 'yangi' ? t('Yangi') : q.holat === 'takror' ? t('Takror') : t('Xato');
}

function xatoMatnlari(q: PrixodQator): string[] {
  return [...q.xatolar.map((x) => t(XATO_MATN[x])), ...q.ogohlar.map((x) => t(OGOH_MATN[x]))];
}

function qatorQidiruvMatni(q: PrixodQator): string {
  return [q.sana, q.nom, q.birlik, q.miqdorMatni, q.yetkazuvchi, q.hujjat, holatNomi(q), ...xatoMatnlari(q)].join(' ');
}

function HolatNishoni({ q }: { q: PrixodQator }) {
  const tone = q.holat === 'yangi' ? 'fz-stamp--ok' : q.holat === 'takror' ? 'fz-stamp--warn' : 'fz-stamp--danger';
  return <span className={`fz-stamp ${tone}`}>{holatNomi(q)}</span>;
}

function Maydon({ nom, qiymat, className = '' }: { nom: string; qiymat: ReactNode; className?: string }) {
  return <td className={`block min-w-0 border-b border-border px-2 py-2 align-top md:table-cell md:px-3 ${className}`}>
    <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-text-mute md:hidden">{t(nom)}</span>
    {qiymat}
  </td>;
}

export function PrixodKitobPreview({ kompaniyaId, skladId, skladNomi }: { kompaniyaId: number; skladId: number | null; skladNomi?: string }) {
  const [holat, setHolat] = useState<Holat | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [filtr, setFiltr] = useState<Filtr>('hammasi');
  const [sahifa, setSahifa] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const faylRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sorovniEskirtirVaBekorQil(generationRef, requestRef);
    setHolat(null);
    setQidiruv(''); setFiltr('hammasi'); setSahifa(0);
    return () => {
      sorovniEskirtirVaBekorQil(generationRef, requestRef);
    };
  }, [kompaniyaId, skladId]);

  const faylTanla = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const generation = ++generationRef.current;
    joriySorovniBekorQil(requestRef);
    const controller = new AbortController();
    requestRef.current = controller;
    const scope = { kompaniyaId, skladId };
    setHolat({ scope, faylNomi: file.name, kitob: null, yuklanmoqda: true, xato: null });
    setQidiruv(''); setFiltr('hammasi'); setSahifa(0);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const kitob = await prixodKitobFonda(bytes, { faylNomi: file.name, kompaniyaId, skladId }, controller.signal);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setHolat({ scope, faylNomi: file.name, kitob, yuklanmoqda: false, xato: null });
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setHolat({ scope, faylNomi: file.name, kitob: null, yuklanmoqda: false, xato: parserXatoMatni(error) });
    } finally {
      if (generation === generationRef.current) requestRef.current = null;
    }
  };

  const scopeMos = holat?.scope.kompaniyaId === kompaniyaId && holat.scope.skladId === skladId;
  const kitob = scopeMos ? holat?.kitob ?? null : null;
  const kutyapti = scopeMos && holat?.yuklanmoqda === true;
  const xato = scopeMos ? holat?.xato ?? null : null;
  const queryKey = qidiruvKaliti(qidiruv);
  const mosQatorlar = useMemo(() => (kitob?.qatorlar ?? []).filter((q) =>
    (filtr === 'hammasi' || q.holat === filtr) && (!queryKey || qidiruvKaliti(qatorQidiruvMatni(q)).includes(queryKey))), [kitob, filtr, queryKey]);
  const sahifalarSoni = Math.max(1, Math.ceil(mosQatorlar.length / SAHIFA_HAJMI));
  const joriySahifa = Math.min(sahifa, sahifalarSoni - 1);
  const qatorlar = mosQatorlar.slice(joriySahifa * SAHIFA_HAJMI, (joriySahifa + 1) * SAHIFA_HAJMI);

  const bekorQil = () => {
    sorovniEskirtirVaBekorQil(generationRef, requestRef);
    setHolat(null); setQidiruv(''); setFiltr('hammasi'); setSahifa(0);
  };

  const filtrlar: { id: Filtr; label: string; soni: number | string; disabled?: boolean }[] = kitob ? [
    { id: 'hammasi', label: t('Barchasi'), soni: kitob.qatorlar.length },
    { id: 'yangi', label: t('Yangi'), soni: kitob.jami.yangi },
    { id: 'takror', label: t('Takror'), soni: kitob.takrorTekshirildi ? kitob.jami.takror : '—', disabled: !kitob.takrorTekshirildi },
    { id: 'xato', label: t('Xato'), soni: kitob.jami.xato },
  ] : [];

  return <section className="fz-card min-w-0" aria-label={t('Kirim hujjatini ko‘rib chiqish')}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><FileSpreadsheet size={17} className="shrink-0 text-[var(--info)]" aria-hidden="true" />
          <h2 className="m-0 text-[15px] font-semibold text-text">{t('Kirim Excelini ko‘rib chiqish')}</h2>
        </div>
        <p className="mb-0 mt-1 text-[12px] leading-4 text-text-dim">{t('Faqat «Приход» varag‘i ko‘riladi. Narx va summa hozircha noma’lum; 0 deb olinmaydi.')}</p>
      </div>
      <span className="fz-stamp fz-stamp--info">{t('Faqat ko‘rish')}</span>
    </header>

    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--border-strong)] bg-surface-2 px-3 text-center text-[13px] font-medium text-text hover:bg-surface-3 sm:flex-1">
          <FileSpreadsheet size={17} aria-hidden="true" />{t('Excel faylini tanlang')}
          <input ref={faylRef} aria-label={t('XLSX fayli')} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={kompaniyaId <= 0} onChange={(e) => void faylTanla(e)} className="sr-only" />
        </label>
        {scopeMos && holat?.faylNomi && <div className="flex min-h-12 min-w-0 items-center justify-between gap-2 rounded-md bg-surface-2 px-3 text-[12px] text-text-dim sm:flex-1">
          <span className="truncate" title={holat.faylNomi}>{holat.faylNomi}</span>
          {kutyapti ? <button type="button" onClick={bekorQil} className="fz-btn fz-btn--ghost min-h-12 min-w-12 px-2" aria-label={t('O‘qishni bekor qilish')}><X size={16} aria-hidden="true" /></button>
            : <button type="button" onClick={bekorQil} className="fz-btn fz-btn--ghost min-h-12 px-3">{t('Tozalash')}</button>}
        </div>}
      </div>

      {skladId == null && <div className="fz-note fz-note--warn" role="status"><ShieldAlert size={16} aria-hidden="true" />
        <span>{t('Ombor tanlanmagan. Fayl faqat ko‘rib chiqiladi; ombor yozuvi yaratilmaydi.')}</span></div>}
      {skladId != null && skladNomi && <p className="m-0 text-[12px] text-text-mute">{t('Ombor')}: <b className="text-text">{skladNomi}</b></p>}

      {kutyapti && <div className="fz-note fz-note--info" role="status"><LoaderCircle className="animate-spin" size={16} aria-hidden="true" />{t('Excel fayli o‘qilmoqda…')}</div>}
      {xato && <div className="fz-note fz-note--danger" role="alert"><AlertCircle size={16} aria-hidden="true" />{xato}</div>}

      {kitob && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label={t('Yangi')} value={kitob.jami.yangi} tone="ok" />
          <Summary label={t('Takror')} value={kitob.takrorTekshirildi ? kitob.jami.takror : '—'} tone="warn" />
          <Summary label={t('Xato')} value={kitob.jami.xato} tone="danger" />
          <Summary label={t('Bo‘sh shablon qatorlari')} value={kitob.boshQatorlar} tone="muted" />
        </div>

        {!kitob.takrorTekshirildi && <div className="fz-note fz-note--warn" role="status">{t('Takrorlar ombor bilan hali solishtirilmagan.')}</div>}

        {(kitob.ogohlar.length > 0 || kitob.otkazilganVaraqlar.length > 0) && <div className="fz-note fz-note--warn" role="status">
          <ShieldAlert size={16} aria-hidden="true" /><div className="min-w-0 space-y-1">
            {kitob.ogohlar.map((kod, i) => <p className="m-0" key={`${kod}-${i}`}>{t(OGOH_MATN[kod])}</p>)}
            {kitob.otkazilganVaraqlar.length > 0 && <p className="m-0">{t('Importdan tashqari varaqlar: {nomlar}', { nomlar: kitob.otkazilganVaraqlar.join(', ') })}</p>}
          </div>
        </div>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('Qator holati filtri')}>
            {filtrlar.map((f) => <button key={f.id} type="button" aria-pressed={filtr === f.id} onClick={() => { setFiltr(f.id); setSahifa(0); }}
              disabled={f.disabled}
              className={`min-h-12 rounded-md border px-3 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${filtr === f.id ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'border-border bg-surface text-text-dim hover:bg-surface-2'}`}>
              {f.label}<span className="ml-1.5 tabular-nums">{f.soni}</span></button>)}
          </div>
          <label className="relative block min-w-0 sm:w-64">
            <Search size={15} className="absolute left-3 top-4 text-text-mute" aria-hidden="true" />
            <input aria-label={t('Qatorlarni qidirish')} value={qidiruv} onChange={(e) => { setQidiruv(e.target.value); setSahifa(0); }}
              placeholder={t('Nom, birlik yoki yetkazuvchi')} className="h-12 w-full rounded-md border border-[var(--border-strong)] bg-bg pl-9 pr-3 text-[13px] text-text outline-none focus:border-[var(--accent)]" />
          </label>
        </div>

        <div className="fz-table-wrap">
          <table className="fz-table w-full" aria-label={t('{varaq} varag‘idagi qatorlar', { varaq: kitob.varaq })}>
            <thead className="hidden md:table-header-group"><tr>
              <th>{t('Sana')}</th><th>{t('Nomi')}</th><th>{t('Birlik')}</th><th className="text-right">{t('Miqdor')}</th><th>{t('Yetkazuvchi')}</th><th>{t('Holat va izoh')}</th>
            </tr></thead>
            <tbody className="block md:table-row-group">
              {qatorlar.map((q) => {
                const izohlar = xatoMatnlari(q);
                const miqdor = q.miqdor == null ? (q.miqdorMatni || '—') : raqamFormatla(q.miqdor, { maximumFractionDigits: 6 });
                return <tr key={`${q.manbaQator}:${q.manbaRaqam ?? ''}`} className="mb-2 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface md:mb-0 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:bg-transparent">
                  <Maydon nom="Sana" qiymat={q.sana ?? '—'} className="text-text-dim" />
                  <Maydon nom="Nomi" qiymat={<span className="block break-words font-medium text-text">{q.nom || '—'}</span>} className="col-span-2 md:col-span-1" />
                  <Maydon nom="Birlik" qiymat={q.birlik || '—'} className="text-text-dim" />
                  <Maydon nom="Miqdor" qiymat={<span className="tabular-nums text-text">{miqdor}</span>} className="text-right md:text-left" />
                  <Maydon nom="Yetkazuvchi" qiymat={q.yetkazuvchi || '—'} className="col-span-2 break-words text-text-dim md:col-span-1" />
                  <td className="col-span-2 min-w-0 px-2 py-2 align-top md:table-cell md:px-3">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-mute md:hidden">{t('Holat va izoh')}</span>
                    <HolatNishoni q={q} />
                    <span className="mt-1 block text-[11px] text-text-mute">{t('Manba: {qator}-qator', { qator: q.manbaQator })}</span>
                    {izohlar.length > 0 && <ul className="mb-0 mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-warn">{izohlar.map((s, i) => <li key={`${s}-${i}`}>{s}</li>)}</ul>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
          {qatorlar.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-text-mute">{t('Bu shartlarga mos qator topilmadi.')}</div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-text-dim">{t('Ko‘rsatilmoqda {dan}–{gacha} / {jami}', {
            dan: mosQatorlar.length ? String(joriySahifa * SAHIFA_HAJMI + 1) : '0',
            gacha: String(Math.min((joriySahifa + 1) * SAHIFA_HAJMI, mosQatorlar.length)), jami: String(mosQatorlar.length),
          })}</span>
          <div className="flex gap-2">
            <button type="button" className="fz-btn min-h-12 min-w-12 px-3" disabled={joriySahifa <= 0} onClick={() => setSahifa((n) => Math.max(0, n - 1))} aria-label={t('Oldingi sahifa')}><ChevronLeft size={17} aria-hidden="true" />{t('Oldingi')}</button>
            <button type="button" className="fz-btn min-h-12 px-3" disabled={joriySahifa + 1 >= sahifalarSoni} onClick={() => setSahifa((n) => Math.min(sahifalarSoni - 1, n + 1))} aria-label={t('Keyingi sahifa')}>{t('Keyingi')}<ChevronRight size={17} aria-hidden="true" /></button>
          </div>
        </div>
      </>}

      {!kitob && !kutyapti && !xato && <div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed border-[var(--border-strong)] px-4 py-6 text-center">
        <FileSpreadsheet size={24} className="mb-2 text-text-mute" aria-hidden="true" />
        <p className="m-0 text-[13px] font-medium text-text">{t('Excel faylini tanlab, qatorlarni tekshiring')}</p>
        <p className="mb-0 mt-1 text-[12px] text-text-mute">{t('Hali omborga yozilmagan.')}</p>
      </div>}

      <div className="fz-note fz-note--info" role="status">
        <Check size={15} aria-hidden="true" /><span>{t('Bu — oldindan ko‘rish. Hali omborga yozilmagan.')}</span>
      </div>
    </div>
  </section>;
}

function Summary({ label, value, tone }: { label: string; value: number | string; tone: 'ok' | 'warn' | 'danger' | 'muted' }) {
  const text = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-text-dim';
  return <div className="min-w-0 rounded-md border border-border bg-surface-2 px-3 py-2">
    <div className="text-[11px] leading-4 text-text-mute">{label}</div>
    <div className={`mt-0.5 text-[20px] font-semibold leading-6 tabular-nums ${text}`}>{value}</div>
  </div>;
}
