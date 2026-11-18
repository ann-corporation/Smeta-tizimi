/**
 * HujjatMaydoni.tsx - «Disk» (egasi 2026-11-18): shaxsiy va kompaniya maydonlari, papka, yuklash/yuklab olish, versiyalar, izoh (@eslatma), qulf,
 * ulashish/taqdim, savat (30 kun), qidiruv, kvota.
 * Kompaniya konteksti ixtiyoriy: kompaniyasiz foydalanuvchida ham shaxsiy disk ochiladi, kompaniya tabi bo'lmaydi (KompaniyaKerak yo'naltiradi).
 * Tablar FAQAT: Mening diskim | Kompaniya diski | Ulashilgan | Savat (kompaniyasiz foydalanuvchida kompaniya diski yo'q).
 * «Tizim hujjatlari», «Taqdimlar», «Faoliyat», «Disk boshqaruvi» alohida tab EMAS: tizim hujjatlari Kompaniya diski daraxtida (🔒 tizim papkalari),
 * taqdimlar Ulashilgan ichida, Faoliyat va Boshqaruv - sarlavhadagi ⚙ menyuda. Eski FaylMenejer olib tashlangan.
 * Mavjud qatlamlar ustida (t2_fayl_papka, t2_hm_*, R2, t2_outbox); API: /api/hujjat-maydoni*.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, FileArchive, FileText, Folder, FolderPlus, Lock, Search, Settings, Trash2, Upload, X } from 'lucide-react';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { toast } from '../umumiy/ui/Toast';
import { matnSora, tasdiqSora } from '../umumiy/ui/Tasdiq';
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../umumiy/kontekst/KompaniyaKerak';
import { HujjatKorinish } from '../umumiy/hujjat/HujjatKorinish';
import { downloadBlob } from '../lib/construction-document-control/export/download-helper';
import { t, tilLocale } from '../i18n/til';
import {
  hmAbadiy, hmBaytlar, hmBosh, hmFaoliyat, hmFaylAmal, hmHajm, hmKvotaHolat, hmOlUrl, hmPapka, hmQidir, hmRegistryJoy, hmRoyxat, hmUlashilgan, hmYukla,
  type HmFayl, type HmRoyxat, type HmUlashilgan, type HmFaoliyat, type Kvota,
} from '../api/t2-hujjat-maydoni';
import { FaylYon } from './FaylYon';
import { BoshqaruvBolim } from './BoshqaruvBolim';
import { UlashilganBolim } from './UlashilganBolim';
import { papkaZip } from './diskZip';

type Joy = 'shaxsiy' | 'kompaniya' | 'ulashilgan' | 'savat';
type Korinish = 'disk' | 'faoliyat' | 'boshqaruv';
const FAAL_NOMI: Record<string, string> = {
  yuklandi: 'Yuklandi', yangi_versiya: 'Yangi versiya', nomlandi: 'Nomi o‘zgardi', kochirildi: 'Ko‘chirildi', savatga: 'Savatga olindi', tiklandi: 'Tiklandi',
  qulflandi: 'Qulflandi', qulf_ochildi: 'Qulf ochildi', versiya_qaytarildi: 'Versiyaga qaytarildi', izoh: 'Izoh', ulashildi: 'Ulashildi', ulashish_bekor: 'Ulashish bekor qilindi',
  papka_yaratildi: 'Papka yaratildi', papka_nomla: 'Papka nomi o‘zgardi', papka_kochir: 'Papka ko‘chirildi', papka_ochir: 'Papka o‘chirildi', sozlama: 'Sozlama', reja: 'Disk rejasi',
  tizim_hujjat: 'Tizim hujjati saqlandi',
};
const XATO_MATN: Record<string, string> = {
  KVOTA_TUGADI: 'Disk to‘ldi. Joy bo‘shating yoki Tokenlar va obuna sahifasida disk rejasini oshiring.',
  QULFLANGAN: 'Fayl boshqa foydalanuvchi tomonidan tahrir uchun qulflangan.',
  RUXSAT_YOQ: 'Bu amal uchun ruxsat yo‘q.', NOM_BAND: 'Shu joyda bunday nom bor.', PAPKA_BOSH_EMAS: 'Papka bo‘sh emas.', FILE_TOO_LARGE: 'Fayl juda katta (100 MB gacha).',
  MIME_REJECTED: 'Bu turdagi faylni yuklab bo‘lmaydi.', TARMOQ: 'Aloqa xatosi. Internetni tekshirib, qayta urinib ko‘ring.',
  TIZIM_PAPKA: 'Tizim papkasini o‘chirib, ko‘chirib yoki qayta nomlab bo‘lmaydi. Ichiga o‘z faylingizni qo‘shishingiz mumkin.',
  PAPKA_TOPILMADI: 'Papka topilmadi. Sahifani yangilang.', FAYL_TOPILMADI: 'Fayl topilmadi.',
};
const xatoMatni = (x: { code: string; xato?: string }) => t(XATO_MATN[x.code] ?? x.xato ?? 'Amal bajarilmadi.');

function KvotaBar({ k, kompaniya }: { k: Kvota; kompaniya: boolean }) {
  const holat = hmKvotaHolat(k);
  const foiz = k.limit ? Math.min(100, (k.ishlatilgan * 100) / k.limit) : 0;
  return (
    <div className="mb-3 rounded-lg border border-border bg-surface p-3" role="status" aria-label={t('Disk hajmi')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-text-dim">
        <span>{kompaniya ? t('Kompaniya diski') : t('Shaxsiy disk')}: <b className="text-text tabular-nums">{hmHajm(k.ishlatilgan)}</b> / {hmHajm(k.limit)}</span>
        <Link to="/admin/tokenlar" className="text-accent hover:underline">{t('Tarif va disk rejalari')}</Link>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-surface-2"><i className="block h-full" style={{ width: `${foiz}%`, background: holat === 'ok' ? 'var(--accent)' : holat === 'ogoh80' ? 'var(--warn, #d97706)' : 'var(--danger, #dc2626)' }} /></div>
      {holat !== 'ok' && (
        <p className="mt-2 text-[12px] text-text" role="alert">
          {holat === 'toldi' ? t('Disk to‘ldi: yangi fayl yuklab bo‘lmaydi, mavjud fayllarni ochish va yuklab olish davom etadi.') : t('Disk deyarli to‘ldi ({f}%). Joy bo‘shating yoki rejani oshiring.', { f: Math.round(foiz) })}
          {' '}<Link to="/admin/tokenlar" className="font-semibold text-accent hover:underline">{t('Tarif sahifasiga o‘tish')}</Link>
        </p>
      )}
    </div>
  );
}

/** Savat jadvali: tiklash, butunlay o'chirish, savatni bo'shatish (egasi/boshqaruvchi). */
function SavatJadval({ r, kompaniyaId, sarlavha, yangila }: { r: HmRoyxat; kompaniyaId: number | null; sarlavha: string | null; yangila: () => unknown }) {
  return (
    <div className="mb-3">
      {sarlavha && <h3 className="mb-1 text-[13px] font-semibold text-text">{sarlavha}</h3>}
      {r.daraja >= 4 && r.fayllar.length > 0 && <button type="button" className="fz-btn mb-2" onClick={async () => { if (!(await tasdiqSora({ matn: t('Savat butunlay bo‘shatilsinmi? Bu qaytarilmaydi.'), xavfli: true }))) return; const x = await hmBosh(kompaniyaId, 'savat'); if (!x.ok) toast(xatoMatni(x), 'danger'); else await yangila(); }}>{t('Savatni bo‘shatish')}</button>}
      <table className="fz-table"><tbody>
        {r.fayllar.map((f) => (
          <tr key={f.id}><td>{f.nom}</td><td className="fz-c-num">{hmHajm(f.bayt)}</td>
            <td className="text-right whitespace-nowrap">
              <button type="button" className="fz-btn" onClick={async () => { const x = await hmFaylAmal(f.id, 'tikla'); if (!x.ok) toast(xatoMatni(x), 'danger'); else await yangila(); }}>{t('Tiklash')}</button>{' '}
              <button type="button" className="fz-btn" onClick={async () => { if (!(await tasdiqSora({ matn: t('Fayl butunlay o‘chirilsinmi?'), xavfli: true }))) return; const x = await hmAbadiy(f.id); if (!x.ok) toast(xatoMatni(x), 'danger'); else await yangila(); }}>{t('Butunlay o‘chirish')}</button></td></tr>
        ))}
        {!r.fayllar.length && <tr><td className="py-6 text-center text-text-mute">{t('Savat bo‘sh.')}</td></tr>}
      </tbody></table>
    </div>
  );
}
export default function HujjatMaydoni() {
  const { joriy, superadmin } = useKompaniya();
  const kompId = joriy?.id ?? null;
  const [sp] = useSearchParams();
  const docId = Number(sp.get('document_id')) > 0 ? Number(sp.get('document_id')) : null;
  const [joy, setJoy] = useState<Joy>('shaxsiy');
  const [korinishTur, setKorinishTur] = useState<Korinish>('disk');
  const [menyu, setMenyu] = useState(false);
  const [papkaId, setPapkaId] = useState<number | null>(null);
  const [data, setData] = useState<HmRoyxat | null>(null);
  /** Savat: kompaniya fayllarining savati (shaxsiy savat data da). */
  const [savatKomp, setSavatKomp] = useState<HmRoyxat | null>(null);
  const [yuk, setYuk] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [tanlangan, setTanlangan] = useState<HmFayl | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [natija, setNatija] = useState<Array<{ id: number; nom: string; papka_id: number | null; mos?: 'nom' | 'matn'; parcha?: string | null }> | null>(null);
  const [tortish, setTortish] = useState(false);
  const [jarayon, setJarayon] = useState<string | null>(null);
  const [ulashilgan, setUlashilgan] = useState<HmUlashilgan[]>([]);
  const [faoliyat, setFaoliyat] = useState<HmFaoliyat[]>([]);
  const [korinish, setKorinish] = useState<{ bytes: Uint8Array; nom: string } | null>(null);
  const [rasm, setRasm] = useState<{ url: string; nom: string; pdf: boolean } | null>(null);
  const [hujjatXato, setHujjatXato] = useState<string | null>(null);
  const fayl = useRef<HTMLInputElement>(null);
  /** Eski `?document_id=` havolasi: shu fayl joylashgan papkani ochib, faylni tanlaydi. */
  const hedef = useRef<{ papka: number | null; fayl: number } | null>(null);

  const shaxsiyMi = joy === 'shaxsiy' || (joy === 'savat' && !kompId);
  const diskKorinishi = korinishTur === 'disk';

  const yangila = useCallback(async () => {
    if (korinishTur === 'faoliyat') {
      setYuk(true); setXato(null);
      try { const r = await hmFaoliyat({ kompaniyaId: kompId }); if (r.ok) setFaoliyat(r.royxat); else setXato(xatoMatni(r)); } finally { setYuk(false); }
      return;
    }
    if (korinishTur !== 'disk') return;
    setYuk(true); setXato(null);
    try {
      if (joy === 'shaxsiy' || joy === 'kompaniya' || joy === 'savat') {
        if (joy === 'kompaniya' && !kompId) { setData(null); return; }
        const [r, rk] = await Promise.all([
          hmRoyxat({ kompaniyaId: joy === 'kompaniya' ? kompId : null, papkaId: joy === 'savat' ? null : papkaId, savat: joy === 'savat' }),
          joy === 'savat' && kompId ? hmRoyxat({ kompaniyaId: kompId, savat: true }) : Promise.resolve(null),
        ]);
        setSavatKomp(rk && rk.ok ? rk : null);
        if (r.ok) setData(r); else { setData(null); setXato(xatoMatni(r)); }
      } else if (joy === 'ulashilgan') {
        const r = await hmUlashilgan(); if (r.ok) setUlashilgan(r.royxat); else setXato(xatoMatni(r));
      }
    } finally { setYuk(false); }
  }, [korinishTur, joy, kompId, papkaId]);
  useEffect(() => { void yangila(); }, [yangila]);
  useEffect(() => { setPapkaId(hedef.current?.papka ?? null); setTanlangan(null); setNatija(null); setData(null); }, [joy, kompId]);
  /* Kompaniyasiz foydalanuvchida kompaniya tabi yo'q: kompaniya almashib ketsa shaxsiy diskka qaytiladi. */
  useEffect(() => { if (!kompId && joy === 'kompaniya') setJoy('shaxsiy'); }, [kompId, joy]);

  /* Eski havola (/admin/documents?document_id=<registry id>): server fayl va papkani topadi. */
  useEffect(() => {
    if (!docId) return;
    let faol = true;
    void hmRegistryJoy(docId).then((r) => {
      if (!faol) return;
      if (!r.ok) { setHujjatXato(r.code === 'RUXSAT_YOQ' ? t('Bu hujjatga ruxsatingiz yo‘q.') : t('Bu hujjat Diskda topilmadi.')); return; }
      if (r.kompaniya_id != null && r.kompaniya_id !== kompId) { setHujjatXato(t('Bu hujjat boshqa kompaniya diskida: yuqoridan shu kompaniyani tanlang.')); return; }
      setHujjatXato(null);
      hedef.current = { papka: r.savatda ? null : r.papka_id, fayl: r.fayl_id };
      setKorinishTur('disk'); setJoy(r.savatda ? 'savat' : r.kompaniya_id == null ? 'shaxsiy' : 'kompaniya');
      setPapkaId(r.savatda ? null : r.papka_id);
    });
    return () => { faol = false; };
  }, [docId, kompId]);
  useEffect(() => {
    const h = hedef.current;
    if (!h || !data) return;
    const f = data.fayllar.find((x) => x.id === h.fayl);
    if (f) { setTanlangan(f); hedef.current = null; }
  }, [data]);

  /* ⚙ menyu: tashqariga bosilsa yoki Esc bosilsa yopiladi. */
  useEffect(() => {
    if (!menyu) return;
    const yop = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as HTMLElement | null)?.closest?.('[data-disk-menyu]')) setMenyu(false); };
    document.addEventListener('mousedown', yop); document.addEventListener('keydown', yop);
    return () => { document.removeEventListener('mousedown', yop); document.removeEventListener('keydown', yop); };
  }, [menyu]);

  const yuklash = async (fayllar: FileList | null) => {
    if (!fayllar?.length) return;
    let i = 0;
    for (const f of Array.from(fayllar)) {
      setJarayon(t('Yuklanmoqda: {nom} ({i}/{n})', { nom: f.name, i: ++i, n: fayllar.length }));
      const r = await hmYukla({ file: f, kompaniyaId: joy === 'kompaniya' ? kompId : null, papkaId });
      if (r.ok) toast(r.ozgarmadi ? t('Mazmun o‘zgarmagan: {nom}', { nom: f.name }) : (r.raqam > 1 ? t('Yangi versiya yuklandi: {nom}', { nom: f.name }) : t('Yuklandi: {nom}', { nom: f.name })), 'ok');
      else toast(xatoMatni(r), 'danger');
    }
    setJarayon(null);
    if (fayl.current) fayl.current.value = '';
    await yangila();
  };
  const yangiPapka = async () => {
    const nom = await matnSora({ matn: t('Papka nomi'), majburiy: true });
    if (!nom) return;
    const r = await hmPapka(joy === 'kompaniya' ? kompId : null, 'yarat', { nom, otaId: papkaId });
    if (!r.ok) toast(xatoMatni(r), 'danger'); else await yangila();
  };
  const qidir = async (q: string) => {
    setQidiruv(q);
    if (q.trim().length < 2) { setNatija(null); return; }
    const r = await hmQidir(q.trim(), joy === 'kompaniya' ? kompId : null);
    if (r.ok) setNatija(r.royxat);
  };
  const korish = async (f: { id: number; nom: string; mime?: string }) => {
    const b = await hmBaytlar(f.id);
    if (!b) { toast(t('Faylni ochib bo‘lmadi'), 'danger'); return; }
    if (/\.xlsx?$/i.test(f.nom)) setKorinish({ bytes: b.bayt, nom: f.nom });
    else if (/^(application\/pdf|image\/(png|jpe?g|gif|webp))$/.test(b.mime)) setRasm({ url: URL.createObjectURL(new Blob([b.bayt as BlobPart], { type: b.mime })), nom: f.nom, pdf: b.mime === 'application/pdf' });
    else window.location.assign(hmOlUrl(f.id));
  };
  const savatga = async (f: HmFayl) => { const r = await hmFaylAmal(f.id, 'savat'); if (!r.ok) toast(xatoMatni(r), 'danger'); else { setTanlangan(null); await yangila(); } };
  const papkaOchir = async (id: number) => { const r = await hmPapka(joy === 'kompaniya' ? kompId : null, 'ochir', { papkaId: id }); if (!r.ok) toast(xatoMatni(r), 'danger'); else await yangila(); };

  /** ZIP eksport (ilgari FaylMenejer da): joriy papka ichki papkalari bilan; ildizda va boshqaruvchi uchun - jadvallar bilan ham. */
  const zip = async (malumot: boolean) => {
    if (!kompId || jarayon) return;
    const nom = data?.yol.length ? data.yol[data.yol.length - 1].nom : (joriy?.nom || t('Kompaniya diski'));
    setJarayon(t('ZIP tayyorlanmoqda…'));
    try {
      const z = await papkaZip({ kompaniyaId: kompId, papkaId, nom: malumot ? `${nom}_toliq_arxiv` : nom, malumot, holat: (s) => setJarayon(t('ZIP: {s}', { s })) });
      if (!z) return;
      if (!z.soni && !malumot) { toast(t('Bu papkada fayl yo‘q'), 'warn'); return; }
      downloadBlob(z.bytes, z.nomi, 'application/zip');
      toast(z.olinmagan.length || z.kesilgan ? t('ZIP tayyor, lekin ba’zi elementlar olinmadi - manifest.json da ro‘yxat') : t('ZIP tayyor: {n} fayl', { n: z.soni }), z.olinmagan.length || z.kesilgan ? 'warn' : 'ok');
    } catch { toast(t('ZIP yaratib bo‘lmadi'), 'danger'); } finally { setJarayon(null); }
  };

  const kvota = data?.kvota;
  const yozaOladi = (data?.daraja ?? 0) >= 3;
  const kompaniyaJoyi = joy === 'kompaniya';
  const boshqaruvOchiladi = !!kompId || superadmin;
  const joylar: Array<[Joy, string]> = useMemo(() => [
    ['shaxsiy', 'Mening diskim'], ...(kompId ? [['kompaniya', 'Kompaniya diski'] as [Joy, string]] : []), ['ulashilgan', 'Ulashilgan'], ['savat', 'Savat'],
  ], [kompId]);
  /** Tizim papkalari birinchi (🔒), keyin foydalanuvchi papkalari - alifbo tartibida. */
  const papkalar = useMemo(() => [...(data?.papkalar ?? [])].sort((a, b) => Number(!!b.tizim) - Number(!!a.tizim) || a.nom.localeCompare(b.nom, tilLocale())), [data]);
  const bosh = !!data && !papkalar.length && !data.fayllar.length;
  /** Bo'sh papka holati: nima qilish kerakligini aytadi. */
  let boshHolat: ReactNode = t('Bu papka bo‘sh.');
  if (kompaniyaJoyi && papkaId == null) boshHolat = <p>{t('Kompaniya diski hali bo‘sh. F-2, F-3 va boshqa tizim hujjatlari yasalgach shu yerda o‘zi paydo bo‘ladi; o‘z fayllaringizni ham qo‘sha olasiz.')}</p>;
  else if (yozaOladi) boshHolat = <button type="button" className="fz-btn fz-btn--primary" onClick={() => fayl.current?.click()}><Upload size={14} /> {t('Fayl tanlang yoki shu yerga tashlang')}</button>;
  const menyuTanla = (k: Korinish) => { setMenyu(false); setKorinishTur(k); setXato(null); };

  return (
    <Sahifa sarlavha={t('Disk')} tavsif={t('Hamma narsa shu yerda saqlanadi: hujjat, rasm, chizma, video. Kompaniya diskida tizim yasagan hujjatlar (F-2, F-3, АОСР, eksportlar) o‘zi tartib bilan paydo bo‘ladi.')}
      amallar={(
        <div className="relative" data-disk-menyu>
          <button type="button" className="fz-btn fz-btn--icon" aria-label={t('Disk sozlamalari')} aria-haspopup="menu" aria-expanded={menyu} onClick={() => setMenyu((v) => !v)}><Settings size={15} /></button>
          {menyu && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-surface p-1 text-[13px] shadow-lg">
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-1.5 text-left hover:bg-surface-2" onClick={() => menyuTanla('faoliyat')}>{t('Faoliyat')}</button>
              {boshqaruvOchiladi && <button type="button" role="menuitem" className="block w-full rounded px-3 py-1.5 text-left hover:bg-surface-2" onClick={() => menyuTanla('boshqaruv')}>{t('Boshqaruv')}</button>}
            </div>)}
        </div>
      )}>
      {diskKorinishi && (
        <div className="flex flex-wrap gap-1 border-b border-border pb-2" role="tablist" aria-label={t('Bo‘limlar')}>
          {joylar.map(([k, nom]) => (
            <button key={k} type="button" role="tab" aria-selected={joy === k} onClick={() => setJoy(k)}
              className={`rounded px-3 py-1.5 text-[13px] ${joy === k ? 'bg-accent/15 font-semibold text-text' : 'text-text-dim hover:bg-surface-2'}`}>{t(nom)}</button>
          ))}
        </div>)}
      {!diskKorinishi && (
        <div className="flex items-center gap-3 border-b border-border pb-2">
          <button type="button" className="fz-btn" onClick={() => menyuTanla('disk')}><ArrowLeft size={14} /> {t('Diskka qaytish')}</button>
          <h2 className="text-[14px] font-semibold text-text">{korinishTur === 'faoliyat' ? t('Faoliyat') : t('Boshqaruv')}</h2>
        </div>)}
      <div className="mt-3">
        {hujjatXato && <p className="mb-2 rounded border border-border p-2 text-[13px] text-text" role="alert">{hujjatXato}</p>}
        {diskKorinishi && (joy === 'shaxsiy' || kompaniyaJoyi || joy === 'savat') && kvota && <KvotaBar k={kvota} kompaniya={kompaniyaJoyi || (joy === 'savat' && !shaxsiyMi)} />}
        {xato && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-border p-2 text-[13px] text-text" role="alert">
            <span>{xato}</span><button type="button" className="fz-btn" onClick={() => void yangila()}>{t('Qayta urinish')}</button>
          </div>)}
        {diskKorinishi && yuk && !data && (joy === 'shaxsiy' || kompaniyaJoyi || joy === 'savat') && !xato && <div className="skel h-40 rounded-lg" role="status" aria-label={t('Yuklanmoqda…')} />}

        {diskKorinishi && (joy === 'shaxsiy' || kompaniyaJoyi) && data && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <nav className="flex flex-wrap items-center gap-1 text-[13px]" aria-label={t('Papka yo‘li')}>
                <button type="button" className="text-accent hover:underline" onClick={() => setPapkaId(null)}>{kompaniyaJoyi ? t('Kompaniya diski') : t('Mening diskim')}</button>
                {data.yol.map((p) => (<span key={p.id}>/ <button type="button" className="hover:underline" onClick={() => setPapkaId(p.id)}>{p.nom}</button></span>))}
              </nav>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <label className="relative"><Search size={13} className="absolute left-2 top-2 text-text-mute" />
                  <input value={qidiruv} onChange={(e) => void qidir(e.target.value)} placeholder={t('Nom yoki fayl ichidagi matn bo‘yicha qidirish')} aria-label={t('Qidirish')} className="input h-8 pl-7 text-[12px]" /></label>
                {yozaOladi && <>
                  <button type="button" className="fz-btn" onClick={() => void yangiPapka()}><FolderPlus size={14} /> {t('Yangi papka')}</button>
                  <button type="button" className="fz-btn fz-btn--primary" onClick={() => fayl.current?.click()}><Upload size={14} /> {kompaniyaJoyi ? t('Fayl qo‘shish') : t('Yuklash')}</button>
                  <input ref={fayl} type="file" multiple className="hidden" aria-label={t('Fayl tanlash')} onChange={(e) => void yuklash(e.target.files)} />
                </>}
                {kompaniyaJoyi && <>
                  <button type="button" className="fz-btn" disabled={!!jarayon} onClick={() => void zip(false)}><FileArchive size={14} /> {t('Papkani ZIP')}</button>
                  {data.daraja >= 4 && papkaId == null && <button type="button" className="fz-btn" disabled={!!jarayon} onClick={() => void zip(true)}>{t('Hammasi + ma’lumotlar (ZIP)')}</button>}
                </>}
              </div>
            </div>
            {natija && (
              <div className="mb-2 rounded border border-border p-2 text-[13px]" aria-label={t('Qidiruv natijasi')}>
                {natija.length ? natija.map((n) => <button key={n.id} type="button" className="block w-full py-0.5 text-left hover:underline" onClick={() => void korish(n)}><span className="block truncate">{n.nom}{n.mos === 'matn' && <span className="fz-stamp ml-2">{t('matn ichida')}</span>}</span>{n.parcha && <span className="block truncate text-[11px] text-text-mute">{n.parcha}</span>}</button>) : <span className="text-text-mute">{t('Hech narsa topilmadi')}</span>}
              </div>
            )}
            {jarayon && <p className="mb-2 text-[12px] text-text-mute" role="status">{jarayon}</p>}
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="fz-table-wrap relative min-w-0 flex-1" onDragOver={(e) => { if (yozaOladi && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setTortish(true); } }} onDragLeave={() => setTortish(false)} onDrop={(e) => { if (!yozaOladi) return; e.preventDefault(); setTortish(false); void yuklash(e.dataTransfer.files); }}>
                {tortish && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded border-2 border-dashed border-accent bg-accent/10 text-[14px] font-semibold text-text">{t('Yuklash uchun fayllarni shu yerga tashlang')}</div>}
                <table className="fz-table">
                  <thead><tr><th>{t('Nomi')}</th><th className="fz-c-num">{t('Hajmi')}</th><th>{t('Versiya')}</th><th>{t('O‘zgargan')}</th><th /></tr></thead>
                  <tbody>
                    {papkalar.map((p) => (
                      <tr key={'p' + p.id} data-tizim={p.tizim ? '1' : undefined}>
                        <td colSpan={4}><button type="button" className="flex items-center gap-2 hover:underline" onClick={() => setPapkaId(p.id)}><Folder size={15} /> {p.nom}
                          {p.tizim && <span title={t('Tizim papkasi: o‘chirib, ko‘chirib yoki qayta nomlab bo‘lmaydi; ichiga fayl qo‘sha olasiz')} aria-label={t('Tizim papkasi')} data-testid="tizim-papka-belgi"><Lock size={12} className="text-text-mute" /></span>}</button></td>
                        <td className="text-right">{yozaOladi && !p.tizim && <button type="button" className="fz-btn" aria-label={t('Papkani o‘chirish')} onClick={() => void papkaOchir(p.id)}><Trash2 size={13} /></button>}</td>
                      </tr>
                    ))}
                    {data.fayllar.map((f) => (
                      <tr key={f.id} className={tanlangan?.id === f.id ? 'bg-accent/10' : ''}>
                        <td><button type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => setTanlangan(f)}>
                          <FileText size={15} /> <span className="truncate">{f.nom}</span>{f.tizim_hujjat && <span className="fz-stamp">{t('tizim')}</span>}{f.qulf_ism && <span title={t('Qulflagan: {kim}', { kim: f.qulf_ism })}><Lock size={12} className="text-text-mute" /></span>}{f.izohlar > 0 && <span className="text-[11px] text-text-mute">({f.izohlar})</span>}</button></td>
                        <td className="fz-c-num">{hmHajm(f.bayt)}</td><td>v{f.versiya ?? 1}</td>
                        <td className="text-[12px] text-text-mute">{new Date(f.yangilandi).toLocaleDateString(tilLocale())}</td>
                        <td className="whitespace-nowrap text-right">
                          <button type="button" className="fz-btn" aria-label={t('Ko‘rish')} onClick={() => void korish(f)}><Eye size={13} /></button>{' '}
                          <a className="fz-btn" aria-label={t('Yuklab olish')} href={hmOlUrl(f.id)}><Download size={13} /></a>{' '}
                          {yozaOladi && <button type="button" className="fz-btn" aria-label={t('Savatga')} onClick={() => void savatga(f)}><Trash2 size={13} /></button>}
                        </td>
                      </tr>
                    ))}
                    {bosh && <tr><td colSpan={5} className="py-8 text-center text-text-mute">{boshHolat}</td></tr>}
                  </tbody>
                </table>
              </div>
              {tanlangan && <FaylYon fayl={tanlangan} daraja={data.daraja} kompaniyaId={kompaniyaJoyi ? kompId : null} papkalar={data.papkalar} yol={data.yol} onYop={() => setTanlangan(null)} onOzgardi={() => void yangila()} onYuklash={(f) => hmYukla({ file: f, kompaniyaId: kompaniyaJoyi ? kompId : null, faylId: tanlangan.id })} />}
            </div>
          </div>
        )}

        {diskKorinishi && joy === 'savat' && data && (
          <div>
            <p className="mb-2 text-[12px] text-text-mute">{t('Savatdagi fayllar 30 kundan keyin o‘zi o‘chadi. Ular disk hajmiga kiradi.')}</p>
            <SavatJadval r={data} kompaniyaId={null} sarlavha={savatKomp ? t('Mening savatim') : null} yangila={yangila} />
            {savatKomp && <SavatJadval r={savatKomp} kompaniyaId={kompId} sarlavha={t('Kompaniya savati')} yangila={yangila} />}
          </div>
        )}
        {diskKorinishi && joy === 'ulashilgan' && <UlashilganBolim kompId={kompId} royxat={ulashilgan} yuklanmoqda={yuk} onKorish={(f) => void korish(f)} />}
        {diskKorinishi && !kompId && kompaniyaJoyi && <KompaniyaKerak nima="Kompaniya diski" />}

        {korinishTur === 'faoliyat' && (
          <ul className="space-y-1 text-[13px]">
            {faoliyat.map((a) => <li key={a.id} className="flex gap-2"><span className="w-36 shrink-0 text-text-mute">{new Date(a.vaqt).toLocaleString(tilLocale())}</span><span><b>{a.ism ?? '—'}</b> {t(FAAL_NOMI[a.amal] ?? a.amal)}{a.tafsilot ? `: ${a.tafsilot}` : ''}</span></li>)}
            {!faoliyat.length && !yuk && <li className="text-text-mute">{t('Faoliyat yo‘q.')}</li>}
          </ul>
        )}

        {korinishTur === 'boshqaruv' && <BoshqaruvBolim kompaniyaId={kompId} />}
        {yuk && (data || joy === 'ulashilgan' || !diskKorinishi) && <p className="mt-2 text-[12px] text-text-mute" role="status">{t('Yuklanmoqda…')}</p>}
      </div>

      {korinish && <HujjatKorinish bytes={korinish.bytes} faylNomi={korinish.nom} onClose={() => setKorinish(null)} />}
      {rasm && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4" role="dialog" aria-label={rasm.nom}>
          <div className="mb-2 flex items-center justify-between text-white"><span className="truncate">{rasm.nom}</span><button type="button" aria-label={t('Yopish')} onClick={() => { URL.revokeObjectURL(rasm.url); setRasm(null); }}><X size={18} /></button></div>
          {rasm.pdf ? <iframe title={rasm.nom} src={rasm.url} className="min-h-0 flex-1 rounded bg-white" /> : <img src={rasm.url} alt={rasm.nom} className="min-h-0 flex-1 object-contain" />}
        </div>
      )}
    </Sahifa>
  );
}
