/**
 * Bozor — sotuvchi kabineti (telefonda ham qulay): mening e'lonlarim (tez e'lon: nom + narx + birlik + rasm), ochiq so'rovlar (taklif berish),
 * mening takliflarim, buyurtmalarim (yetkazildi -> baho). Sotuvchi kompaniyasiz (yakka) bo'lishi mumkin. Narx QQS siz.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { qatorSumma } from '../../lib/hisob-yadro';
import {
  bzBaho, bzElonHolat, bzElonSaqla, bzKabinet, bzProfilOl, bzProfilSaqla, bzRasmUrl, bzRasmYukla, bzSorovOchiq, bzTaklifBer, bzYetkazildi,
  type MeningBuyurtma, type MeningElon, type MeningTaklif, type OchiqSorov, type Profil,
} from '../../api/t2-bozor';
import { BIRLIKLAR, ELON_TURLARI, HUDUDLAR, KATEGORIYALAR, type ElonTur } from '../../lib/bozor/katalog';
import { yetkazishHavolasi } from '../../lib/bozor/havola';

type AmalNatija = Promise<{ ok: boolean; code?: string }>;
const maydon = 'h-12 w-full rounded-lg border border-border px-3 text-[16px]';
const tugma = 'flex min-h-[48px] items-center justify-center rounded-xl px-4 text-[16px] font-semibold';
const XATO: Record<string, string> = {
  NARX_KERAK: 'Narx kiriting (QQS siz).', NARX_NOTOGRI: 'Narx noto‘g‘ri.', TAQIQLANGAN_SOZ: 'Matnda taqiqlangan so‘z bor.', SARLAVHA_KERAK: 'Nom kamida 3 belgi bo‘lsin.',
  BIRLIK_KERAK: 'Birlikni tanlang.', PROFIL_KERAK: 'Avval profilingizni saqlang.', YASHIRIN: 'Bu e‘lon moderator tomonidan yashirilgan.', OZ_SOROVINGIZ: 'O‘z kompaniyangiz so‘roviga taklif berib bo‘lmaydi.',
  SOROV_YOPIQ: 'So‘rov yopilgan.', RASM_NOTOGRI: 'Rasm noto‘g‘ri.', BLOKLANGAN: 'Profil bloklangan.', HAJM_NOTOGRI: 'Rasm 2 MB dan kichik bo‘lsin.', TUR_NOTOGRI: 'Rasm JPG, PNG yoki WEBP bo‘lsin.',
};
const xabar = (c: string) => t(XATO[c] ?? 'Bajarib bo‘lmadi. Qayta urinib ko‘ring.');

function ProfilForma({ boshlangich, onSaqla }: { boshlangich: Profil | null; onSaqla: () => void }) {
  const [nom, setNom] = useState(boshlangich?.nom ?? '');
  const [tur, setTur] = useState(boshlangich?.tur ?? 'yakka');
  const [telefon, setTelefon] = useState(boshlangich?.telefon ?? '');
  const [hudud, setHudud] = useState(boshlangich?.hudud ?? '');
  const [band, setBand] = useState(false);
  const saqla = async () => {
    setBand(true);
    const r = await bzProfilSaqla({ nom, tur, telefon: telefon || undefined, hudud: hudud || undefined, kompaniya_id: boshlangich?.kompaniya_id ?? null });
    setBand(false);
    if (r.ok) { toast(t('Profil saqlandi.'), 'ok'); onSaqla(); } else toast(xabar(r.code), 'warn');
  };
  return (
    <div className="flex max-w-md flex-col gap-2">
      <p className="text-[14px] text-text-mute">{t('Sotuvchi sifatida ko‘rinish uchun qisqa profil: faqat nom va hudud ochiq ko‘rinadi, telefon yashirin.')}</p>
      <input className={maydon} aria-label={t('Nom yoki ism')} placeholder={t('Nom yoki ism')} value={nom} onChange={(e) => setNom(e.target.value)} />
      <select className={maydon} aria-label={t('Kim')} value={tur} onChange={(e) => setTur(e.target.value as Profil['tur'])}>
        <option value="yakka">{t('Yakka shaxs')}</option><option value="usta">{t('Usta / brigada')}</option><option value="firma">{t('Firma')}</option>
      </select>
      <select className={maydon} aria-label={t('Hudud')} value={hudud} onChange={(e) => setHudud(e.target.value)}><option value="">{t('Hudud')}</option>{HUDUDLAR.map((h) => <option key={h}>{h}</option>)}</select>
      <input className={maydon} inputMode="tel" aria-label={t('Telefon')} placeholder={t('Telefon (ixtiyoriy)')} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
      <button type="button" disabled={band || nom.trim().length < 2} onClick={() => void saqla()} className={`${tugma} bg-blue-600 text-white`}>{t('Saqlash')}</button>
    </div>
  );
}

function TezElon({ onYaratildi }: { onYaratildi: () => void }) {
  const [tur, setTur] = useState<ElonTur>('tovar');
  const [sarlavha, setSarlavha] = useState('');
  const [narx, setNarx] = useState('');
  const [birlik, setBirlik] = useState('dona');
  const [kat, setKat] = useState('');
  const [hudud, setHudud] = useState('');
  const [qqsBor, setQqsBor] = useState(true);
  const [rasmlar, setRasmlar] = useState<string[]>([]);
  const [band, setBand] = useState(false);
  const rasmTanla = async (f: File | undefined) => {
    if (!f) return;
    setBand(true);
    const r = await bzRasmYukla(f);
    setBand(false);
    if (r.ok) setRasmlar((x) => [...x, r.natija.r2_kalit].slice(0, 8)); else toast(xabar(r.code), 'warn');
  };
  const yubor = async (faol: boolean) => {
    setBand(true);
    const r = await bzElonSaqla({ tur, sarlavha, narx_qqs_siz: narx || null, birlik, kategoriya: kat || undefined, hudud: hudud || undefined, qqs_bor: qqsBor, rasmlar, holat: faol ? 'faol' : 'qoralama' });
    setBand(false);
    if (!r.ok) { toast(xabar(r.code), 'warn'); return; }
    toast(faol ? t('E‘lon bozorda ko‘rinadi.') : t('Qoralama saqlandi.'), 'ok');
    setSarlavha(''); setNarx(''); setRasmlar([]); onYaratildi();
  };
  return (
    <div className="flex max-w-md flex-col gap-2 rounded-xl border border-border p-3">
      <h2 className="text-[17px] font-semibold">{t('Tez e‘lon')}</h2>
      <div className="flex gap-1">{ELON_TURLARI.map((x) => <button key={x.kalit} type="button" onClick={() => { setTur(x.kalit); setKat(''); setBirlik(x.kalit === 'ijara' ? 'soat' : x.kalit === 'xizmat' ? 'm2' : 'dona'); }} className={`h-11 flex-1 rounded-lg border text-[14px] ${tur === x.kalit ? 'border-blue-600 font-semibold' : 'border-border'}`}>{t(x.nom)}</button>)}</div>
      <input className={maydon} aria-label={t('Nom')} placeholder={t('Nom (masalan: M400 sement, 50 kg)')} value={sarlavha} onChange={(e) => setSarlavha(e.target.value)} />
      <div className="flex gap-2">
        <MoneyInput className={maydon} aria-label={t('Narx (QQS siz)')} placeholder={t('Narx (QQS siz)')} value={narx} onValueChange={setNarx} />
        <select className="h-12 w-28 shrink-0 rounded-lg border border-border px-2" aria-label={t('Birlik')} value={birlik} onChange={(e) => setBirlik(e.target.value)}>{BIRLIKLAR.map((b) => <option key={b}>{b}</option>)}</select>
      </div>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={qqsBor} onChange={(e) => setQqsBor(e.target.checked)} />{t('QQS to‘lovchiman (narxga QQS alohida qo‘shiladi)')}</label>
      <select className={maydon} aria-label={t('Kategoriya')} value={kat} onChange={(e) => setKat(e.target.value)}><option value="">{t('Kategoriya')}</option>{KATEGORIYALAR.filter((k) => k.tur === tur).map((k) => <option key={k.kalit} value={k.kalit}>{t(k.nom)}</option>)}</select>
      <select className={maydon} aria-label={t('Hudud')} value={hudud} onChange={(e) => setHudud(e.target.value)}><option value="">{t('Hudud')}</option>{HUDUDLAR.map((h) => <option key={h}>{h}</option>)}</select>
      <div className="flex flex-wrap items-center gap-2">
        {rasmlar.map((k) => <img key={k} src={bzRasmUrl(k)} alt="" className="h-14 w-14 rounded object-cover" />)}
        <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border border-dashed border-border text-[24px]" aria-label={t('Rasm qo‘shish')}>+<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => { void rasmTanla(e.target.files?.[0]); e.target.value = ''; }} /></label>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={band || sarlavha.trim().length < 3} onClick={() => void yubor(false)} className={`${tugma} flex-1 border border-border`}>{t('Qoralama')}</button>
        <button type="button" disabled={band || sarlavha.trim().length < 3 || !narx} onClick={() => void yubor(true)} className={`${tugma} flex-1 bg-blue-600 text-white`}>{t('E‘lon berish')}</button>
      </div>
    </div>
  );
}

function ElonQator({ e, yangila }: { e: MeningElon; yangila: () => void }) {
  const ozgartir = async (h: 'faol' | 'toxtatilgan') => { const r = await bzElonHolat(e.id, h); if (r.ok) yangila(); else toast(xabar(r.code), 'warn'); };
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border p-2">
      {e.rasmlar[0] ? <img src={bzRasmUrl(e.rasmlar[0])} alt="" className="h-14 w-14 rounded object-cover" /> : <div className="h-14 w-14 rounded bg-surface-2" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{e.sarlavha}</span>
        <span className="text-[13px] text-text-mute"><FmtN val={e.narx_qqs_siz} /> / {e.birlik} · {t(e.holat === 'faol' ? 'Faol' : e.holat === 'yashirin' ? 'Yashirilgan' : e.holat === 'toxtatilgan' ? 'To‘xtatilgan' : 'Qoralama')}{e.shikoyat_soni ? ` · ${t('shikoyat')}: ${e.shikoyat_soni}` : ''}</span>
        {e.yashirin_sabab && <span className="text-[12px] text-warn">{e.yashirin_sabab}</span>}
      </div>
      {e.holat === 'faol' && <button type="button" onClick={() => void ozgartir('toxtatilgan')} className="h-11 rounded-lg border border-border px-3 text-[14px]">{t('To‘xtatish')}</button>}
      {(e.holat === 'toxtatilgan' || e.holat === 'qoralama') && <button type="button" onClick={() => void ozgartir('faol')} className="h-11 rounded-lg border border-blue-600 px-3 text-[14px]">{t('Faollashtirish')}</button>}
      {e.holat === 'faol' && <Link to={`/bozor/e/${e.id}`} className="text-[13px] underline">{t('Ko‘rish')}</Link>}
    </li>
  );
}

function SorovQator({ s, yangila }: { s: OchiqSorov; yangila: () => void }) {
  const [narx, setNarx] = useState(s.mening_narxim != null ? String(s.mening_narxim) : '');
  const [muddat, setMuddat] = useState('');
  const [yetk, setYetk] = useState(false);
  const [band, setBand] = useState(false);
  const yubor = async () => {
    setBand(true);
    const r = await bzTaklifBer({ sorov_id: s.id, narx_qqs_siz: narx, muddat_kun: muddat ? Number(muddat) : undefined, yetkazish: yetk });
    setBand(false);
    if (r.ok) { toast(t('Taklif yuborildi.'), 'ok'); yangila(); } else toast(xabar(r.code), 'warn');
  };
  const jami = qatorSumma(s.hajm, narx ? Number(narx) : null);
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <span className="font-semibold">{s.nom}</span>
      <span className="text-[13px] text-text-mute"><FmtN val={s.hajm} /> {s.birlik}{s.hudud ? ` · ${s.hudud}` : ''}{s.muddat_sana ? ` · ${s.muddat_sana}` : ''} · {t('takliflar')}: {s.taklif_soni}</span>
      <div className="flex gap-2">
        <MoneyInput className={maydon} aria-label={t('Narx (QQS siz)')} placeholder={`${t('Narx (QQS siz)')} / ${s.birlik}`} value={narx} onValueChange={setNarx} />
        <input className="h-12 w-24 shrink-0 rounded-lg border border-border px-2" type="number" min={0} aria-label={t('Muddat (kun)')} placeholder={t('kun')} value={muddat} onChange={(e) => setMuddat(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={yetk} onChange={(e) => setYetk(e.target.checked)} />{t('Yetkazib beraman')}</label>
      {jami != null && <span className="text-[13px] text-text-mute">{t('Jami (QQS siz)')}: <FmtN val={jami} /></span>}
      <button type="button" disabled={band || !narx} onClick={() => void yubor()} className={`${tugma} bg-blue-600 text-white`}>{s.mening_narxim != null ? t('Taklifni yangilash') : t('Taklif berish')}</button>
    </li>
  );
}

function BuyurtmaQator({ b, yangila }: { b: MeningBuyurtma; yangila: () => void }) {
  const amal = async (f: () => AmalNatija, ok: string) => { const r = await f(); if (r.ok) { toast(t(ok), 'ok'); yangila(); } else toast(xabar(r.code ?? ''), 'warn'); };
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <span className="font-semibold">{b.nom}</span>
      <span className="text-[13px] text-text-mute"><FmtN val={b.hajm} /> {b.birlik} × <FmtN val={b.narx_qqs_siz} /> = <FmtN val={qatorSumma(b.hajm, b.narx_qqs_siz)} /> ({t('QQS siz')}) · {t(b.holat === 'tanlandi' ? 'Tanlandi' : b.holat === 'yetkazildi' ? 'Yetkazildi' : b.holat === 'qabul_qilindi' ? 'Qabul qilindi' : b.holat)}</span>
      <div className="flex flex-wrap gap-2">
        {b.holat === 'tanlandi' && <button type="button" onClick={() => void amal(() => bzYetkazildi(b.id), 'Yetkazildi deb belgilandi.')} className={`${tugma} bg-blue-600 text-white`}>{t('Yetkazib berdim')}</button>}
        {b.holat === 'tanlandi' && <Link to={yetkazishHavolasi({ nom: b.nom, hajm: b.hajm, birlik: b.birlik, hudud: b.hudud })} className={`${tugma} border border-border`}>{t('Mashina chaqirish')}</Link>}
        {b.holat === 'qabul_qilindi' && !b.baholangan && [5, 4, 3, 2, 1].map((n) => <button key={n} type="button" onClick={() => void amal(() => bzBaho(b.id, n), 'Baho yuborildi.')} className="h-11 w-11 rounded-lg border border-border">{n}★</button>)}
      </div>
    </li>
  );
}

export default function BozorKabinet() {
  const [profil, setProfil] = useState<Profil | null | undefined>(undefined);
  const [tab, setTab] = useState<'elon' | 'sorov' | 'taklif' | 'buyurtma'>('elon');
  const [elonlar, setElonlar] = useState<MeningElon[]>([]);
  const [takliflar, setTakliflar] = useState<MeningTaklif[]>([]);
  const [buyurtmalar, setBuyurtmalar] = useState<MeningBuyurtma[]>([]);
  const [sorovlar, setSorovlar] = useState<OchiqSorov[]>([]);
  const [xato, setXato] = useState('');
  const yukla = useCallback(async () => {
    const p = await bzProfilOl();
    if (!p.ok) { setXato(p.code); setProfil(null); return; }
    setProfil(p.natija.profil);
    if (!p.natija.profil) return;
    const [k, s] = await Promise.all([bzKabinet(), bzSorovOchiq()]);
    if (k.ok) { setElonlar(k.natija.elonlar); setTakliflar(k.natija.takliflar); setBuyurtmalar(k.natija.buyurtmalar); }
    if (s.ok) setSorovlar(s.natija.sorovlar);
  }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  if (profil === undefined) return <Sahifa sarlavha={t('Bozor kabineti')}><p className="p-4 text-text-mute">{t('Yuklanmoqda…')}</p></Sahifa>;
  if (xato) return <Sahifa sarlavha={t('Bozor kabineti')}><p className="p-4" role="alert">{t('Kabinet ochilmadi. Hisobga kirganingizni tekshiring.')}</p></Sahifa>;
  if (!profil) return <Sahifa sarlavha={t('Bozor kabineti')}><div className="p-4"><ProfilForma boshlangich={null} onSaqla={() => void yukla()} /></div></Sahifa>;
  const tabs: Array<[typeof tab, string, number]> = [['elon', 'E‘lonlarim', elonlar.length], ['sorov', 'Ochiq so‘rovlar', sorovlar.length], ['taklif', 'Takliflarim', takliflar.length], ['buyurtma', 'Buyurtmalarim', buyurtmalar.length]];
  return (
    <Sahifa sarlavha={t('Bozor kabineti')} tavsif={t('E‘lon bering, so‘rovlarga narx taklif qiling, buyurtmalarni yuriting.')}>
      <div className="flex flex-col gap-3 p-2">
        <div role="tablist" className="flex flex-wrap gap-1">
          {tabs.map(([k, nom, n]) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`h-11 rounded-lg border px-3 text-[14px] ${tab === k ? 'border-blue-600 font-semibold' : 'border-border'}`}>{t(nom)} ({n})</button>)}
          <Link to="/bozor" className="flex h-11 items-center rounded-lg border border-border px-3 text-[14px]">{t('Vitrina')}</Link>
        </div>
        {tab === 'elon' && (<>
          <TezElon onYaratildi={() => void yukla()} />
          <ul className="flex flex-col gap-2">{elonlar.map((e) => <ElonQator key={e.id} e={e} yangila={() => void yukla()} />)}</ul>
          <details><summary className="cursor-pointer text-[14px] text-text-mute">{t('Profilni tahrirlash')}</summary><div className="pt-2"><ProfilForma boshlangich={profil} onSaqla={() => void yukla()} /></div></details>
        </>)}
        {tab === 'sorov' && (sorovlar.length ? <ul className="flex flex-col gap-2">{sorovlar.map((s) => <SorovQator key={`${s.id}:${s.mening_narxim}`} s={s} yangila={() => void yukla()} />)}</ul> : <p className="text-text-mute">{t('Hozircha ochiq so‘rov yo‘q.')}</p>)}
        {tab === 'taklif' && (takliflar.length ? <ul className="flex flex-col gap-2">{takliflar.map((x) => <li key={x.id} className="rounded-xl border border-border p-3 text-[14px]"><b>{x.sorov_nom}</b> — <FmtN val={x.narx_qqs_siz} /> / {x.birlik} ({t(x.holat === 'tanlandi' ? 'Tanlandi' : x.holat === 'rad' ? 'Rad etildi' : 'Yuborildi')})</li>)}</ul> : <p className="text-text-mute">{t('Hali taklif bermadingiz.')}</p>)}
        {tab === 'buyurtma' && (buyurtmalar.length ? <ul className="flex flex-col gap-2">{buyurtmalar.map((b) => <BuyurtmaQator key={b.id} b={b} yangila={() => void yukla()} />)}</ul> : <p className="text-text-mute">{t('Hali buyurtma yo‘q.')}</p>)}
      </div>
    </Sahifa>
  );
}
