/**
 * TaqdimlarInbox.tsx — /admin/taqdimlar. Tomonlar orasidagi hujjat yuborish (taqdim) va qaror:
 *   Kelgan  — menga yuborilganlar: ko'rish, izoh, qabul / rad / tuzatish so'rash (zakazchik tomoni);
 *   Yuborilgan — men yuborganlar: holat, qaror izohi, qaytarib olish (pudratchi tomoni).
 * Zakazchik pudratchi hujjatini TAHRIRLAY OLMAYDI — faqat qaror chiqaradi. Qaror o'zgarmaydi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { izohYoz, taqdimTafsilotOl, taqdimlarOl, taqdimniQaytar, taqdimQarori, type TaqdimQisqa, type TaqdimTafsilot } from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { Bolim, HolatBelgi } from './tomon-ui';
import { HODISA_NOMI, inp, oyMatn, pul, sana, tugma, tugmaAsosiy } from './tomon-yordam';

const OCHIQ = ['yuborilgan', 'ko_rilmoqda'];
const KORINADIGAN_QATOR = 200;

function Tafsilot({ kompaniyaId, id, yangila }: { kompaniyaId: number; id: number; yangila: () => void }) {
  const [d, setD] = useState<TaqdimTafsilot | null>(null);
  const [izoh, setIzoh] = useState('');
  const [hammasi, setHammasi] = useState(false);
  const [band, setBand] = useState(false);
  const ol = useCallback(async () => { const r = await taqdimTafsilotOl(kompaniyaId, id); if (r.ok) setD(r.natija); else toast(r.error, 'danger'); }, [kompaniyaId, id]);
  useEffect(() => { setD(null); setIzoh(''); void ol(); }, [ol]);
  if (!d) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  const q = d.taqdim;
  const ochiq = OCHIQ.includes(q.holat);

  const qaror = async (qr: 'korilmoqda' | 'qabul' | 'rad' | 'tuzatish') => {
    if ((qr === 'rad' || qr === 'tuzatish') && izoh.trim().length < 3) { toast(t('Rad etish yoki tuzatish so‘rash uchun izoh yozing'), 'danger'); return; }
    setBand(true); const r = await taqdimQarori(kompaniyaId, q.id, qr, izoh); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Qaror saqlandi'), 'ok'); setIzoh(''); yangila(); void ol();
  };
  const qaytar = async () => { setBand(true); const r = await taqdimniQaytar(kompaniyaId, q.id, izoh); setBand(false); if (!r.ok) toast(r.error, 'danger'); else { yangila(); void ol(); } };
  const izohQosh = async () => {
    if (!izoh.trim()) return; setBand(true); const r = await izohYoz(kompaniyaId, { taqdimId: q.id, matn: izoh }); setBand(false);
    if (!r.ok) toast(r.error, 'danger'); else { setIzoh(''); void ol(); }
  };
  const qatorlar = hammasi ? d.qatorlar : d.qatorlar.slice(0, KORINADIGAN_QATOR);
  const yashirinBor = !hammasi && d.qatorlar.length > KORINADIGAN_QATOR;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <b>{q.nom}</b><HolatBelgi holat={q.holat} turi="taqdim" />
        <span className="text-text-dim">{q.etuvchi_nom} → {q.qabul_qiluvchi_nom}</span>
        {q.obyekt_nom && <span className="text-text-dim">{t('Obyekt')}: {q.obyekt_nom}</span>}
        {q.summa != null && <span className="tabular-nums">{t('Summa')}: <b>{pul(q.summa)}</b></span>}
      </div>
      {q.taqdim_izoh && <p className="text-xs text-text-dim">{t('Yuboruvchi izohi')}: {q.taqdim_izoh}</p>}
      {q.qaror_izoh && <p className="rounded border border-warn/40 bg-warn/5 px-2 py-1 text-xs">{t('Qaror izohi')}: {q.qaror_izoh}</p>}
      {d.butunlik_ok === false && <p role="alert" className="rounded border border-danger/50 bg-danger/5 px-2 py-1 text-xs text-danger">{t('DIQQAT: yuborilgandan keyin hujjat qatorlari o‘zgargan (butunlik xeshi mos kelmaydi). Qaror chiqarishdan oldin yuboruvchidan aniqlang.')}</p>}
      {d.butunlik_ok === true && <p className="text-xs text-ok">✓ {t('Butunlik tekshiruvi: yuborilgan hujjat o‘zgarmagan')}</p>}
      {q.document_id != null && <a className="text-xs text-accent underline" href={hujjatYuklabOlishUrl(q.document_id)}>{t('Hujjat faylini yuklab olish')}</a>}

      {q.resurs === 'f2' && (
        <div className="max-h-96 overflow-auto rounded border border-border">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="sticky top-0 bg-surface text-left text-text-dim"><tr><th className="px-2 py-1">№</th><th className="px-2 py-1">{t('Kod')}</th><th className="px-2 py-1">{t('Nomi')}</th><th className="px-2 py-1">{t('Birlik')}</th>
              <th className="px-2 py-1 text-right">{t('Hajm')}</th><th className="px-2 py-1 text-right">{t('Narx')}</th><th className="px-2 py-1 text-right">{t('Summa')}</th></tr></thead>
            <tbody>{qatorlar.map((x) => (
              <tr key={x.qator_id} className="border-t"><td className="px-2 py-1 tabular-nums">{x.tartib}</td><td className="px-2 py-1">{x.kod}</td><td className="px-2 py-1">{x.nom}</td><td className="px-2 py-1">{x.birlik}</td>
                <td className="px-2 py-1 text-right tabular-nums">{pul(x.hajm)}</td><td className="px-2 py-1 text-right tabular-nums">{pul(x.narx)}</td><td className="px-2 py-1 text-right tabular-nums">{pul(x.summa)}</td></tr>))}</tbody>
          </table>
          <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-text-dim">{t('Qatorlar')}: {d.qator_jami}{d.qisqartirilgan ? ` (${t('birinchi 5000 ta')})` : ''}
            {yashirinBor && <button type="button" className="text-accent underline" onClick={() => setHammasi(true)}>{t('Hammasini ko‘rsatish')}</button>}</div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold">{t('Muloqot va tarix')}</div>
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">{d.hodisalar.map((h) => (
          <li key={h.id} className={`text-xs ${h.meni ? 'text-text' : 'text-text-dim'}`}><span className="tabular-nums">{sana(h.vaqt)}</span> · {h.kompaniya_nom ?? '—'} · <b>{t(HODISA_NOMI[h.tur] ?? h.tur)}</b>{h.matn ? ` — ${h.matn}` : ''}</li>))}</ul>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[240px] flex-1 text-xs text-text-dim">{t('Izoh')}
          <textarea className={`${inp} mt-1 block h-16 w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder={t('Izoh yozing (rad etish va tuzatish uchun majburiy)')} /></label>
        <button type="button" className={tugma} disabled={band || !izoh.trim()} onClick={() => void izohQosh()}>{t('Izoh qoldirish')}</button>
        {q.kelgan && ochiq && <>
          {q.holat === 'yuborilgan' && <button type="button" className={tugma} disabled={band} onClick={() => void qaror('korilmoqda')}>{t('Ko‘rib chiqila boshlandi')}</button>}
          <button type="button" className={tugmaAsosiy} disabled={band || d.butunlik_ok === false} onClick={() => void qaror('qabul')}>{t('Qabul qilish')}</button>
          <button type="button" className={tugma} disabled={band} onClick={() => void qaror('tuzatish')}>{t('Tuzatish so‘rash')}</button>
          <button type="button" className={tugma} disabled={band} onClick={() => void qaror('rad')}>{t('Rad etish')}</button></>}
        {!q.kelgan && q.holat === 'yuborilgan' && <button type="button" className={tugma} disabled={band} onClick={() => void qaytar()}>{t('Qaytarib olish')}</button>}
      </div>
    </div>
  );
}

export default function TaqdimlarInbox() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [yonalish, setYonalish] = useState<'kelgan' | 'yuborilgan'>('kelgan');
  const [holat, setHolat] = useState('');
  const [royxat, setRoyxat] = useState<TaqdimQisqa[]>([]);
  const [tanlangan, setTanlangan] = useState<number | null>(null);
  const [xato, setXato] = useState('');

  const yukla = useCallback(async () => {
    if (!kompaniyaId) return;
    const r = await taqdimlarOl(kompaniyaId, { yonalish, holat: holat || undefined });
    if (!r.ok) { setXato(r.error); return; }
    setXato(''); setRoyxat(r.natija);
  }, [kompaniyaId, yonalish, holat]);
  useEffect(() => { void yukla(); }, [yukla]);
  const ochiqSoni = useMemo(() => royxat.filter((x) => OCHIQ.includes(x.holat)).length, [royxat]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Hujjatlar almashinuvi" />;
  return (
    <Sahifa sarlavha="Tomonlar hujjatlari" tavsif="Pudratchi yuborgan hujjatlar — zakazchik ko‘radi, izoh yozadi va qaror chiqaradi; qaror o‘zgarmaydi">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded border text-xs">
            {(['kelgan', 'yuborilgan'] as const).map((y) => (
              <button key={y} type="button" onClick={() => { setYonalish(y); setTanlangan(null); }} className={'px-3 py-1.5 ' + (yonalish === y ? 'bg-accent/15 text-accent' : '')}>{y === 'kelgan' ? t('Kelgan') : t('Yuborilgan')}</button>))}
          </div>
          <select aria-label={t('Holat')} className={inp} value={holat} onChange={(e) => setHolat(e.target.value)}>
            <option value="">{t('Barcha holatlar')}</option>
            {['yuborilgan', 'ko_rilmoqda', 'tuzatish', 'qabul', 'rad', 'qaytarilgan'].map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="text-xs text-text-dim">{t('Ochiq')}: <b>{ochiqSoni}</b></span>
        </div>
        {xato && <div role="alert" className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{xato}</div>}
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
          <Bolim sarlavha="Ro‘yxat">
            {royxat.length === 0 ? <p className="text-sm text-text-dim">{t('Hujjat yo‘q')}</p> : (
              <ul className="max-h-[70vh] space-y-1 overflow-auto">{royxat.map((x) => (
                <li key={x.id}><button type="button" onClick={() => setTanlangan(x.id)} className={`w-full rounded border px-2 py-1.5 text-left text-xs hover:border-accent ${tanlangan === x.id ? 'border-accent bg-accent/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between gap-2"><b>{x.nom}</b><HolatBelgi holat={x.holat} turi="taqdim" /></div>
                  <div className="text-text-dim">{x.qarshi_nom} · {x.obyekt_nom ?? '—'} · {oyMatn(x.oy)} · {pul(x.summa)}</div>
                  <div className="text-text-dim">{sana(x.taqdim_vaqti)}</div></button></li>))}</ul>)}
          </Bolim>
          <Bolim sarlavha="Hujjat">
            {tanlangan == null ? <p className="text-sm text-text-dim">{t('Ro‘yxatdan hujjatni tanlang')}</p> : <Tafsilot kompaniyaId={kompaniyaId} id={tanlangan} yangila={() => void yukla()} />}
          </Bolim>
        </div>
      </div>
    </Sahifa>
  );
}
