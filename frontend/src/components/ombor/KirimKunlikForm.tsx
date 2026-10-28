import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, RotateCcw, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { prixodMiqdor, prixodSana } from '../../lib/ombor-prixod/kitob';
import { KUNLIK_SERVIS,type KunlikServis,type KunlikTarix as Harakat } from '../../lib/ombor-kunlik/servis';
export type { KunlikServis } from '../../lib/ombor-kunlik/servis';
import {
  yangiOperationId,
  type T2Obyekt, type T2SkladHarakat, type T2SkladQoldiq,
} from '../../api/supabase';

type Amal = 'prixod' | 'rasxod';
type Kiritish = { sana: string; nomi: string; birligi: string; miqdor: string; postavshik: string; qabulQiluvchi: string; qabulTuri: string; izoh: string; hujjat: string };
type Buyruq = { versiya: 1; kompaniyaId: number; obyektId: number; amal: Amal; operationId: string; payload: T2SkladHarakat };
type Scope = { kompaniyaId: number; obyektId: number };

const BOSh: Kiritish = { sana: '', nomi: '', birligi: '', miqdor: '', postavshik: '', qabulQiluvchi: '', qabulTuri: '', izoh: '', hujjat: '' };
const TUR_TAKLIFLARI: Record<string, string> = { prarab: 'Prorabga', brigada: 'Brigadaga', usta: 'Ustaga', subpudrat: 'Subpudratchiga', blok: 'Blok uchun', boshqa: 'Boshqa mas’ul shaxsga' };
const STORAGE_PREFIX = 't2.sklad.pending.v1';

function kalit(scope: Scope) { return `${STORAGE_PREFIX}:${scope.kompaniyaId}:${scope.obyektId}`; }
function noyob(values: Array<string | null | undefined>) {
  return [...new Set(values.map((x) => x?.trim() ?? '').filter(Boolean))];
}
function toBuyruq(data: Kiritish, amal: Amal, scope: Scope, id: string): T2SkladHarakat {
  const izoh = [data.izoh.trim(), data.hujjat.trim() ? `${t('Hujjat')}: ${data.hujjat.trim()}` : ''].filter(Boolean).join('\n');
  return {
    obyekt_id: scope.obyektId, operatsiya: amal, turi: 'mat', sana: data.sana,
    nomi: data.nomi.trim(), birligi: data.birligi.trim(), obyomi: Number(data.miqdor.replace(',', '.')),
    postavshik: data.postavshik.trim(), qabul_qiluvchi: data.qabulQiluvchi.trim(),
    qabul_turi: data.qabulTuri, izoh, operation_id: id,
  };
}
function saqlanganOqish(key: string, scope: Scope): Buyruq | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Buyruq;
    if (value?.versiya === 1 && value.kompaniyaId === scope.kompaniyaId && value.obyektId === scope.obyektId
      && (value.amal === 'prixod' || value.amal === 'rasxod') && typeof value.operationId === 'string'
      && value.payload?.operation_id === value.operationId && value.payload?.obyekt_id === scope.obyektId) return value;
  } catch { /* Session storage is best-effort; malformed data is never submitted. */ }
  return null;
}

export function KirimKunlikForm({ kompaniyaId, obyekt, amal, onYop, onYozildi, servis=KUNLIK_SERVIS }: {
  kompaniyaId: number;
  obyekt: T2Obyekt | null;
  amal: Amal;
  onYop: () => void;
  onYozildi: (scope: Scope & { operationId: string }) => void;
  servis?: KunlikServis;
}) {
  const scope = { kompaniyaId, obyektId: obyekt?.id ?? 0 };
  const objectId=obyekt?.id??0;const objectCompany=obyekt?.kompaniya_id??0;
  const scopeKalit = kalit(scope);
  const activeScope = useRef(scopeKalit);
  activeScope.current = scopeKalit;
  const sending = useRef(new Set<string>());
  const [data, setData] = useState<Kiritish>(BOSh);
  const [tekshiruv, setTekshiruv] = useState(false);
  const [pending, setPending] = useState<Buyruq | null>(null);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [manbalar, setManbalar] = useState<{ qoldiq: T2SkladQoldiq[]; tarix: Harakat[] }>({ qoldiq: [], tarix: [] });
  const [manbaYuklanmoqda, setManbaYuklanmoqda] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(BOSh); setTekshiruv(false); setXato(''); setPending(null); setBand(false);
    if (kompaniyaId <= 0 || objectId<=0 || objectCompany !== kompaniyaId) return;
    setPending(saqlanganOqish(scopeKalit, {kompaniyaId,obyektId:objectId}));
  }, [kompaniyaId, objectId,objectCompany, scopeKalit]);
  useEffect(() => {
    activeScope.current=scopeKalit;
    return () => { if (activeScope.current === scopeKalit) activeScope.current = ''; };
  }, [scopeKalit]);

  useEffect(() => {
    if (kompaniyaId <= 0 || objectId<=0 || objectCompany !== kompaniyaId) { setManbalar({ qoldiq: [], tarix: [] }); return; }
    let active = true;
    const c = kompaniyaId; const o = objectId;
    setManbaYuklanmoqda(true); setManbalar({ qoldiq: [], tarix: [] });
    void Promise.all([
      servis.qoldiqOl(o),
      servis.tarixOl(c,o),
    ]).then(([q, h]) => {
      if (!active || activeScope.current !== kalit({ kompaniyaId: c, obyektId: o })) return;
      setManbalar({
        qoldiq: q.ok ? (q.qatorlar ?? []).filter((r) => r.kompaniya_id === c && r.obyekt_id === o) : [],
        tarix: h.ok ? (h.qatorlar ?? []).filter((r) => r.kompaniya_id === c && r.obyekt_id === o) : [],
      });
      setManbaYuklanmoqda(false);
    }).catch(() => { if (active) setManbaYuklanmoqda(false); });
    return () => { active = false; };
  }, [kompaniyaId, objectId,objectCompany,servis]);

  useEffect(() => {
    const el = dialogRef.current;
    el?.querySelector<HTMLButtonElement>('[data-yop]')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending && !band) onYop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onYop, pending, band]);

  const nomTakliflari = useMemo(() => noyob([...manbalar.qoldiq.map((r) => r.nomi), ...manbalar.tarix.map((r) => r.nomi)])
    .filter(n=>qidiruvKaliti(n).includes(qidiruvKaliti(data.nomi))).slice(0, 8), [manbalar,data.nomi]);
  const birlikTakliflari = useMemo(() => noyob([
    ...manbalar.qoldiq.filter((r) => r.nomi.toLocaleLowerCase() === data.nomi.trim().toLocaleLowerCase()).map((r) => r.birligi),
    ...manbalar.tarix.filter((r) => r.nomi?.toLocaleLowerCase() === data.nomi.trim().toLocaleLowerCase()).map((r) => r.birligi),
  ]).slice(0, 8), [manbalar, data.nomi]);
  const postavshikTakliflari = useMemo(() => noyob(manbalar.tarix
    .filter((r) => r.nomi?.toLocaleLowerCase() === data.nomi.trim().toLocaleLowerCase())
    .map((r) => r.postavshik)).slice(0, 8), [manbalar, data.nomi]);

  const izohTayyor = data.izoh.trim() && data.hujjat.trim()
    ? `${data.izoh.trim()}\n${t('Hujjat')}: ${data.hujjat.trim()}` : data.izoh.trim() || (data.hujjat.trim() ? `${t('Hujjat')}: ${data.hujjat.trim()}` : '');
  const qtyText = data.miqdor.trim().replace(',', '.');
  const qtyValid = prixodMiqdor(qtyText) != null && Number(qtyText) > 0;
  const objectValid = !!obyekt && Number.isSafeInteger(obyekt.id) && obyekt.id > 0 && obyekt.kompaniya_id === kompaniyaId && kompaniyaId > 0;
  const formValid = objectValid && prixodSana(data.sana) === data.sana && !!data.nomi.trim() && data.nomi.trim().length <= 300
    && !!data.birligi.trim() && data.birligi.trim().length <= 50 && qtyValid && !!izohTayyor && izohTayyor.length <= 500
    && (amal === 'rasxod' ? !!data.qabulQiluvchi.trim() && data.qabulQiluvchi.trim().length <= 200 && !!data.qabulTuri
      : !!data.postavshik.trim() && data.postavshik.trim().length <= 200 && !!data.qabulQiluvchi.trim() && data.qabulQiluvchi.trim().length <= 200);

  const edit = (field: keyof Kiritish, value: string) => {
    setData((old) => ({ ...old, [field]: value })); setTekshiruv(false); setXato('');
  };
  const saqlashgaUrin = async (command: Buyruq) => {
    const key = kalit({ kompaniyaId: command.kompaniyaId, obyektId: command.obyektId });
    if (sending.current.has(key)) return;
    sending.current.add(key); setBand(true); setXato('');
    try {
      try{sessionStorage.setItem(key, JSON.stringify(command));}catch{
        if(activeScope.current===key)setXato(t('Urinish qurilmada saqlanmadi. Hozircha yozuv yuborilmadi.'));
        return;
      }
      setPending(command);
      const result = await servis.yozish(command.kompaniyaId, command.amal, command.payload);
      if (result.ok === true) {
        try {
          const current = sessionStorage.getItem(key);
          if (current && (JSON.parse(current) as Buyruq).operationId === command.operationId) sessionStorage.removeItem(key);
        } catch { /* Never remove a different attempt on malformed storage. */ }
        if (activeScope.current === key) { setPending(null); setBand(false); onYozildi({ kompaniyaId: command.kompaniyaId, obyektId: command.obyektId, operationId: command.operationId }); }
        return;
      }
      // These exact legacy RPC replies are returned before any movement is inserted.
      const rejection=result.error??'';
      if(rejection.startsWith("Skladda yetarli qoldiq yo'q:")||rejection==="obyomi musbat bo'lishi kerak"){
        try{const stored=sessionStorage.getItem(key);if(stored&&JSON.parse(stored).operationId===command.operationId)sessionStorage.removeItem(key);}catch{/* Retain uncertain storage. */}
        if(activeScope.current===key){setPending(null);setTekshiruv(false);setXato(rejection);}return;
      }
      // The wrapper does not distinguish a definite RPC rejection from a lost/invalid response.
      // Keep the immutable payload and UUID until the outcome is known; never create a new attempt.
      if (activeScope.current === key) { setPending(command); setXato(result.error || t('Natija noma’lum; ayni urinish saqlanib turibdi.')); }
    } catch {
      if (activeScope.current === key) { setPending(command); setXato(t('Javob olinmadi; ayni urinishni xavfsiz qayta yuborish mumkin.')); }
    } finally {
      sending.current.delete(key);
      if (activeScope.current === key) setBand(false);
    }
  };
  const submit = () => {
    if (pending || band || !formValid) return;
    const id = yangiOperationId();
    const payload = toBuyruq(data, amal, scope, id);
    void saqlashgaUrin({ versiya: 1, kompaniyaId, obyektId: scope.obyektId, amal, operationId: id, payload });
  };
  const retry = () => { if (pending && !band) void saqlashgaUrin(pending); };

  const maydon = (label: string, field: keyof Kiritish, options: { maxLength?: number; type?: string; inputMode?: 'decimal'; required?: boolean } = {}) => (
    <label key={field} className="grid min-w-0 gap-1 text-[12px] font-medium text-text-dim">
      {t(label)}{options.required && <span aria-hidden="true" className="text-danger"> *</span>}
      <input type={options.type ?? 'text'} inputMode={options.inputMode} maxLength={options.maxLength}
        disabled={!!pending || band || !objectValid} value={data[field]}
        onChange={(e) => edit(field, e.target.value)}
        className="h-[48px] min-h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[13px] text-text outline-none focus:border-[var(--accent)] disabled:opacity-60" />
    </label>
  );

  if (!objectValid) return <div role="alert" className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-3">
    <section className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 text-text" role="dialog" aria-modal="true" aria-labelledby="kunlik-xato-title">
      <h2 id="kunlik-xato-title" className="text-base font-semibold">{t('Ombor harakatini kiritish')}</h2>
      <p className="text-sm text-danger">{t('Tanlangan kompaniya uchun obyektni qayta tanlang.')}</p>
      <button type="button" data-yop className="min-h-[48px] h-[48px] rounded-md border border-border px-4" onClick={onYop}>{t('Yopish')}</button>
    </section>
  </div>;

  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/50 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending && !band) onYop(); }}>
    <div ref={dialogRef} className="my-auto max-h-[96dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-4 text-text shadow-xl sm:p-5"
      role="dialog" aria-modal="true" aria-labelledby="kunlik-title">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div><h2 id="kunlik-title" className="m-0 text-base font-semibold">{t(amal === 'prixod' ? 'KELDI — omborga kirim' : 'BERDIM — ombordan chiqim')}</h2>
          <p className="mb-0 mt-1 text-[12px] text-text-dim">{t('Kompaniya')}: {kompaniyaId} · {t('Obyekt')}: {obyekt.nom}</p></div>
        {!pending && <button type="button" data-yop aria-label={t('Yopish')} className="grid h-[48px] min-h-[48px] w-[48px] min-w-[48px] place-items-center rounded-md border border-border" onClick={onYop}><X size={18} /></button>}
      </header>

      {pending ? <section className="space-y-3" aria-label={t('Noaniq urinish')}>
        <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm" role="alert">
          <p className="m-0 flex items-center gap-2 font-semibold"><AlertTriangle size={17} />{t('Oldingi urinish natijasi tasdiqlanmadi.')}</p>
          <p className="mb-0 mt-1">{t('Javob tasdiqlanmaguncha shu yozuv saqlanadi. Qayta yuborish ikkinchi harakat yaratmaydi.')}</p>
          {xato && <p className="mb-0 mt-2 break-words text-[12px]">{xato}</p>}
        </div>
        <Review command={pending} obyektNomi={obyekt.nom} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex h-[48px] min-h-[48px] items-center gap-2 rounded-md bg-accent px-4 text-sm text-white disabled:opacity-60" disabled={band} onClick={retry}>
            <RotateCcw size={16} />{band ? t('Tekshirilmoqda…') : t('Ayni urinishni qayta yuborish')}
          </button>
          <button type="button" className="h-[48px] min-h-[48px] rounded-md border border-border px-4 text-sm" onClick={onYop}>{t('Yopish')}</button>
        </div>
      </section> : <>
        {xato&&<p role="alert" className="rounded-md border border-danger p-3 text-[13px] text-danger">{xato}</p>}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {maydon('Sana', 'sana', { type: 'date', required: true })}
          {maydon('Material nomi', 'nomi', { maxLength: 300, required: true })}
          {data.nomi && nomTakliflari.length > 0 && <Suggestions label="Manbada uchragan materiallar" values={nomTakliflari} onPick={(v) => edit('nomi', v)} />}
          {maydon('O‘lchov birligi', 'birligi', { maxLength: 50, required: true })}
          {birlikTakliflari.length > 0 && <Suggestions label="Manbada uchragan birliklar" values={birlikTakliflari} onPick={(v) => edit('birligi', v)} />}
          {maydon('Miqdor', 'miqdor', { inputMode: 'decimal', required: true })}
          {amal === 'prixod' && maydon('Yetkazuvchi', 'postavshik', { maxLength: 200, required: true })}
          {amal === 'prixod' && postavshikTakliflari.length > 0 && <Suggestions label="Manbada uchragan yetkazuvchilar" values={postavshikTakliflari} onPick={(v) => edit('postavshik', v)} />}
          {maydon('Qabul qiluvchi', 'qabulQiluvchi', { maxLength: 200, required: true })}
          {amal === 'rasxod' && <label className="grid gap-1 text-[12px] font-medium text-text-dim">{t('Qabul turi / berish maqsadi')} *
            <select className="h-[48px] min-h-[48px] rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[13px] text-text" value={data.qabulTuri} disabled={!!pending || band} onChange={(e) => edit('qabulTuri', e.target.value)}>
              <option value="">{t('Tanlang')}</option>{Object.entries(TUR_TAKLIFLARI).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>}
          {maydon('Sabab / maqsad izohi', 'izoh', { maxLength: 500, required: true })}
          {maydon('Hujjat raqami (ixtiyoriy)', 'hujjat', { maxLength: 200 })}
        </div>
        <p className="my-2 text-[12px] text-text-dim">{manbaYuklanmoqda ? t('Obyektning mavjud materiallari va tarixidan takliflar olinmoqda…') : t('Takliflar faqat shu kompaniya va obyektning qoldiq/tarixidan olinadi; birlik yoki yetkazuvchi avtomatik tanlanmaydi.')}</p>
        {izohTayyor.length > 500 && <p className="text-sm text-danger" role="alert">{t('Izoh va hujjat raqami birga 500 belgidan oshmasin; matn qisqartirilmaydi.')}</p>}
        {!tekshiruv ? <button type="button" className="h-[48px] min-h-[48px] rounded-md bg-accent px-4 text-sm text-white disabled:opacity-50" disabled={!formValid || !!pending || band} onClick={() => setTekshiruv(true)}>{t('Barcha qiymatlarni tekshirish')}</button> : <>
          <Review command={{ versiya: 1, kompaniyaId, obyektId: scope.obyektId, amal, operationId: '', payload: toBuyruq(data, amal, scope, '') }} obyektNomi={obyekt.nom} />
          <p className="text-[12px] text-text-dim">{t('Tekshiruv ko‘rinishi: harakat hali yuborilmadi.')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-[48px] min-h-[48px] rounded-md border border-border px-4 text-sm" onClick={() => setTekshiruv(false)}>{t('Tahrirlash')}</button>
            <button type="button" className="inline-flex h-[48px] min-h-[48px] items-center gap-2 rounded-md bg-accent px-4 text-sm text-white disabled:opacity-50" disabled={!formValid || band} onClick={submit}><Check size={16} />{t('Tasdiqlab yuborish')}</button>
          </div>
        </>}
      </>}
    </div>
  </div>;
}

function Suggestions({ label, values, onPick }: { label: string; values: string[]; onPick: (value: string) => void }) {
  return <div className="flex min-w-0 flex-wrap gap-1 sm:col-span-2" role="group" aria-label={t(label)}>
    {values.map((value) => <button key={value} type="button" className="min-h-[48px] rounded-md border border-border bg-surface-2 px-3 text-[12px] text-text" onClick={() => onPick(value)}>{value}</button>)}
  </div>;
}

function Review({ command, obyektNomi }: { command: Buyruq; obyektNomi: string }) {
  const p = command.payload;
  const rows: Array<[string, string]> = [
    ['Harakat', t(command.amal === 'prixod' ? 'KELDI — omborga kirim' : 'BERDIM — ombordan chiqim')],
    ['Sana', p.sana], ['Kompaniya ID', String(command.kompaniyaId)], ['Obyekt', `${obyektNomi} (#${command.obyektId})`],
    ['Material nomi', p.nomi], ['O‘lchov birligi', p.birligi], ['Miqdor', String(p.obyomi)],
    ['Yetkazuvchi', p.postavshik?.trim() || 'Ko‘rsatilmagan'], ['Qabul qiluvchi', p.qabul_qiluvchi?.trim() || 'Ko‘rsatilmagan'],
    ['Qabul turi / berish maqsadi', p.qabul_turi ? TUR_TAKLIFLARI[p.qabul_turi] ?? p.qabul_turi : 'Ko‘rsatilmagan'],
    ['Sabab / maqsad izohi', p.izoh?.trim() || 'Ko‘rsatilmagan'],
  ];
  return <section className="rounded-lg border border-border bg-surface-2 p-3" aria-label={t('To‘liq tasdiqlash ko‘rinishi')}>
    <h3 className="m-0 text-sm font-semibold">{t('To‘liq tasdiqlash ko‘rinishi')}</h3>
    <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {rows.map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-[11px] text-text-mute">{t(key)}</dt><dd className="m-0 break-words text-[13px] text-text">{value || t('Ko‘rsatilmagan')}</dd></div>)}
  </dl></section>;
}
