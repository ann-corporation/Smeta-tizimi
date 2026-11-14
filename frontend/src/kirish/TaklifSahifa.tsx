/**
 * Taklifni qabul qilish (emailsiz kirish): /taklif/:token (havola) yoki /taklif (telefon + 8 xonali kod).
 * Yangi odam o'z parolini o'rnatadi; lavozim aynan taklifdagidek (mijoz tanlamaydi). Telefon raqami allaqachon hisobda
 * bo'lsa — jim ulanmaydi: egasi avval kiradi, so'ng shu sahifada «Mavjud hisobga ulash»ni bosadi.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { t } from '../i18n/til';
import { taklifQabulQil, taklifUlash } from '../api/kirish-taklif';
import { telefonE164, telefonNiqob } from '../lib/telefon-niqob';
import { MAVJUD_FOYDALANUVCHI_KIRISH } from '../lib/nav/boshSahifa';
import { PublicEntry } from '../components/public-entry/PublicEntry';

const XATO: Record<string, string> = {
  TAKLIF_RAD: 'Kod yoki havola noto‘g‘ri, muddati tugagan yoki ishlatilgan.', HISOB_BOR: 'Bu raqam bilan hisob allaqachon bor. Avval o‘sha hisobga kiring, so‘ng shu sahifada «Mavjud hisobga ulash»ni bosing.',
  PAROL_QISQA: 'Parol kamida 8 belgidan iborat bo‘lsin.', PAROL_UZUN: 'Parol juda uzun.', PAROL_OSON: 'Parol juda oddiy. Boshqasini tanlang.',
  PAROL_TELEFON: 'Parol telefon raqamingizni o‘z ichiga olmasin.', PAROL_KOD: 'Parol taklif kodiga teng bo‘lmasin.', LIMIT: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.',
  YOQILMAGAN: 'Taklif orqali kirish hali yoqilmagan.', AUTH_REQUIRED: 'Avval tizimga kiring.', ALLAQACHON_AZO: 'Siz allaqachon shu kompaniya a‘zosisiz.',
};

export default function TaklifSahifa() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [tel, setTel] = useState('');
  const [kod, setKod] = useState('');
  const [parol, setParol] = useState('');
  const [parol2, setParol2] = useState('');
  const [xato, setXato] = useState('');
  const [band, setBand] = useState(false);
  const [kirgan, setKirgan] = useState(false);
  const [hisobBor, setHisobBor] = useState(false);

  useEffect(() => {
    let tirik = true;
    try { void fetch('/api/sessiya').then((r) => { if (tirik && r.ok) setKirgan(true); }).catch(() => undefined); } catch { /* tarmoq yo'q */ }
    return () => { tirik = false; };
  }, []);

  const asos = token ? { token } : { telefon: telefonE164(tel) ?? '', kod: kod.replace(/\s+/g, '') };
  const asosTayyor = token ? true : !!telefonE164(tel) && /^\d{8}$/.test(kod.replace(/\s+/g, ''));

  async function qabul(e: React.FormEvent) {
    e.preventDefault();
    if (parol !== parol2) { setXato(t('Parollar bir xil emas.')); return; }
    setBand(true); setXato('');
    const r = await taklifQabulQil({ ...asos, parol });
    setBand(false);
    if (r.ok) { navigate(MAVJUD_FOYDALANUVCHI_KIRISH); return; }
    if (r.code === 'HISOB_BOR') setHisobBor(true);
    setXato(t(XATO[r.code || ''] ?? r.xabar ?? 'Qabul qilib bo‘lmadi.'));
  }
  async function ulash() {
    setBand(true); setXato('');
    const r = await taklifUlash(asos);
    setBand(false);
    if (r.ok) { navigate(MAVJUD_FOYDALANUVCHI_KIRISH); return; }
    setXato(t(XATO[r.code || ''] ?? r.xabar ?? 'Ulab bo‘lmadi.'));
  }

  return (
    <PublicEntry kirgan={kirgan} onOpenApp={() => navigate(MAVJUD_FOYDALANUVCHI_KIRISH)} onChooseAuth={() => navigate('/kirish')}>
      <div className="entry-auth">
        <h2 className="entry-auth-title">{t('Taklifni qabul qilish')}</h2>
        <p className="entry-auth-note">{t('Kompaniya sizni tizimga taklif qildi. Email kerak emas: o‘zingiz parol tanlaysiz, keyin telefon raqamingiz va shu parol bilan kirasiz.')}</p>
        <form className="entry-auth-form" onSubmit={(e) => void qabul(e)} noValidate>
          {!token && <>
            <div className="entry-field"><label htmlFor="taklif-tel">{t('Telefon raqamingiz')}</label>
              <div className="entry-input-wrap"><input id="taklif-tel" className="entry-input" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(telefonNiqob(e.target.value))} placeholder="+998 90 123 45 67" /></div></div>
            <div className="entry-field"><label htmlFor="taklif-kod">{t('Taklif kodi (8 xona)')}</label>
              <div className="entry-input-wrap"><input id="taklif-kod" className="entry-input entry-input--code" inputMode="numeric" autoComplete="one-time-code" maxLength={9} value={kod} onChange={(e) => setKod(e.target.value.replace(/[^\d\s]/g, ''))} placeholder="••••••••" /></div></div>
          </>}
          <div className="entry-field"><label htmlFor="taklif-parol">{t('Yangi parol')}</label>
            <div className="entry-input-wrap"><input id="taklif-parol" className="entry-input" type="password" autoComplete="new-password" value={parol} onChange={(e) => setParol(e.target.value)} /></div></div>
          <div className="entry-field"><label htmlFor="taklif-parol2">{t('Parolni takrorlang')}</label>
            <div className="entry-input-wrap"><input id="taklif-parol2" className="entry-input" type="password" autoComplete="new-password" value={parol2} onChange={(e) => setParol2(e.target.value)} /></div></div>
          <p className="entry-auth-note">{t('Parol kamida 8 belgi; telefon raqamingiz yoki kod bo‘lmasin.')}</p>
          {xato && <div className="entry-auth-error" role="alert">{xato}</div>}
          <button type="submit" className="entry-auth-submit" disabled={band || !asosTayyor || parol.length < 8 || parol !== parol2}>
            {band ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null} {t('Parol o‘rnatib kirish')}
          </button>
        </form>
        {(hisobBor || kirgan) && <div className="entry-auth-form">
          <p className="entry-auth-note">{kirgan ? t('Sizda hisob bor va tizimdasiz: taklifni mavjud hisobingizga ulash mumkin.') : t('Hisobingiz bo‘lsa avval kiring, keyin shu havolani qayta oching.')}</p>
          {kirgan ? <button type="button" className="entry-auth-alt" disabled={band || !asosTayyor} onClick={() => void ulash()}>{t('Mavjud hisobga ulash')}</button>
            : <Link className="entry-auth-alt" to="/kirish">{t('Kirish')}</Link>}
        </div>}
      </div>
    </PublicEntry>
  );
}
