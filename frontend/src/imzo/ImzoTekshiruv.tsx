/**
 * ImzoTekshiruv - QR dagi `/t/:token` sahifasi (KIRMASDAN ochiladi, telefonda qulay).
 * Kirmagan odamga: hujjat turi, sana, kim chiqargan (kompaniya), imzolar va ularning holati, «asl / yangi tahriri bor» belgisi.
 * SUMMA va hujjat mazmuni ko'rsatilmaydi. Kirgan va ruxsati bor odamga: Excel yuklab olish / tizimda ochish; fayl farqi (qaysi katak).
 * Yuklangan fayl tekshiruvi brauzerda: mazmun xeshi hisoblanadi, faylning o'zi hech qayerga yuborilmaydi.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, FileCheck2, LogIn, ShieldQuestion } from 'lucide-react';
import { t } from '../i18n/til';
import { ochiqTekshir, tokenOchish, xatoMatni } from '../api/t2-imzo';
import { hujjatOl, hujjatYuklabOlishUrl } from '../api/t2-hujjat-canonical';
import { ImzoQatorlari } from '../components/imzo/ImzoUi';
import { hujjatMazmunXeshi, mazmunFarqi, xlsxKanonik, type KanonMazmun, type MazmunFarqi } from '../lib/imzo/mazmun';
import { ChopKorinish } from './ChopKorinish';
import { sanaMatni } from '../lib/imzo/qr-varaq';
import { tokenMi } from '../lib/imzo/yadro';
import { joriyHujjatOrnat } from '../lib/imzo/joriy-hujjat';

const Qobiq = ({ children }: { children: React.ReactNode }) => (
  <main className="min-h-screen px-4 py-6 flex justify-center" style={{ background: 'var(--bg, #f6f8fa)', color: 'var(--text, #1f2328)' }}>
    <div className="w-full flex flex-col gap-3" style={{ maxWidth: 560 }}>{children}</div>
  </main>
);
const Karta = ({ children }: { children: React.ReactNode }) => <section className="rounded-lg border p-4 flex flex-col gap-2" style={{ background: 'var(--surface, #fff)', borderColor: 'var(--border, #d0d7de)' }}>{children}</section>;

export default function ImzoTekshiruv() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['t-ochiq', token], queryFn: () => ochiqTekshir(token), retry: false });
  // Kirganmi: sessiya bor bo'lsa ruxsat so'raladi (server a'zolik/tomon ruxsatini tekshiradi)
  const ruxsat = useQuery({ queryKey: ['t-ruxsat', token], enabled: q.data?.ok === true, retry: false, queryFn: () => tokenOchish(token) });
  const [fayl, setFayl] = useState<{ nom: string; mos: boolean; farq: MazmunFarqi[] | null } | null>(null);
  const [band, setBand] = useState(false);
  const [chop, setChop] = useState<KanonMazmun | null>(null);
  const korilayotgan = ruxsat.data && ruxsat.data.ok ? ruxsat.data.hujjat_id : null;
  useEffect(() => { joriyHujjatOrnat(korilayotgan); return () => joriyHujjatOrnat(null); }, [korilayotgan]);

  if (!tokenMi(token) || (q.data && !q.data.ok && q.data.status === 404)) {
    return (
      <Qobiq><Karta>
        <h1 className="text-[18px] font-semibold m-0 flex items-center gap-2"><ShieldQuestion size={20} aria-hidden="true" /> {t('Topilmadi')}</h1>
        <p className="m-0 text-[13px]">{t('Bu havola bo‘yicha hujjat yoki imzo topilmadi (havola noto‘g‘ri yoki bekor qilingan).')}</p>
      </Karta></Qobiq>
    );
  }
  if (q.isLoading) return <Qobiq><Karta><p className="m-0 text-[13px]" role="status">{t('Tekshirilmoqda…')}</p></Karta></Qobiq>;
  const d = q.data;
  if (!d || !d.ok) return <Qobiq><Karta><p className="m-0 text-[13px]" role="alert">{d && 'code' in d && d.code === 'KOP_URINISH' ? t('Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.') : t('Tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.')}</p></Karta></Qobiq>;

  const nashr = d.tur === 'nashr' ? d.nashr : null;
  const hujjat = d.tur === 'imzo' ? d.hujjat : null;
  const xeshlar = [...d.imzolar.map((i) => i.mazmun_xesh), ...(nashr?.mazmun_xesh ? [nashr.mazmun_xesh] : [])];
  const r = ruxsat.data;
  const kirgan = r ? (r.ok || r.status === 403) : false;
  const ruxsatBor = !!r && r.ok;
  const hujjatId = r && r.ok ? r.hujjat_id : null;

  const chopOch = async () => {
    if (!hujjatId) return;
    setBand(true);
    try {
      const asl = await hujjatOl(hujjatId);
      const k = asl instanceof Blob ? xlsxKanonik(new Uint8Array(await asl.arrayBuffer())) : null;
      if (k) setChop(k); else window.open(hujjatYuklabOlishUrl(hujjatId), '_blank', 'noopener');   // xlsx emas (masalan PDF) - asl fayl o'zi ochiladi
    } finally { setBand(false); }
  };

  const tekshir = async (f: File) => {
    setBand(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const xesh = await hujjatMazmunXeshi(bytes);
      const mos = xeshlar.includes(xesh);
      let farq: MazmunFarqi[] | null = null;
      if (!mos && ruxsatBor && hujjatId) {   // faqat kirgan va ruxsati bor odamga: qaysi katak farq qiladi
        const asl = await hujjatOl(hujjatId);
        if (asl instanceof Blob) { const a = xlsxKanonik(new Uint8Array(await asl.arrayBuffer())); const y = xlsxKanonik(bytes); if (a && y) farq = mazmunFarqi(a, y, 30); }
      }
      setFayl({ nom: f.name, mos, farq });
    } finally { setBand(false); }
  };

  let asl: React.ReactNode;
  if (ruxsatBor && hujjatId) {
    asl = (
      <div className="flex flex-wrap gap-2">
        <Link to={'/admin/imzo?bolim=imzolash&hujjat=' + hujjatId} className="fz-btn fz-btn--primary">{t('Tizimda ochish')}</Link>
        <a href={hujjatYuklabOlishUrl(hujjatId)} className="fz-btn"><Download size={14} aria-hidden="true" /> {t('Excel yuklab olish')}</a>
        <button type="button" className="fz-btn" disabled={band} onClick={() => void chopOch()}>{t('Chop etish / PDF sifatida saqlash')}</button>
      </div>
    );
  } else if (kirgan && r && !r.ok && r.status === 403) {
    asl = <p className="m-0 text-[13px]" role="note">{t('Sizda bu hujjatga ruxsat yo‘q. Hujjatni chiqargan kompaniya administratoridan (yoki hujjatni sizga taqdim qilgan tomondan) ruxsat so‘rang.')}</p>;
  } else if (ruxsat.isLoading) {
    asl = <p className="m-0 text-[13px]">{t('Ruxsat tekshirilmoqda…')}</p>;
  } else {
    asl = (
      <>
        <p className="m-0 text-[13px]">{t('Asl nusxani ochish yoki yuklab olish uchun tizimga kiring. Summa va hujjat mazmuni kirmagan odamga ko‘rsatilmaydi.')}</p>
        <Link to="/" className="fz-btn fz-btn--primary self-start"><LogIn size={14} aria-hidden="true" /> {t('Kirish')}</Link>
      </>
    );
  }
  return (
    <Qobiq>
      <Karta>
        <h1 className="text-[18px] font-semibold m-0">{nashr ? t('Tizimdan chiqqan hujjat') : t('Imzolangan hujjat')}</h1>
        <dl className="m-0 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-text-dim">{t('Hujjat turi')}</dt><dd className="m-0">{(nashr?.turi ?? hujjat?.turi) || '—'}</dd>
          {hujjat?.tahrir && <><dt className="text-text-dim">{t('Tahrir')}</dt><dd className="m-0">{hujjat.tahrir}</dd></>}
          <dt className="text-text-dim">{t('Sana')}</dt><dd className="m-0">{(nashr?.sana ?? hujjat?.sana) ? sanaMatni(String(nashr?.sana ?? hujjat?.sana)) : '—'}</dd>
          <dt className="text-text-dim">{t('Kim chiqargan')}</dt><dd className="m-0">{(nashr?.kompaniya ?? hujjat?.kompaniya) || '—'}</dd>
        </dl>
        {nashr && (nashr.joriy
          ? <p className="m-0 text-[13px] font-semibold" style={{ color: 'var(--ok, #1a7f37)' }}>{t('Asl nashr: bu hujjatning joriy tahriri.')}</p>
          : <p className="m-0 text-[13px] font-semibold" style={{ color: 'var(--warn, #9a6700)' }}>{t('Bu nashr eskirgan: hujjat keyin o‘zgargan, yangi tahriri bor.')} {nashr.joriy_token && <Link to={'/t/' + nashr.joriy_token} className="underline">{t('Joriy tahrirni ko‘rish')}</Link>}</p>)}
      </Karta>

      <Karta>
        <h2 className="text-[15px] font-semibold m-0">{t('Imzolar')}</h2>
        <ImzoQatorlari imzolar={d.imzolar} maxfiy />
        <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-dim, #656d76)' }}>{t('Imzo holati serverda ochiq kalit bilan tekshirilgan. Bu tizim ichidagi kriptografik imzo; ERI (E-IMZO) emas.')}</p>
      </Karta>

      <Karta>
        <h2 className="text-[15px] font-semibold m-0">{t('Faylni tekshirish')}</h2>
        <p className="m-0 text-[12.5px]">{t('Qo‘lingizdagi Excel faylni tanlang: u shu hujjat mazmuniga mosligi tekshiriladi (fayl hech qayerga yuborilmaydi).')}</p>
        <input type="file" accept=".xlsx,.xlsm,.pdf" aria-label={t('Faylni tanlang')} disabled={band} onChange={(e) => { const f = e.target.files?.[0]; if (f) void tekshir(f); }} />
        {fayl && (
          <div role="status" className="text-[13px]">
            <p className="m-0 font-semibold flex items-center gap-1" style={{ color: fayl.mos ? 'var(--ok, #1a7f37)' : 'var(--danger, #cf222e)' }}><FileCheck2 size={16} aria-hidden="true" /> {fayl.mos ? t('Mos: fayl mazmuni imzolangan/chiqarilgan hujjatga teng.') : t('Mos emas: fayl mazmuni boshqacha.')}</p>
            {!fayl.mos && fayl.farq && fayl.farq.length > 0 && (
              <ul className="m-0 mt-1 pl-4 text-[12px]">{fayl.farq.map((x) => <li key={x.varaq + x.katak}>{x.varaq} · {x.katak} ({t('qator')} {x.qator}): «{x.eski ?? '—'}» → «{x.yangi ?? '—'}»</li>)}</ul>
            )}
            {!fayl.mos && !ruxsatBor && <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-dim, #656d76)' }}>{t('Qaysi katak farq qilishini faqat tizimga kirgan va hujjatga ruxsati bor odam ko‘radi.')}</p>}
          </div>
        )}
      </Karta>

      <Karta>
        <h2 className="text-[15px] font-semibold m-0">{t('Asl nusxa')}</h2>
        {asl}        {r && !r.ok && r.status !== 403 && r.status !== 401 && <p className="m-0 text-[12px]" role="alert">{xatoMatni(r.code)}</p>}
      </Karta>
      {chop && <ChopKorinish kanon={chop} token={token} origin={window.location.origin} sarlavha={(nashr?.turi ?? hujjat?.turi) || t('Hujjat')} imzolar={d.imzolar} yopish={() => setChop(null)} />}
    </Qobiq>
  );
}
