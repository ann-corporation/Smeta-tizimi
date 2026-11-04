/** Takliflarni solishtirish (ochilgandan keyin): pozitsiya × yetkazuvchi jadvali, eng arzon belgisi, jami (QQS bilan asosiy), ball bilan baholash, bo'linma g'olib. */
import { useMemo, useState } from 'react';
import { Award, Save, Sparkles } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { OpsMaydon } from '../../components/kompaniya-ops/OpsUi';
import { tafsilotTaqqoslashga, tenderBaholashSaqla, tenderGolib, type TenderTafsilot } from '../../api/t2-tender';
import { ballashtir, engArzonBolinma, engArzonEmas, MEZONLAR, tartibla, taqqoslashJadvali, type Mezon } from '../../lib/tender/taqqoslash';
import { pulJuft } from '../../lib/tender/pul';
import { MEZON_NOM, TenderPul, tenderXato } from './tender-ui';

export function TenderTaqqos({ kompaniyaId, td, onSaqlandi }: { kompaniyaId: number; td: TenderTafsilot; onSaqlandi: () => void }) {
  const { qatorlar, takliflar } = useMemo(() => tafsilotTaqqoslashga(td), [td]);
  const jadval = useMemo(() => taqqoslashJadvali(qatorlar, takliflar), [qatorlar, takliflar]);
  const meyor = td.rfq.meyor;
  const ballUsul = td.rfq.baholash_usuli === 'ball';
  const [qolda, setQolda] = useState<Record<number, Partial<Record<Mezon, number>>>>(() => {
    const m: Record<number, Partial<Record<Mezon, number>>> = {};
    for (const b of td.baholar.filter((x) => x.raund === td.rfq.raund)) if (b.ballar.tolov != null) m[b.taklif_id] = { tolov: Number(b.ballar.tolov) };
    return m;
  });
  const ballar = useMemo(() => (ballUsul ? ballashtir(jadval, takliflar, meyor, qolda) : []), [ballUsul, jadval, takliflar, meyor, qolda]);
  const tartib = useMemo(() => tartibla(ballUsul ? 'ball' : 'narx', jadval, ballar), [ballUsul, jadval, ballar]);
  const baholashda = td.rfq.holat === 'baholash';
  const mumkin = baholashda && td.ruxsat.tasdiq;
  const golibMap = useMemo(() => {
    const m = new Map<number, number>();   // rfq_qator_id -> taklif_id (g'olib)
    for (const q of td.qatorlar) if (q.golib_taklif_qator_id != null) {
      const t2 = td.takliflar.find((x) => x.qatorlar.some((y) => y.taklif_qator_id === q.golib_taklif_qator_id));
      if (t2) m.set(q.id, t2.id);
    }
    return m;
  }, [td]);
  const [tanlov, setTanlov] = useState<Record<number, number | null>>({});
  const [asos, setAsos] = useState('');
  const [yakun, setYakun] = useState(true);
  const [band, setBand] = useState(false);

  const nomi = (id: number) => takliflar.find((x) => x.id === id)?.nom || t('Ishtirokchi');
  const bolinma = () => { const m: Record<number, number | null> = {}; for (const b of engArzonBolinma(jadval)) for (const q of b.qatorIdlar) m[q] = b.taklifId; setTanlov(m); };
  const bitta = (id: number) => { const m: Record<number, number | null> = {}; for (const s of jadval.satrlar) if (s.kataklar.some((k) => k.taklifId === id)) m[s.qator.id] = id; setTanlov(m); };

  const tanlanganlar = Object.entries(tanlov).filter(([, v]) => v != null).map(([q, v]) => ({ qatorId: Number(q), taklifId: v as number }));
  const guruh = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const x of tanlanganlar) m.set(x.taklifId, [...(m.get(x.taklifId) ?? []), x.qatorId]);
    return [...m].map(([taklifId, qatorIdlar]) => ({ taklifId, qatorIdlar }));
  }, [tanlanganlar]);
  const arzonEmas = engArzonEmas(jadval, guruh);

  const ballSaqla = async () => {
    const vazn = MEZONLAR.filter((m) => (meyor[m] ?? 0) > 0);
    if (!ballar.length || ballar.some((b) => !b.toliq)) { toast(t('Avval barcha mezonlar bo‘yicha ballarni to‘ldiring (to‘lov sharti — qo‘lda).'), 'warn'); return; }
    setBand(true);
    const r = await tenderBaholashSaqla(kompaniyaId, { rfqId: td.rfq.id, kutilganVersiya: td.rfq.versiya,
      ballar: ballar.map((b) => ({ taklif_id: b.taklifId, ballar: Object.fromEntries(vazn.map((m) => [m, b.ballar[m] as number])) })) });
    setBand(false);
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); return; }
    toast(t('Ballar saqlandi.'), 'ok'); onSaqlandi();
  };
  const golibTanla = async () => {
    if (!guruh.length) { toast(t('Kamida bitta pozitsiya uchun g‘olibni belgilang.'), 'warn'); return; }
    if (asos.trim().length < 10) { toast(t('G‘olib tanlash asosini yozing (kamida 10 belgi).'), 'warn'); return; }
    setBand(true);
    const r = await tenderGolib(kompaniyaId, { rfqId: td.rfq.id, kutilganVersiya: td.rfq.versiya, asos: asos.trim(), yakun,
      tanlov: guruh.map((g) => ({ taklif_id: g.taklifId, qator_idlar: g.qatorIdlar })) });
    setBand(false);
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); return; }
    toast(t('G‘olib tanlandi, buyurtmalar yaratildi.'), 'ok'); onSaqlandi();
  };

  if (!takliflar.length) return <div className="rounded border border-dashed border-border p-6 text-center text-[13px] text-text-mute">{t('Taklif kelmagan.')}</div>;
  const hujayra = 'whitespace-nowrap px-2 py-1.5 align-top';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {mumkin && <>
          <button type="button" className="fz-btn fz-btn--sm" onClick={bolinma}><Sparkles /> {t('Pozitsiya bo‘yicha eng arzon')}</button>
          {jadval.engArzonToliqId != null && <button type="button" className="fz-btn fz-btn--sm" onClick={() => bitta(jadval.engArzonToliqId as number)}>{t('Bitta g‘olib: umumiy eng arzon')} — {nomi(jadval.engArzonToliqId)}</button>}
        </>}
        <span className="text-[12px] text-text-mute">{t('Narxlar QQS bilan solishtiriladi; eng arzoni yashil.')}</span>
      </div>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-surface-2 text-left">
              <th className={hujayra}>{t('Pozitsiya')}</th>
              {tartib.map((id, i) => <th key={id} className={`${hujayra} text-right`}><><span className="mr-1 text-text-mute">#{i + 1}</span>{nomi(id)}</></th>)}
            </tr>
          </thead>
          <tbody>
            {jadval.satrlar.map((s) => (
              <tr key={s.qator.id} className="border-t border-border">
                <td className={hujayra}><span className="font-medium">{s.qator.nom}</span><span className="block text-[11px] text-text-mute">{s.qator.lotNo > 1 || td.qatorlar.some((x) => x.lot_no > 1) ? t('Lot') + ' ' + s.qator.lotNo + ' · ' : ''}<FmtN val={s.qator.miqdor} /> {s.qator.birlik}</span></td>
                {tartib.map((id) => {
                  const k = s.kataklar.find((x) => x.taklifId === id);
                  const yutdi = golibMap.get(s.qator.id) === id;
                  return (
                    <td key={id} className={`${hujayra} text-right ${k?.eng ? 'bg-[color-mix(in_srgb,var(--ok)_14%,transparent)]' : ''} ${yutdi ? 'outline outline-2 outline-[var(--ok)]' : ''}`}>
                      {!k ? <span className="text-text-mute">{t('narx bermagan')}</span> : <>
                        <span className={k.eng ? 'font-bold text-ok' : ''}><FmtN val={k.narxQqsBilan ?? k.narx} /></span>
                        <span className="block text-[11px] text-text-mute">{t('QQS siz')}: <FmtN val={k.narx} />{k.muddatKun != null ? ' · ' + t('{n} kun', { n: k.muddatKun }) : ''}{k.qisman ? ' · ' + t('qisman') : ''}</span>
                        {yutdi && <span className="fz-stamp fz-stamp--ok">{t('G‘olib')}</span>}
                        {mumkin && <label className="mt-1 flex items-center justify-end gap-1 text-[11px]"><input type="radio" name={'g' + s.qator.id} checked={tanlov[s.qator.id] === id} onChange={() => setTanlov({ ...tanlov, [s.qator.id]: id })} />{t('tanlash')}</label>}
                      </>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-2">
              <td className={`${hujayra} font-semibold`}>{t('Jami')}</td>
              {tartib.map((id) => { const j = jadval.jami.find((x) => x.taklifId === id)!; const tk = takliflar.find((x) => x.id === id)!;
                return <td key={id} className={`${hujayra} text-right ${jadval.engArzonToliqId === id ? 'text-ok' : ''}`}>
                  <TenderPul ndsSiz={j.jamiNdsSiz} foiz={tk.qqsFoiz} valyuta={td.rfq.valyuta} />
                  {!j.toliq && <span className="block text-[11px] text-warn">{t('To‘liq emas')}: {j.yopilgan}/{j.jamiQator}</span>}
                  {tk.yetkazishNarx != null && <span className="block text-[11px] text-text-mute">{t('shu jumladan yetkazish')}: <FmtN val={pulJuft(tk.yetkazishNarx, tk.qqsFoiz).qqsBilan} /></span>}
                </td>; })}
            </tr>
            <tr className="border-t border-border"><td className={hujayra}>{t('Yetkazish muddati (eng uzun)')}</td>{tartib.map((id) => { const j = jadval.jami.find((x) => x.taklifId === id)!; return <td key={id} className={`${hujayra} text-right`}>{j.maxMuddatKun == null ? t('kiritilmagan') : t('{n} kun', { n: j.maxMuddatKun })}</td>; })}</tr>
            <tr className="border-t border-border"><td className={hujayra}>{t('To‘lov sharti')}</td>{tartib.map((id) => <td key={id} className={`${hujayra} whitespace-normal text-right`}>{td.takliflar.find((x) => x.id === id)?.tolov_sharti || t('kiritilmagan')}</td>)}</tr>
            <tr className="border-t border-border"><td className={hujayra}>{t('Kafolat')}</td>{tartib.map((id) => { const v = takliflar.find((x) => x.id === id)?.kafolatOy; return <td key={id} className={`${hujayra} text-right`}>{v == null ? t('kiritilmagan') : t('{n} oy', { n: v })}</td>; })}</tr>
            <tr className="border-t border-border"><td className={hujayra}>{t('Yetkazuvchi reytingi')}</td>{tartib.map((id) => { const v = takliflar.find((x) => x.id === id)?.reyting; return <td key={id} className={`${hujayra} text-right`}>{v == null ? t('baho yo‘q') : v.toFixed(1) + ' / 5'}</td>; })}</tr>
            <tr className="border-t border-border"><td className={hujayra}>{t('Taklif amal qiladi')}</td>{tartib.map((id) => { const v = takliflar.find((x) => x.id === id)?.amalKun; return <td key={id} className={`${hujayra} text-right`}>{v == null ? t('kiritilmagan') : t('{n} kun', { n: v })}</td>; })}</tr>
          </tfoot>
        </table>
      </div>

      {ballUsul && (
        <div className="fz-card">
          <div className="fz-card__head"><h3 className="fz-card__title">{t('Ball bilan baholash')}</h3>
            <span className="text-[12px] text-text-mute">{MEZONLAR.filter((m) => (meyor[m] ?? 0) > 0).map((m) => t(MEZON_NOM[m]) + ' ' + meyor[m] + '%').join(' · ')}</span></div>
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[520px] text-[12.5px]">
              <thead><tr className="text-left"><th className="px-2 py-1">{t('Ishtirokchi')}</th>{MEZONLAR.filter((m) => (meyor[m] ?? 0) > 0).map((m) => <th key={m} className="px-2 py-1 text-right">{t(MEZON_NOM[m])}</th>)}<th className="px-2 py-1 text-right">{t('Jami ball')}</th></tr></thead>
              <tbody>
                {tartib.map((id) => { const b = ballar.find((x) => x.taklifId === id)!; return (
                  <tr key={id} className="border-t border-border">
                    <td className="px-2 py-1 font-medium">{nomi(id)}</td>
                    {MEZONLAR.filter((m) => (meyor[m] ?? 0) > 0).map((m) => (
                      <td key={m} className="px-2 py-1 text-right">
                        {m === 'tolov' && baholashda && td.ruxsat.yoz
                          ? <input type="number" min="0" max="100" aria-label={t('To‘lov sharti bali')} className="h-7 w-16 text-right" value={qolda[id]?.tolov ?? ''} onChange={(e) => { const v = e.target.value; setQolda((q) => { const n = { ...q }; if (v === '') delete n[id]; else n[id] = { ...n[id], tolov: Math.min(100, Math.max(0, Number(v))) }; return n; }); }} />
                          : b.ballar[m] == null ? <span className="text-text-mute">{t('kiritilmagan')}</span> : <><FmtN val={b.ballar[m] as number} />{b.yetishmaydi.includes(m) && <span title={t('Taklifda ko‘rsatilmagan: shartli ball berilgan')} className="text-warn">*</span>}</>}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-semibold">{b.jami == null ? <span className="font-normal text-text-mute">{t('hisoblanmadi')}</span> : <FmtN val={b.jami} />}</td>
                  </tr>); })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-text-mute">{t('* taklifda ko‘rsatilmagan ma’lumot: kafolat/muddat — 0 ball, reytingsiz — 50 (neytral). Narx balli faqat to‘liq takliflarga beriladi.')}</p>
            {baholashda && td.ruxsat.yoz && <div className="mt-2 flex justify-end"><button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void ballSaqla()}><Save /> {t('Ballarni saqlash')}</button></div>}
          </div>
        </div>
      )}

      {mumkin && (
        <div className="fz-card">
          <div className="fz-card__head"><h3 className="fz-card__title">{t('G‘olibni tasdiqlash')}</h3></div>
          <div className="space-y-3 p-4">
            <p className="text-[12.5px]">{guruh.length ? guruh.map((g) => `${nomi(g.taklifId)}: ${g.qatorIdlar.length} ${t('pozitsiya')}`).join(' · ') : t('Jadvalda har pozitsiya uchun «tanlash» ni belgilang yoki yuqoridagi tugmalardan foydalaning.')}</p>
            {arzonEmas.length > 0 && <p className="text-[12.5px] text-warn">{t('{n} ta pozitsiyada eng arzon taklif tanlanmagan — asosda sababini yozing.', { n: arzonEmas.length })}</p>}
            <OpsMaydon nom={t('Tanlash asosi (majburiy)')} majburiy izoh={t('Bu matn audit jurnaliga yoziladi.')}><textarea rows={3} maxLength={4000} value={asos} onChange={(e) => setAsos(e.target.value)} /></OpsMaydon>
            <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={yakun} onChange={(e) => setYakun(e.target.checked)} />{t('Tanlanmagan pozitsiyalar qolsa ham tenderni yakunlash')}</label>
            <div className="flex justify-end"><button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void golibTanla()}><Award /> {t('G‘olibni tasdiqlash va buyurtma yaratish')}</button></div>
          </div>
        </div>
      )}
      {td.rfq.golib_asos && <p className="rounded border border-border p-3 text-[12.5px]"><span className="font-medium">{t('Tanlash asosi')}:</span> {td.rfq.golib_asos}</p>}
    </div>
  );
}
