/** Profil formasi: ism, telefon, til, avatar rangi (login/email — faqat o‘qiladi). Dirty-holat, inline tekshiruv, serverdan kelgan kod xabari. */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Languages, Save } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { t, tilOl, tilQoy } from '../../i18n/til';
import {
  AVATAR_RANGLAR, PROFIL_KALIT, ismTekshir, profilYangila, telefonTekshir, xatoMatn, type Profil, type ProfilJavobi, type ProfilTil, type ProfilYangilash,
} from '../../api/profil';
import { Avatar } from './AkkauntTugmasi';
import { initsiallar } from './akkaunt-lib';
import { INPUT_SINF, INPUT_STIL, Karta, Maydon, Nota, Qator } from './AkkauntUi';

const TILLAR: ReadonlyArray<{ kod: ProfilTil; nom: string }> = [
  { kod: 'uz', nom: 'Oʻzbekcha' },
  { kod: 'ru', nom: 'Русский' },
  { kod: 'en', nom: 'English' },
];

export function ProfilForma({ profil }: { profil: Profil }) {
  const qc = useQueryClient();
  const [ism, setIsm] = useState(profil.ism ?? '');
  const [telefon, setTelefon] = useState(profil.telefon ?? '');
  const [til, setTil] = useState<ProfilTil | ''>(profil.til ?? '');
  const [rang, setRang] = useState<string>(profil.avatar_rang ?? '');
  const [tegildi, setTegildi] = useState<{ ism: boolean; telefon: boolean }>({ ism: false, telefon: false });
  const [band, setBand] = useState(false);
  const [serverXato, setServerXato] = useState<string | null>(null);
  const [serverKod, setServerKod] = useState<string | null>(null);

  const ismKod = ismTekshir(ism);
  const telKod = telefonTekshir(telefon);
  const ismXato = (tegildi.ism || ism.trim() !== (profil.ism ?? '')) && ismKod ? xatoMatn(ismKod) : serverKod === 'ISM_NOTOGRI' ? xatoMatn(serverKod) : null;
  const telXato = (tegildi.telefon || telefon.trim() !== (profil.telefon ?? '')) && telKod ? xatoMatn(telKod) : serverKod === 'TELEFON_NOTOGRI' ? xatoMatn(serverKod) : null;

  const farq: ProfilYangilash = {};
  if (ism.trim() !== (profil.ism ?? '')) farq.ism = ism.trim();
  if (telefon.trim() !== (profil.telefon ?? '')) farq.telefon = telefon.trim();
  if (til && til !== profil.til) farq.til = til;
  if (rang && rang !== (profil.avatar_rang ?? '')) farq.avatar_rang = rang;
  const ozgargan = Object.keys(farq).length > 0;
  const yaroqli = !(farq.ism !== undefined && ismKod) && !(farq.telefon !== undefined && telKod);

  const bosh = initsiallar(ism.trim() || profil.ism, profil.login, profil.email);

  const saqla = async (e: FormEvent) => {
    e.preventDefault();
    setTegildi({ ism: true, telefon: true });
    if (!ozgargan || !yaroqli || band) return;
    setBand(true); setServerXato(null); setServerKod(null);
    const r = await profilYangila(farq);
    setBand(false);
    if (!r.ok) { setServerKod(r.code); setServerXato(xatoMatn(r.code)); return; }
    const yangi: Profil = { ...profil, ...(r.profil ?? {}), ...farq } as Profil;
    qc.setQueryData<ProfilJavobi>(PROFIL_KALIT, (eski) => (eski ? { ...eski, profil: yangi } : eski));
    void qc.invalidateQueries({ queryKey: PROFIL_KALIT });
    toast(t('Profil saqlandi'), 'ok');
    if (farq.til && !(farq.til === 'uz' && tilOl().startsWith('uz')) && farq.til !== tilOl()) tilQoy(farq.til);
  };

  const bekor = () => {
    setIsm(profil.ism ?? ''); setTelefon(profil.telefon ?? ''); setTil(profil.til ?? ''); setRang(profil.avatar_rang ?? '');
    setTegildi({ ism: false, telefon: false }); setServerXato(null); setServerKod(null);
  };

  const rangYorlig = t('Avatar rangi');
  return (
    <form onSubmit={(e) => { void saqla(e); }} noValidate aria-label={t('Profil')}>
      <Karta sarlavha="Profil" tavsif="Ism, telefon, til va avatar rangi. Login va elektron pochta o‘zgarmaydi.">
        <div className="flex items-center gap-3">
          <Avatar ism={bosh} rang={rang || profil.avatar_rang} olcham={56} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-text truncate">{ism.trim() || profil.login || '—'}</div>
            <div className="text-[12px] text-text-dim truncate">{profil.email ?? '—'}</div>
          </div>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
          <Maydon yorliq={t('Ism')} xato={ismXato} yordam={t('2–80 belgi')}>
            {(p) => <input {...p} type="text" value={ism} maxLength={120} autoComplete="name" className={INPUT_SINF} style={INPUT_STIL}
              onChange={(e) => { setIsm(e.target.value); setServerKod(null); }} onBlur={() => setTegildi((x) => ({ ...x, ism: true }))} />}
          </Maydon>
          <Maydon yorliq={t('Telefon')} xato={telXato} yordam={profil.telefon_tasdiqlangan && !farq.telefon ? t('Tasdiqlangan') : t('Masalan: +998 90 123 45 67')}>
            {(p) => <input {...p} type="tel" inputMode="tel" value={telefon} maxLength={24} autoComplete="tel" className={INPUT_SINF} style={INPUT_STIL}
              onChange={(e) => { setTelefon(e.target.value); setServerKod(null); }} onBlur={() => setTegildi((x) => ({ ...x, telefon: true }))} />}
          </Maydon>
          <Maydon yorliq={t('Interfeys tili')} yordam={t('Saqlaganingizda interfeys tili ham almashadi.')}>
            {(p) => (
              <div className="relative">
                <Languages size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mute pointer-events-none" />
                <select {...p} value={til} onChange={(e) => setTil(e.target.value as ProfilTil | '')} className={`${INPUT_SINF} pl-8`} style={INPUT_STIL}>
                  {!profil.til && <option value="" disabled>—</option>}
                  {TILLAR.map((x) => <option key={x.kod} value={x.kod}>{x.nom}</option>)}
                </select>
              </div>
            )}
          </Maydon>
        </div>

        <div role="group" aria-label={rangYorlig} className="flex flex-col gap-2">
          <span className="text-[12px] text-text-dim">{rangYorlig}</span>
          <div className="flex flex-wrap gap-2">
            {AVATAR_RANGLAR.map(({ rang: r, nom }) => {
              const tanlangan = rang.toLowerCase() === r.toLowerCase();
              return (
                <button key={r} type="button" aria-pressed={tanlangan} aria-label={t(nom)} title={t(nom)} onClick={() => setRang(r)}
                  className="rounded-full inline-flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                  style={{ width: 32, height: 32, background: r, color: '#fff', border: tanlangan ? '2px solid var(--text)' : '2px solid transparent', outlineOffset: 2 }}>
                  {tanlangan && <Check size={14} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        {serverXato && <Nota tur="danger">{serverXato}</Nota>}

        <div className="flex items-center gap-2 flex-wrap">
          <button type="submit" className="fz-btn fz-btn--primary" disabled={!ozgargan || !yaroqli || band}>
            <Save aria-hidden="true" />{band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
          {ozgargan && <button type="button" className="fz-btn fz-btn--ghost" onClick={bekor} disabled={band}>{t('Bekor qilish')}</button>}
          {ozgargan && <span className="text-[12px] text-text-dim">{t('Saqlanmagan o‘zgarishlar bor')}</span>}
        </div>

        <div>
          <Qator yorliq="Login" qiymat={profil.login || '—'} />
          <Qator yorliq="Elektron pochta" qiymat={profil.email ?? '—'} />
          <Qator yorliq="Ro‘yxatdan o‘tgan" qiymat={profil.yaratildi ? new Date(profil.yaratildi).toLocaleDateString() : '—'} />
        </div>
      </Karta>
    </form>
  );
}
