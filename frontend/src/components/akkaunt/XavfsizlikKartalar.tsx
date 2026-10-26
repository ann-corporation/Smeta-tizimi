/** Xavfsizlik kartalari: parol o‘zgartirish/o‘rnatish, joriy sessiya, Google ulanishi. */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Circle, Eye, EyeOff, LogOut, Monitor } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { t } from '../../i18n/til';
import {
  PROFIL_KALIT, boshqaSessiyalarChiqish, googleUzish, parolKuchi, parolOzgartir, parolTalablari, qurilmaNomi, xatoMatn,
  type Profil, type ProfilSessiya,
} from '../../api/profil';
import { INPUT_SINF, INPUT_STIL, Karta, Maydon, Nota, Qator } from './AkkauntUi';

function sanaVaqt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/* ───────── Parol ───────── */
function ParolMaydoni({ yorliq, qiymat, onOzgar, korinadi, onKorsat, avto, xato, yordam }: {
  yorliq: string; qiymat: string; onOzgar: (v: string) => void; korinadi: boolean; onKorsat: () => void; avto: string; xato?: string | null; yordam?: string;
}) {
  const korsat = t('Parolni ko‘rsatish');
  const yashir = t('Parolni yashirish');
  return (
    <Maydon yorliq={yorliq} xato={xato} yordam={yordam}>
      {(p) => (
        <div className="relative">
          <input {...p} type={korinadi ? 'text' : 'password'} value={qiymat} autoComplete={avto} maxLength={200}
            onChange={(e) => onOzgar(e.target.value)} className={`${INPUT_SINF} pr-10`} style={INPUT_STIL} />
          <button type="button" onClick={onKorsat} aria-label={`${korinadi ? yashir : korsat}: ${yorliq}`} aria-pressed={korinadi}
            className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text cursor-pointer"
            style={{ width: 32, height: 32 }}>
            {korinadi ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        </div>
      )}
    </Maydon>
  );
}

const KUCH_NOMI = ['Parol kiritilmagan', 'Juda zaif', 'Zaif', 'O‘rtacha', 'Kuchli'] as const;
const KUCH_RANG = ['var(--surface-3)', 'var(--danger)', 'var(--warn)', 'var(--info)', 'var(--ok)'] as const;

export function ParolForma({ parolBor, parolYangilandi }: { parolBor: boolean; parolYangilandi?: string | null }) {
  const qc = useQueryClient();
  const [eski, setEski] = useState('');
  const [yangi, setYangi] = useState('');
  const [takror, setTakror] = useState('');
  const [korinadi, setKorinadi] = useState({ eski: false, yangi: false, takror: false });
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<{ kod: string; matn: string } | null>(null);
  const [kopUrinish, setKopUrinish] = useState(false);

  const talablar = parolTalablari(yangi, parolBor ? eski : undefined);
  const majburiyOk = talablar.filter((x) => x.majburiy).every((x) => x.bajarildi);
  const kuch = parolKuchi(yangi);
  const mosKelmaydi = takror.length > 0 && takror !== yangi;
  const tayyor = majburiyOk && yangi.length > 0 && takror === yangi && (!parolBor || eski.length > 0) && !kopUrinish;

  const ozgar = (f: (v: string) => void) => (v: string) => { f(v); setXato(null); setKopUrinish(false); };
  const almashtir = (k: keyof typeof korinadi) => () => setKorinadi((x) => ({ ...x, [k]: !x[k] }));

  const yubor = async (e: FormEvent) => {
    e.preventDefault();
    if (!tayyor || band) return;
    setBand(true); setXato(null);
    const r = await parolOzgartir({ eski: parolBor ? eski : undefined, yangi });
    setBand(false);
    if (!r.ok) {
      if (r.code === 'KOP_URINISH') setKopUrinish(true);
      setXato({ kod: r.code, matn: xatoMatn(r.code) });
      return;
    }
    setEski(''); setYangi(''); setTakror('');
    setKorinadi({ eski: false, yangi: false, takror: false });
    void qc.invalidateQueries({ queryKey: PROFIL_KALIT });
    toast(t('Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi.'), 'ok');
  };

  const sarlavha = parolBor ? 'Parolni o‘zgartirish' : 'Parol o‘rnatish';
  const tavsif = parolBor
    ? 'Parolni yangilasangiz, shu qurilmada kirib turasiz; boshqa qurilmalardagi sessiyalar yopiladi.'
    : 'Hozir bu akkauntda parol yo‘q — faqat Google orqali kirasiz. Parol o‘rnatsangiz, login va parol bilan ham kira olasiz.';

  return (
    <form onSubmit={(e) => { void yubor(e); }} noValidate aria-label={t(sarlavha)}>
      <Karta sarlavha={sarlavha} tavsif={tavsif}>
        {parolBor && (
          <ParolMaydoni yorliq={t('Joriy parol')} qiymat={eski} onOzgar={ozgar(setEski)} korinadi={korinadi.eski} onKorsat={almashtir('eski')} avto="current-password"
            xato={xato?.kod === 'ESKI_PAROL_XATO' ? xato.matn : null} />
        )}
        <ParolMaydoni yorliq={t('Yangi parol')} qiymat={yangi} onOzgar={ozgar(setYangi)} korinadi={korinadi.yangi} onKorsat={almashtir('yangi')} avto="new-password"
          xato={xato && ['PAROL_QISQA', 'PAROL_UZUN', 'PAROL_BIR_XIL'].includes(xato.kod) ? xato.matn : null} />

        <div aria-live="polite" className="flex flex-col gap-1.5">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= kuch ? KUCH_RANG[kuch] : 'var(--surface-3)' }} />
            ))}
          </div>
          <span className="text-[12px] text-text-dim">{t('Parol kuchi')}: {t(KUCH_NOMI[kuch])} <span className="text-text-mute">({t('faqat maslahat')})</span></span>
          <ul className="m-0 p-0 list-none flex flex-col gap-0.5" aria-label={t('Parol talablari')}>
            {talablar.map((x) => {
              const Ikon = x.bajarildi ? Check : Circle;
              return (
                <li key={x.id} className="flex items-center gap-1.5 text-[12px]" style={{ color: x.bajarildi ? 'var(--ok)' : 'var(--text-dim)' }}>
                  <Ikon size={12} aria-hidden="true" /><span>{t(x.matn)}</span>
                  <span className="sr-only">{x.bajarildi ? t('bajarildi') : t('bajarilmagan')}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <ParolMaydoni yorliq={t('Yangi parolni takrorlang')} qiymat={takror} onOzgar={ozgar(setTakror)} korinadi={korinadi.takror} onKorsat={almashtir('takror')} avto="new-password"
          xato={mosKelmaydi ? t('Parollar mos kelmayapti') : null} />

        {kopUrinish && <Nota tur="warn">{t('Juda ko‘p urinish bo‘ldi. Xavfsizlik uchun birozdan so‘ng (taxminan bir necha daqiqadan keyin) qayta urinib ko‘ring.')}</Nota>}
        {xato && !kopUrinish && !['ESKI_PAROL_XATO', 'PAROL_QISQA', 'PAROL_UZUN', 'PAROL_BIR_XIL'].includes(xato.kod) && <Nota tur="danger">{xato.matn}</Nota>}

        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" className="fz-btn fz-btn--primary" disabled={!tayyor || band}>
            {band ? t('Saqlanmoqda…') : parolBor ? t('Parolni yangilash') : t('Parolni o‘rnatish')}
          </button>
          <span className="text-[12px] text-text-dim">{t('Oxirgi o‘zgarish')}: {sanaVaqt(parolYangilandi)}</span>
        </div>
      </Karta>
    </form>
  );
}

/* ───────── Joriy sessiya ───────── */
export function qolganMuddat(tugaydi: Date, hozir: number): string {
  const ms = tugaydi.getTime() - hozir;
  if (ms <= 0) return t('Muddati tugagan');
  const kun = Math.floor(ms / 86_400_000);
  if (kun >= 1) return t('{n} kun qoldi', { n: kun });
  const soat = Math.max(1, Math.floor(ms / 3_600_000));
  return t('{n} soat qoldi', { n: soat });
}

export function SessiyaKarta({ sessiya, onChiqildi }: { sessiya: ProfilSessiya | null; onChiqildi?: () => void }) {
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const boshl = sessiya ? new Date(sessiya.boshlangan) : null;
  const tug = sessiya ? new Date(sessiya.tugaydi) : null;
  const yaroqli = !!boshl && !!tug && !Number.isNaN(boshl.getTime()) && !Number.isNaN(tug.getTime()) && tug > boshl;
  const hozir = Date.now();
  const foiz = yaroqli ? Math.min(100, Math.max(0, Math.round(((hozir - boshl!.getTime()) / (tug!.getTime() - boshl!.getTime())) * 100))) : null;
  const qurilma = qurilmaNomi(typeof navigator !== 'undefined' ? navigator.userAgent : '');

  const chiq = async () => {
    const ha = await tasdiqSora({
      sarlavha: t('Boshqa qurilmalardan chiqish'),
      matn: t('Shu qurilmadan tashqari barcha qurilmalardagi sessiyalaringiz yopiladi. Shu qurilmada kirib turasiz. Davom etasizmi?'),
      tasdiqMatni: t('Chiqish'), bekorMatni: t('Bekor qilish'), xavfli: true,
    });
    if (!ha) return;
    setBand(true); setXato(null);
    const r = await boshqaSessiyalarChiqish();
    setBand(false);
    if (!r.ok) { setXato(xatoMatn(r.code)); return; }
    toast(t('Boshqa qurilmalardagi sessiyalar yopildi.'), 'ok');
    onChiqildi?.();
  };

  return (
    <Karta sarlavha="Sessiyalar" tavsif="Hozirgi qurilmadagi sessiya va boshqa qurilmalardan chiqish.">
      <div className="flex items-center gap-2 text-[13px] text-text">
        <Monitor size={16} aria-hidden="true" className="text-text-dim shrink-0" />
        <span className="font-semibold">{t('Shu qurilma')}</span>
        <span className="fz-chip fz-chip--accent">{qurilma}</span>
      </div>
      <div>
        <Qator yorliq="Boshlangan" qiymat={sanaVaqt(sessiya?.boshlangan)} />
        <Qator yorliq="Tugaydi" qiymat={sanaVaqt(sessiya?.tugaydi)} />
      </div>
      {foiz !== null && tug && (
        <div className="flex flex-col gap-1">
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={foiz} aria-label={t('Sessiya muddati')}
            className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
            <div className="h-full rounded-full" style={{ width: `${foiz}%`, background: foiz >= 90 ? 'var(--warn)' : 'var(--accent)' }} />
          </div>
          <span className="text-[12px] text-text-dim">{qolganMuddat(tug, hozir)}</span>
        </div>
      )}
      {xato && <Nota tur="danger">{xato}</Nota>}
      <button type="button" className="fz-btn fz-btn--danger self-start" onClick={() => { void chiq(); }} disabled={band}>
        <LogOut aria-hidden="true" />{band ? t('Bajarilmoqda…') : t('Boshqa barcha qurilmalardan chiqish')}
      </button>
      <Nota tur="info">{t('Qurilmalar ro‘yxati yuritilmaydi: serverda har bir qurilma alohida kuzatilmaydi, shu sababli faqat «boshqa hammasidan chiqish» mavjud.')}</Nota>
    </Karta>
  );
}

/* ───────── Google ───────── */
export function GoogleKarta({ profil }: { profil: Profil }) {
  const qc = useQueryClient();
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const uz = async () => {
    const ha = await tasdiqSora({
      sarlavha: t('Google’ni uzish'),
      matn: t('Google akkaunti shu hisobdan uziladi. Bundan keyin faqat login va parol bilan kirasiz. Davom etasizmi?'),
      tasdiqMatni: t('Uzish'), bekorMatni: t('Bekor qilish'), xavfli: true,
    });
    if (!ha) return;
    setBand(true); setXato(null);
    const r = await googleUzish();
    setBand(false);
    if (!r.ok) { setXato(xatoMatn(r.code)); return; }
    void qc.invalidateQueries({ queryKey: PROFIL_KALIT });
    toast(t('Google uzildi'), 'ok');
  };

  return (
    <Karta sarlavha="Google" tavsif="Google akkaunti orqali kirish.">
      <Qator yorliq="Holat" qiymat={<span className={`fz-chip ${profil.google_ulangan ? 'fz-chip--accent' : ''}`}>{profil.google_ulangan ? t('Ulangan') : t('Ulanmagan')}</span>} />
      {profil.google_ulangan ? (
        <>
          {profil.email && <Qator yorliq="Elektron pochta" qiymat={profil.email} />}
          {!profil.parol_bor && <Nota tur="warn">{t('Google’ni uzish uchun avval parol o‘rnating — aks holda akkauntga kira olmay qolasiz.')}</Nota>}
          {xato && <Nota tur="danger">{xato}</Nota>}
          <button type="button" className="fz-btn fz-btn--danger self-start" onClick={() => { void uz(); }} disabled={!profil.parol_bor || band}>
            {band ? t('Bajarilmoqda…') : t('Google’ni uzish')}
          </button>
        </>
      ) : (
        <Nota tur="info">
          {t('Google hisobingiz hali ulanmagan. «Kirish usullari» bo‘limida Google’ni shu hisobga ulashingiz yoki ikkinchi hisobni birlashtirishingiz mumkin.')}{' '}
          <Link to="/admin/akkaunt?bolim=kirish" className="underline text-[var(--accent-text)]">{t('Kirish usullariga o‘tish')}</Link>
        </Nota>
      )}
    </Karta>
  );
}
