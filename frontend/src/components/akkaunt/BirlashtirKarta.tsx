/**
 * «Bitta hisob — barcha kirish usullari»: ulangan usullar (login/parol, Google), Google'ni shu hisobga ulash
 * (kirmasdan — `google_ulash`) va ikkinchi hisobni birlashtirish (`hisob_birlashtir`). Yakuniy qaror — serverda.
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, GitMerge, RefreshCw, X } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { t } from '../../i18n/til';
import GoogleKirish from '../../kirish/GoogleKirish';
import { useMen } from '../../api/t2-men';
import { PROFIL_KALIT, googleUlash, hisobBirlashtir, xatoMatn, type BirlashtirNatija, type Profil } from '../../api/profil';
import { rolNomi } from './akkaunt-lib';
import { INPUT_SINF, INPUT_STIL, Karta, Maydon, Nota, Qator } from './AkkauntUi';

/** `qolgan_rollar` elementi satr yoki `{ rol }` bo‘lishi mumkin — ko‘rsatiladigan matn (aniqlanmasa — null). */
export function rolElementi(x: unknown): string | null {
  if (typeof x === 'string' && x) return x;
  if (x && typeof x === 'object') {
    const r = (x as { rol?: unknown; nom?: unknown }).rol ?? (x as { nom?: unknown }).nom;
    if (typeof r === 'string' && r) return r;
  }
  return null;
}

function Holat({ ha, yoqMatn, bor }: { ha: boolean; bor: string; yoqMatn: string }) {
  const Ikon = ha ? Check : X;
  return (
    <span className={`fz-chip ${ha ? 'fz-chip--accent' : ''} inline-flex items-center gap-1`}>
      <Ikon size={12} aria-hidden="true" />{ha ? bor : yoqMatn}
    </span>
  );
}

function Xulosa({ natija }: { natija: BirlashtirNatija }) {
  const men = useMen();
  const nomlar = new Map((men.data?.azoliklar ?? []).map((a) => [a.kompaniya_id, a.nom]));
  const kompaniyalar = natija.kochirilgan_kompaniyalar ?? [];
  const qolgan = (natija.qolgan_rollar ?? []).map(rolElementi).filter((x): x is string => !!x);
  const nomsiz = (id: number) => t('Kompaniya № {n}', { n: id });
  return (
    <div className="flex flex-col gap-3" role="status" data-testid="birlashtirish-xulosa">
      <Nota tur="info">{t('Hisoblar birlashtirildi. Endi ikkinchi hisob login bilan kirsangiz ham shu hisobga tushasiz.')}</Nota>
      <div>
        <div className="text-[12px] text-text-dim mb-1">{t('Ko‘chirilgan kompaniyalar va rollar')}</div>
        {kompaniyalar.length === 0 ? <p className="m-0 text-[13px] text-text-dim">{t('Kompaniya ko‘chirilmadi (ikkinchi hisobda ish joyi bo‘lmagan).')}</p> : (
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {kompaniyalar.map((k, i) => (
              <li key={`${k.kompaniya_id}-${k.rol}-${i}`} className="flex items-center justify-between gap-2 border-b border-[var(--border)] last:border-0 py-1.5 text-[13px]">
                <span className="min-w-0 truncate">{nomlar.get(k.kompaniya_id) ?? nomsiz(k.kompaniya_id)}</span>
                <span className="fz-chip shrink-0">{t(rolNomi(k.rol))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {qolgan.length > 0 && (
        <div>
          <div className="text-[12px] text-text-dim mb-1">{t('Hisobingizda qolgan rollar')}</div>
          <div className="flex flex-wrap gap-1">{qolgan.map((r, i) => <span key={`${r}-${i}`} className="fz-chip">{t(rolNomi(r))}</span>)}</div>
        </div>
      )}
      <button type="button" className="fz-btn self-start" onClick={() => window.location.reload()}>
        <RefreshCw aria-hidden="true" />{t('Sahifani yangilash')}
      </button>
    </div>
  );
}

export function BirlashtirKarta({ profil }: { profil: Profil }) {
  const qc = useQueryClient();
  const [ochiq, setOchiq] = useState(false);
  const [login, setLogin] = useState('');
  const [parol, setParol] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);
  const [natija, setNatija] = useState<BirlashtirNatija | null>(null);

  const ochish = (oldindan?: string) => {
    setOchiq(true);
    if (oldindan) setLogin(oldindan);
  };

  const googleCredential = async (credential: string) => {
    setXato(null);
    const r = await googleUlash(credential);
    if (r.ok) {
      void qc.invalidateQueries({ queryKey: PROFIL_KALIT });
      toast(t('Google shu hisobga ulandi'), 'ok');
      return;
    }
    if (r.code === 'GOOGLE_BOSHQA_HISOB') {
      setXabar(r.boshqa_login
        ? t('Bu Google pochta «{login}» hisobiga ulangan. Quyida uning login va parolini kiriting — hisoblar birlashtiriladi.', { login: r.boshqa_login })
        : xatoMatn(r.code));
      ochish(r.boshqa_login ?? undefined);
      return;
    }
    setXato(xatoMatn(r.code));
  };

  const yubor = async (e: FormEvent) => {
    e.preventDefault();
    if (band || !login.trim() || !parol) return;
    const ha = await tasdiqSora({
      sarlavha: t('Hisoblarni birlashtirish'),
      matn: [
        t('«{login}» hisobi shu hisobga birlashtiriladi:', { login: login.trim() }),
        `• ${t('uning kompaniyalari va rollari shu hisobga o‘tadi;')}`,
        `• ${t('u login va parol bilan kirsangiz ham shu hisobga tushasiz;')}`,
        `• ${t('boshqa qurilmalardagi sessiyalar yopilishi mumkin.')}`,
        t('Davom etasizmi?'),
      ].join('\n'),
      tasdiqMatni: t('Birlashtirish'), bekorMatni: t('Bekor qilish'), xavfli: true,
    });
    if (!ha) return;
    setBand(true); setXato(null);
    const r = await hisobBirlashtir({ login: login.trim(), parol });
    setBand(false);
    if (!r.ok) { setXato(xatoMatn(r.code)); return; }
    setParol('');
    setNatija({ kochirilgan_kompaniyalar: r.kochirilgan_kompaniyalar ?? [], qolgan_rollar: r.qolgan_rollar ?? [] });
    toast(t('Hisoblar birlashtirildi'), 'ok');
    // Server cookie'ni qayta berdi: sessiya, kompaniya konteksti va profil yangidan o‘qiladi.
    void qc.invalidateQueries();
  };

  const parolOrnat = !profil.parol_bor;
  return (
    <Karta sarlavha="Bitta hisob — barcha kirish usullari" tavsif="Login/parol va Google — bitta hisobga olib boradi. Ikkita alohida hisobingiz bo‘lsa, ularni shu yerda birlashtiring.">
      <div>
        <Qator yorliq="Login va parol" qiymat={<span className="inline-flex items-center gap-2 flex-wrap justify-end"><Holat ha={profil.parol_bor} bor={t('Ulangan')} yoqMatn={t('Parol o‘rnatilmagan')} />{profil.login && <span className="text-text-dim">{profil.login}</span>}</span>} />
        <Qator yorliq="Google" qiymat={<span className="inline-flex items-center gap-2 flex-wrap justify-end"><Holat ha={profil.google_ulangan} bor={t('Ulangan')} yoqMatn={t('Ulanmagan')} />{profil.google_ulangan && profil.email && <span className="text-text-dim">{profil.email}</span>}</span>} />
      </div>

      {parolOrnat && (
        <Nota tur="info">
          {t('Login va parol bilan ham kirish uchun parol o‘rnating.')}{' '}
          <Link to="/admin/akkaunt?bolim=xavfsizlik" className="underline text-[var(--accent-text)]">{t('Parol o‘rnatish')}</Link>
        </Nota>
      )}

      {!profil.google_ulangan && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[12px] text-text-dim">{t('Google akkauntingizni shu hisobga ulang — keyin Google bilan kirsangiz ham shu hisobga tushasiz (qayta kirish talab qilinmaydi).')}</p>
          <GoogleKirish matn="continue_with" onCredential={googleCredential} />
        </div>
      )}

      {xabar && <Nota tur="warn">{xabar}</Nota>}
      {xato && !ochiq && <Nota tur="danger">{xato}</Nota>}

      {natija && <Xulosa natija={natija} />}
      {!natija && !ochiq && (
        <div className="flex flex-col gap-2 items-start">
          <p className="m-0 text-[12px] text-text-dim">{t('Ikkinchi hisobning kompaniya va rollari shu hisobga o‘tadi; u login bilan kirsangiz ham shu hisobga tushasiz.')}</p>
          <button type="button" className="fz-btn fz-btn--primary" onClick={() => ochish()}>
            <GitMerge aria-hidden="true" />{t('Boshqa hisobni shu hisobga birlashtirish')}
          </button>
        </div>
      )}
      {!natija && ochiq && (
        <form onSubmit={(e) => { void yubor(e); }} noValidate aria-label={t('Hisoblarni birlashtirish')} className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3">
          <p className="m-0 text-[12px] text-text-dim">{t('Birlashtiriladigan ikkinchi hisobning login va parolini kiriting. Uning kompaniya va rollari shu hisobga o‘tadi.')}</p>
          <Maydon yorliq={t('Ikkinchi hisob logini')}>
            {(p) => <input {...p} type="text" value={login} autoComplete="username" autoCapitalize="none" className={INPUT_SINF} style={INPUT_STIL}
              onChange={(e) => { setLogin(e.target.value); setXato(null); }} />}
          </Maydon>
          <Maydon yorliq={t('Ikkinchi hisob paroli')}>
            {(p) => <input {...p} type="password" value={parol} autoComplete="off" className={INPUT_SINF} style={INPUT_STIL}
              onChange={(e) => { setParol(e.target.value); setXato(null); }} />}
          </Maydon>
          {xato && <Nota tur="danger">{xato}</Nota>}
          <div className="flex gap-2 flex-wrap">
            <button type="submit" className="fz-btn fz-btn--primary" disabled={band || !login.trim() || !parol}>
              <GitMerge aria-hidden="true" />{band ? t('Birlashtirilmoqda…') : t('Birlashtirish')}
            </button>
            <button type="button" className="fz-btn fz-btn--ghost" onClick={() => { setOchiq(false); setXato(null); setXabar(null); setParol(''); }} disabled={band}>{t('Bekor qilish')}</button>
          </div>
        </form>
      )}
    </Karta>
  );
}
