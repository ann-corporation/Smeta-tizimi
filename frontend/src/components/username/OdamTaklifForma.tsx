/**
 * OdamTaklifForma — «Kompaniyaga qo'shish»: BITTA maydonga @username, telefon yoki email (aniq) yoziladi, turi avtomatik aniqlanadi.
 * Odam jimgina a'zo qilinmaydi: KUTILADIGAN taklif yuboriladi, u qabul qilgach a'zo bo'ladi.
 * Autocomplete — faqat o'z kompaniyadoshlar orasida (begonalar orasida prefiks qidiruvi yo'q). Telefon/email qidiruvi faqat «Yuborish» bosilganda
 * (aniq moslik, soatiga 30 ta limit). Hisob topilmasa va telefon bo'lsa — mavjud «havola/kod» taklifi (SMS yuborilmaydi, kod/havola ko'rsatiladi).
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Send } from 'lucide-react';
import { t } from '../../i18n/til';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { kompaniyaTaklifYubor, kompaniyadoshQidir, usernameXatoMatn, type OdamProfil } from '../../api/username';
import { taklifYarat } from '../../api/kirish-taklif';
import { qiymatTuri, usernameNorm } from '../../lib/username/username';
import { INPUT_SINF, INPUT_STIL } from '../akkaunt/AkkauntUi';

const TAKLIF_ROLLARI = ['rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'] as const;
const TURI_NOMI = { username: 'username', telefon: 'telefon raqami', email: 'email', noaniq: '' } as const;

export function OdamTaklifForma({ kompaniyaId, onYuborildi }: { kompaniyaId: number; onYuborildi?: (p: OdamProfil) => void }) {
  const [qiymat, setQiymat] = useState('');
  const [rol, setRol] = useState<string>('prorab');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [yuborildi, setYuborildi] = useState<OdamProfil | null>(null);
  const [odamlar, setOdamlar] = useState<OdamProfil[]>([]);
  const [telTaklif, setTelTaklif] = useState<{ telefon: string } | null>(null);
  const [ism, setIsm] = useState('');
  const [havola, setHavola] = useState<{ kod: string; havola: string } | null>(null);
  const soraldi = useRef(0);

  const tur = qiymatTuri(qiymat);

  // Autocomplete: faqat kompaniyadoshlar orasida (ism yoki @username boshlanishi); telefon/email ko'rinishida so'ralmaydi.
  useEffect(() => {
    const s = usernameNorm(qiymat) ?? '';
    if (tur === 'telefon' || tur === 'email' || s.length < 2) { setOdamlar([]); return; }
    const n = ++soraldi.current;
    const id = setTimeout(() => {
      void kompaniyadoshQidir(s).then((r) => { if (n === soraldi.current) setOdamlar(r.ok ? r.royxat : []); });
    }, 300);
    return () => clearTimeout(id);
  }, [qiymat, tur]);

  const yubor = async () => {
    if (band || tur === 'noaniq') return;
    setBand(true); setXato(null); setYuborildi(null); setTelTaklif(null); setHavola(null);
    const r = await kompaniyaTaklifYubor(kompaniyaId, qiymat.trim(), rol);
    setBand(false);
    if (r.ok) { setYuborildi(r.profil); setQiymat(''); setOdamlar([]); onYuborildi?.(r.profil); return; }
    if (r.code === 'TOPILMADI' && r.telefon_taklif && r.telefon) { setTelTaklif({ telefon: r.telefon }); return; }
    setXato(usernameXatoMatn(r.code));
  };

  const havolaYarat = async () => {
    if (!telTaklif || band) return;
    setBand(true); setXato(null);
    const r = await taklifYarat({ kompaniyaId, ism: ism.trim(), telefon: telTaklif.telefon, rol });
    setBand(false);
    if (!r.ok || !r.kod || !r.havola) { setXato(r.xabar || usernameXatoMatn(r.code)); return; }
    setHavola({ kod: r.kod, havola: r.havola });
  };

  const nusxa = (matn: string) => { void navigator.clipboard?.writeText(matn).catch(() => undefined); };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]">
        <div className="relative min-w-0">
          <input className={INPUT_SINF} style={INPUT_STIL} aria-label={t('@username, telefon yoki email')} placeholder={t('@username, telefon yoki email')}
            value={qiymat} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => { setQiymat(e.target.value); setYuborildi(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void yubor(); }} />
          {odamlar.length > 0 && (
            <ul role="listbox" aria-label={t('Kompaniyadoshlar')} className="absolute z-10 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg p-1 m-0 list-none">
              {odamlar.map((o) => (
                <li key={o.id} role="option" aria-selected={false}>
                  <button type="button" className="w-full text-left rounded px-2 py-1.5 text-[13px] hover:bg-[var(--surface-2)] cursor-pointer" onClick={() => { setQiymat(o.username ? '@' + o.username : o.ism); setOdamlar([]); }}>
                    <span className="font-medium text-text">{o.ism}</span>{o.username && <span className="ml-2 text-text-dim">@{o.username}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <select className={INPUT_SINF} style={INPUT_STIL} aria-label={t('Lavozim')} value={rol} onChange={(e) => setRol(e.target.value)}>
          {TAKLIF_ROLLARI.map((r) => <option key={r} value={r}>{t(ROLE_LABELS[r] || r)}</option>)}
        </select>
        <button type="button" className="fz-btn fz-btn--primary" disabled={band || tur === 'noaniq'} onClick={() => void yubor()}>
          {band ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}{t('Taklif yuborish')}
        </button>
      </div>
      <p className="text-[12px] text-text-mute m-0" aria-live="polite">
        {tur === 'noaniq' ? t('Odamni @username, telefon raqami yoki email bo‘yicha toping. U taklifni qabul qilgach a’zo bo‘ladi.') : t('Aniqlandi: {tur}', { tur: t(TURI_NOMI[tur]) })}
      </p>
      {yuborildi && <p role="status" className="inline-flex items-center gap-1 text-[13px] m-0"><Check size={14} aria-hidden="true" />{t('Taklif yuborildi')}: <b>{yuborildi.ism}</b>{yuborildi.username && <span> @{yuborildi.username}</span>}</p>}
      {xato && <p role="alert" className="fz-note fz-note--danger m-0">{xato}</p>}
      {telTaklif && !havola && (
        <div className="fz-note fz-note--info flex-col items-stretch gap-2">
          <span>{t('Bu raqam bilan hisob topilmadi. Taklif havolasi va kod yaratib, SMS yoki Telegram orqali o‘zingiz yuborishingiz mumkin.')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <input className={INPUT_SINF} style={{ ...INPUT_STIL, maxWidth: '16rem' }} aria-label={t('Ism')} placeholder={t('Odamning ismi')} value={ism} onChange={(e) => setIsm(e.target.value)} />
            <button type="button" className="fz-btn fz-btn--primary" disabled={band || ism.trim().length < 2} onClick={() => void havolaYarat()}>{t('Havola va kod yaratish')}</button>
          </div>
        </div>
      )}
      {havola && (
        <div className="fz-note fz-note--info flex-col items-stretch gap-1" role="status">
          <span>{t('Faqat hozir ko‘rinadi — nusxa oling va odamga yuboring.')}</span>
          <div className="flex items-center gap-2 flex-wrap"><code className="select-all">{havola.havola}</code><button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => nusxa(havola.havola)}><Copy size={12} aria-hidden="true" />{t('Havolani nusxalash')}</button></div>
          <div className="flex items-center gap-2 flex-wrap">{t('Kod')}: <code className="select-all">{havola.kod}</code><button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => nusxa(havola.kod)}><Copy size={12} aria-hidden="true" />{t('Kodni nusxalash')}</button></div>
        </div>
      )}
    </div>
  );
}