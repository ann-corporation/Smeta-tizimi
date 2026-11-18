/**
 * FaylYon.tsx - tanlangan fayl paneli: versiyalar (qaytarish, yangi versiya), izohlar (@eslatma), ulashish, faoliyat, qulf, nomlash, ko'chirish.
 */
import { useCallback, useEffect, useState } from 'react';
import { Lock, Unlock, X } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { matnSora } from '../umumiy/ui/Tasdiq';
import { t, tilLocale } from '../i18n/til';
import {
  hmDarajaNomi, hmFaoliyat, type FaylOp, hmFaylAmal, hmHajm, hmIzohlar, hmIzohYoz, hmOdamlar, hmOlUrl, hmUlash, hmUlashBekor, hmUlashRoyxat, hmVersiyalar,
  type HmFaoliyat, type HmFayl, type HmIzoh, type HmYuklaFn, type HmOdam, type HmPapka, type HmUlash, type HmVersiya,
} from '../api/t2-hujjat-maydoni';

type Tab = 'versiya' | 'izoh' | 'ulashish' | 'faoliyat';
const xm = (x: { code: string; xato?: string }) => x.xato || x.code;

export function FaylYon(p: {
  fayl: HmFayl; daraja: number; kompaniyaId: number | null; papkalar: HmPapka[]; yol: HmPapka[];
  onYop: () => void; onOzgardi: () => void; onYuklash: HmYuklaFn;
}) {
  const { fayl, daraja } = p;
  const [tab, setTab] = useState<Tab>('versiya');
  const [versiyalar, setVersiyalar] = useState<HmVersiya[]>([]);
  const [izohlar, setIzohlar] = useState<HmIzoh[]>([]);
  const [ulashlar, setUlashlar] = useState<HmUlash[]>([]);
  const [havolaRuxsat, setHavolaRuxsat] = useState(false);
  const [faol, setFaol] = useState<HmFaoliyat[]>([]);
  const [matn, setMatn] = useState('');
  const [odamlar, setOdamlar] = useState<HmOdam[]>([]);
  const [eslatilgan, setEslatilgan] = useState<number[]>([]);
  const [qid, setQid] = useState('');
  const [daraja2, setDaraja2] = useState('korish');
  const [yangiHavola, setYangiHavola] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    if (tab === 'versiya') { const r = await hmVersiyalar(fayl.id); if (r.ok) setVersiyalar(r.versiyalar); }
    if (tab === 'izoh') { const r = await hmIzohlar(fayl.id); if (r.ok) setIzohlar(r.izohlar); }
    if (tab === 'ulashish' && daraja >= 4) { const r = await hmUlashRoyxat('fayl', fayl.id); if (r.ok) { setUlashlar(r.royxat); setHavolaRuxsat(r.havola_ruxsat); } }
    if (tab === 'faoliyat') { const r = await hmFaoliyat({ faylId: fayl.id }); if (r.ok) setFaol(r.royxat); }
  }, [tab, fayl.id, daraja]);
  useEffect(() => { void yukla(); }, [yukla]);
  useEffect(() => { setYangiHavola(null); setEslatilgan([]); setMatn(''); }, [fayl.id]);
  useEffect(() => { if (tab === 'izoh' || tab === 'ulashish') void hmOdamlar(p.kompaniyaId, qid).then((r) => { if (r.ok) setOdamlar(r.royxat); }); }, [tab, p.kompaniyaId, qid]);

  const amal = async (op: FaylOp, q: { nom?: string; papkaId?: number | null; raqam?: number } = {}) => {
    const r = await hmFaylAmal(fayl.id, op, q);
    if (!r.ok) toast(r.code === 'QULFLANGAN' ? t('Fayl boshqa foydalanuvchi tomonidan tahrir uchun qulflangan.') : xm(r), 'danger'); else { p.onOzgardi(); void yukla(); }
  };
  const nomla = async () => { const n = await matnSora({ matn: t('Yangi nom'), boshlangich: fayl.nom, majburiy: true }); if (n && n !== fayl.nom) void amal('nomla', { nom: n }); };
  const yozaOladi = daraja >= 3;
  const izohYoz = async () => {
    if (!matn.trim()) return;
    const r = await hmIzohYoz(fayl.id, matn, eslatilgan);
    if (!r.ok) toast(xm(r), 'danger'); else { setMatn(''); setEslatilgan([]); setIzohlar(r.izohlar); p.onOzgardi(); }
  };
  const ulash = async (subyektTuri: 'foydalanuvchi' | 'rol' | 'havola', subyektId?: number | null, rol?: string) => {
    const r = await hmUlash({ nishonTuri: 'fayl', nishonId: fayl.id, subyektTuri, subyektId, rol, daraja: daraja2, muddatSoat: 168 });
    if (!r.ok) { toast(xm(r), 'danger'); return; }
    if (r.havola) setYangiHavola(window.location.origin + r.havola);
    toast(t('Ulashildi'), 'ok'); void yukla();
  };

  return (
    <aside className="w-full shrink-0 rounded-lg border border-border bg-surface p-3 text-[13px] lg:w-[340px]" aria-label={t('Fayl tafsilotlari')}>
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-semibold text-text">{fayl.nom}</div><div className="text-[11px] text-text-mute">{hmHajm(fayl.bayt)} · v{fayl.versiya ?? 1}</div></div>
        <button type="button" aria-label={t('Yopish')} onClick={p.onYop}><X size={16} /></button></div>
      {yozaOladi && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className="fz-btn" onClick={() => void nomla()}>{t('Nomlash')}</button>
          {fayl.qulf_ism
            ? <button type="button" className="fz-btn" onClick={() => void amal('qulf_och')}><Unlock size={13} /> {t('Qulfni ochish')}</button>
            : <button type="button" className="fz-btn" title={t('Faylni yuklab olib o‘z kompyuteringizda tahrirlash uchun qulflang; yangi versiyani yuklaganingizda qulf ochiladi.')} onClick={() => void amal('qulf')}><Lock size={13} /> {t('Tahrir uchun qulflash')}</button>}
          <label className="fz-btn cursor-pointer">{t('Yangi versiya yuklash')}
            <input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const r = await p.onYuklash(f); if (!r.ok) toast(r.code === 'KVOTA_TUGADI' ? t('Disk to‘ldi. Joy bo‘shating yoki Tokenlar va obuna sahifasida disk rejasini oshiring.') : xm(r), 'danger'); else { toast(t('Yangi versiya yuklandi'), 'ok'); p.onOzgardi(); void yukla(); } e.target.value = ''; }} /></label>
          <select className="input h-8 text-[12px]" aria-label={t('Ko‘chirish')} value="" onChange={(e) => { if (e.target.value !== '') void amal('kochir', { papkaId: e.target.value === '0' ? null : Number(e.target.value) }); }}>
            <option value="">{t('Ko‘chirish…')}</option><option value="0">{t('Ildiz')}</option>
            {p.yol.map((y) => <option key={'y' + y.id} value={y.id}>{y.nom}</option>)}{p.papkalar.map((y) => <option key={'p' + y.id} value={y.id}>{y.nom}</option>)}
          </select>
        </div>
      )}
      <div className="mt-3 flex gap-1 border-b border-border" role="tablist">
        {(['versiya', 'izoh', 'ulashish', 'faoliyat'] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-2 py-1 text-[12px] ${tab === k ? 'border-b-2 border-accent font-semibold' : 'text-text-dim'}`}>
            {t(k === 'versiya' ? 'Versiyalar' : k === 'izoh' ? 'Izohlar' : k === 'ulashish' ? 'Ulashish' : 'Faoliyat')}</button>))}
      </div>

      {tab === 'versiya' && <ul className="mt-2 space-y-1.5">{versiyalar.map((v) => (
        <li key={v.raqam} className="flex items-center gap-2"><span className="w-8 font-semibold">v{v.raqam}</span><span className="min-w-0 flex-1 truncate text-text-dim">{v.kim ?? '—'} · {new Date(v.yaratildi).toLocaleDateString(tilLocale())} · {hmHajm(v.bayt)}</span>
          <a className="fz-btn" href={hmOlUrl(fayl.id, v.raqam)}>{t('Yuklab olish')}</a>
          {yozaOladi && (v.joriy ? <span className="fz-stamp fz-stamp--ok">{t('joriy')}</span> : <button type="button" className="fz-btn" onClick={() => void amal('versiya_qaytar', { raqam: v.raqam })}>{t('Qaytarish')}</button>)}</li>))}</ul>}

      {tab === 'izoh' && (
        <div className="mt-2">
          <ul className="max-h-60 space-y-2 overflow-auto">{izohlar.map((i) => (<li key={i.id}><div className="text-[11px] text-text-mute">{i.ism ?? '—'} · {new Date(i.yaratildi).toLocaleString(tilLocale())}</div><div className="whitespace-pre-wrap">{i.matn}</div></li>))}
            {!izohlar.length && <li className="text-text-mute">{t('Izoh yo‘q.')}</li>}</ul>
          {daraja >= 2 && (
            <div className="mt-2 space-y-1.5">
              <textarea value={matn} onChange={(e) => setMatn(e.target.value)} rows={2} maxLength={2000} className="input w-full text-[12px]" aria-label={t('Izoh')} placeholder={t('Izoh yozing…')} />
              <div className="flex flex-wrap gap-1 text-[11px]"><span className="text-text-mute">{t('Eslatish (@):')}</span>
                {odamlar.slice(0, 8).map((o) => (<button key={o.id} type="button" aria-pressed={eslatilgan.includes(o.id)} onClick={() => setEslatilgan((a) => a.includes(o.id) ? a.filter((x) => x !== o.id) : [...a, o.id])}
                  className={`rounded border px-1.5 py-0.5 ${eslatilgan.includes(o.id) ? 'border-accent bg-accent/15' : 'border-border'}`}>@{o.ism}</button>))}</div>
              <button type="button" className="fz-btn fz-btn--primary" disabled={!matn.trim()} onClick={() => void izohYoz()}>{t('Yuborish')}</button>
            </div>)}
        </div>)}

      {tab === 'ulashish' && (daraja < 4 ? <p className="mt-2 text-text-mute">{t('Ulashish faqat egasi yoki boshqaruvchi uchun.')}</p> : (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1.5"><select className="input h-8 text-[12px]" value={daraja2} onChange={(e) => setDaraja2(e.target.value)} aria-label={t('Daraja')}>{['korish', 'izoh', 'tahrir'].map((d) => <option key={d} value={d}>{t(hmDarajaNomi(d))}</option>)}</select>
            <input value={qid} onChange={(e) => setQid(e.target.value)} className="input h-8 flex-1 text-[12px]" placeholder={t('Ism yoki login')} aria-label={t('Odam qidirish')} /></div>
          <ul className="max-h-32 space-y-1 overflow-auto">{odamlar.map((o) => (<li key={o.id} className="flex items-center justify-between"><span>{o.ism}{o.rol ? <span className="text-text-mute"> · {o.rol}</span> : null}</span><button type="button" className="fz-btn" onClick={() => void ulash('foydalanuvchi', o.id)}>{t('Ulashish')}</button></li>))}</ul>
          {p.kompaniyaId && <button type="button" className="fz-btn" disabled={!havolaRuxsat} title={havolaRuxsat ? undefined : t('Tashqi havola kompaniyada yoqilmagan (Disk boshqaruvi).')} onClick={() => void ulash('havola')}>{t('Tashqi havola (7 kun, faqat ko‘rish)')}</button>}
          {yangiHavola && <div className="break-all rounded border border-border p-2 text-[11px]" role="status">{t('Havola faqat hozir ko‘rsatiladi:')} <input readOnly value={yangiHavola} className="input mt-1 w-full text-[11px]" aria-label={t('Havola')} onFocus={(e) => e.currentTarget.select()} /></div>}
          <ul className="space-y-1">{ulashlar.map((u) => (<li key={u.id} className="flex items-center justify-between"><span>{u.nom ?? (u.subyekt_turi === 'havola' ? t('Tashqi havola') : u.rol ?? u.subyekt_turi)} <span className="text-text-mute">· {t(hmDarajaNomi(u.daraja))}</span></span>
            <button type="button" className="fz-btn" onClick={async () => { await hmUlashBekor(u.id); void yukla(); }}>{t('Bekor qilish')}</button></li>))}</ul>
        </div>))}

      {tab === 'faoliyat' && <ul className="mt-2 space-y-1">{faol.map((a) => <li key={a.id}><span className="text-text-mute">{new Date(a.vaqt).toLocaleString(tilLocale())}</span> <b>{a.ism ?? '—'}</b> {a.amal}{a.tafsilot ? `: ${a.tafsilot}` : ''}</li>)}{!faol.length && <li className="text-text-mute">{t('Faoliyat yo‘q.')}</li>}</ul>}
    </aside>
  );
}