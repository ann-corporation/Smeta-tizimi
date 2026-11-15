/**
 * UsernameKarta — o'z @username i: jonli bo'shlik tekshiruvi, ismdan takliflar, saqlash/o'chirish va
 * «meni telefon/email bo'yicha kim topadi» sozlamasi. Profil kartasi (`rejim="karta"`) va ro'yxatdan o'tish/onboarding
 * (`rejim="tanlov"`, «Keyinroq» tugmasi bilan o'tkazib yuboriladi) uchun bitta komponent.
 * Mantiq serverda: yakuniy qaror RPC da; bu yerda faqat oldindan ko'rsatma (usernameXato) va debounce bilan bo'shlik tekshiruvi.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import {
  telefonQidiruvBelgila, usernameBelgila, usernameOl, usernameTekshir, usernameXatoMatn, type TelefonQidiruv, type UsernameHolat, type UsernameTekshiruv,
} from '../../api/username';
import { telegramUsernameTaklifi, usernameNorm, usernameTakliflari, usernameXato, USERNAME_MAX, DEBOUNCE_MS } from '../../lib/username/username';
import { INPUT_SINF, INPUT_STIL, Karta, Maydon } from '../akkaunt/AkkauntUi';

type Holat = 'bosh' | 'yaroqsiz' | 'tekshirilmoqda' | 'bosh_emas' | 'tayyor' | 'xato';

export function UsernameKarta({ ism, login, rejim = 'karta', telegramUsername, onTayyor, onKeyin }: {
  ism: string | null; login?: string | null; rejim?: 'karta' | 'tanlov'; telegramUsername?: string | null; onTayyor?: (username: string | null) => void; onKeyin?: () => void;
}) {
  const [hozirgi, setHozirgi] = useState<UsernameHolat | null>(null);
  const [yuklandi, setYuklandi] = useState(false);
  const [qiymat, setQiymat] = useState('');
  const [holat, setHolat] = useState<Holat>('bosh');
  const [tekshiruv, setTekshiruv] = useState<UsernameTekshiruv | null>(null);
  const [xatoKod, setXatoKod] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const soraldi = useRef(0);

  const takliflar = useMemo(() => {
    const tg = telegramUsernameTaklifi(telegramUsername);
    return [...(tg ? [tg] : []), ...usernameTakliflari(ism, login)].filter((x, i, a) => a.indexOf(x) === i).slice(0, 8);
  }, [ism, login, telegramUsername]);

  useEffect(() => {
    let tirik = true;
    void usernameOl().then((r) => {
      if (!tirik) return;
      if (r.ok) { setHozirgi(r); setQiymat(r.username ?? ''); }
      setYuklandi(true);
    });
    return () => { tirik = false; };
  }, []);

  const norm = usernameNorm(qiymat);
  const ozgargan = norm !== (hozirgi?.username ?? null);

  // Jonli tekshiruv (debounce). Eski javob yangisini bosib ketmasligi uchun soraldi hisoblagichi.
  useEffect(() => {
    if (!yuklandi || !ozgargan) { setHolat('bosh'); setTekshiruv(null); return; }
    if (norm === null) { setHolat('bosh'); return; }
    const x = usernameXato(norm);
    if (x) { setHolat('yaroqsiz'); setXatoKod(x); return; }
    setHolat('tekshirilmoqda');
    const n = ++soraldi.current;
    const id = setTimeout(() => {
      void usernameTekshir(norm, takliflar.filter((v) => v !== norm)).then((r) => {
        if (n !== soraldi.current) return;
        if (!r.ok) { setHolat('xato'); setXatoKod(r.code); return; }
        setTekshiruv(r);
        setHolat(r.bosh ? 'tayyor' : 'bosh_emas');
        setXatoKod(r.sabab);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [norm, ozgargan, yuklandi, takliflar]);

  const saqla = async (yangi: string | null) => {
    if (band) return;
    setBand(true);
    const r = await usernameBelgila(yangi);
    setBand(false);
    if (!r.ok) { setHolat('xato'); setXatoKod(r.code); return; }
    setHozirgi((h) => (h ? { ...h, username: r.username, bugun_qoldi: hozirgi?.username ? Math.max(h.bugun_qoldi - 1, 0) : h.bugun_qoldi } : h));
    setQiymat(r.username ?? '');
    toast(r.username ? t('Username saqlandi') : t('Username o‘chirildi'), 'ok');
    onTayyor?.(r.username);
  };

  const sozlama = async (v: TelefonQidiruv) => {
    const r = await telefonQidiruvBelgila(v);
    if (!r.ok) { toast(usernameXatoMatn(r.code), 'danger'); return; }
    setHozirgi((h) => (h ? { ...h, telefon_qidiruv: v } : h));
    toast(t('Sozlama saqlandi'), 'ok');
  };

  const xabar = (() => {
    if (!ozgargan) return null;
    if (holat === 'tekshirilmoqda') return <span className="inline-flex items-center gap-1 text-text-dim"><Loader2 size={12} className="animate-spin" aria-hidden="true" />{t('Tekshirilmoqda…')}</span>;
    if (holat === 'tayyor') return <span className="inline-flex items-center gap-1 text-[var(--ok,#16a34a)]"><Check size={12} aria-hidden="true" />{t('Bo‘sh — olishingiz mumkin')}</span>;
    if (holat === 'bosh_emas') return <span className="inline-flex items-center gap-1 text-[var(--danger)]"><X size={12} aria-hidden="true" />{usernameXatoMatn(xatoKod ?? 'USERNAME_BAND')}</span>;
    if (holat === 'yaroqsiz' || holat === 'xato') return <span className="text-[var(--danger)]">{usernameXatoMatn(xatoKod)}</span>;
    return null;
  })();
  const variantlar = (tekshiruv && holat === 'bosh_emas' ? tekshiruv.variantlar : (!qiymat ? takliflar : [])).slice(0, 5);
  const saqlashMumkin = ozgargan && norm !== null && holat === 'tayyor' && !band;

  const govda = (
    <>
      <Maydon yorliq={t('Username')} yordam={t('5–32 belgi: kichik lotin harflari, raqamlar va _; harf bilan boshlanadi.')}>
        {(p) => (
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-text-dim text-[14px]">@</span>
            <input {...p} className={INPUT_SINF} style={INPUT_STIL} value={qiymat} maxLength={USERNAME_MAX + 1} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder={t('masalan: alisher_navoiy')} onChange={(e) => setQiymat(e.target.value.replace(/^@+/, ''))} />
          </div>
        )}
      </Maydon>
      <div className="text-[12px] min-h-[18px]" role="status" aria-live="polite">{xabar}</div>
      {variantlar.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label={t('Takliflar')}>
          {variantlar.map((v) => (
            <button key={v} type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setQiymat(v)}>@{v}</button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fz-btn fz-btn--primary" disabled={!saqlashMumkin} onClick={() => void saqla(norm)}>
          {band ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}{t('Username’ni saqlash')}
        </button>
        {rejim === 'karta' && hozirgi?.username && (
          <button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={() => void saqla(null)}>{t('O‘chirish')}</button>
        )}
        {rejim === 'tanlov' && onKeyin && <button type="button" className="fz-btn fz-btn--ghost" onClick={onKeyin}>{t('Keyinroq')}</button>}
        {hozirgi && hozirgi.username && <span className="text-[11px] text-text-mute">{t('Bugun qolgan o‘zgartirishlar')}: {hozirgi.bugun_qoldi}</span>}
      </div>
      {rejim === 'karta' && hozirgi && (
        <Maydon yorliq={t('Meni telefon raqami yoki email bo‘yicha kim topa oladi')} yordam={t('Faqat aniq moslik; telefon va email hech kimga ko‘rsatilmaydi. @username bo‘yicha topish doim yoqiq.')}>
          {(p) => (
            <select {...p} className={INPUT_SINF} style={INPUT_STIL} value={hozirgi.telefon_qidiruv} onChange={(e) => void sozlama(e.target.value as TelefonQidiruv)}>
              <option value="hammasi">{t('Hamma')}</option>
              <option value="kompaniyadosh">{t('Faqat kompaniyadoshlar')}</option>
              <option value="hech">{t('Hech kim')}</option>
            </select>
          )}
        </Maydon>
      )}
    </>
  );

  if (rejim === 'tanlov') return <div className="flex flex-col gap-3">{govda}</div>;
  return <Karta sarlavha="Username" tavsif="Telegram’dagi kabi noyob @username — odamlar sizni kompaniyaga qo‘shish, taklif va topshiriq uchun shu orqali topadi.">{govda}</Karta>;
}
