import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Upload } from 'lucide-react';
import { t } from '../../i18n/til';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { faylTransportOqi, transportXatoMatni, transportYoyPreview, transportYoyYoz } from '../../api/transport-api';
import { aslFaylSaqla } from '../../api/t2-asl-fayl';
import {
  bolimlar, tasdiqHolati, transportKartalar, yoyJadval, yoyXulosa,
  type AuditJavob, type PanelQator, type YangilaFn, type YoyJavob, type YoyYuk,
} from '../../lib/transport-yoy/panel';

const som = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n));
const ishorali = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${som(n)}`);

/**
 * Transport paneli (obyekt smetasi → «Transport»): 3 karta + xatolar, hisob aktidan taqsimlash (preview → bitta «Tasdiqlash»).
 * Mavjud ekranga bitta bo'lim; usulni qator bo'yicha o'zgartirish — smeta ro'yxatidagi qator tafsilotida.
 */
export function TransportPanel({ kompaniyaId, obyektId, qatorlar, audit, auditXato, yuklanmoqda, yangila, onQatorgaOt, boshlangichYuk = null }: {
  kompaniyaId: number; obyektId: number; qatorlar: readonly PanelQator[]; audit: AuditJavob | null; auditXato: string; yuklanmoqda: boolean;
  yangila: YangilaFn; onQatorgaOt: (qatorId: number) => void; boshlangichYuk?: YoyYuk | null;
}) {
  const kartalar = useMemo(() => transportKartalar(qatorlar, audit), [qatorlar, audit]);
  const rzlar = useMemo(() => bolimlar(qatorlar), [qatorlar]);
  const [yuk, setYuk] = useState<YoyYuk | null>(boshlangichYuk);
  const [rzId, setRzId] = useState<number | ''>('');
  const [narxMatn, setNarxMatn] = useState(boshlangichYuk?.tkm_narx != null ? String(boshlangichYuk.tkm_narx) : '');
  const [fayl, setFayl] = useState('');
  const [oqilmoqda, setOqilmoqda] = useState(false);
  const [natija, setNatija] = useState<YoyJavob | null>(null);
  const [band, setBand] = useState(false);
  const [qabul, setQabul] = useState(false);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const narx = Number(narxMatn.replace(',', '.').replace(/\s/g, ''));
  const narxTogri = narxMatn.trim() !== '' && Number.isFinite(narx) && narx >= 0;
  const tayyor = yuk != null && rzId !== '' && narxTogri;
  const chaqiruv = () => ({ obyektId, rzId: Number(rzId), tkmNarx: narx, qatorlar: yuk!.qatorlar });

  const faylTanlandi = async (f: File | undefined) => {
    if (!f) return;
    setOqilmoqda(true); setXabar(null); setNatija(null); setQabul(false); setFayl(f.name);
    // Asl smeta fayli (hisob akti varag'i bilan) — dalil sifatida R2 ga; o'qish uni kutmaydi.
    void aslFaylSaqla(f, { kompaniyaId, obyektId, turi: 'asl_smeta' });
    const r = await faylTransportOqi(f);
    setOqilmoqda(false);
    if (!r.ok) { setYuk(null); setXabar({ ok: false, matn: transportXatoMatni(r.code, r.xabar) }); return; }
    if (!r.yuk) { setYuk(null); setXabar({ ok: false, matn: t('Faylda «Расчёт затрат транспорта» varag‘i topilmadi.') }); return; }
    setYuk(r.yuk);
    if (r.yuk.tkm_narx != null) setNarxMatn(String(r.yuk.tkm_narx));
  };

  const korish = async () => {
    if (!tayyor) return;
    setBand(true); setXabar(null); setQabul(false);
    const r = await transportYoyPreview(kompaniyaId, chaqiruv());
    setBand(false);
    if (!r.ok) { setNatija(null); setXabar({ ok: false, matn: transportXatoMatni(r.code, r.xabar) }); return; }
    setNatija(r);
  };

  const jadval = useMemo(() => yoyJadval(natija?.guruhlar), [natija]);
  const xulosa = useMemo(() => yoyXulosa(natija?.guruhlar), [natija]);
  const bloklangan = natija?.bloklangan === true;
  const holat = tasdiqHolati({ bloklangan, qabul, yozilishiMumkin: xulosa.yozilishiMumkin, band });

  const tasdiqla = async () => {
    if (holat.disabled || !tayyor) return;
    setBand(true); setXabar(null);
    const r = await transportYoyYoz(kompaniyaId, { ...chaqiruv(), majburiy: holat.majburiy });
    setBand(false);
    if (!r.ok || r.yozildi !== true) { setXabar({ ok: false, matn: transportXatoMatni(r.code, r.xabar) }); return; }
    setXabar({ ok: true, matn: `${t('Yozildi')}: ${r.yaratildi ?? 0} ${t('ta t·km qatori')}` });
    setNatija(null); setQabul(false);
    await yangila();
  };

  return (
    <div className="space-y-4" data-testid="transport-panel">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] text-text-mute">{t('Har material uchun bitta usul: foiz, t·km yoki narx ichida — transport ikki marta hisoblanmaydi.')}</p>
        <button type="button" className="fz-btn fz-btn--sm fz-btn--ghost ml-auto" disabled={yuklanmoqda} onClick={() => void yangila()}><RefreshCw aria-hidden="true" size={14} />{t('Yangilash')}</button>
      </div>

      {auditXato && <div role="alert" className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" /><span>{t('Transport auditini o‘qib bo‘lmadi')}: {t(transportXatoMatni(auditXato))}</span></div>}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <div className="rounded-md border border-border bg-surface-2 p-3" data-testid="transport-karta-tkm">
          <p className="fz-panel__h">{t('t·km transport')}</p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums">{kartalar.tkm.soni}<span className="ml-1 text-[12px] font-normal text-text-mute">{t('qator')}</span></p>
          <p className="text-[12px] tabular-nums text-text-dim">{som(kartalar.tkm.som)} {t('so‘m')}{kartalar.tkm.somNomalum > 0 ? ` · ${kartalar.tkm.somNomalum} ${t('ta narxsiz')}` : ''}</p>
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3" data-testid="transport-karta-foiz">
          <p className="fz-panel__h">{t('Foizdagi transport')}</p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums">{kartalar.foiz.soni}<span className="ml-1 text-[12px] font-normal text-text-mute">{t('material')}</span></p>
          <p className="text-[12px] text-text-dim">{t('podvaldagi transport %')} · {t('narx ichida')}: {kartalar.narxIchida.soni}</p>
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3" data-testid="transport-karta-yuk">
          <p className="fz-panel__h">{t('Yuk tashish ishlari (Е310/Е311)')}</p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums">{kartalar.yuk.soni}<span className="ml-1 text-[12px] font-normal text-text-mute">{t('ish')}</span></p>
          <p className="text-[12px] tabular-nums text-text-dim">{som(kartalar.yuk.som)} {t('so‘m')}{kartalar.yuk.somNomalum > 0 ? ` · ${kartalar.yuk.somNomalum} ${t('ta narxsiz')}` : ''}</p>
        </div>
      </div>

      {kartalar.xatoSoni > 0 && (
        <div role="alert" className="rounded-md border border-danger bg-surface-2 p-3" data-testid="transport-xatolar">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-danger"><AlertTriangle aria-hidden="true" size={15} />{t('Transport xatolari')}: {kartalar.xatoSoni}</p>
          <p className="mt-0.5 text-[11.5px] text-text-mute">{t('Xato bor obyektda F-2 tasdiqlanmaydi. Tuzating, so‘ng «Yangilash» bosing.')}</p>
          <ul className="mt-2 space-y-1">
            {(audit?.xatolar ?? []).slice(0, 30).map((e, i) => (
              <li key={`${e.kod}:${e.qator_id}:${i}`} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="fz-stamp fz-stamp--danger" style={{ height: 18, padding: '0 5px', fontSize: 9.5 }}>{e.kod}</span>
                <span className="min-w-0 flex-1 text-text-dim" style={{ overflowWrap: 'anywhere' }}>{e.xabar}</span>
                <button type="button" className="text-[12px] text-accent-text underline decoration-dotted" onClick={() => onQatorgaOt(e.qator_id)}>{t('Qatorga o‘tish')} #{e.qator_id}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-md border border-border p-3" aria-label={t('Hisob aktidan taqsimlash')}>
        <h4 className="text-[13px] font-semibold text-text">{t('Hisob aktidan taqsimlash')}</h4>
        <p className="mt-0.5 text-[11.5px] text-text-mute">{t('Smeta XLSX dagi «Расчёт затрат транспорта» varag‘i bo‘yicha t·km qatorlari har materialning tagiga qo‘shiladi.')}</p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm" hidden data-testid="transport-fayl" onChange={(e) => { void faylTanlandi(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className="fz-btn fz-btn--sm" disabled={oqilmoqda || band} onClick={() => inputRef.current?.click()}><Upload aria-hidden="true" size={14} />{oqilmoqda ? t('O‘qilmoqda…') : t('Smeta XLSX tanlash')}</button>
            {fayl && <span className="ml-2 text-[12px] text-text-mute">{fayl}</span>}
          </div>
          {yuk && (
            <>
              <label className="text-[12px] text-text-dim">{t('Bo‘lim (uchastka)')}
                <select className="fz-input ml-2" value={rzId} onChange={(e) => { setRzId(e.target.value ? Number(e.target.value) : ''); setNatija(null); setQabul(false); }} aria-label={t('Bo‘lim (uchastka)')}>
                  <option value="">{t('— tanlang —')}</option>
                  {rzlar.map((r) => <option key={r.id} value={r.id}>{r.nom.slice(0, 80)}</option>)}
                </select>
              </label>
              <label className="text-[12px] text-text-dim">{t('1 t·km narxi, so‘m (QQS siz)')}
                <MoneyInput className="fz-input ml-2 w-28" inputMode="decimal" value={narxMatn} onValueChange={(v) => { setNarxMatn(v); setNatija(null); }} aria-label={t('1 t·km narxi, so‘m (QQS siz)')} />
              </label>
              <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={!tayyor || band} onClick={() => void korish()}>{band && !natija ? t('Tekshirilmoqda…') : t('Ko‘rish')}</button>
            </>
          )}
        </div>
        {yuk && (yuk.topilmadi?.length ?? 0) > 0 && <p className="mt-2 text-[12px] text-warn">{t('Faylda mos resurs topilmagan materiallar')}: {yuk.topilmadi!.slice(0, 6).join('; ')}</p>}
        {yuk && (yuk.ogohlantirish?.length ?? 0) > 0 && <p className="mt-1 text-[12px] text-text-mute">{yuk.ogohlantirish!.slice(0, 3).join(' · ')}</p>}

        {natija && (
          <div className="mt-3 space-y-3" data-testid="transport-preview">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-text-mute">
                  <th className="py-1 pr-2 font-medium">{t('Material')}</th><th className="py-1 pr-2 text-right font-medium">{t('Topilgan qator')}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t('Miqdor: smeta / hisob')}</th><th className="py-1 pr-2 text-right font-medium">{t('t·km: tizim / hisob')}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t('Farq, so‘m')}</th><th className="py-1 font-medium">{t('Holat')}</th>
                </tr></thead>
                <tbody>{jadval.map((g, i) => (
                  <tr key={`${g.material}:${i}`} className="border-t border-border align-top">
                    <td className="py-1 pr-2" style={{ overflowWrap: 'anywhere' }}>{g.material}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{g.topilgan}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{som(g.miqdorTizim)} / {som(g.miqdorHisob)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{som(g.tkmTizim)} / {som(g.tkmHisob)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{ishorali(g.farqSom)}</td>
                    <td className="py-1"><span className={`fz-stamp fz-stamp--${g.chip.ton}`} title={g.sabab ?? undefined}>{t(g.chip.soz)}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-[12px] text-text-dim">{xulosa.jami} {t('guruh')} · {xulosa.yozilishiMumkin} {t('ta t·km qatori yoziladi')} · {t('farq')} {ishorali(xulosa.farqJami)} {t('so‘m')}</p>
            {bloklangan && (
              <label className="flex items-start gap-2 text-[12.5px] text-warn">
                <input type="checkbox" checked={qabul} onChange={(e) => setQabul(e.target.checked)} data-testid="transport-qabul" />
                <span>{t('Farqni qabul qilaman: farq / topilmagan / qisman guruhlar bilan ham yozilsin')}</span>
              </label>
            )}
            <button type="button" className="fz-btn fz-btn--primary" disabled={holat.disabled} onClick={() => void tasdiqla()} data-testid="transport-tasdiq">{band ? t('Yozilmoqda…') : t('Tasdiqlash')}</button>
          </div>
        )}
        {xabar && <p role={xabar.ok ? 'status' : 'alert'} className={`mt-2 text-[12.5px] ${xabar.ok ? 'text-ok' : 'text-danger'}`}>{xabar.matn}</p>}
      </section>
    </div>
  );
}
