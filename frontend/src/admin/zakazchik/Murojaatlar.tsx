/**
 * Murojaatlar.tsx — /admin/murojaatlar. Tomonlar orasidagi remark / predpisaniya / ekspertiza izohi / mualliflik remarki /
 * savol / sinov so'rovi / yetkazish talabi: yozildi → ijrochi BAJARDI (dalil bilan) → yozgan tomon YOPDI yoki QAYTA OCHDI
 * (raund oshadi). Asl murojaat va jurnal o'zgarmaydi. Dalil fayllari R2 reyestridan (nusxalanmaydi). Ruxsat serverda.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { sbLoyihaUmumiy } from '../../api/t2-loyiha';
import { hujjatYukla, hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import {
  aloqalarOl, murojaatBekor, murojaatHujjat, murojaatJavob, murojaatQarori, murojaatTafsilotOl, murojaatTurlariOl, murojaatYarat, murojaatlarOl, zakazchikObyektlarOl,
  type Aloqa, type Muhimlik, type MurojaatQisqa, type MurojaatTafsilot, type MurojaatTuri, type ZakazchikObyekt,
} from '../../api/t2-tomon';
import { t, tilOl } from '../../i18n/til';
import { Bolim } from './tomon-ui';
import { HODISA_NOMI, inp, sana, tugma, tugmaAsosiy } from './tomon-yordam';

const MUHIMLIK: Muhimlik[] = ['past', 'oddiy', 'yuqori', 'kritik'];
const MUHIMLIK_NOMI: Record<Muhimlik, string> = { past: 'Past', oddiy: 'Oddiy', yuqori: 'Yuqori', kritik: 'Kritik' };
const HOLAT_NOMI: Record<string, string> = { ochiq: 'Ochiq', bajarildi: 'Bajarildi — tekshiruv kutilmoqda', yopildi: 'Yopildi', bekor: 'Bekor qilingan' };
const MUR_HODISA: Record<string, string> = { murojaat: 'Murojaat yozildi', murojaat_javob: 'Bajarildi (javob)', murojaat_dalil: 'Dalil biriktirildi', murojaat_yopildi: 'Yopildi', murojaat_qayta: 'Qayta ochildi', murojaat_bekor: 'Bekor qilindi' };
const turNomi = (k: string, turlar: readonly MurojaatTuri[]) => { const x = turlar.find((q) => q.kalit === k); return !x ? k : (tilOl() === 'ru' && x.nom_ru) ? x.nom_ru : x.nom; };

function Yaratish({ kompaniyaId, aloqalar, turlar, onYaratildi }: { kompaniyaId: number; aloqalar: Aloqa[]; turlar: MurojaatTuri[]; onYaratildi: () => void }) {
  const faol = aloqalar.filter((a) => a.holat === 'faol');
  const [aloqaId, setAloqaId] = useState<number | ''>('');
  const [turi, setTuri] = useState('remark');
  const [sarlavha, setSarlavha] = useState('');
  const [matn, setMatn] = useState('');
  const [muhimlik, setMuhimlik] = useState<Muhimlik>('oddiy');
  const [muddat, setMuddat] = useState('');
  const [joy, setJoy] = useState('');
  const [obyektId, setObyektId] = useState<number | ''>('');
  const [oz, setOz] = useState<T2Obyekt[]>([]);
  const [ochilgan, setOchilgan] = useState<ZakazchikObyekt[]>([]);
  const [band, setBand] = useState(false);
  useEffect(() => {
    void sbT2ObyektlarOlKomp(kompaniyaId).then((r) => setOz((r.ok ? r.qatorlar ?? [] : []) as T2Obyekt[]));
    void zakazchikObyektlarOl(kompaniyaId).then((r) => setOchilgan(r.ok ? r.natija : []));
  }, [kompaniyaId]);
  useEffect(() => { if (aloqaId === '' && faol.length === 1) setAloqaId(faol[0].id); }, [faol, aloqaId]);
  const obyektlar = useMemo(() => [
    ...oz.map((o) => ({ id: o.id, nom: o.nom })),
    ...ochilgan.filter((o) => aloqaId === '' || o.aloqa_id === aloqaId).map((o) => ({ id: o.obyekt_id, nom: `${o.obyekt_nom} (${o.qarshi_nom})` })),
  ], [oz, ochilgan, aloqaId]);
  const yubor = async () => {
    if (aloqaId === '') return;
    setBand(true);
    const r = await murojaatYarat(kompaniyaId, { aloqaId, turi, sarlavha, matn, muhimlik, muddat, joy, obyektId: obyektId === '' ? null : obyektId });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Murojaat yuborildi'), 'ok'); setSarlavha(''); setMatn(''); setJoy(''); setMuddat(''); onYaratildi();
  };
  if (!faol.length) return <p className="text-sm text-text-dim">{t('Murojaat yozish uchun avval faol aloqa kerak (Tomonlar aloqasi).')}</p>;
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <label className="text-xs text-text-dim">{t('Kimga / kim bilan')}
        <select className={`${inp} mt-1 block w-full`} value={aloqaId} onChange={(e) => setAloqaId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('— tanlang —')}</option>{faol.map((a) => <option key={a.id} value={a.id}>{a.qarshi_nom} ({a.qarshi_rol})</option>)}</select></label>
      <label className="text-xs text-text-dim">{t('Turi')}
        <select className={`${inp} mt-1 block w-full`} value={turi} onChange={(e) => setTuri(e.target.value)}>{turlar.map((x) => <option key={x.kalit} value={x.kalit}>{turNomi(x.kalit, turlar)}</option>)}</select></label>
      <label className="text-xs text-text-dim">{t('Muhimlik')}
        <select className={`${inp} mt-1 block w-full`} value={muhimlik} onChange={(e) => setMuhimlik(e.target.value as Muhimlik)}>{MUHIMLIK.map((m) => <option key={m} value={m}>{t(MUHIMLIK_NOMI[m])}</option>)}</select></label>
      <label className="text-xs text-text-dim">{t('Muddat')}<input type="date" className={`${inp} mt-1 block w-full`} value={muddat} onChange={(e) => setMuddat(e.target.value)} /></label>
      <label className="text-xs text-text-dim md:col-span-2">{t('Sarlavha')}<input className={`${inp} mt-1 block w-full`} value={sarlavha} onChange={(e) => setSarlavha(e.target.value)} placeholder={t('masalan: Poydevor betoni sinfi mos emas')} /></label>
      <label className="text-xs text-text-dim">{t('Obyekt')}
        <select className={`${inp} mt-1 block w-full`} value={obyektId} onChange={(e) => setObyektId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('— obyektsiz —')}</option>{obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select></label>
      <label className="text-xs text-text-dim">{t('Joy (qavat, o‘q, uchastka)')}<input className={`${inp} mt-1 block w-full`} value={joy} onChange={(e) => setJoy(e.target.value)} /></label>
      <label className="text-xs text-text-dim md:col-span-3">{t('Tavsif')}<textarea className={`${inp} mt-1 block h-16 w-full`} value={matn} onChange={(e) => setMatn(e.target.value)} /></label>
      <div className="flex items-end"><button type="button" className={tugmaAsosiy} disabled={band || aloqaId === '' || sarlavha.trim().length < 3} onClick={() => void yubor()}>{t('Murojaat yuborish')}</button></div>
    </div>
  );
}

function Tafsilot({ kompaniyaId, id, turlar, yangila }: { kompaniyaId: number; id: number; turlar: MurojaatTuri[]; yangila: () => void }) {
  const [d, setD] = useState<MurojaatTafsilot | null>(null);
  const [matn, setMatn] = useState('');
  const [fayllar, setFayllar] = useState<File[]>([]);
  const [band, setBand] = useState(false);
  const ol = useCallback(async () => { const r = await murojaatTafsilotOl(kompaniyaId, id); if (r.ok) setD(r.natija); else toast(r.error, 'danger'); }, [kompaniyaId, id]);
  useEffect(() => { setD(null); setMatn(''); setFayllar([]); void ol(); }, [ol]);
  if (!d) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  const m = d.murojaat;

  /** Fayllarni R2 ga yuklaydi (kompaniyaning birinchi loyihasi ostida) va hujjat ID larini qaytaradi. */
  async function yukla(): Promise<number[] | null> {
    if (!fayllar.length) return [];
    const lr = await sbLoyihaUmumiy(kompaniyaId);
    if (!lr.ok || !lr.id) { toast(lr.error || t('Fayl uchun loyiha topilmadi'), 'danger'); return null; }
    const loyiha = { id: lr.id };
    const idlar: number[] = [];
    for (const file of fayllar) {
      const r = await hujjatYukla({ file, kompaniyaId, loyihaId: loyiha.id, documentType: 'murojaat_dalil' });
      if (!r.ok) { toast(r.xato || t('Fayl yuklanmadi'), 'danger'); return null; }
      idlar.push(r.data.document_id);
    }
    return idlar;
  }
  const javob = async () => {
    setBand(true);
    const idlar = await yukla();
    if (idlar == null) { setBand(false); return; }
    const r = await murojaatJavob(kompaniyaId, m.id, matn, idlar); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Bajarildi deb belgilandi'), 'ok'); setMatn(''); setFayllar([]); yangila(); void ol();
  };
  const dalilQosh = async () => {
    setBand(true); const idlar = await yukla();
    if (idlar == null) { setBand(false); return; }
    for (const x of idlar) { const r = await murojaatHujjat(kompaniyaId, m.id, x); if (!r.ok) { toast(r.error, 'danger'); break; } }
    setBand(false); setFayllar([]); void ol();
  };
  const qaror = async (q: 'yopish' | 'qayta_ochish') => {
    if (q === 'qayta_ochish' && matn.trim().length < 3) { toast(t('Qayta ochish sababini yozing'), 'danger'); return; }
    setBand(true); const r = await murojaatQarori(kompaniyaId, m.id, q, matn); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    setMatn(''); yangila(); void ol();
  };
  const bekor = async () => { setBand(true); const r = await murojaatBekor(kompaniyaId, m.id, matn); setBand(false); if (!r.ok) toast(r.error, 'danger'); else { yangila(); void ol(); } };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm"><b>{m.sarlavha}</b>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">{turNomi(m.turi, turlar)}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">{t(HOLAT_NOMI[m.holat] ?? m.holat)}{m.raund > 1 ? ` · ${t('raund')} ${m.raund}` : ''}</span></div>
      <div className="text-xs text-text-dim">{m.beruvchi_nom} → {m.ijrochi_nom}{m.obyekt_nom ? ` · ${m.obyekt_nom}` : ''}{m.joy ? ` · ${m.joy}` : ''}{m.muddat ? ` · ${t('muddat')}: ${m.muddat}` : ''} · {t(MUHIMLIK_NOMI[m.muhimlik])}</div>
      {m.matn && <p className="whitespace-pre-wrap rounded border border-border px-2 py-1.5 text-sm">{m.matn}</p>}
      {m.javob_matn && <p className="whitespace-pre-wrap rounded border border-ok/40 bg-ok/5 px-2 py-1.5 text-sm"><b>{t('Javob')}:</b> {m.javob_matn}</p>}
      {m.yopish_izoh && <p className="text-xs text-text-dim">{t('Yopish izohi')}: {m.yopish_izoh}</p>}

      <div>
        <div className="text-xs font-semibold">{t('Dalil fayllari')} ({d.hujjatlar.length})</div>
        <ul className="mt-1 space-y-0.5">{d.hujjatlar.map((h) => (
          <li key={h.document_id} className="text-xs"><a className="text-accent underline" href={hujjatYuklabOlishUrl(h.document_id)}><Paperclip size={11} className="mr-1 inline" />{h.fayl ?? `#${h.document_id}`}</a>
            <span className="text-text-dim"> · {h.kompaniya_nom} · {t('raund')} {h.raund}</span></li>))}</ul>
      </div>

      <div>
        <div className="text-xs font-semibold">{t('Tarix')}</div>
        <ul className="mt-1 max-h-44 space-y-0.5 overflow-auto">{d.hodisalar.map((h) => (
          <li key={h.id} className={`text-xs ${h.meni ? 'text-text' : 'text-text-dim'}`}><span className="tabular-nums">{sana(h.vaqt)}</span> · {h.kompaniya_nom ?? '—'} · <b>{t(MUR_HODISA[h.tur] ?? HODISA_NOMI[h.tur] ?? h.tur)}</b>{h.matn ? ` — ${h.matn}` : ''}</li>))}</ul>
      </div>

      {(m.holat === 'ochiq' || m.holat === 'bajarildi') && (
        <div className="space-y-2 rounded border border-border p-2">
          <textarea className={`${inp} block h-16 w-full`} value={matn} onChange={(e) => setMatn(e.target.value)}
            placeholder={m.menga && m.holat === 'ochiq' ? t('Nima qilindi? (majburiy)') : t('Izoh / sabab')} />
          <input type="file" multiple className="block text-xs" onChange={(e) => setFayllar(Array.from(e.target.files ?? []))} aria-label={t('Dalil fayllari')} />
          <div className="flex flex-wrap gap-2">
            {m.menga && m.holat === 'ochiq' && <button type="button" className={tugmaAsosiy} disabled={band || matn.trim().length < 3} onClick={() => void javob()}>{t('Bajarildi')}</button>}
            {fayllar.length > 0 && <button type="button" className={tugma} disabled={band} onClick={() => void dalilQosh()}>{t('Faqat dalil qo‘shish')}</button>}
            {m.men_beruvchiman && m.holat === 'bajarildi' && <>
              <button type="button" className={tugmaAsosiy} disabled={band} onClick={() => void qaror('yopish')}>{t('Qabul qilish va yopish')}</button>
              <button type="button" className={tugma} disabled={band} onClick={() => void qaror('qayta_ochish')}>{t('Qayta ochish')}</button></>}
            {m.men_beruvchiman && m.holat === 'ochiq' && <button type="button" className={tugma} disabled={band} onClick={() => void bekor()}>{t('Bekor qilish')}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Murojaatlar() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [yonalish, setYonalish] = useState<'menga' | 'mendan'>('menga');
  const [holat, setHolat] = useState('');
  const [royxat, setRoyxat] = useState<MurojaatQisqa[]>([]);
  const [aloqalar, setAloqalar] = useState<Aloqa[]>([]);
  const [turlar, setTurlar] = useState<MurojaatTuri[]>([]);
  const [tanlangan, setTanlangan] = useState<number | null>(null);
  const [xato, setXato] = useState('');

  const yukla = useCallback(async () => {
    if (!kompaniyaId) return;
    const r = await murojaatlarOl(kompaniyaId, { yonalish, holat: holat || undefined });
    if (!r.ok) { setXato(r.error); return; }
    setXato(''); setRoyxat(r.natija);
  }, [kompaniyaId, yonalish, holat]);
  useEffect(() => { void yukla(); }, [yukla]);
  useEffect(() => {
    if (!kompaniyaId) return;
    void aloqalarOl(kompaniyaId).then((r) => { if (r.ok) setAloqalar(r.natija); });
    void murojaatTurlariOl(kompaniyaId).then((r) => { if (r.ok) setTurlar(r.natija); });
  }, [kompaniyaId]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Murojaatlar" />;
  return (
    <Sahifa sarlavha="Murojaatlar" tavsif="Remark, predpisaniya, savol va sinov so‘rovlari: yozing → ijrochi bajaradi va dalil qo‘yadi → siz yopasiz yoki qayta ochasiz">
      <div className="space-y-3">
        <Bolim sarlavha="Yangi murojaat"><Yaratish kompaniyaId={kompaniyaId} aloqalar={aloqalar} turlar={turlar} onYaratildi={() => void yukla()} /></Bolim>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded border text-xs">
            {(['menga', 'mendan'] as const).map((y) => (
              <button key={y} type="button" onClick={() => { setYonalish(y); setTanlangan(null); }} className={'px-3 py-1.5 ' + (yonalish === y ? 'bg-accent/15 text-accent' : '')}>{y === 'menga' ? t('Menga') : t('Mendan')}</button>))}
          </div>
          <select aria-label={t('Holat')} className={inp} value={holat} onChange={(e) => setHolat(e.target.value)}>
            <option value="">{t('Barcha holatlar')}</option>{Object.keys(HOLAT_NOMI).map((h) => <option key={h} value={h}>{t(HOLAT_NOMI[h])}</option>)}</select>
        </div>
        {xato && <div role="alert" className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{xato}</div>}
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
          <Bolim sarlavha="Ro‘yxat">
            {royxat.length === 0 ? <p className="text-sm text-text-dim">{t('Murojaat yo‘q')}</p> : (
              <ul className="max-h-[65vh] space-y-1 overflow-auto">{royxat.map((x) => (
                <li key={x.id}><button type="button" onClick={() => setTanlangan(x.id)} className={`w-full rounded border px-2 py-1.5 text-left text-xs hover:border-accent ${tanlangan === x.id ? 'border-accent bg-accent/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between gap-2"><b>{x.sarlavha}</b>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${x.kechikkan ? 'bg-danger/15 text-danger' : x.holat === 'yopildi' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'}`}>{x.kechikkan ? t('Kechikkan') : t(HOLAT_NOMI[x.holat] ?? x.holat)}</span></div>
                  <div className="text-text-dim">{x.qarshi_nom} · {turNomi(x.turi, turlar)} · {t(MUHIMLIK_NOMI[x.muhimlik])}{x.muddat ? ` · ${x.muddat}` : ''}{x.raund > 1 ? ` · ${t('raund')} ${x.raund}` : ''}</div></button></li>))}</ul>)}
          </Bolim>
          <Bolim sarlavha="Murojaat">
            {tanlangan == null ? <p className="text-sm text-text-dim">{t('Ro‘yxatdan murojaatni tanlang')}</p> : <Tafsilot kompaniyaId={kompaniyaId} id={tanlangan} turlar={turlar} yangila={() => void yukla()} />}
          </Bolim>
        </div>
      </div>
    </Sahifa>
  );
}
