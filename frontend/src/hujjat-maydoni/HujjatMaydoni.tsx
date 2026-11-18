/**
 * HujjatMaydoni.tsx - "Hujjatlarim / Kompaniya diski" (egasi 2026-11-18): shaxsiy va kompaniya maydonlari, papka, yuklash/yuklab olish,
 * versiyalar, izoh (@eslatma), qulf, ulashish, savat (30 kun), faoliyat, qidiruv, kvota va admin ko'rinishi.
 * Mavjud qatlamlar ustida (t2_fayl_papka, R2, t2_outbox); API: /api/hujjat-maydoni*. Jonli birgalikda tahrir - keyingi faza.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, FileText, Folder, FolderPlus, Lock, Search, Trash2, Upload, X } from 'lucide-react';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { HujjatKorinish } from '../umumiy/hujjat/HujjatKorinish';
import { t, tilLocale } from '../i18n/til';
import {
  hmAbadiy, hmBaytlar, hmBosh, hmFaoliyat, hmFaylAmal, hmHajm, hmDarajaNomi, hmKvotaHolat, hmOlUrl, hmPapka, hmQidir, hmRoyxat, hmTizim, hmUlashilgan, hmYukla,
  type HmFayl, type HmRoyxat, type HmTizimHujjat, type HmUlashilgan, type HmFaoliyat, type Kvota,
} from '../api/t2-hujjat-maydoni';
import { FaylYon } from './FaylYon';
import { AdminPanel } from './AdminPanel';

type Joy = 'shaxsiy' | 'kompaniya' | 'ulashilgan' | 'tizim' | 'savat' | 'faoliyat' | 'admin';
const FAAL_NOMI: Record<string, string> = {
  yuklandi: 'Yuklandi', yangi_versiya: 'Yangi versiya', nomlandi: 'Nomi o‘zgardi', kochirildi: 'Ko‘chirildi', savatga: 'Savatga olindi', tiklandi: 'Tiklandi',
  qulflandi: 'Qulflandi', qulf_ochildi: 'Qulf ochildi', versiya_qaytarildi: 'Versiyaga qaytarildi', izoh: 'Izoh', ulashildi: 'Ulashildi', ulashish_bekor: 'Ulashish bekor qilindi',
  papka_yaratildi: 'Papka yaratildi', papka_nomla: 'Papka nomi o‘zgardi', papka_kochir: 'Papka ko‘chirildi', papka_ochir: 'Papka o‘chirildi', sozlama: 'Sozlama', reja: 'Disk rejasi',
};
const XATO_MATN: Record<string, string> = {
  KVOTA_TUGADI: 'Disk to‘ldi. Joy bo‘shating yoki Tokenlar va obuna sahifasida disk rejasini oshiring.',
  QULFLANGAN: 'Fayl boshqa foydalanuvchi tomonidan tahrir uchun qulflangan.',
  RUXSAT_YOQ: 'Bu amal uchun ruxsat yo‘q.', NOM_BAND: 'Shu joyda bunday nom bor.', PAPKA_BOSH_EMAS: 'Papka bo‘sh emas.', FILE_TOO_LARGE: 'Fayl juda katta (100 MB gacha).',
  MIME_REJECTED: 'Bu turdagi faylni yuklab bo‘lmaydi.', TARMOQ: 'Aloqa xatosi.',
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

export default function HujjatMaydoni() {
  const { joriy } = useKompaniya();
  const kompId = joriy?.id ?? null;
  const [joy, setJoy] = useState<Joy>('shaxsiy');
  const [papkaId, setPapkaId] = useState<number | null>(null);
  const [data, setData] = useState<HmRoyxat | null>(null);
  const [yuk, setYuk] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [tanlangan, setTanlangan] = useState<HmFayl | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [natija, setNatija] = useState<Array<{ id: number; nom: string; papka_id: number | null }> | null>(null);
  const [tizim, setTizim] = useState<HmTizimHujjat[]>([]);
  const [ulashilgan, setUlashilgan] = useState<HmUlashilgan[]>([]);
  const [faoliyat, setFaoliyat] = useState<HmFaoliyat[]>([]);
  const [korinish, setKorinish] = useState<{ bytes: Uint8Array; nom: string } | null>(null);
  const [rasm, setRasm] = useState<{ url: string; nom: string; pdf: boolean } | null>(null);
  const fayl = useRef<HTMLInputElement>(null);

  const adminKomp = joy === 'admin' ? kompId : null;
  const shaxsiyMi = joy === 'shaxsiy' || (joy === 'savat' && !kompId) || (joy === 'admin' && !kompId);

  const yangila = useCallback(async () => {
    setYuk(true); setXato(null);
    try {
      if (joy === 'shaxsiy' || joy === 'kompaniya' || joy === 'savat') {
        const r = await hmRoyxat({ kompaniyaId: joy === 'kompaniya' ? kompId : null, papkaId: joy === 'savat' ? null : papkaId, savat: joy === 'savat' });
        if (r.ok) setData(r); else { setData(null); setXato(xatoMatni(r)); }
      } else if (joy === 'tizim' && kompId) {
        const r = await hmTizim(kompId); if (r.ok) setTizim(r.royxat); else setXato(xatoMatni(r));
      } else if (joy === 'ulashilgan') {
        const r = await hmUlashilgan(); if (r.ok) setUlashilgan(r.royxat); else setXato(xatoMatni(r));
      } else if (joy === 'faoliyat') {
        const r = await hmFaoliyat({ kompaniyaId: kompId }); if (r.ok) setFaoliyat(r.royxat); else setXato(xatoMatni(r));
      }
    } finally { setYuk(false); }
  }, [joy, kompId, papkaId]);
  useEffect(() => { void yangila(); }, [yangila]);
  useEffect(() => { setPapkaId(null); setTanlangan(null); setNatija(null); }, [joy, kompId]);

  const yuklash = async (fayllar: FileList | null) => {
    if (!fayllar?.length) return;
    for (const f of Array.from(fayllar)) {
      const r = await hmYukla({ file: f, kompaniyaId: joy === 'kompaniya' ? kompId : null, papkaId });
      if (r.ok) toast(r.ozgarmadi ? t('Mazmun o‘zgarmagan: {nom}', { nom: f.name }) : (r.raqam > 1 ? t('Yangi versiya yuklandi: {nom}', { nom: f.name }) : t('Yuklandi: {nom}', { nom: f.name })), 'ok');
      else toast(xatoMatni(r), 'danger');
    }
    if (fayl.current) fayl.current.value = '';
    await yangila();
  };
  const yangiPapka = async () => {
    const nom = window.prompt(t('Papka nomi'));
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

  const kvota = data?.kvota;
  const yozaOladi = (data?.daraja ?? 0) >= 3;
  const joylar: Array<[Joy, string]> = useMemo(() => [
    ['shaxsiy', 'Hujjatlarim'], ...(kompId ? [['kompaniya', 'Kompaniya diski'] as [Joy, string]] : []), ['ulashilgan', 'Menga ulashilgan'],
    ...(kompId ? [['tizim', 'Tizim hujjatlari'] as [Joy, string]] : []), ['savat', 'Savat'], ['faoliyat', 'Faoliyat'], ...(kompId ? [['admin', 'Disk boshqaruvi'] as [Joy, string]] : []),
  ], [kompId]);

  return (
    <Sahifa sarlavha={t('Hujjatlarim')} tavsif={t('Shaxsiy va kompaniya fayllari: papkalar, versiyalar, izohlar, ulashish. Fayllar xavfsiz saqlanadi; versiyalar va savat disk hajmiga kiradi.')}>
      <div className="flex flex-wrap gap-1 border-b border-border pb-2" role="tablist" aria-label={t('Bo‘limlar')}>
        {joylar.map(([k, nom]) => (
          <button key={k} type="button" role="tab" aria-selected={joy === k} onClick={() => setJoy(k)}
            className={`rounded px-3 py-1.5 text-[13px] ${joy === k ? 'bg-accent/15 font-semibold text-text' : 'text-text-dim hover:bg-surface-2'}`}>{t(nom)}</button>
        ))}
      </div>
      <div className="mt-3">
        {(joy === 'shaxsiy' || joy === 'kompaniya' || joy === 'savat') && kvota && <KvotaBar k={kvota} kompaniya={joy === 'kompaniya' || (joy === 'savat' && !shaxsiyMi)} />}
        {xato && <p className="mb-2 rounded border border-border p-2 text-[13px] text-text" role="alert">{xato}</p>}

        {(joy === 'shaxsiy' || joy === 'kompaniya') && data && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <nav className="flex flex-wrap items-center gap-1 text-[13px]" aria-label={t('Papka yo‘li')}>
                <button type="button" className="text-accent hover:underline" onClick={() => setPapkaId(null)}>{joy === 'kompaniya' ? t('Kompaniya diski') : t('Hujjatlarim')}</button>
                {data.yol.map((p) => (<span key={p.id}>/ <button type="button" className="hover:underline" onClick={() => setPapkaId(p.id)}>{p.nom}</button></span>))}
              </nav>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <label className="relative"><Search size={13} className="absolute left-2 top-2 text-text-mute" />
                  <input value={qidiruv} onChange={(e) => void qidir(e.target.value)} placeholder={t('Fayl nomi bo‘yicha qidirish')} aria-label={t('Qidirish')} className="input h-8 pl-7 text-[12px]" /></label>
                {yozaOladi && <>
                  <button type="button" className="fz-btn" onClick={() => void yangiPapka()}><FolderPlus size={14} /> {t('Yangi papka')}</button>
                  <button type="button" className="fz-btn fz-btn--primary" onClick={() => fayl.current?.click()}><Upload size={14} /> {t('Yuklash')}</button>
                  <input ref={fayl} type="file" multiple className="hidden" aria-label={t('Fayl tanlash')} onChange={(e) => void yuklash(e.target.files)} />
                </>}
              </div>
            </div>
            {natija && (
              <div className="mb-2 rounded border border-border p-2 text-[13px]" aria-label={t('Qidiruv natijasi')}>
                {natija.length ? natija.map((n) => <button key={n.id} type="button" className="block w-full truncate py-0.5 text-left hover:underline" onClick={() => void korish(n)}>{n.nom}</button>) : <span className="text-text-mute">{t('Hech narsa topilmadi')}</span>}
              </div>
            )}
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="fz-table-wrap min-w-0 flex-1">
                <table className="fz-table">
                  <thead><tr><th>{t('Nomi')}</th><th className="fz-c-num">{t('Hajmi')}</th><th>{t('Versiya')}</th><th>{t('O‘zgargan')}</th><th /></tr></thead>
                  <tbody>
                    {data.papkalar.map((p) => (
                      <tr key={'p' + p.id}>
                        <td colSpan={4}><button type="button" className="flex items-center gap-2 hover:underline" onClick={() => setPapkaId(p.id)}><Folder size={15} /> {p.nom}</button></td>
                        <td className="text-right">{yozaOladi && <button type="button" className="fz-btn" aria-label={t('Papkani o‘chirish')} onClick={async () => { const r = await hmPapka(joy === 'kompaniya' ? kompId : null, 'ochir', { papkaId: p.id }); if (!r.ok) toast(xatoMatni(r), 'danger'); else await yangila(); }}><Trash2 size={13} /></button>}</td>
                      </tr>
                    ))}
                    {data.fayllar.map((f) => (
                      <tr key={f.id} className={tanlangan?.id === f.id ? 'bg-accent/10' : ''}>
                        <td><button type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => setTanlangan(f)}>
                          <FileText size={15} /> <span className="truncate">{f.nom}</span>{f.qulf_ism && <span title={t('Qulflagan: {kim}', { kim: f.qulf_ism })}><Lock size={12} className="text-text-mute" /></span>}{f.izohlar > 0 && <span className="text-[11px] text-text-mute">({f.izohlar})</span>}</button></td>
                        <td className="fz-c-num">{hmHajm(f.bayt)}</td><td>v{f.versiya ?? 1}</td>
                        <td className="text-[12px] text-text-mute">{new Date(f.yangilandi).toLocaleDateString(tilLocale())}</td>
                        <td className="whitespace-nowrap text-right">
                          <button type="button" className="fz-btn" aria-label={t('Ko‘rish')} onClick={() => void korish(f)}><Eye size={13} /></button>{' '}
                          <a className="fz-btn" aria-label={t('Yuklab olish')} href={hmOlUrl(f.id)}><Download size={13} /></a>{' '}
                          {yozaOladi && <button type="button" className="fz-btn" aria-label={t('Savatga')} onClick={() => void savatga(f)}><Trash2 size={13} /></button>}
                        </td>
                      </tr>
                    ))}
                    {!data.papkalar.length && !data.fayllar.length && <tr><td colSpan={5} className="py-6 text-center text-text-mute">{t('Bu papka bo‘sh. Fayl yuklang yoki papka yarating.')}</td></tr>}
                  </tbody>
                </table>
              </div>
              {tanlangan && <FaylYon fayl={tanlangan} daraja={data.daraja} kompaniyaId={joy === 'kompaniya' ? kompId : null} papkalar={data.papkalar} yol={data.yol} onYop={() => setTanlangan(null)} onOzgardi={() => void yangila()} onYuklash={(f) => hmYukla({ file: f, kompaniyaId: joy === 'kompaniya' ? kompId : null, faylId: tanlangan.id })} />}
            </div>
          </div>
        )}

        {joy === 'savat' && data && (
          <div>
            <p className="mb-2 text-[12px] text-text-mute">{t('Savatdagi fayllar 30 kundan keyin o‘zi o‘chadi. Ular disk hajmiga kiradi.')}</p>
            {data.daraja >= 4 && data.fayllar.length > 0 && <button type="button" className="fz-btn mb-2" onClick={async () => { if (!window.confirm(t('Savat butunlay bo‘shatilsinmi? Bu qaytarilmaydi.'))) return; const r = await hmBosh(null, 'savat'); if (!r.ok) toast(xatoMatni(r), 'danger'); else await yangila(); }}>{t('Savatni bo‘shatish')}</button>}
            <table className="fz-table"><tbody>
              {data.fayllar.map((f) => (
                <tr key={f.id}><td>{f.nom}</td><td className="fz-c-num">{hmHajm(f.bayt)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" className="fz-btn" onClick={async () => { const r = await hmFaylAmal(f.id, 'tikla'); if (!r.ok) toast(xatoMatni(r), 'danger'); else await yangila(); }}>{t('Tiklash')}</button>{' '}
                    <button type="button" className="fz-btn" onClick={async () => { if (!window.confirm(t('Fayl butunlay o‘chirilsinmi?'))) return; const r = await hmAbadiy(f.id); if (!r.ok) toast(xatoMatni(r), 'danger'); else await yangila(); }}>{t('Butunlay o‘chirish')}</button></td></tr>
              ))}
              {!data.fayllar.length && <tr><td className="py-6 text-center text-text-mute">{t('Savat bo‘sh.')}</td></tr>}
            </tbody></table>
          </div>
        )}

        {joy === 'ulashilgan' && (
          <table className="fz-table"><thead><tr><th>{t('Nomi')}</th><th>{t('Daraja')}</th><th>{t('Kim ulashdi')}</th><th /></tr></thead><tbody>
            {ulashilgan.map((u) => (
              <tr key={u.turi + u.id}><td>{u.turi === 'papka' ? <Folder size={14} className="mr-1 inline" /> : <FileText size={14} className="mr-1 inline" />}{u.nom}</td><td>{t(hmDarajaNomi(u.daraja))}</td><td>{u.bergan ?? '—'}</td>
                <td className="text-right">{u.turi === 'fayl' && <><button type="button" className="fz-btn" onClick={() => void korish({ id: u.id, nom: u.nom })}><Eye size={13} /></button>{' '}<a className="fz-btn" href={hmOlUrl(u.id)} aria-label={t('Yuklab olish')}><Download size={13} /></a></>}</td></tr>
            ))}
            {!ulashilgan.length && !yuk && <tr><td className="py-6 text-center text-text-mute" colSpan={4}>{t('Hali hech kim fayl ulashmagan.')}</td></tr>}
          </tbody></table>
        )}

        {joy === 'tizim' && (
          <div>
            <p className="mb-2 text-[12px] text-text-mute">{t('F-2, АОСР, smeta eksportlari: faqat o‘qish. Har hujjat chiqarilgan paytdagi nusxa; «oxirgi» belgisi eng yangi versiyani bildiradi.')}</p>
            <table className="fz-table"><thead><tr><th>{t('Nomi')}</th><th>{t('Turi')}</th><th>{t('Versiya')}</th><th className="fz-c-num">{t('Hajmi')}</th><th>{t('Sana')}</th><th /></tr></thead><tbody>
              {tizim.map((d) => (
                <tr key={d.document_id}><td>{d.nom}{d.oxirgi && <span className="fz-stamp fz-stamp--ok ml-2">{t('oxirgi')}</span>}</td><td>{d.tur}</td><td>{d.versiya ?? 1}</td><td className="fz-c-num">{hmHajm(d.bayt)}</td>
                  <td className="text-[12px] text-text-mute">{new Date(d.sana).toLocaleDateString(tilLocale())}</td>
                  <td className="text-right"><a className="fz-btn" href={`/api/hujjat-ol?id=${d.document_id}`} aria-label={t('Yuklab olish')}><Download size={13} /></a></td></tr>
              ))}
              {!tizim.length && !yuk && <tr><td className="py-6 text-center text-text-mute" colSpan={6}>{t('Tizim hujjatlari hali yo‘q.')}</td></tr>}
            </tbody></table>
          </div>
        )}

        {joy === 'faoliyat' && (
          <ul className="space-y-1 text-[13px]">
            {faoliyat.map((a) => <li key={a.id} className="flex gap-2"><span className="w-36 shrink-0 text-text-mute">{new Date(a.vaqt).toLocaleString(tilLocale())}</span><span><b>{a.ism ?? '—'}</b> {t(FAAL_NOMI[a.amal] ?? a.amal)}{a.tafsilot ? `: ${a.tafsilot}` : ''}</span></li>)}
            {!faoliyat.length && !yuk && <li className="text-text-mute">{t('Faoliyat yo‘q.')}</li>}
          </ul>
        )}

        {joy === 'admin' && adminKomp && <AdminPanel kompaniyaId={adminKomp} />}
        {yuk && <p className="mt-2 text-[12px] text-text-mute">{t('Yuklanmoqda…')}</p>}
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