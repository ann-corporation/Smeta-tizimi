/**
 * Yuk egasi: «Yuk chaqirish» — bitta ekranda 3 qadam (nima · qayerdan→qayerga xaritada · qachon), darhol narx bahosi (bir qator tarkib), e'lon.
 * Narx rejimi: qat'iy narx (sukut, lib/yuk-tashish/qadam.ts SUKUT_NARX_REJIMI) yoki «taklif so'rash». Narx QQS siz; stavka kiritilmagan bo'lsa narxni o'zingiz belgilaysiz.
 * Zayavka/buyurtmadan to'ldirish: ?nom=&tonna=&a_nom=&b_nom=&buyurtma=&zayavka= (bitta bosish uchun havola). Reys: oxirgi ma'lum joy (polling 20 s; real vaqt — Phase 2).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { yangiOperationId } from '../../api/supabase';
import { ybSozlama, ybXato, ybYoz, ybYuklarim, type YukQator } from '../../api/t2-yuk-birjasi';
import { YT_XATO, ytEgaKuzat, ytYukQosh, type EgaKuzat } from '../../api/t2-yuk-tashish';
import { parametrlarServerdan, shoshilinchlik, SUKUT_PARAMETR, tavsiyaNarx, YUK_TURLARI, type NarxParametr, type YukTuri } from '../../lib/yuk-birjasi/narx';
import { GEO_PROVAYDER, UZ_MARKAZ, UZ_ZOOM, type ManzilNatija, type Nuqta } from '../../lib/yuk-tashish/geo';
import { SUKUT_NARX_REJIMI } from '../../lib/yuk-tashish/qadam';
import { MASHINA_SINF, narxQator } from '../../lib/yuk-tashish/shipper';
import TileMap, { type XaritaBelgi } from '../../components/yuk/TileMap';
import { YUK_TURI_NOM } from '../yuk-birjasi/yuk-ui';

const maydon = 'h-12 w-full rounded-lg border border-border px-3 text-[16px]';
const bugunISO = () => new Date().toISOString().slice(0, 10);
type Nuq = { nom: string; p: Nuqta | null };

function ManzilTanlash({ yorliq, qiymat, onO, faol, onFaol }: { yorliq: string; qiymat: Nuq; onO: (n: Nuq) => void; faol: boolean; onFaol: () => void }) {
  const [natija, setNatija] = useState<ManzilNatija[]>([]);
  const [band, setBand] = useState(false);
  const qidir = async () => { setBand(true); try { setNatija(await GEO_PROVAYDER.qidir(qiymat.nom)); } catch { setNatija([]); } setBand(false); };
  return (
    <div className={`flex flex-col gap-1 rounded-lg border p-2 ${faol ? 'border-blue-600' : 'border-border'}`}>
      <div className="flex gap-2">
        <input className={maydon} aria-label={yorliq} placeholder={yorliq} value={qiymat.nom} onFocus={onFaol} onChange={(e) => onO({ ...qiymat, nom: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void qidir(); }} />
        <button type="button" disabled={band || qiymat.nom.trim().length < 3} onClick={() => void qidir()} className="h-12 shrink-0 rounded-lg border border-border px-3">{t('Qidirish')}</button>
      </div>
      <span className="text-[12px] text-text-mute">{qiymat.p ? `✓ ${qiymat.p.lat.toFixed(4)}, ${qiymat.p.lng.toFixed(4)}` : t('Manzil qidiring yoki xaritada bosing.')}</span>
      {natija.map((n, i) => <button key={i} type="button" className="rounded px-2 py-1 text-left text-[13px] hover:bg-surface-2" onClick={() => { onO({ nom: n.nom, p: { lat: n.lat, lng: n.lng } }); setNatija([]); }}>{n.nom}</button>)}
    </div>
  );
}

export default function YukChaqirish() {
  const { joriy } = useKompaniya();
  const [sp] = useSearchParams();
  const kompaniyaId = joriy?.id ?? 0;
  const [nom, setNom] = useState(sp.get('nom') ?? '');
  const [tonna, setTonna] = useState(sp.get('tonna') ?? '');
  const [yukTuri, setYukTuri] = useState<YukTuri>('sochma');
  const [sinf, setSinf] = useState('');
  const [a, setA] = useState<Nuq>({ nom: sp.get('a_nom') ?? '', p: null });
  const [b, setB] = useState<Nuq>({ nom: sp.get('b_nom') ?? '', p: null });
  const [qaysi, setQaysi] = useState<'a' | 'b'>('a');
  const [sanaDan, setSanaDan] = useState(bugunISO());
  const [rejim, setRejim] = useState<'qat_iy' | 'taklif'>(SUKUT_NARX_REJIMI);
  const [qatiy, setQatiy] = useState('');
  const [masofa, setMasofa] = useState<{ km: number; daqiqa: number; manba: string } | null>(null);
  const [param, setParam] = useState<NarxParametr>(SUKUT_PARAMETR);
  const [band, setBand] = useState(false);
  const [yuklarim, setYuklarim] = useState<YukQator[]>([]);
  const [kuzat, setKuzat] = useState<number | null>(null);
  const op = useRef(yangiOperationId());
  const buyurtmaId = Number(sp.get('buyurtma')) || undefined;
  const zayavkaId = Number(sp.get('zayavka')) || undefined;

  useEffect(() => { if (kompaniyaId) void ybSozlama(kompaniyaId).then((r) => { if (r.ok) setParam(parametrlarServerdan(r.natija.parametrlar)); }); }, [kompaniyaId]);
  const yuklarniOl = useCallback(async () => { if (!kompaniyaId) return; const r = await ybYuklarim(kompaniyaId, { limit: 20 }); if (r.ok) setYuklarim(r.natija.yuklar ?? []); }, [kompaniyaId]);
  useEffect(() => { void yuklarniOl(); }, [yuklarniOl]);
  useEffect(() => {
    if (!a.p || !b.p) { setMasofa(null); return; }
    let tirik = true;
    void GEO_PROVAYDER.marshrut(a.p, b.p).then((r) => { if (tirik) setMasofa(r); });
    return () => { tirik = false; };
  }, [a.p, b.p]);

  const baho = useMemo(() => tavsiyaNarx({ masofaKm: masofa?.km ?? null, tonna: Number(tonna.replace(',', '.')) || null, yukTuri, shoshilinch: shoshilinchlik(sanaDan || null, bugunISO()), parametr: param }), [masofa, tonna, yukTuri, sanaDan, param]);
  const qator = narxQator(baho);
  const yakuniy = Number(qatiy.replace(/\s/g, '').replace(',', '.')) || baho.qqsSiz;

  const belgilar: XaritaBelgi[] = [...(a.p ? [{ id: 'a', lat: a.p.lat, lng: a.p.lng, yorliq: 'A', rang: 'a' as const }] : []), ...(b.p ? [{ id: 'b', lat: b.p.lat, lng: b.p.lng, yorliq: 'B', rang: 'b' as const }] : [])];
  const tanla = (p: Nuqta) => { const n = { nom: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, p }; if (qaysi === 'a') { setA(n); setQaysi('b'); } else setB(n); };

  const elonQil = async () => {
    if (!nom.trim() || !a.p || !b.p || !(Number(tonna.replace(',', '.')) > 0)) { toast(t('Yuk nomi, tonna va ikkala manzilni kiriting.'), 'warn'); return; }
    if (rejim === 'qat_iy' && !(yakuniy && yakuniy > 0)) { toast(t('Narxni kiriting (QQS siz).'), 'warn'); return; }
    setBand(true);
    const data = {
      nom: nom.trim(), yuk_turi: yukTuri, a_nom: a.nom || null, a_lat: a.p.lat, a_lng: a.p.lng, b_nom: b.nom || null, b_lat: b.p.lat, b_lng: b.p.lng, masofa_km: masofa?.km ?? null,
      tonna: Number(tonna.replace(',', '.')), sana_dan: sanaDan || null, sana_gacha: sanaDan || null, tolov_shakli: 'otkazma', escrow: false,
      narx_taklif_qqs_siz: rejim === 'qat_iy' ? yakuniy : null, narx_tavsiya_qqs_siz: baho.qqsSiz, qqs_foiz: param.qqsFoiz,
    };
    const s = await ybYoz(kompaniyaId, 'saqla', data, op.current);
    if (!s.ok || !s.id) { setBand(false); toast(ybXato(s), 'danger'); return; }
    const q = await ytYukQosh(kompaniyaId, { yuk_id: s.id, narx_rejim: rejim, mashina_sinf: sinf || undefined, buyurtma_id: buyurtmaId, zayavka_id: zayavkaId });
    if (!q.ok) { setBand(false); toast(t(YT_XATO[q.code] ?? 'Xatolik yuz berdi. Qayta urining.'), 'danger'); return; }
    const e = await ybYoz(kompaniyaId, 'elon', { id: s.id, versiya: s.versiya }, yangiOperationId());
    setBand(false);
    if (!e.ok) { toast(ybXato(e), 'danger'); return; }
    op.current = yangiOperationId();
    toast(t('Yuk e‘lon qilindi. Haydovchilar ko‘ryapti.'), 'ok');
    setKuzat(s.id); void yuklarniOl();
  };

  if (!joriy) return <Sahifa sarlavha={t('Yuk chaqirish')}><p className="p-4 text-text-mute">{t('Kompaniya tanlang.')}</p></Sahifa>;
  return (
    <Sahifa sarlavha={t('Yuk chaqirish')} tavsif={t('Nima, qayerdan qayerga, qachon — narx darhol ko‘rinadi.')}>
      <div className="mx-auto grid max-w-3xl gap-4 p-3">
        <section className="grid gap-2" aria-label={t('1. Nima')}>
          <h2 className="text-[15px] font-semibold">{t('1. Nima tashiladi')}</h2>
          <input className={maydon} aria-label={t('Yuk nomi')} placeholder={t('Yuk nomi (masalan, sement)')} value={nom} onChange={(e) => setNom(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={maydon} aria-label={t('Og‘irlik, tonna')} placeholder={t('Og‘irlik, tonna')} inputMode="decimal" value={tonna} onChange={(e) => setTonna(e.target.value)} />
            <select className={maydon} aria-label={t('Yuk turi')} value={yukTuri} onChange={(e) => setYukTuri(e.target.value as YukTuri)}>{YUK_TURLARI.map((x) => <option key={x} value={x}>{t(YUK_TURI_NOM[x] ?? x)}</option>)}</select>
          </div>
          <select className={maydon} aria-label={t('Mashina turi')} value={sinf} onChange={(e) => setSinf(e.target.value)}><option value="">{t('Mashina turi (ixtiyoriy)')}</option>{MASHINA_SINF.map((x) => <option key={x.kod} value={x.kod}>{t(x.nom)}</option>)}</select>
        </section>

        <section className="grid gap-2" aria-label={t('2. Qayerdan qayerga')}>
          <h2 className="text-[15px] font-semibold">{t('2. Qayerdan → qayerga')}</h2>
          <ManzilTanlash yorliq={t('Qayerdan (A)')} qiymat={a} onO={setA} faol={qaysi === 'a'} onFaol={() => setQaysi('a')} />
          <ManzilTanlash yorliq={t('Qayerga (B)')} qiymat={b} onO={setB} faol={qaysi === 'b'} onFaol={() => setQaysi('b')} />
          <TileMap markaz={a.p ?? UZ_MARKAZ} zoom={a.p ? 9 : UZ_ZOOM} belgilar={belgilar} onTanla={tanla} yorliq={t('Yo‘nalish xaritasi')} balandlik={240} />
          <span className="text-[12px] text-text-mute">{t('Xaritada bosib {n} nuqtani belgilang.', { n: qaysi === 'a' ? 'A' : 'B' })}{masofa ? ` · ${masofa.km} ${t('km')}${masofa.manba === 'taxminiy' ? ' (' + t('taxminiy') + ')' : ''}` : ''}</span>
        </section>

        <section className="grid gap-2" aria-label={t('3. Qachon')}>
          <h2 className="text-[15px] font-semibold">{t('3. Qachon')}</h2>
          <input type="date" className={maydon} aria-label={t('Sana')} min={bugunISO()} value={sanaDan} onChange={(e) => setSanaDan(e.target.value)} />
          <select className={maydon} aria-label={t('Narx rejimi')} value={rejim} onChange={(e) => setRejim(e.target.value as 'qat_iy' | 'taklif')}>
            <option value="qat_iy">{t('Qat‘iy narx — birinchi qabul qilgan haydovchi')}</option>
            <option value="taklif">{t('Taklif so‘rash — haydovchilar narx aytadi')}</option>
          </select>
        </section>

        <section className="rounded-xl border border-border p-3" aria-live="polite">
          <div className="text-[14px]">{qator.matn}</div>
          {baho.qqsSiz != null && <div className="text-[13px] text-text-mute">{t('QQS siz')}: <FmtN val={baho.qqsSiz} /> · {t('QQS bilan')}: {baho.qqsBilan != null ? <FmtN val={baho.qqsBilan} /> : '—'}</div>}
          {rejim === 'qat_iy' && <MoneyInput aria-label={t('Narx (QQS siz)')} placeholder={baho.qqsSiz == null ? t('Narx (QQS siz) — o‘zingiz belgilang') : t('Narxni o‘zgartirish (QQS siz)')} value={qatiy} onValueChange={setQatiy} className={`${maydon} mt-2`} />}
          <p className="mt-2 text-[11px] text-text-mute">{t('To‘lov platformada ushlanmaydi: to‘lov holati tomonlar o‘rtasida belgilanadi.')}</p>
        </section>
        <button type="button" disabled={band} onClick={() => void elonQil()} className="min-h-[52px] rounded-xl bg-blue-600 px-4 text-[16px] font-semibold text-white disabled:opacity-50">{t('Yuk chaqirish')}</button>

        {yuklarim.length > 0 && (
          <section aria-label={t('Yuklarim')} className="grid gap-2">
            <h2 className="text-[15px] font-semibold">{t('Yuklarim')}</h2>
            {yuklarim.slice(0, 8).map((y) => <button key={y.id} type="button" onClick={() => setKuzat(y.id)} className={`flex justify-between rounded-lg border p-2 text-left text-[13px] ${kuzat === y.id ? 'border-blue-600' : 'border-border'}`}><span>{y.nom} · {y.a_nom ?? '—'} → {y.b_nom ?? '—'}</span><span>{y.holat}</span></button>)}
          </section>
        )}
        {kuzat != null && <KuzatKarta kompaniyaId={kompaniyaId} yukId={kuzat} />}
      </div>
    </Sahifa>
  );
}

/** Reys kuzatuvi: oxirgi ma'lum joy (har 20 s yangilanadi; jonli oqim Phase 2). */
function KuzatKarta({ kompaniyaId, yukId }: { kompaniyaId: number; yukId: number }) {
  const [d, setD] = useState<EgaKuzat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  useEffect(() => {
    let toxta = false;
    const ol = async () => { const r = await ytEgaKuzat(kompaniyaId, yukId); if (toxta) return; if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.code); };
    void ol(); const id = setInterval(() => void ol(), 20000);
    return () => { toxta = true; clearInterval(id); };
  }, [kompaniyaId, yukId]);
  if (xato) return <p className="text-[13px] text-text-mute">{t('Reys ma‘lumoti hozir mavjud emas.')}</p>;
  if (!d) return null;
  const belgi: XaritaBelgi[] = d.joy ? [{ id: 'm', lat: d.joy.lat, lng: d.joy.lng, yorliq: t('Mashina'), rang: 'mashina' }] : [];
  return (
    <section className="grid gap-2 rounded-xl border-2 border-blue-600 p-3" aria-label={t('Reys holati')}>
      <h2 className="text-[15px] font-semibold">{t('Reys holati')}: {d.yuk_holat}</h2>
      {!d.bron && <p className="text-[13px] text-text-mute">{t('Haydovchi hali qabul qilmadi.')}</p>}
      {d.bron && <div className="text-[13px]">{d.bron.tashuvchi}{d.bron.telefon ? ` · ${d.bron.telefon}` : ''}{d.bron.reyting != null ? ` · ★ ${d.bron.reyting} (${d.bron.reyting_soni})` : ''} · {t('qadam')}: {d.bron.qadam} · {t('Qabul kodi')}: <b>{d.bron.qabul_kod}</b></div>}
      {d.joy && (
        <>
          <TileMap markaz={{ lat: d.joy.lat, lng: d.joy.lng }} zoom={11} belgilar={belgi} iz={d.joy.iz.map(([la, ln]) => [la, ln] as [number, number])} yorliq={t('Mashina joyi')} balandlik={220} />
          <span className="text-[12px] text-text-mute">{t('Oxirgi ma‘lum joy')} · {d.joy.soniya_oldin} {t('soniya oldin')}</span>
        </>
      )}
      {d.qabul_so_rov && d.buyurtma_id != null && <Link className="text-[13px] underline" to="/admin/logistika">{t('Yuk yetkazildi — omborga qabul qiling (Ta‘minot va sklad).')}</Link>}
    </section>
  );
}
