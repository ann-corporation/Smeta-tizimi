/**
 * Ochiq tender boshqaruvi (xaridor / buyurtmachi — universal): lot yaratish (smeta bo'limidan FAQAT hajm, zayavka qatoridan yoki qo'lda), e'lon, muhr, ochish,
 * taqqos, kelishuv signallari, g'olib -> aloqa -> mavjud buyurtma/topshiriq, narx manbasi (o'rtacha + ogohlantirish), shartnoma havolasi, bayonnoma (token).
 * Mavjud tender amallari (api/t2-tender.ts) qayta ishlatiladi; yangi — api/t2-tender-ochiq.ts. Har qadamni xaridor alohida tasdiqlaydi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { sbT2DaraxtOl, sbT2ObyektlarOlKomp, type T2Obyekt, type T2Qator } from '../../api/supabase';
import { TENDER_XATO_XABARI, tenderGolib, tenderOtish, tenderRoyxatOl, tenderSaqla, tenderTafsilotOl, type TenderRoyxatQator, type TenderTafsilot, type TenderTur } from '../../api/t2-tender';
import { tnAloqa, tnBayonnoma, tnKorsatish, tnLotSmetadan, tnNarxManba, tnShartnomaHavola, tnTopshiriq, type Bayonnoma, type LotSmetadan, type ShartnomaHavola } from '../../api/t2-tender-ochiq';
import { taqqosQatorlari } from '../../lib/tender-ochiq/taqqos';
import { bayonnomaXlsx } from '../../lib/tender-ochiq/bayonnoma-export';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';

const maydon = 'h-12 w-full rounded-lg border border-border px-3 text-[16px]';
const tugma = 'flex min-h-[44px] items-center justify-center rounded-xl px-4 text-[15px] font-semibold';
const HOLAT_NOM: Record<string, string> = { qoralama: 'Qoralama', tasdiqlashda: 'Tasdiqlashda', elon: 'E‘lon qilingan', takliflar_yopildi: 'Takliflar yopildi', baholash: 'Baholash (ochilgan)', golib_tanlandi: 'G‘olib tanlandi', yopildi: 'Yopildi', bekor: 'Bekor' };
const xabar = (c: string | undefined) => t((c && TENDER_XATO_XABARI[c]) || (c === 'MUHRLANGAN' ? 'Takliflar muhrlangan: avval muddat tugashi va ochilishi kerak.' : c === 'ALOQA_KERAK' ? 'Avval g‘olib bilan aloqa yarating.' : 'Bajarib bo‘lmadi. Qayta urinib ko‘ring.'));

function Yangi({ kid, onYaratildi }: { kid: number; onYaratildi: (id: number) => void }) {
  const [p] = useSearchParams();
  const zayavka = p.get('yarat') === '1' && p.get('zayavka_id') ? { nom: p.get('nom') ?? '', birlik: p.get('birlik') ?? '', hajm: Number(p.get('hajm')) || 0, zayavka_id: Number(p.get('zayavka_id')) || undefined, obyekt_id: Number(p.get('obyekt_id')) || undefined } : null;
  const turBosh = p.get('tur');
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyekt, setObyekt] = useState(zayavka?.obyekt_id ? String(zayavka.obyekt_id) : p.get('obyekt') ?? '');
  const [bolimlar, setBolimlar] = useState<T2Qator[] | null>(null);
  const [bolim, setBolim] = useState(p.get('bolim') ?? '');
  const [tur, setTur] = useState<LotSmetadan['tur']>(turBosh === 'subpudrat' || turBosh === 'texnika_ijara' ? turBosh : 'material');
  const [doira, setDoira] = useState<'ochiq' | 'taklif'>('ochiq');
  const [nom, setNom] = useState(zayavka?.nom ?? '');
  const [muddat, setMuddat] = useState('');
  const [egasiKorsat, setEgasiKorsat] = useState(false);
  const [band, setBand] = useState(false);
  useEffect(() => { void sbT2ObyektlarOlKomp(kid).then((r) => setObyektlar(r.qatorlar ?? [])); }, [kid]);
  /* Smeta bo'limlari daraxti (faqat bo'lim — «rz» — sarlavhalari; narx ko'rsatilmaydi). Zayavka rejimida kerak emas. */
  useEffect(() => {
    if (zayavka || !obyekt) { setBolimlar(null); return; }
    let bekor = false;
    void sbT2DaraxtOl(Number(obyekt), 'id,ota_id,daraja,tur,kod,nom,tartib,obyekt_id,kompaniya_id').then((r) => { if (!bekor) setBolimlar(((r.qatorlar ?? []) as T2Qator[]).filter((q) => q.tur === 'rz')); });
    return () => { bekor = true; };
  }, [obyekt, zayavka]);
  const yubor = async () => {
    setBand(true);
    const iso = new Date(muddat).toISOString();
    let id: number | undefined; let kod: string | undefined;
    if (zayavka) {
      const r = await tenderSaqla(kid, { tur: tur as TenderTur, doira, obyektId: obyekt ? Number(obyekt) : null, muddat: iso, maydonlar: { sarlavha: nom || zayavka.nom },
        qatorlar: [{ nom: zayavka.nom, birlik: zayavka.birlik, miqdor: zayavka.hajm, ...(zayavka.zayavka_id ? { zayavka_id: zayavka.zayavka_id } : {}) }] });
      id = r.id; kod = r.ok ? undefined : r.code;
    } else {
      const r = await tnLotSmetadan(kid, { obyekt_id: Number(obyekt), bolim_id: bolim ? Number(bolim) : null, tur, doira, muddat: iso, nom: nom || undefined });
      if (r.ok) id = r.natija.id; else kod = r.code;
    }
    if (id && egasiKorsat) await tnKorsatish(kid, id, true);
    setBand(false);
    if (id) { toast(t('Lot qoralama sifatida yaratildi. Tasdiqlab e‘lon qiling.'), 'ok'); onYaratildi(id); } else toast(xabar(kod), 'warn');
  };
  const tayyor = nom.trim().length > 1 && muddat && (zayavka ? true : !!obyekt);
  return (
    <div className="flex max-w-md flex-col gap-2 rounded-xl border border-border p-3">
      <h2 className="text-[17px] font-semibold">{t('Yangi tender lot')}</h2>
      {zayavka && <p className="text-[13px] text-text-mute">{t('Zayavka qatoridan to‘ldirildi')}: {zayavka.nom} · <FmtN val={zayavka.hajm} /> {zayavka.birlik}</p>}
      <div className="flex gap-1">{([['material', 'Material'], ['subpudrat', 'Ish / subpudrat'], ['texnika_ijara', 'Texnika ijarasi']] as const).map(([k, n]) => <button key={k} type="button" onClick={() => setTur(k)} className={`h-11 flex-1 rounded-lg border text-[13px] ${tur === k ? 'border-blue-600 font-semibold' : 'border-border'}`}>{t(n)}</button>)}</div>
      <div className="flex gap-1">{([['ochiq', 'Ochiq (hamma ko‘radi)'], ['taklif', 'Faqat taklif qilinganlar']] as const).map(([k, n]) => <button key={k} type="button" onClick={() => setDoira(k)} className={`h-11 flex-1 rounded-lg border text-[13px] ${doira === k ? 'border-blue-600 font-semibold' : 'border-border'}`}>{t(n)}</button>)}</div>
      <input className={maydon} aria-label={t('Lot nomi')} placeholder={t('Lot nomi')} value={nom} onChange={(e) => setNom(e.target.value)} />
      {!zayavka && (
        <>
          <select className={maydon} aria-label={t('Obyekt')} value={obyekt} onChange={(e) => { setObyekt(e.target.value); setBolim(''); }}><option value="">{t('Obyekt (smeta bo‘limi uchun)')}</option>{obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select>
          <select className={maydon} aria-label={t('Smeta bo‘limi')} value={bolim} disabled={!obyekt || bolimlar === null} onChange={(e) => { setBolim(e.target.value); const b = bolimlar?.find((x) => String(x.id) === e.target.value); if (b && !nom.trim()) setNom(`${b.kod ?? ''} ${b.nom ?? ''}`.trim()); }}>
            <option value="">{!obyekt ? t('Avval obyektni tanlang') : bolimlar === null ? t('Yuklanmoqda…') : t('Butun obyekt (barcha bo‘limlar)')}</option>
            {(bolimlar ?? []).map((b) => <option key={b.id} value={b.id}>{`${'· '.repeat(Math.min(b.daraja ?? 0, 4))}${b.kod ?? ''} ${b.nom ?? ''}`}</option>)}
          </select>
        </>
      )}
      <label className="flex flex-col gap-1 text-[13px] text-text-mute">{t('Taklif qabul qilish muddati')}<input className={maydon} type="datetime-local" value={muddat} onChange={(e) => setMuddat(e.target.value)} /></label>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={egasiKorsat} onChange={(e) => setEgasiKorsat(e.target.checked)} />{t('Ochiq sahifada kompaniyam nomini ko‘rsatish')}</label>
      <button type="button" disabled={band || !tayyor} onClick={() => void yubor()} className={`${tugma} bg-blue-600 text-white`}>{t('Lot yaratish')}</button>
      <p className="text-[12px] text-text-mute">{t('Smeta bo‘limidan lotga faqat nom, birlik va HAJM olinadi — smeta narxi va ustama boshqalarga ko‘rinmaydi. Kompaniya nomi sukut bo‘yicha yashirin.')}</p>
    </div>
  );
}

function Lot({ kid, rfqId, yangila }: { kid: number; rfqId: number; yangila: () => void }) {
  const [d, setD] = useState<(TenderTafsilot & { ok: true }) | null>(null);
  const [b, setB] = useState<Bayonnoma | null>(null);
  const [havola, setHavola] = useState<ShartnomaHavola['shartnoma'] | null>(null);
  const [xabarMatn, setXabarMatn] = useState('');
  const [asos, setAsos] = useState('');
  const [band, setBand] = useState(false);
  const yukla = useCallback(async () => {
    const r = await tenderTafsilotOl(kid, rfqId);
    if (!r.ok) return;
    setD(r.natija);
    if (r.natija.ochilgan) { const bb = await tnBayonnoma(kid, rfqId); setB(bb.ok ? bb.natija : null); } else setB(null);
  }, [kid, rfqId]);
  useEffect(() => { void yukla(); }, [yukla]);
  const taqqos = useMemo(() => (b ? taqqosQatorlari(b) : []), [b]);
  if (!d) return <p className="text-text-mute">{t('Yuklanmoqda…')}</p>;
  const r = d.rfq;
  const muddatOtgan = r.muddat != null && new Date(r.muddat).getTime() <= Date.now();
  const otish = async (ga: 'tasdiqlashda' | 'elon' | 'baholash') => {
    setBand(true);
    const x = await tenderOtish(kid, { rfqId, kutilganVersiya: r.versiya, ga });
    setBand(false);
    if (x.ok) { toast(t(ga === 'baholash' ? 'Takliflar ochildi (jurnalga yozildi).' : 'Holat yangilandi.'), 'ok'); await yukla(); yangila(); } else toast(xabar(x.code), 'warn');
  };
  const golib = async (taklifId: number) => {
    if (asos.trim().length < 10) { toast(t('G‘olib tanlash asosini yozing (kamida 10 belgi).'), 'warn'); return; }
    setBand(true);
    const a = await tnAloqa(kid, rfqId, taklifId);
    if (!a.ok) { setBand(false); toast(xabar(a.code), 'warn'); return; }
    const g = await tenderGolib(kid, { rfqId, kutilganVersiya: r.versiya, tanlov: [{ taklif_id: taklifId }], asos });
    setBand(false);
    if (!g.ok) { toast(xabar(g.code), 'warn'); return; }
    toast(t('G‘olib tanlandi, buyurtma yaratildi.'), 'ok'); await yukla(); yangila();
  };
  const manba = async () => {
    const x = await tnNarxManba(kid, rfqId);
    if (!x.ok) { toast(xabar(x.code), 'warn'); return; }
    setXabarMatn(x.natija.ogohlantirish === 'urtacha' ? t('Narx manbasiga barcha yaroqli takliflarning arifmetik o‘rtachasi yozildi (QQS siz).') : t('Narx manbasiga yozildi.'));
  };
  const topshiriq = async () => { const x = await tnTopshiriq(kid, rfqId); if (x.ok) { setXabarMatn(t('Ishlar g‘olib narxlarida subpudratchiga topshirildi.')); } else toast(xabar(x.code), 'warn'); };
  const shartnoma = async () => { const x = await tnShartnomaHavola(kid, rfqId); if (x.ok) setHavola(x.natija.shartnoma); else toast(xabar(x.code), 'warn'); };
  const hujjat = async () => {
    if (!b) return;
    setBand(true);
    try {
      const { bytes, faylNomi } = await bayonnomaXlsx(b);
      const tk = await hujjatTokenBilan({ kompaniyaId: kid, bytes, hujjat: 'TENDER_BAYONNOMA', sabab: `Tender bayonnomasi · ${b.tender.raqam ?? b.tender.id}` }, () => downloadBlob(bytes, faylNomi));
      if (!tk.ok) toast(tk.xabar, 'danger'); else toast(tk.xabar || t('Bayonnoma tayyor.'), 'ok');
    } catch { toast(t('Bayonnoma tuzilmadi. Qayta urinib ko‘ring.'), 'warn'); }
    setBand(false);
  };
  const yutgan = (b?.takliflar ?? []).find((x) => x.holat === 'golib');
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[17px] font-semibold">{r.nom}</h3><span className="text-[13px] text-text-mute">{t(HOLAT_NOM[r.effektiv_holat] ?? r.effektiv_holat)}</span></div>
      <p className="text-[13px] text-text-mute">{t('Muddat')}: {r.muddat ? new Date(r.muddat).toLocaleString() : '—'} · {r.doira === 'ochiq' ? t('Ochiq') : t('Faqat taklif qilinganlar')}{r.doira === 'ochiq' && r.holat === 'elon' && <> · <Link to={`/tender/${r.id}`} className="underline">{t('Ochiq sahifa')}</Link></>}</p>
      <div className="flex flex-wrap gap-2">
        {r.holat === 'qoralama' && <button type="button" disabled={band} onClick={() => void otish('tasdiqlashda')} className={`${tugma} border border-border`}>{t('Tasdiqlashga yuborish')}</button>}
        {r.holat === 'tasdiqlashda' && <button type="button" disabled={band} onClick={() => void otish('elon')} className={`${tugma} bg-blue-600 text-white`}>{t('E‘lon qilish')}</button>}
        {(r.holat === 'elon' || r.holat === 'takliflar_yopildi') && muddatOtgan && !d.ochilgan && <button type="button" disabled={band} onClick={() => void otish('baholash')} className={`${tugma} bg-blue-600 text-white`}>{t('Takliflarni ochish')}</button>}
      </div>
      {!d.ochilgan && (r.holat === 'elon' || r.holat === 'takliflar_yopildi') && (
        <p role="status" className="rounded-lg bg-surface-2 p-2 text-[14px]">{t('Takliflar muhrlangan')}: {d.takliflar_soni ?? 0} {t('ta taklif.')} {muddatOtgan ? t('Muddat tugadi — ochish mumkin.') : t('Narxlar muddat tugagach, ochilgandan keyin ko‘rinadi.')}</p>
      )}
      {d.ochilgan && b && (
        <>
          {b.ogohlantirishlar.length > 0 && <p role="alert" className="rounded-lg bg-surface-2 p-2 text-[13px]">{t('Kelishuv belgilari (signal, hukm emas)')}: {b.ogohlantirishlar.map((o) => `${t(o.tur === 'bir_foydalanuvchi' ? 'bir foydalanuvchi' : o.tur === 'bir_xil_jami' ? 'bir xil jami' : 'bir xil narx nisbati')} (#${o.taklif_idlar.join(', #')})`).join('; ')}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead><tr className="text-left text-text-mute"><th>{t('Ishtirokchi')}</th><th className="text-right">{t('Jami (QQS siz)')}</th><th>{t('Muddat (kun)')}</th><th>{t('Kafolat (oy)')}</th><th>{t('Holat')}</th><th /></tr></thead>
              <tbody>{taqqos.map((x) => (
                <tr key={x.taklif_id} className={`border-t border-border ${x.holat === 'golib' ? 'bg-surface-2 font-semibold' : ''}`}>
                  <td>{x.kompaniya}</td><td className="text-right tabular-nums"><FmtN val={x.jami} /></td><td>{x.muddat_kun_max ?? '—'}</td><td>{x.kafolat_oy ?? '—'}</td><td>{x.holat}</td>
                  <td className="text-right">{r.holat === 'baholash' && <button type="button" disabled={band} onClick={() => void golib(x.taklif_id)} className="h-10 rounded-lg bg-blue-600 px-3 text-white">{t('G‘olib')}</button>}</td>
                </tr>))}</tbody>
            </table>
          </div>
          {r.holat === 'baholash' && <textarea className="min-h-[64px] rounded-lg border border-border p-2 text-[15px]" aria-label={t('G‘olib tanlash asosi')} placeholder={t('G‘olib tanlash asosi (kamida 10 belgi)')} value={asos} onChange={(e) => setAsos(e.target.value)} />}
          {(r.holat === 'golib_tanlandi' || r.holat === 'yopildi') && yutgan && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
              <span className="text-[14px]">{t('G‘olib')}: <b>{yutgan.kompaniya}</b></span>
              <div className="flex flex-wrap gap-2">
                {(r.tur === 'material' || r.tur === 'texnika_ijara') && <button type="button" onClick={() => void manba()} className={`${tugma} border border-border`}>{t('Narx manbasiga yozish (o‘rtacha)')}</button>}
                {r.tur === 'subpudrat' && <button type="button" onClick={() => void topshiriq()} className={`${tugma} border border-border`}>{t('Ishni subpudratchiga topshirish')}</button>}
                {r.tur === 'subpudrat' && <button type="button" onClick={() => void shartnoma()} className={`${tugma} border border-border`}>{t('Shartnoma qoralamasi')}</button>}
              </div>
              {xabarMatn && <p role="status" className="text-[13px]">{xabarMatn}</p>}
              {havola && <p className="text-[13px]"><Link className="underline" to={`/admin/shartnoma-liniya?yangi=1&turi=${havola.turi}&nom=${encodeURIComponent(havola.nom)}&taraf=${encodeURIComponent(havola.taraf ?? '')}${havola.summa_bez_nds != null ? `&summa=${havola.summa_bez_nds}` : ''}${havola.loyiha_id ? `&loyiha=${havola.loyiha_id}` : ''}`}>{t('Shartnomani ochish')}</Link> · {t('Summa (QQS siz)')}: <FmtN val={havola.summa_bez_nds} /></p>}
            </div>
          )}
          <button type="button" disabled={band} onClick={() => void hujjat()} className={`${tugma} border border-border`}>{t('Tender bayonnomasi (Excel)')}</button>
        </>
      )}
    </div>
  );
}

export default function TenderOchiqBoshqaruv() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? 0;
  const [royxat, setRoyxat] = useState<TenderRoyxatQator[]>([]);
  const [tanlangan, setTanlangan] = useState<number | null>(null);
  const yukla = useCallback(async () => { if (!kid) return; const r = await tenderRoyxatOl({ kompaniyaId: kid, yonalish: 'meniki', limit: 50 }); if (r.ok) setRoyxat(r.natija.qatorlar); }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);
  if (!joriy) return <Sahifa sarlavha={t('Ochiq tender')}><p className="p-4 text-text-mute">{t('Kompaniya tanlang.')}</p></Sahifa>;
  return (
    <Sahifa sarlavha={t('Ochiq tender')} tavsif={t('Lotni e‘lon qiling, takliflar muhrlangan keladi, muddatdan keyin oching, taqqoslang va g‘olibni tanlang.')}>
      <div className="flex flex-col gap-3 p-2">
        <Yangi kid={kid} onYaratildi={(id) => { setTanlangan(id); void yukla(); }} />
        <ul className="flex flex-col gap-2">
          {royxat.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setTanlangan(tanlangan === x.id ? null : x.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-left">
                <span className="font-semibold">{x.nom}</span><span className="text-[13px] text-text-mute">{t(HOLAT_NOM[x.effektiv_holat] ?? x.effektiv_holat)} · {t('takliflar')}: {x.takliflar_soni ?? 0}</span>
              </button>
              {tanlangan === x.id && <div className="pt-2"><Lot kid={kid} rfqId={x.id} yangila={() => void yukla()} /></div>}
            </li>
          ))}
          {tanlangan != null && !royxat.some((x) => x.id === tanlangan) && <li><Lot kid={kid} rfqId={tanlangan} yangila={() => void yukla()} /></li>}
        </ul>
        <p className="text-[13px] text-text-mute">{t('Taklif berish, savol-javob va ball bilan baholash')}: <Link to="/admin/tender" className="underline">{t('Tender / xarid')}</Link></p>
      </div>
    </Sahifa>
  );
}
