/**
 * Haydovchi yuzi (Logistika P1): telefon-birinchi, katta tugmalar. Liniyaga chiqish, yaqin yuklar (masofa bo'yicha, ro'yxat + xarita), qabul (poyga: bitta yutadi),
 * qadamlar keldi → yuklandi → yo'lda → yetkazdi (har biri bitta tugma), foto isbot, qabul qiluvchi + imzo, daromad ro'yxati.
 * Joy FAQAT faol reysda va sahifa ochiq paytda yuboriladi (PWA fon joylashuvini kafolatlamaydi — ekranni yoniq qoldiring). Server oxirgi nuqtani saqlaydi.
 * Narx QQS siz. Yakka haydovchi kompaniyasiz ishlaydi (profil — t2_yb_tashuvchi).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import TileMap, { type XaritaBelgi } from '../../components/yuk/TileMap';
import { UZ_MARKAZ, UZ_ZOOM } from '../../lib/yuk-tashish/geo';
import { keyingiQadam, QADAM_NOM, YT_BEKOR_SABAB } from '../../lib/yuk-tashish/qadam';
import {
  YT_XATO, ytBaho, ytHaydovchiQosh, ytPark, ytTayinla, type ParkHaydovchi, ytBekor, ytDalil, ytFaylYukla, ytHolat, ytJoy, ytProfil, ytReys, ytQabul, ytQadam, ytSaqla, ytYaqin,
  type MashinaQator, type MenikiBron, type TashuvchiProfil, type YaqinYuk,
} from '../../api/t2-yuk-tashish';
import { ImzoTaxtasi, type ImzoRef } from './ImzoTaxtasi';

const xabar = (code: string) => t(YT_XATO[code] ?? 'Xatolik yuz berdi. Qayta urining.');
type JoyOl = { lat: number; lng: number; aniq: number };
const joyOl = (): Promise<JoyOl | null> => new Promise((res) => {
  if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, aniq: p.coords.accuracy }), () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
});
type Yangila = { (): PromiseLike<void> };
const KATTA = 'min-h-[52px] w-full rounded-xl px-4 text-[16px] font-semibold disabled:opacity-50';

export default function HaydovchiSahifa() {
  const [profil, setProfil] = useState<TashuvchiProfil | null | undefined>(undefined);
  const [mashinalar, setMashinalar] = useState<MashinaQator[]>([]);
  const [bronlar, setBronlar] = useState<MenikiBron[]>([]);
  const [yuklar, setYuklar] = useState<YaqinYuk[]>([]);
  const [joy, setJoy] = useState<{ lat: number; lng: number } | null>(null);
  const [band, setBand] = useState(false);
  const [narx, setNarx] = useState<Record<number, string>>({});

  const yangila = useCallback(async () => {
    const p = await ytProfil();
    if (!p.ok) { setProfil(null); return; }
    setProfil(p.natija.tashuvchi); setMashinalar(p.natija.mashinalar ?? []);
    if (p.natija.tashuvchi) { const m = await ytReys(); if (m.ok) setBronlar(m.natija.bronlar ?? []); }
  }, []);
  useEffect(() => { void yangila(); }, [yangila]);

  const faol = useMemo(() => bronlar.find((b) => b.mening && (b.holat === 'bron' || b.holat === 'yolda')) ?? null, [bronlar]);
  const firmaReyslar = useMemo(() => bronlar.filter((b) => !b.mening && (b.holat === 'bron' || b.holat === 'yolda' || b.holat === 'yetkazildi')), [bronlar]);
  const onlayn = !!profil?.onlayn;

  /* Yaqin yuklar: onlayn va faol reys yo'q paytda har 20 s */
  useEffect(() => {
    if (!onlayn || faol) { setYuklar([]); return; }
    let toxta = false;
    const yukla = async () => { const j = joy ?? await joyOl(); if (j && !joy) setJoy({ lat: j.lat, lng: j.lng }); const r = await ytYaqin(j ? { lat: j.lat, lng: j.lng } : {}); if (!toxta && r.ok) setYuklar(r.natija.yuklar ?? []); };
    void yukla(); const id = setInterval(() => void yukla(), 20000);
    return () => { toxta = true; clearInterval(id); };
  }, [onlayn, faol?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Faol reys: joy yuborish (faqat shu paytda), ekranni yoniq tutish */
  useEffect(() => {
    if (!faol) return;
    let toxta = false; let lock: { release?(): unknown } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request(t: string): PromiseLike<{ release(): unknown }> } }).wakeLock;
    if (wl) { try { wl.request('screen').then((l) => { lock = l; }, () => undefined); } catch { /* ekranni yoniq tutish ixtiyoriy */ } }
    const yubor = async () => { const j = await joyOl(); if (j && !toxta) { setJoy({ lat: j.lat, lng: j.lng }); await ytJoy(faol.id, j.lat, j.lng, j.aniq); } };
    void yubor(); const id = setInterval(() => { if (document.visibilityState === 'visible') void yubor(); }, 20000);
    return () => { toxta = true; clearInterval(id); void lock?.release?.(); };
  }, [faol?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const holatBer = async (on: boolean) => {
    setBand(true);
    const j = on ? await joyOl() : null;
    if (on && !j) toast(t('Joylashuvni yoqing.'), 'warn');
    const r = await ytHolat(on, j ?? undefined);
    setBand(false);
    if (!r.ok) { toast(xabar(r.code), 'danger'); return; }
    if (j) setJoy({ lat: j.lat, lng: j.lng });
    void yangila();
  };

  const qabul = async (y: YaqinYuk) => {
    setBand(true);
    const r = y.narx_rejim === 'qat_iy' ? await ytQabul(y.id, 'bron') : await ytQabul(y.id, 'taklif', Number(narx[y.id]) || undefined);
    setBand(false);
    if (!r.ok) { toast(xabar(r.code), 'danger'); void yangila(); return; }
    toast(y.narx_rejim === 'qat_iy' ? t('Yuk sizniki. Yo‘lga chiqing.') : t('Taklif yuborildi.'), 'ok');
    void yangila();
  };

  if (profil === undefined) return <Sahifa sarlavha={t('Haydovchi')}><p className="p-4 text-text-mute">{t('Yuklanmoqda...')}</p></Sahifa>;
  if (!profil) return <Sahifa sarlavha={t('Haydovchi bo‘lish')}><Royxat onTayyor={yangila} /></Sahifa>;

  const belgilar: XaritaBelgi[] = [
    ...(joy ? [{ id: 'men', lat: joy.lat, lng: joy.lng, yorliq: t('Men'), rang: 'mashina' as const }] : []),
    ...yuklar.filter((y) => y.a_lat != null && y.a_lng != null).map((y) => ({ id: 'y' + y.id, lat: y.a_lat as number, lng: y.a_lng as number, yorliq: y.nom, rang: 'yuk' as const })),
  ];
  const yakunlangan = bronlar.filter((b) => b.holat === 'yetkazildi' || b.holat === 'yopildi');

  return (
    <Sahifa sarlavha={t('Haydovchi')} tavsif={`${profil.ism} · ${profil.reyting_ortacha != null ? '★ ' + profil.reyting_ortacha : t('reytingsiz')}`}>
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-3">
        <button type="button" disabled={band} onClick={() => void holatBer(!onlayn)}
          className={`${KATTA} ${onlayn ? 'bg-green-600 text-white' : 'bg-surface-2 text-text'}`}>{onlayn ? t('Liniyadasiz — oflayn bo‘lish') : t('Liniyaga chiqish')}</button>
        {!onlayn && !faol && <p className="text-[13px] text-text-mute">{t('Liniyaga chiqsangiz, yoningizdagi yuklar ko‘rinadi. Joylashuv faqat reys paytida yuboriladi.')}</p>}

        {faol && <ReysKarta bron={faol} onYangila={yangila} />}
        {profil.tur === 'firma' && <FirmaPaneli reyslar={firmaReyslar} onYangila={yangila} />}

        {onlayn && !faol && (
          <section className="flex flex-col gap-3" aria-label={t('Yaqin yuklar')}>
            <h2 className="text-[15px] font-semibold">{t('Yaqin yuklar')} ({yuklar.length})</h2>
            <TileMap markaz={joy ?? UZ_MARKAZ} zoom={joy ? 9 : UZ_ZOOM} belgilar={belgilar} yorliq={t('Yaqin yuklar xaritasi')} balandlik={220} />
            {yuklar.length === 0 && <p className="text-[13px] text-text-mute">{t('Hozircha yaqin atrofda yuk yo‘q.')}</p>}
            {yuklar.map((y) => (
              <article key={y.id} className="rounded-xl border border-border p-3">
                <div className="flex justify-between gap-2"><b>{y.nom}</b><span className="text-[13px] text-text-mute">{y.joydan_km} {t('km uzoqda')}</span></div>
                <div className="text-[13px]">{y.a_nom ?? '—'} → {y.b_nom ?? '—'}{y.masofa_km != null ? ` · ${y.masofa_km} ${t('km')}` : ''}{y.tonna != null ? ` · ${y.tonna} ${t('t')}` : ''}</div>
                <div className="mt-1 text-[14px]">
                  {y.narx_rejim === 'qat_iy'
                    ? <>{y.narx_taklif_qqs_siz != null ? <b><FmtN val={y.narx_taklif_qqs_siz} /></b> : '—'} <span className="text-[12px] text-text-mute">UZS · {t('QQS siz')}</span></>
                    : <span className="text-text-mute">{t('Narx taklif qilinadi')}</span>}
                </div>
                {y.narx_rejim === 'taklif' && <MoneyInput aria-label={t('Taklif narxi (QQS siz)')} placeholder={t('Narx (QQS siz)')} value={narx[y.id] ?? ''} onValueChange={(v) => setNarx({ ...narx, [y.id]: v })} className="mt-2 h-11 w-full rounded-lg border border-border px-3" />}
                <button type="button" disabled={band} onClick={() => void qabul(y)} className={`${KATTA} mt-2 bg-blue-600 text-white`}>{y.narx_rejim === 'qat_iy' ? t('Qabul qilish') : t('Taklif berish')}</button>
              </article>
            ))}
          </section>
        )}

        <section aria-label={t('Daromad')} className="rounded-xl border border-border p-3">
          <h2 className="text-[15px] font-semibold">{t('Yetkazilgan reyslar')} ({yakunlangan.length})</h2>
          {yakunlangan.length === 0 && <p className="text-[13px] text-text-mute">{t('Hali yetkazilgan reys yo‘q.')}</p>}
          <ul className="mt-1 flex flex-col gap-1 text-[13px]">
            {yakunlangan.map((b) => <li key={b.id} className="flex flex-col gap-1"><div className="flex justify-between gap-2"><span>{b.yuk}</span><span><FmtN val={b.narx_qqs_siz} /> <span className="text-text-mute">{t('QQS siz')}</span></span></div>{!b.baholangan && !b.haydovchi_id && b.mening && <Baho bronId={b.id} />}</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-text-mute">{t('Daromad hisobi: tomonlar kelishgan narx, QQS siz. To‘lov platformada ushlanmaydi — to‘lov holati tomonlar o‘rtasida.')}</p>
        </section>
        <details className="text-[13px] text-text-mute"><summary>{t('Mashinalarim')} ({mashinalar.length})</summary>
          <ul>{mashinalar.map((m) => <li key={m.id}>{m.davlat_raqami} · {m.turi}{m.yuk_t != null ? ` · ${m.yuk_t} ${t('t')}` : ''}</li>)}</ul></details>
      </div>
    </Sahifa>
  );
}

function Royxat({ onTayyor }: { onTayyor: Yangila }) {
  const [f, setF] = useState({ ism: '', telefon: '', davlat_raqami: '', yuk_t: '' });
  const [band, setBand] = useState(false);
  const yubor = async () => {
    setBand(true);
    const r = await ytSaqla({ ism: f.ism.trim(), telefon: f.telefon.trim() || undefined, davlat_raqami: f.davlat_raqami.trim() || undefined, yuk_t: Number(f.yuk_t) || undefined });
    setBand(false);
    if (!r.ok) { toast(xabar(r.code === 'ISM_KERAK' ? 'NETWORK' : r.code), 'danger'); return; }
    await onTayyor();
  };
  const maydon = 'h-12 w-full rounded-lg border border-border px-3 text-[16px]';
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-3">
      <p className="text-[14px]">{t('Mashinangiz bilan yuk tashishni boshlang: ism, telefon, davlat raqami va sig‘im yetarli.')}</p>
      <input className={maydon} placeholder={t('Ism')} value={f.ism} onChange={(e) => setF({ ...f, ism: e.target.value })} />
      <input className={maydon} placeholder={t('Telefon')} inputMode="tel" value={f.telefon} onChange={(e) => setF({ ...f, telefon: e.target.value })} />
      <input className={maydon} placeholder={t('Davlat raqami')} value={f.davlat_raqami} onChange={(e) => setF({ ...f, davlat_raqami: e.target.value })} />
      <input className={maydon} placeholder={t('Sig‘im, tonna')} inputMode="decimal" value={f.yuk_t} onChange={(e) => setF({ ...f, yuk_t: e.target.value })} />
      <button type="button" disabled={band || !f.ism.trim()} onClick={() => void yubor()} className={`${KATTA} bg-blue-600 text-white`}>{t('Haydovchi bo‘lish')}</button>
    </div>
  );
}

function ReysKarta({ bron, onYangila }: { bron: MenikiBron; onYangila: Yangila }) {
  const [qadam, setQadam] = useState<string>(bron.qadam);
  const [band, setBand] = useState(false);
  const [qabulNom, setQabulNom] = useState('');
  const [bekorSabab, setBekorSabab] = useState('');
  const [foto, setFoto] = useState<{ yuklash: boolean; yetkazish: boolean }>({ yuklash: false, yetkazish: false });
  const imzo = useRef<ImzoRef>(null);
  const keyingi = keyingiQadam(qadam);

  const fotoYukla = async (tur: 'yuklash' | 'yetkazish', f: File | null) => {
    if (!f) return;
    setBand(true);
    const y = await ytFaylYukla(f);
    if (!y.ok) { setBand(false); toast(xabar(y.code), 'danger'); return; }
    const d = await ytDalil(bron.id, tur, y.r2_kalit, y.sha256);
    setBand(false);
    if (!d.ok) { toast(xabar(d.code), 'danger'); return; }
    setFoto((p) => ({ ...p, [tur]: true })); toast(t('Foto saqlandi.'), 'ok');
  };
  const bajar = async () => {
    if (!keyingi) return;
    setBand(true);
    let ekstra: { qabul_nom?: string; imzo_r2_kalit?: string } = {};
    if (keyingi === 'yetkazdi') {
      ekstra = { qabul_nom: qabulNom.trim() };
      const blob = await imzo.current?.blob();
      if (blob) { const y = await ytFaylYukla(blob); if (y.ok) ekstra.imzo_r2_kalit = y.r2_kalit; }
    }
    const r = await ytQadam(bron.id, keyingi, ekstra);
    setBand(false);
    if (!r.ok) { toast(xabar(r.code), 'danger'); if (r.code === 'QADAM_TARTIB') void onYangila(); return; }
    setQadam(keyingi); if (keyingi === 'yetkazdi') void onYangila();
  };
  const bekor = async () => { setBand(true); const r = await ytBekor(bron.id, bekorSabab); setBand(false); if (!r.ok) toast(xabar(r.code), 'danger'); else void onYangila(); };

  return (
    <section className="flex flex-col gap-3 rounded-xl border-2 border-blue-600 p-3" aria-label={t('Joriy reys')}>
      <h2 className="text-[15px] font-semibold">{t('Joriy reys')}: {bron.yuk}</h2>
      <div className="text-[13px]">{bron.a_nom ?? '—'} → {bron.b_nom ?? '—'} · <b><FmtN val={bron.narx_qqs_siz} /></b>{' UZS '}<span className="text-text-mute">{t('QQS siz')}</span></div>
      <ol className="flex flex-wrap gap-1 text-[12px]">{(['keldi', 'yuklandi', 'yolda', 'yetkazdi'] as const).map((q) => <li key={q} className={`rounded-full px-2 py-0.5 ${QADAM_NOM.indexOf(q) <= QADAM_NOM.indexOf(qadam as (typeof QADAM_NOM)[number]) ? 'bg-green-600 text-white' : 'bg-surface-2'}`}>{t(QADAM_NOM_UZ[q])}</li>)}</ol>
      {(keyingi === 'yuklandi' || keyingi === 'yolda') && !foto.yuklash && <FotoTugma yorliq={t('Yuklash fotosi')} band={band} onFayl={(f) => void fotoYukla('yuklash', f)} />}
      {keyingi === 'yetkazdi' && (
        <>
          {!foto.yetkazish && <FotoTugma yorliq={t('Yetkazish fotosi')} band={band} onFayl={(f) => void fotoYukla('yetkazish', f)} />}
          <input className="h-12 w-full rounded-lg border border-border px-3 text-[16px]" placeholder={t('Qabul qiluvchi ism-familiyasi')} value={qabulNom} onChange={(e) => setQabulNom(e.target.value)} />
          <ImzoTaxtasi ref={imzo} yorliq={t('Qabul qiluvchi imzosi')} />
        </>
      )}
      {keyingi && <button type="button" disabled={band || (keyingi === 'yetkazdi' && (!qabulNom.trim() || !foto.yetkazish))} onClick={() => void bajar()} className={`${KATTA} bg-blue-600 text-white`}>{t(QADAM_TUGMA[keyingi])}</button>}
      {qadam === 'yetkazdi' && <p className="text-[14px] text-green-700">{t('Yetkazildi. Yuk egasi tasdiqlagach reys yopiladi.')}</p>}
      {(qadam === 'bron' || qadam === 'keldi') && (
        <div className="flex gap-2">
          <select className="h-11 flex-1 rounded-lg border border-border px-2" aria-label={t('Bekor qilish sababi')} value={bekorSabab} onChange={(e) => setBekorSabab(e.target.value)}>
            <option value="">{t('Bekor qilish sababi')}</option>{YT_BEKOR_SABAB.map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </select>
          <button type="button" disabled={band || !bekorSabab} onClick={() => void bekor()} className="h-11 rounded-lg border border-border px-3">{t('Bekor qilish')}</button>
        </div>
      )}
    </section>
  );
}
const QADAM_NOM_UZ: Record<string, string> = { keldi: 'Keldim', yuklandi: 'Yukladim', yolda: 'Yo‘lda', yetkazdi: 'Yetkazdim' };
const QADAM_TUGMA: Record<string, string> = { keldi: 'Yuklash joyiga keldim', yuklandi: 'Yukladim', yolda: 'Yo‘lga chiqdim', yetkazdi: 'Yetkazib berdim' };

function FotoTugma({ yorliq, band, onFayl }: { yorliq: string; band: boolean; onFayl: (f: File | null) => void }) {
  return <label className={`${KATTA} flex cursor-pointer items-center justify-center bg-surface-2 text-center ${band ? 'opacity-50' : ''}`}>📷 {yorliq}
    <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={band} onChange={(e) => onFayl(e.target.files?.[0] ?? null)} /></label>;
}

function Baho({ bronId }: { bronId: number }) {
  const [ball, setBall] = useState(0); const [izoh, setIzoh] = useState(''); const [ok, setOk] = useState(false);
  if (ok) return <p className="text-[13px]">{t('Baho yuborildi.')}</p>;
  return (
    <div className="flex flex-col gap-2"><div className="flex gap-1" role="radiogroup" aria-label={t('Yuk egasini baholang')}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={String(n)} onClick={() => setBall(n)} className={`h-11 w-11 rounded-lg ${n <= ball ? 'bg-amber-400' : 'bg-surface-2'}`}>★</button>)}</div>
      <input className="h-11 rounded-lg border border-border px-3" placeholder={t('Sabab (ixtiyoriy)')} value={izoh} onChange={(e) => setIzoh(e.target.value)} />
      <button type="button" disabled={!ball} onClick={() => void ytBaho(bronId, ball, izoh.trim() || undefined).then((r) => (r.ok ? setOk(true) : toast(xabar(r.code), 'danger')))} className={`${KATTA} bg-blue-600 text-white`}>{t('Baholash')}</button></div>
  );
}

/** Firma: haydovchilar (firma a'zosi, login bo'yicha), mashinalar reestri va reyslarni tayinlash. Firma hamma reysni ko'radi. */
function FirmaPaneli({ reyslar, onYangila }: { reyslar: MenikiBron[]; onYangila: Yangila }) {
  const [haydovchilar, setHaydovchilar] = useState<ParkHaydovchi[]>([]);
  const [mashinalar, setMashinalar] = useState<MashinaQator[]>([]);
  const [login, setLogin] = useState('');
  const [tanla, setTanla] = useState<Record<number, { h?: number; m?: number }>>({});
  const [band, setBand] = useState(false);
  const ol = useCallback(async () => { const r = await ytPark(); if (r.ok) { setHaydovchilar(r.natija.haydovchilar ?? []); setMashinalar(r.natija.mashinalar ?? []); } }, []);
  useEffect(() => { void ol(); }, [ol]);
  const qosh = async () => { setBand(true); const r = await ytHaydovchiQosh(login.trim()); setBand(false); if (!r.ok) { toast(xabar(r.code), 'danger'); return; } setLogin(''); void ol(); };
  const tayinla = async (b: MenikiBron) => {
    const s = tanla[b.id]; if (!s?.h) return;
    setBand(true); const r = await ytTayinla(b.id, s.h, s.m); setBand(false);
    if (!r.ok) { toast(xabar(r.code), 'danger'); return; }
    toast(t('Haydovchi tayinlandi.'), 'ok'); void onYangila();
  };
  const maydon = 'h-11 rounded-lg border border-border px-2';
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-3" aria-label={t('Firma parki')}>
      <h2 className="text-[15px] font-semibold">{t('Firma parki')}</h2>
      <div className="text-[13px]">{t('Haydovchilar')}: {haydovchilar.length === 0 ? '—' : haydovchilar.map((h) => h.ism).join(', ')} · {t('Mashinalar')}: {mashinalar.map((m) => m.davlat_raqami).join(', ') || '—'}</div>
      <div className="flex gap-2"><input className={`${maydon} flex-1`} placeholder={t('Haydovchi logini (firma a‘zosi)')} value={login} onChange={(e) => setLogin(e.target.value)} />
        <button type="button" disabled={band || !login.trim()} onClick={() => void qosh()} className="h-11 rounded-lg border border-border px-3">{t('Qo‘shish')}</button></div>
      {reyslar.length === 0 && <p className="text-[13px] text-text-mute">{t('Firma reyslari hozircha yo‘q.')}</p>}
      {reyslar.map((b) => (
        <article key={b.id} className="rounded-lg border border-border p-2 text-[13px]">
          <div className="flex justify-between gap-2"><b>{b.yuk}</b><span>{b.holat}</span></div>
          <div>{b.a_nom ?? '—'} → {b.b_nom ?? '—'}</div>
          {b.haydovchi ? <div className="text-text-mute">{t('Haydovchi')}: {b.haydovchi} · {b.qadam}</div>
            : (b.holat === 'bron' && (b.qadam === 'bron' || b.qadam === 'keldi')) && (
              <div className="mt-1 flex flex-wrap gap-2">
                <select className={maydon} aria-label={t('Haydovchi')} value={tanla[b.id]?.h ?? ''} onChange={(e) => setTanla({ ...tanla, [b.id]: { ...tanla[b.id], h: Number(e.target.value) || undefined } })}><option value="">{t('Haydovchi')}</option>{haydovchilar.map((h) => <option key={h.foydalanuvchi_id} value={h.foydalanuvchi_id}>{h.ism}</option>)}</select>
                <select className={maydon} aria-label={t('Mashina')} value={tanla[b.id]?.m ?? ''} onChange={(e) => setTanla({ ...tanla, [b.id]: { ...tanla[b.id], m: Number(e.target.value) || undefined } })}><option value="">{t('Mashina')}</option>{mashinalar.filter((m) => m.holat === 'faol').map((m) => <option key={m.id} value={m.id}>{m.davlat_raqami}</option>)}</select>
                <button type="button" disabled={band || !tanla[b.id]?.h} onClick={() => void tayinla(b)} className="h-11 rounded-lg bg-blue-600 px-3 text-white">{t('Tayinlash')}</button>
              </div>)}
        </article>
      ))}
    </section>
  );
}