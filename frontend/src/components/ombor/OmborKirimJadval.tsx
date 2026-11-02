import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, PackageOpen, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { t, raqamFormatla } from '../../i18n/til';
import { OpsOyna } from '../kompaniya-ops/OpsUi';
import { sbSkladKirimRoyxat, sbSkladKirimStorno, type KirimFiltr, type KirimRoyxat } from '../../api/t2-sklad-kirim';
import { yangiOperationId } from '../../api/supabase';
import { stornoMumkin } from '../../lib/ombor-prixod/yozish';

const SAHIFA = 50;
const n = (v: number | null | undefined) => (v == null ? '—' : raqamFormatla(Number(v), { maximumFractionDigits: 6 }));
const STORNO_XATO: Record<string, string> = {
  STORNO_WINDOW_EXPIRED: 'Storno faqat yozilganidan keyin 24 soat ichida mumkin.',
  ALREADY_STORNED: 'Bu qator allaqachon storno qilingan.',
  RECEIPT_NOT_STORNABLE: 'Bu qatorni storno qilib bo‘lmaydi.',
  REQUIRED_FIELD: 'Sababni yozing.',
};

/** «Kirim» yorlig'i: markaziy ombor kirim jurnali (filtr, 50 lik sahifa, material bo'yicha jami, storno). */
export function OmborKirimJadval({ kompaniyaId, skladId, yozishMumkin, yangilash }: {
  kompaniyaId: number; skladId: number; yozishMumkin: boolean; yangilash: number;
}) {
  const [filtr, setFiltr] = useState<KirimFiltr>({});
  const [qoralama, setQoralama] = useState<KirimFiltr>({});
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<KirimRoyxat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [storno, setStorno] = useState<{ id: number; nomi: string; sabab: string; op: string; band: boolean; xato: string | null } | null>(null);
  const avlod = useRef(0);

  const yukla = useCallback(async () => {
    const g = ++avlod.current;
    setYuklanmoqda(true); setXato(null);
    const r = await sbSkladKirimRoyxat({ kompaniyaId, skladId, filtr, limit: SAHIFA, offset });
    if (g !== avlod.current) return;
    setYuklanmoqda(false);
    if (r.ok) setData(r); else { setData(null); setXato(t('Kirim ro‘yxatini o‘qib bo‘lmadi.')); }
  }, [kompaniyaId, skladId, filtr, offset]);
  useEffect(() => { void yukla(); }, [yukla, yangilash]);
  useEffect(() => { setFiltr({}); setQoralama({}); setOffset(0); }, [kompaniyaId, skladId]);

  const qollash = () => { setFiltr(qoralama); setOffset(0); };
  const stornoYubor = async () => {
    if (!storno || !storno.sabab.trim()) return;
    setStorno({ ...storno, band: true, xato: null });
    const r = await sbSkladKirimStorno({ kompaniyaId, harakatId: storno.id, sabab: storno.sabab, operationId: storno.op });
    if (r.ok) { setStorno(null); void yukla(); }
    else setStorno((s) => s && { ...s, band: false, xato: t(STORNO_XATO[r.code ?? ''] ?? (r.error || 'Storno bajarilmadi.')) });
  };

  const jami = data?.jami ?? 0;
  const inp = 'h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[13px] text-text';
  return <section className="flex flex-col gap-3" aria-label={t('Ombor kirimi')}>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <label className="relative block lg:col-span-2">
        <Search size={15} className="absolute left-3 top-4 text-text-mute" aria-hidden="true" />
        <input aria-label={t('Material bo‘yicha qidirish')} placeholder={t('Material nomi')} value={qoralama.qidir ?? ''}
          onChange={(e) => setQoralama({ ...qoralama, qidir: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') qollash(); }} className={`${inp} pl-9`} />
      </label>
      <input aria-label={t('Yetkazuvchi')} placeholder={t('Yetkazuvchi')} value={qoralama.yetkazuvchi ?? ''}
        onChange={(e) => setQoralama({ ...qoralama, yetkazuvchi: e.target.value })} className={inp} />
      <input aria-label={t('Sanadan')} type="date" value={qoralama.dan ?? ''} onChange={(e) => setQoralama({ ...qoralama, dan: e.target.value })} className={inp} />
      <input aria-label={t('Sanagacha')} type="date" value={qoralama.gacha ?? ''} onChange={(e) => setQoralama({ ...qoralama, gacha: e.target.value })} className={inp} />
      <input aria-label={t('Tur')} placeholder={t('Tur (masalan, Материал)')} value={qoralama.tur ?? ''} onChange={(e) => setQoralama({ ...qoralama, tur: e.target.value })} className={inp} />
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button type="button" className="fz-btn fz-btn--primary min-h-[48px] flex-1 justify-center" onClick={qollash}>{t('Qidirish')}</button>
        <button type="button" className="fz-btn min-h-[48px] flex-1 justify-center" onClick={() => { setQoralama({}); setFiltr({}); setOffset(0); }}>{t('Tozalash')}</button>
      </div>
    </div>

    {xato && <div className="fz-note fz-note--danger" role="alert"><ShieldAlert size={16} aria-hidden="true" />{xato}</div>}
    {yuklanmoqda && !data && <div className="skel h-40 rounded-xl" />}

    {data && jami === 0 && <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-[var(--border-strong)] px-4 py-6 text-center">
      <PackageOpen size={28} className="mb-2 text-text-mute" aria-hidden="true" />
      <p className="m-0 text-[14px] font-semibold text-text">{Object.keys(filtr).length ? t('Bu shartlarga mos kirim yo‘q.') : t('Bu omborda hali kirim yo‘q.')}</p>
      <p className="mb-0 mt-1 text-[12px] text-text-mute">{t('«Excel’dan yuklash» tugmasi bilan «Приход» varag‘ini yuklang.')}</p>
    </div>}

    {data && jami > 0 && <>
      <div className="fz-table-wrap">
        <table className="fz-table w-full" aria-label={t('Kirim qatorlari')}>
          <thead className="hidden md:table-header-group"><tr>
            <th>{t('Sana')}</th><th>{t('Material')}</th><th>{t('Birlik')}</th><th className="fz-c-num">{t('Miqdor')}</th>
            <th>{t('Yetkazuvchi')}</th><th>{t('Tur')}</th><th>{t('Manba')}</th><th />
          </tr></thead>
          <tbody className="block md:table-row-group">
            {data.qatorlar.map((q) => <tr key={q.id} className={`mb-2 grid grid-cols-2 gap-x-2 rounded-md border border-border bg-surface p-2 md:mb-0 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0 ${q.storno ? 'opacity-60' : ''}`}>
              <td className="text-[12px] text-text-dim">{q.sana}</td>
              <td className="col-span-2 font-medium text-text md:col-span-1">{q.nomi}{q.storno && <span className="fz-stamp fz-stamp--danger ml-2">{t('storno')}</span>}</td>
              <td className="text-text-dim">{q.birligi}</td>
              <td className="fz-c-num font-semibold tabular-nums">{n(q.obyomi)}</td>
              <td className="col-span-2 break-words text-text-dim md:col-span-1">{q.postavshik || t('Ko‘rsatilmagan')}</td>
              <td className="text-[12px] text-text-dim">{q.manba_turi || q.turi || '—'}</td>
              <td className="text-[11px] text-text-mute">{t('Fayl #{fayl} · {varaq} · {qator}-qator', { fayl: String(q.manba_fayl_id ?? '—'), varaq: q.manba_varaq ?? '—', qator: String(q.manba_qator ?? '—') })}</td>
              <td className="col-span-2 md:col-span-1">
                {yozishMumkin && stornoMumkin(q) && <button type="button" className="fz-btn min-h-[48px] w-full justify-center md:w-auto"
                  onClick={() => setStorno({ id: q.id, nomi: q.nomi, sabab: '', op: yangiOperationId(), band: false, xato: null })}>
                  <RotateCcw size={15} aria-hidden="true" />{t('Storno')}</button>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-text-dim">{t('Ko‘rsatilmoqda {dan}–{gacha} / {jami}', { dan: String(offset + 1), gacha: String(Math.min(offset + SAHIFA, jami)), jami: String(jami) })}</span>
        <div className="flex gap-2">
          <button type="button" className="fz-btn min-h-[48px] px-3" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - SAHIFA))} aria-label={t('Oldingi sahifa')}><ChevronLeft size={17} aria-hidden="true" />{t('Oldingi')}</button>
          <button type="button" className="fz-btn min-h-[48px] px-3" disabled={offset + SAHIFA >= jami} onClick={() => setOffset(offset + SAHIFA)} aria-label={t('Keyingi sahifa')}>{t('Keyingi')}<ChevronRight size={17} aria-hidden="true" /></button>
        </div>
      </div>
      <MaterialJami data={data} sarlavha={t('Material bo‘yicha jami (tanlangan filtr)')} />
    </>}
    {yuklanmoqda && data && <p className="m-0 flex items-center gap-2 text-[12px] text-text-mute"><LoaderCircle size={14} className="animate-spin" aria-hidden="true" />{t('Yangilanmoqda…')}</p>}

    <OpsOyna ochiq={storno != null} onYop={() => setStorno(null)} band={storno?.band} sarlavha={t('Kirimni storno qilish')}
      amallar={<>
        <button type="button" className="fz-btn min-h-[48px] px-4" onClick={() => setStorno(null)}>{t('Bekor qilish')}</button>
        <button type="button" className="fz-btn fz-btn--danger min-h-[48px] px-4" disabled={!storno?.sabab.trim() || storno?.band} onClick={() => void stornoYubor()}>{t('Storno qilish')}</button>
      </>}>
      <p className="m-0 text-[13px] text-text">{storno?.nomi}</p>
      <p className="m-0 text-[12px] text-text-dim">{t('Asl qator o‘chirilmaydi — teskari yozuv qo‘shiladi.')}</p>
      <label className="block text-[12px] font-medium text-text-dim">{t('Sabab (majburiy)')}
        <textarea value={storno?.sabab ?? ''} maxLength={1000} onChange={(e) => setStorno((s) => s && { ...s, sabab: e.target.value })}
          className="mt-1 min-h-[96px] w-full rounded-md border border-[var(--border-strong)] bg-bg p-3 text-[13px] text-text" />
      </label>
      {storno?.xato && <p className="m-0 text-[12px] text-danger" role="alert">{storno.xato}</p>}
    </OpsOyna>
  </section>;
}

function MaterialJami({ data, sarlavha, qoldiq = false }: { data: KirimRoyxat; sarlavha: string; qoldiq?: boolean }) {
  return <div className="fz-table-wrap">
    <table className="fz-table w-full" aria-label={sarlavha}>
      <caption className="px-3 py-2 text-left text-[13px] font-semibold text-text">{sarlavha}</caption>
      <thead><tr>
        <th>{t('Material')}</th><th className="fz-c-num">{t('Kirim')}</th><th className="fz-c-num">{t('Storno')}</th>
        {qoldiq ? <><th className="fz-c-num">{t('Rasxod')}</th><th className="fz-c-num">{t('Qoldiq')}</th></> : <th className="fz-c-num">{t('Sof kirim')}</th>}
      </tr></thead>
      <tbody>{data.jami_materiallar.map((m) => <tr key={`${m.nomi}|${m.birligi}`}>
        <td className="font-medium text-text">{m.nomi} <span className="text-[11px] text-text-mute">{m.birligi}</span></td>
        <td className="fz-c-num tabular-nums">{n(m.kirim)}</td>
        <td className="fz-c-num tabular-nums">{n(m.storno)}</td>
        {qoldiq
          ? <><td className="fz-c-num text-[12px] text-warn">{data.rasxod_kiritilgan ? '—' : t('kiritilmagan')}</td>
              {/* Rasxod noma'lum — qoldiq 0 yoki kirimga teng deb ko'rsatilmaydi (NULL ≠ 0). */}
              <td className="fz-c-num tabular-nums">{data.rasxod_kiritilgan ? n(m.sof_kirim) : '—'}</td></>
          : <td className="fz-c-num font-semibold tabular-nums">{n(m.sof_kirim)}</td>}
      </tr>)}</tbody>
    </table>
  </div>;
}

/** «Qoldiq» yorlig'i: kirim − rasxod. Rasxod hali kiritilmagan bo'lsa qoldiq to'liq deb ko'rsatilmaydi. */
export function OmborQoldiqJadval({ kompaniyaId, skladId, yangilash }: { kompaniyaId: number; skladId: number; yangilash: number }) {
  const [data, setData] = useState<KirimRoyxat | null>(null);
  const [xato, setXato] = useState(false);
  useEffect(() => {
    let tirik = true;
    setXato(false);
    void sbSkladKirimRoyxat({ kompaniyaId, skladId, limit: 1, offset: 0 }).then((r) => {
      if (!tirik) return;
      if (r.ok) setData(r); else { setData(null); setXato(true); }
    });
    return () => { tirik = false; };
  }, [kompaniyaId, skladId, yangilash]);
  if (xato) return <div className="fz-note fz-note--danger" role="alert"><ShieldAlert size={16} aria-hidden="true" />{t('Qoldiqni o‘qib bo‘lmadi.')}</div>;
  if (!data) return <div className="skel h-40 rounded-xl" />;
  return <section className="flex flex-col gap-3" aria-label={t('Ombor qoldig‘i')}>
    {!data.rasxod_kiritilgan && <div className="fz-note fz-note--warn" role="status"><ShieldAlert size={16} aria-hidden="true" />
      <span><b>{t('Rasxod hali kiritilmagan.')}</b> {t('Qoldiq = kirim − rasxod; rasxod kiritilguncha qoldiq hisoblanmaydi — quyida faqat kirim ko‘rsatilgan.')}</span></div>}
    {data.jami_materiallar.length === 0
      ? <div className="rounded-md border border-dashed border-[var(--border-strong)] px-4 py-8 text-center text-[13px] text-text-mute">{t('Bu omborda hali kirim yo‘q.')}</div>
      : <MaterialJami data={data} sarlavha={t('Material bo‘yicha qoldiq')} qoldiq />}
  </section>;
}
