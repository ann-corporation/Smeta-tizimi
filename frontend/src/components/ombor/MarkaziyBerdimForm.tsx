import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpFromLine, ShieldAlert } from 'lucide-react';
import { t, raqamFormatla } from '../../i18n/til';
import { OpsOyna } from '../kompaniya-ops/OpsUi';
import { OmborTanlov } from './OmborTanlov';
import {
  sbSkladBerdim, sbSkladMarkaziyQoldiq, type BerdimNatija, type MarkaziyQoldiqQator,
} from '../../api/t2-sklad-kirim';
import { yangiOperationId } from '../../api/supabase';
import { kunlikBugun } from '../../lib/ombor-kunlik/tez-kiritish';
import { berdimMiqdor } from '../../lib/ombor-kunlik/berdim';

export type BerdimServis = {
  qoldiq: typeof sbSkladMarkaziyQoldiq;
  berdim: typeof sbSkladBerdim;
  operationId: () => string;
};
const SERVIS: BerdimServis = { qoldiq: sbSkladMarkaziyQoldiq, berdim: sbSkladBerdim, operationId: yangiOperationId };

function xatoMatni(code?: string): string {
  switch (code) {
    case 'QOLDIQ_YETMAYDI': return t('Markaziy omborda bu miqdor yoʻq — qoldiqni tekshiring.');
    case 'OBJECT_SCOPE_MISMATCH': return t('Obyekt shu kompaniyaga tegishli emas.');
    case 'WAREHOUSE_SCOPE_MISMATCH': return t('Ombor topilmadi yoki faol emas.');
    case 'OPERATION_ID_CONFLICT': return t('Maʼlumot oʻzgargan — oynani yopib, qaytadan oching.');
    case 'PERMISSION_DENIED': return t('Berish uchun ruxsat yoʻq.');
    default: return t('Natija nomaʼlum — qayta bosing: takroriy yozuv yaratilmaydi.');
  }
}
type Obyekt = { id: number; nom: string };

export function MarkaziyBerdimForm({ kompaniyaId, skladId, skladNomi, obyektlar, boshObyektId, onYop, onYozildi, servis = SERVIS }: {
  kompaniyaId: number; skladId: number; skladNomi: string; obyektlar: readonly Obyekt[]; boshObyektId?: number | null;
  onYop: () => void; onYozildi: () => void; servis?: BerdimServis;
}) {
  const [obyektId, setObyektId] = useState<string>(boshObyektId ? String(boshObyektId) : '');
  const [qidir, setQidir] = useState('');
  const [variantlar, setVariantlar] = useState<MarkaziyQoldiqQator[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [oqishXato, setOqishXato] = useState(false);
  const [tanlangan, setTanlangan] = useState<MarkaziyQoldiqQator | null>(null);
  const [miqdor, setMiqdor] = useState('');
  const [qabul, setQabul] = useState('');
  const [sana, setSana] = useState(kunlikBugun());
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const op = useRef<{ key: string; id: string } | null>(null);
  const scope = useRef(`${kompaniyaId}:${skladId}`);
  scope.current = `${kompaniyaId}:${skladId}`;

  // Material qidiruvi: markaziy ombor qoldig'i (>0) — nom/birlik faqat bazadagi aniq qiymat, o'ylab topilmaydi.
  useEffect(() => {
    let tirik = true;
    const joriy = scope.current;
    setYuklanmoqda(true); setOqishXato(false);
    const id = setTimeout(() => {
      void servis.qoldiq({ kompaniyaId, skladId, qidir, limit: 30 }).then((r) => {
        if (!tirik || scope.current !== joriy) return;
        setYuklanmoqda(false);
        if (r.ok) setVariantlar(r.qatorlar); else { setVariantlar([]); setOqishXato(true); }
      });
    }, qidir ? 250 : 0);
    return () => { tirik = false; clearTimeout(id); };
  }, [kompaniyaId, skladId, qidir, servis]);

  const m = berdimMiqdor(miqdor);
  const ortiq = m != null && tanlangan != null && Number(m) > tanlangan.qoldiq;
  const tayyor = !!obyektId && tanlangan != null && m != null && !ortiq && /^\d{4}-\d{2}-\d{2}$/.test(sana);
  const obyektOptions = useMemo(() => obyektlar.map((o) => ({ value: String(o.id), label: o.nom })), [obyektlar]);

  const yubor = async () => {
    if (!tayyor || band || !tanlangan || m == null) return;
    // Bir xil ma'lumot = bir xil operation_id (qayta bosish ikkinchi yozuv yaratmaydi); ma'lumot o'zgarsa — yangi.
    const key = [kompaniyaId, skladId, obyektId, tanlangan.nomi, tanlangan.birligi, m, sana, qabul.trim()].join('|');
    if (op.current?.key !== key) op.current = { key, id: servis.operationId() };
    setBand(true); setXato(null);
    let r: BerdimNatija;
    try {
      r = await servis.berdim({ kompaniyaId, skladId, obyektId: Number(obyektId), nomi: tanlangan.nomi, birligi: tanlangan.birligi,
        miqdor: m, sana, qabulQiluvchi: qabul.trim(), operationId: op.current.id });
    } catch { r = { ok: false, code: 'NETWORK' }; }
    setBand(false);
    if (scope.current !== `${kompaniyaId}:${skladId}`) return;
    if (r.ok) { op.current = null; onYozildi(); return; }
    setXato(xatoMatni(r.code));
  };

  return (
    <OpsOyna ochiq onYop={onYop} band={band} kenglik={520} ikon={<ArrowUpFromLine />} sarlavha={t('Berdim → obyekt')}
      amallar={<>
        <button type="button" className="fz-btn min-h-[48px] px-4" onClick={onYop} disabled={band}>{t('Bekor qilish')}</button>
        <button type="button" className="fz-btn fz-btn--primary min-h-[48px] px-4" disabled={!tayyor || band} onClick={() => void yubor()}>
          {band ? t('Yozilmoqda…') : t('Berdim → obyekt')}</button>
      </>}>
      <p className="m-0 text-[12px] text-text-dim">{t('Markaziy ombor: {nom}. Berilgan material obyekt qoldigʻiga tushadi — M-29 shu qoldiqdan yechadi.', { nom: skladNomi })}</p>
      <OmborTanlov label={t('Obyekt')} value={obyektId} options={obyektOptions} onChange={setObyektId} />
      <label className="flex flex-col gap-1 text-[12px] text-text-dim">{t('Material (markaziy ombor qoldigʻidan)')}
        <input type="search" value={qidir} onChange={(e) => { setQidir(e.target.value); setTanlangan(null); }} placeholder={t('Masalan: sement')}
          className="min-h-[48px] w-full" />
      </label>
      {oqishXato && <div className="fz-note fz-note--danger" role="alert"><ShieldAlert size={16} aria-hidden="true" />{t('Qoldiqni oʻqib boʻlmadi.')}</div>}
      <div role="listbox" aria-label={t('Material (markaziy ombor qoldigʻidan)')} className="flex max-h-[220px] flex-col gap-1 overflow-y-auto">
        {variantlar.map((v) => {
          const tan = tanlangan?.nomi === v.nomi && tanlangan?.birligi === v.birligi;
          return <button key={`${v.nomi}|${v.birligi}`} type="button" role="option" aria-selected={tan} onClick={() => setTanlangan(v)}
            className={`flex min-h-[48px] items-center justify-between gap-3 rounded-lg border px-3 text-left text-[13px] ${tan ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border bg-bg'}`}>
            <span className="min-w-0 truncate">{v.nomi}</span>
            <b className="shrink-0 tabular-nums">{raqamFormatla(v.qoldiq, { maximumFractionDigits: 6 })} {v.birligi}</b>
          </button>;
        })}
        {!yuklanmoqda && !oqishXato && variantlar.length === 0 &&
          <p role="status" className="m-0 p-2 text-[13px] text-text-dim">{t('Markaziy omborda qoldiq topilmadi.')}</p>}
      </div>
      <label className="flex flex-col gap-1 text-[12px] text-text-dim">{tanlangan ? t('Miqdor ({birlik})', { birlik: tanlangan.birligi }) : t('Miqdor')}
        <input inputMode="decimal" value={miqdor} onChange={(e) => setMiqdor(e.target.value)} className="min-h-[48px] w-full" />
      </label>
      {ortiq && <div className="fz-note fz-note--warn" role="alert">{t('Markaziy omborda faqat {q} {birlik} bor.', { q: raqamFormatla(tanlangan.qoldiq, { maximumFractionDigits: 6 }), birlik: tanlangan.birligi })}</div>}
      <label className="flex flex-col gap-1 text-[12px] text-text-dim">{t('Kimga berildi (ixtiyoriy)')}
        <input value={qabul} onChange={(e) => setQabul(e.target.value)} maxLength={300} className="min-h-[48px] w-full" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-text-dim">{t('Sana')}
        <input type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="min-h-[48px] w-full" />
      </label>
      {xato && <div className="fz-note fz-note--danger" role="alert"><ShieldAlert size={16} aria-hidden="true" />{xato}</div>}
    </OpsOyna>
  );
}
