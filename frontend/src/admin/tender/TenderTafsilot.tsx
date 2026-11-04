/** Tender kartasi: holat zanjiri, tasdiq/e'lon/ochish/raund/shartnoma/yopish amallari, pozitsiyalar, takliflar (muhr), savol-javob, buyurtma va reyting, audit jurnali. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Lock, Pencil, RefreshCw, Star } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { OpsKpi, OpsKpiQator, OpsMaydon, OpsOyna } from '../../components/kompaniya-ops/OpsUi';
import { sbT2ShartnomalarOl, type Shartnoma } from '../../api/t2-shartnoma';
import { tenderBahoBer, tenderOtish, tenderRaund, tenderTafsilotOl, type TenderTafsilot as Tafsilot } from '../../api/t2-tender';
import { effektivHolat, harakatlar, izohKerak, TENDER_HOLATLAR, taklifBerishMumkin, type Harakat, type TenderHolat } from '../../lib/tender/holat';
import { qqsSizNarx } from '../../lib/hisob-yadro';
import { Bosh, HolatBelgi, holatNomi, isoDanLokal, lokaldanIso, sanaKun, sanaVaqt, tenderXato, turNomi } from './tender-ui';
import { TenderSavollar } from './TenderSavollar';
import { TenderTaklifForma } from './TenderTaklifForma';
import { TenderTaqqos } from './TenderTaqqos';

const HARAKAT_GA: Partial<Record<Harakat, TenderHolat>> = {
  tasdiqga: 'tasdiqlashda', qaytarish: 'qoralama', elon: 'elon', erta_yopish: 'takliflar_yopildi', ochish: 'baholash',
  shartnoma: 'shartnoma', bajarilmoqda: 'bajarilmoqda', yopish: 'yopildi', bekor: 'bekor',
};
const HARAKAT_NOM: Record<Harakat, string> = {
  tahrir: 'Tahrirlash', tasdiqga: 'Tasdiqqa yuborish', qaytarish: 'Qaytarish', elon: 'Tasdiqlash va e’lon qilish', erta_yopish: 'Muddatdan oldin yopish',
  ochish: 'Takliflarni ochish', baholash_saqlash: 'Baholash', raund: 'Qayta raund (BAFO)', golib: 'G‘olib', shartnoma: 'Shartnomaga bog‘lash',
  bajarilmoqda: 'Bajarilmoqda deb belgilash', yopish: 'Yopish', bekor: 'Bekor qilish',
};
const HODISA_NOM: Record<string, string> = {
  yaratildi: 'Qoralama yaratildi', tahrirlandi: 'Tahrirlandi', holat: 'Holat o‘zgardi', taklif: 'Taklif keldi', taklif_qaytar: 'Taklif qaytarib olindi', savol: 'Savol berildi',
  javob: 'Javob berildi', baholandi: 'Ballar saqlandi', golib: 'G‘olib tanlandi', raund: 'Qayta raund', reyting: 'Yetkazuvchi baholandi', fayl: 'Fayl biriktirildi',
};

export function TenderTafsilot({ kompaniyaId, rfqId, orqaga, tahrirlash }: { kompaniyaId: number; rfqId: number; orqaga: () => void; tahrirlash: (td: Tafsilot) => void }) {
  const [td, setTd] = useState<Tafsilot | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [amal, setAmal] = useState<Harakat | null>(null);
  const [izoh, setIzoh] = useState('');
  const [raundMuddat, setRaundMuddat] = useState('');
  const [shartnomaId, setShartnomaId] = useState('');
  const [shartnomalar, setShartnomalar] = useState<Shartnoma[]>([]);
  const [band, setBand] = useState(false);

  const yukla = useCallback(async () => {
    setYuk(true);
    const r = await tenderTafsilotOl(kompaniyaId, rfqId);
    setYuk(false);
    if (r.ok) { setTd(r.natija); setXato(null); } else setXato(r.code === 'TOPILMADI' ? t('Tender topilmadi yoki sizga ochiq emas.') : r.error);
  }, [kompaniyaId, rfqId]);
  useEffect(() => { void yukla(); }, [yukla]);

  const eh = td ? effektivHolat(td.rfq.holat, td.rfq.muddat) : null;
  const tugmalar = useMemo(() => (td && td.egasi && eh ? harakatlar(td.rfq.holat, td.ruxsat, eh === 'takliflar_yopildi' && td.rfq.holat === 'elon') : []), [td, eh]);

  const amalOch = (h: Harakat) => {
    if (!td) return;
    if (h === 'tahrir') { tahrirlash(td); return; }
    if (h === 'golib' || h === 'baholash_saqlash') { document.getElementById('tender-taqqos')?.scrollIntoView({ behavior: 'smooth' }); return; }
    setIzoh(''); setShartnomaId(''); setRaundMuddat('');
    if (h === 'shartnoma') void sbT2ShartnomalarOl(kompaniyaId).then((r) => setShartnomalar((r.qatorlar as Shartnoma[]) || []));
    setAmal(h);
  };
  const bajar = async () => {
    if (!td || !amal) return;
    setBand(true);
    let r;
    if (amal === 'raund') {
      const m = lokaldanIso(raundMuddat);
      if (!m || izoh.trim().length < 3) { setBand(false); toast(t('Yangi muddat va sababni kiriting.'), 'warn'); return; }
      r = await tenderRaund(kompaniyaId, { rfqId: td.rfq.id, kutilganVersiya: td.rfq.versiya, muddat: m, izoh: izoh.trim() });
    } else {
      const ga = HARAKAT_GA[amal] as TenderHolat;
      if (izohKerak(td.rfq.holat, ga) && izoh.trim().length < 3) { setBand(false); toast(t('Sababni yozing.'), 'warn'); return; }
      if (amal === 'shartnoma' && !shartnomaId) { setBand(false); toast(t('Shartnomani tanlang.'), 'warn'); return; }
      r = await tenderOtish(kompaniyaId, { rfqId: td.rfq.id, kutilganVersiya: td.rfq.versiya, ga, izoh: izoh.trim() || undefined, shartnomaId: amal === 'shartnoma' ? Number(shartnomaId) : null });
    }
    setBand(false);
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); if (r.code === 'VERSIYA_ESKI') void yukla(); return; }
    toast(t('Bajarildi.'), 'ok'); setAmal(null); void yukla();
  };
  const baho = async (buyurtmaId: number, ball: number) => {
    const r = await tenderBahoBer(kompaniyaId, { buyurtmaId, ball });
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); return; }
    toast(t('Baho saqlandi.'), 'ok'); void yukla();
  };

  if (xato) return <div className="space-y-3"><button type="button" className="fz-btn fz-btn--ghost" onClick={orqaga}><ArrowLeft /> {t('Ro‘yxatga')}</button><Bosh>{xato}</Bosh></div>;
  if (!td || !eh) return <Bosh>{t('Yuklanmoqda…')}</Bosh>;
  const r = td.rfq;
  const bahoQiling = td.egasi && td.ruxsat.yoz;
  const muhr = td.egasi && !td.ochilgan && (eh === 'elon' || eh === 'takliflar_yopildi');
  const mening = td.takliflar.find((x) => x.holat === 'berildi' || x.holat === 'faol' || x.holat === 'golib');
  const lotlar = [...new Set(td.qatorlar.map((q) => q.lot_no))].sort((a, b) => a - b);
  const zanjir: TenderHolat[] = TENDER_HOLATLAR.filter((h) => h !== 'bekor' && h !== 'takliflar_yopildi');
  const joriyIndeks = zanjir.indexOf((eh === 'takliflar_yopildi' ? 'elon' : eh) as TenderHolat);
  const izohTalab = amal && amal !== 'raund' && HARAKAT_GA[amal] ? izohKerak(r.holat, HARAKAT_GA[amal] as TenderHolat) : amal === 'raund';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fz-btn fz-btn--ghost" onClick={orqaga}><ArrowLeft /> {t('Ro‘yxatga')}</button>
        <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void yukla()} disabled={yuk}><RefreshCw className={yuk ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {tugmalar.filter((h) => h !== 'baholash_saqlash').map((h) => (
            <button key={h} type="button" className={`fz-btn fz-btn--sm ${h === 'elon' || h === 'ochish' || h === 'tasdiqga' || h === 'golib' ? 'fz-btn--primary' : h === 'bekor' ? 'fz-btn--ghost' : ''}`} onClick={() => amalOch(h)}>
              {h === 'tahrir' ? <Pencil /> : h === 'elon' ? <Check /> : null} {t(HARAKAT_NOM[h])}
            </button>
          ))}
        </span>
      </div>

      <div className="fz-card"><div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="fz-c-shifr">{r.raqam ?? '#' + r.id}</span><h2 className="text-[16px] font-semibold">{r.nom}</h2><HolatBelgi holat={eh} />
          <span className="fz-chip">{turNomi(r.tur)}</span>{r.raund > 1 && <span className="fz-chip fz-chip--accent">{t('Raund {n}', { n: r.raund })}</span>}</div>
        <ol className="flex flex-wrap gap-1 text-[11.5px]" aria-label={t('Tender bosqichlari')}>
          {zanjir.map((h, i) => <li key={h} className={`rounded-full border px-2 py-0.5 ${eh === 'bekor' ? 'border-border text-text-mute' : i < joriyIndeks ? 'border-[var(--ok)] text-ok' : i === joriyIndeks ? 'border-[var(--accent)] font-semibold text-accent' : 'border-border text-text-mute'}`}>{holatNomi(h)}</li>)}
          {eh === 'bekor' && <li className="rounded-full border border-[var(--danger)] px-2 py-0.5 text-danger">{holatNomi('bekor')}</li>}
        </ol>
        <OpsKpiQator yorliq={t('Tender ko‘rsatkichlari')}>
          <OpsKpi nom={t('Takliflar muddati')} qiymat={sanaVaqt(r.muddat)} ost={eh === 'elon' ? t('muddat tugaguncha takliflar yopiq') : undefined} />
          <OpsKpi nom={t('Byudjet')} qiymat={r.byudjet_qqs_bilan == null ? <span className="text-text-mute">{t(td.egasi ? 'kiritilmagan' : 'yashirin')}</span> : <FmtN val={r.byudjet_qqs_bilan} />}
            ost={r.byudjet_qqs_bilan == null ? undefined : <>{t('QQS bilan')} · {t('QQS siz')}: <FmtN val={qqsSizNarx(r.byudjet_qqs_bilan, r.qqs_foiz)} /></>} />
          {td.egasi && <OpsKpi nom={t('Takliflar')} qiymat={td.takliflar_soni ?? 0} ost={muhr ? t('muhrlangan — ochilmagan') : undefined} />}
          <OpsKpi nom={t('G‘olibni aniqlash')} qiymat={r.baholash_usuli === 'ball' ? t('Ball bilan') : t('Eng past narx')} />
        </OpsKpiQator>
        {r.izoh && <p className="text-[12.5px] text-text-dim">{r.izoh}</p>}
        {r.tolov_sharti && <p className="text-[12.5px]"><span className="font-medium">{t('To‘lov sharti')}:</span> {r.tolov_sharti}</p>}
        {td.egasi && r.yuborgan_actor_id != null && r.tasdiq_actor_id != null && r.yuborgan_actor_id === r.tasdiq_actor_id && <p className="text-[12px] text-warn">{t('Diqqat: tasdiqlovchi va yuboruvchi bir kishi.')}</p>}
      </div></div>

      <div className="fz-card"><div className="fz-card__head"><h3 className="fz-card__title">{t('Pozitsiyalar')}</h3></div>
        <div className="overflow-x-auto"><table className="fz-table min-w-[560px]">
          <thead><tr><th>#</th><th>{t('Nomi')}</th><th className="fz-c-num">{t('Miqdor')}</th><th>{t('Kerak sana')}</th><th>{t('Yetkazish joyi')}</th></tr></thead>
          <tbody>{lotlar.map((l) => <FragmentLot key={l} lot={l} qatorlar={td.qatorlar.filter((q) => q.lot_no === l)} kopLot={lotlar.length > 1} />)}</tbody>
        </table></div></div>

      {muhr && <div className="flex items-center gap-2 rounded border border-border p-4 text-[13px]"><Lock size={16} className="text-text-mute" />{eh === 'elon' ? t('Takliflar muhrlangan: muddat tugagach «Takliflarni ochish» tugmasi paydo bo‘ladi. Ungacha faqat soni ko‘rinadi.') : t('Muddat tugadi. Takliflarni ochganingizda hamma tomon ko‘ra oladi va jurnalga yoziladi.')}</div>}
      {td.egasi && !muhr && r.holat !== 'qoralama' && r.holat !== 'tasdiqlashda' && <div id="tender-taqqos"><TenderTaqqos kompaniyaId={kompaniyaId} td={td} onSaqlandi={() => void yukla()} /></div>}

      {!td.egasi && (
        <>
          {mening && <p className="rounded border border-border p-3 text-[12.5px]">{t('Sizning taklifingiz')}: <span className="font-medium">{mening.holat === 'golib' ? t('G‘olib') : mening.holat === 'yutqazdi' ? t('Tanlanmadi') : t('Qabul qilindi')}</span> · {sanaVaqt(mening.yaratildi)}</p>}
          {taklifBerishMumkin(r.holat, r.muddat) && td.ruxsat.taklif && <TenderTaklifForma key={r.raund + ':' + (mening?.id ?? 0)} kompaniyaId={kompaniyaId} td={td} onSaqlandi={() => void yukla()} />}
          {taklifBerishMumkin(r.holat, r.muddat) && !td.ruxsat.taklif && <Bosh>{t('Taklif berish uchun «Tenderga taklif berish» ruxsati kerak.')}</Bosh>}
        </>
      )}

      {(r.holat !== 'qoralama' && r.holat !== 'tasdiqlashda') && <TenderSavollar kompaniyaId={kompaniyaId} td={td} onSaqlandi={() => void yukla()} />}

      {td.buyurtmalar.length > 0 && (
        <div className="fz-card"><div className="fz-card__head"><h3 className="fz-card__title">{t('Buyurtmalar va yetkazish')}</h3></div>
          <div className="space-y-2 p-4">
            {td.buyurtmalar.map((b) => {
              const tugadi = ['qabul_qilindi_yakuniy', 'qisman', 'nizo'].includes(b.holat);
              return (
                <div key={b.id} className="rounded border border-border p-3 text-[12.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{t('Buyurtma')} #{b.id} · {b.ijrochi_nom ?? ''}</span><span className="fz-stamp">{b.bosqich ?? b.holat}</span></div>
                  <ul className="mt-1 space-y-0.5 text-text-dim">{(b.qatorlar ?? []).map((q, i) => <li key={i}>{q.nom}: <FmtN val={q.miqdor} /> {q.birlik}{q.qabul_miqdor != null ? ' · ' + t('qabul qilindi') + ': ' : ''}{q.qabul_miqdor != null && <FmtN val={q.qabul_miqdor} />}</li>)}</ul>
                  <p className="mt-1 text-[11.5px] text-text-mute">{t('To‘lov holati va ombor kirimi — moliya/ombor bo‘limlarida; bu yerga hozircha ulanmagan.')}</p>
                  {td.egasi && tugadi && b.baho != null && <p className="mt-1 inline-flex items-center gap-1"><Star size={13} />{t('Sizning bahoyingiz')}: {b.baho} / 5</p>}
                  {td.egasi && tugadi && b.baho == null && bahoQiling && <div className="mt-2 flex flex-wrap items-center gap-1"><span>{t('Yetkazuvchini baholang')}:</span>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="fz-btn fz-btn--sm" onClick={() => void baho(b.id, n)}>{n}</button>)}</div>}
                </div>);
            })}
          </div></div>
      )}

      {td.egasi && (
        <div className="fz-card"><div className="fz-card__head"><h3 className="fz-card__title">{t('Audit jurnali')}</h3></div>
          <ol className="space-y-1 p-4 text-[12.5px]">
            {td.jurnal.map((j) => (
              <li key={j.id} className="flex flex-wrap gap-2"><span className="text-text-mute">{sanaVaqt(j.yaratildi)}</span><span>{t(HODISA_NOM[j.hodisa] ?? j.hodisa)}</span>
                {j.hodisa === 'holat' && <span className="text-text-dim">{holatNomi(String(j.payload.dan))} → {holatNomi(String(j.payload.ga))}{j.payload.izoh ? ' — ' + String(j.payload.izoh) : ''}</span>}
                {j.hodisa === 'golib' && j.payload.asos != null && <span className="text-text-dim">{String(j.payload.asos)}</span>}</li>))}
          </ol></div>
      )}

      <OpsOyna ochiq={amal != null} onYop={() => setAmal(null)} band={band} kenglik={460} sarlavha={amal ? t(HARAKAT_NOM[amal]) : ''}
        amallar={<><button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={() => setAmal(null)}>{t('Bekor qilish')}</button><button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void bajar()}>{t('Tasdiqlash')}</button></>}>
        {amal === 'elon' && <p className="text-[13px]">{t('E’londan keyin yetkazuvchilar taklif bera oladi. Muddat')}: <b>{sanaVaqt(r.muddat)}</b></p>}
        {amal === 'ochish' && <p className="text-[13px]">{t('Takliflar ochiladi: xaridor tomoni ko‘radi, ochgan kishi va vaqt jurnalga yoziladi.')}</p>}
        {amal === 'raund' && <OpsMaydon nom={t('Yangi muddat')} majburiy><input type="datetime-local" value={raundMuddat || isoDanLokal(null)} onChange={(e) => setRaundMuddat(e.target.value)} /></OpsMaydon>}
        {amal === 'shartnoma' && <OpsMaydon nom={t('Shartnoma')} majburiy><select value={shartnomaId} onChange={(e) => setShartnomaId(e.target.value)}><option value="">{t('— tanlang —')}</option>{shartnomalar.map((s) => <option key={s.id} value={s.id}>{s.raqam ?? '#' + s.id}</option>)}</select></OpsMaydon>}
        {(izohTalab || amal === 'elon' || amal === 'tasdiqga') && <OpsMaydon nom={izohTalab ? t('Sabab (majburiy)') : t('Izoh')} majburiy={izohTalab}><textarea rows={3} maxLength={1000} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></OpsMaydon>}
      </OpsOyna>
    </div>
  );
}

function FragmentLot({ lot, qatorlar, kopLot }: { lot: number; qatorlar: Tafsilot['qatorlar']; kopLot: boolean }) {
  return (
    <>
      {kopLot && <tr className="bg-surface-2"><td colSpan={5} className="font-medium">{t('Lot')} {lot}{qatorlar[0]?.lot_nom ? ' — ' + qatorlar[0].lot_nom : ''}</td></tr>}
      {qatorlar.map((q) => (
        <tr key={q.id}><td className="text-text-mute">{q.qator_no}</td><td><span className="font-medium">{q.nom}</span>{q.spets && <span className="block text-[11.5px] text-text-mute">{q.spets}</span>}</td>
          <td className="fz-c-num"><FmtN val={q.miqdor} /> {q.birlik}</td><td>{sanaKun(q.talab_sana)}</td><td>{q.yetkazish_joyi ?? '—'}</td></tr>))}
    </>
  );
}
