/**
 * «Kirish usullari» (yagona akkaunt, 2026-11-13): shu hisobga ulangan usullar (parol, email, Google, Telegram, telefon), uzish
 * (oxirgi usulni uzib bo'lmaydi; qayta autentifikatsiya), va ikkinchi (parolsiz) hisobni Google yoki email-kod isboti bilan birlashtirish.
 * Qaror — serverda (t2_usul_uz_v1 / t2_hisob_birlashtir_v2); bu yerda faqat ko'rsatish va isbotni yuborish.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GitMerge, Loader2, RefreshCw, Send, Unplug } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { t } from '../../i18n/til';
import GoogleKirish from '../../kirish/GoogleKirish';
import { PROFIL_KALIT, birlashtirEmailKod, birlashtirTelegramBoshla, birlashtirTelegramHolat, birlashtirGoogle, emailKodYubor, usulUz, usullarOl, xatoMatn, type BirlashtirNatija, type Usul, type UsulTuri } from '../../api/profil';
import { INPUT_SINF, INPUT_STIL, Karta, Nota } from './AkkauntUi';

/** Telegram yo'li serverda yoqilganmi (KIRISH_TELEGRAM_YOQILGAN + bot) — o'chiq bo'lsa tugmalar ko'rinmaydi. */
function useTelegramYoqilgan(): boolean {
  const [ha, setHa] = useState(false);
  useEffect(() => {
    let tirik = true;
    try { void fetch('/api/kirish-telegram').then((r) => r.json()).then((j: { yoqilgan?: boolean }) => { if (tirik && j?.yoqilgan === true) setHa(true); }).catch(() => undefined); } catch { /* tarmoq yo'q */ }
    return () => { tirik = false; };
  }, []);
  return ha;
}

const TUR_NOMI: Record<UsulTuri, string> = { parol: 'Login va parol', email: 'Email kod', google: 'Google', telegram: 'Telegram', telefon: 'Telefon' };

export function KirishUsullariKarta() {
  const qc = useQueryClient();
  const [usullar, setUsullar] = useState<Usul[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState<number | null>(null);
  const [parolSorash, setParolSorash] = useState<number | null>(null);
  const [parol, setParol] = useState('');
  const tgYoqilgan = useTelegramYoqilgan();
  const [tgBand, setTgBand] = useState(false);

  const yukla = useCallback(async () => {
    const r = await usullarOl();
    if (r.ok) { setUsullar(r.usullar ?? []); setXato(null); } else setXato(xatoMatn(r.code));
  }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  const uz = async (u: Usul, parolBilan?: string) => {
    if (!parolBilan) {
      const ha = await tasdiqSora({ sarlavha: t('Kirish usulini uzish'), matn: t('«{n}» usuli uziladi. Boshqa usullaringiz bilan kirishda davom etasiz.', { n: t(TUR_NOMI[u.tur]) }), tasdiqMatni: t('Uzish'), bekorMatni: t('Bekor qilish'), xavfli: true });
      if (!ha) return;
    }
    setBand(u.id); setXato(null);
    const r = await usulUz({ usulId: u.id, parol: parolBilan });
    setBand(null);
    if (r.ok) { setParolSorash(null); setParol(''); toast(t('Kirish usuli uzildi'), 'ok'); void qc.invalidateQueries({ queryKey: PROFIL_KALIT }); void yukla(); return; }
    if (r.code === 'QAYTA_KIRISH_KERAK') { setParolSorash(u.id); setXato(xatoMatn(r.code)); return; }
    setXato(xatoMatn(r.code));
  };

  const telegramUlash = async () => {
    setTgBand(true); setXato(null);
    try {
      const r = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal: 'kod' }) });
      const j = await r.json().catch(() => null) as { ok?: boolean; havola?: string } | null;
      if (j?.ok && j.havola) window.open(j.havola, '_blank', 'noopener,noreferrer'); else setXato(t('Telegramni ulab bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.'));
    } catch { setXato(t('Telegramni ulab bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.')); }
    setTgBand(false);
  };

  return (
    <Karta sarlavha="Kirish usullari" tavsif="Bitta odam — bitta hisob. Bu yerda shu hisobga ulangan barcha usullar; qaysi biri bilan kirsangiz ham shu hisobga tushasiz.">
      {usullar === null && !xato && <div className="flex items-center gap-2 text-[13px] text-text-dim"><Loader2 className="animate-spin" size={14} aria-hidden="true" />{t('Yuklanmoqda…')}</div>}
      {usullar && usullar.length === 0 && <p className="m-0 text-[13px] text-text-dim">{t('Ulangan usul topilmadi.')}</p>}
      {usullar && usullar.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col" aria-label={t('Kirish usullari')}>
          {usullar.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] last:border-0 py-2 text-[13px]">
              <span className="font-medium">{t(TUR_NOMI[u.tur])}</span>
              <span className="text-text-dim">{u.niqob}</span>
              <span className={`fz-chip ${u.tasdiqlangan ? 'fz-chip--accent' : ''}`}>{u.tasdiqlangan ? t('Tasdiqlangan') : t('Tasdiqlanmagan')}</span>
              {u.manba === 'birlashtirish' && <span className="fz-chip">{t('Birlashtirilgan hisobdan')}</span>}
              {u.manba !== 'birlashtirish' && (
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm ml-auto" disabled={band === u.id} aria-label={`${t('Uzish')}: ${t(TUR_NOMI[u.tur])}`} onClick={() => void uz(u)}>
                  <Unplug size={13} aria-hidden="true" />{t('Uzish')}
                </button>
              )}
              {parolSorash === u.id && (
                <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); void uz(u, parol); }}>
                  <input type="password" autoComplete="current-password" className={INPUT_SINF} style={INPUT_STIL} aria-label={t('Joriy parol')} value={parol} onChange={(e) => setParol(e.target.value)} />
                  <button type="submit" className="fz-btn fz-btn--primary" disabled={!parol || band === u.id}>{t('Tasdiqlash')}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {tgYoqilgan && usullar && !usullar.some((x) => x.tur === 'telegram') && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="fz-btn" disabled={tgBand} onClick={() => void telegramUlash()}><Send size={14} aria-hidden="true" />{t('Telegram ulash')}</button>
          <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void yukla()}><RefreshCw size={14} aria-hidden="true" />{t('Ro‘yxatni yangilash')}</button>
        </div>
      )}
      {xato && <Nota tur="danger">{xato}</Nota>}
    </Karta>
  );
}

/** Ikkinchi (parolsiz bo'lishi mumkin) hisobga egalik isboti: Google yoki email-kod. Muvaffaqiyatda `onNatija`. */
export function BirlashtirIsbot({ onNatija }: { onNatija: (n: BirlashtirNatija) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [tid, setTid] = useState<string | null>(null);
  const [kod, setKod] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const tgYoqilgan = useTelegramYoqilgan();
  const [tg, setTg] = useState<{ nonce: string; sir: string; belgi: string; havola: string } | null>(null);
  const tgTugadi = useRef(false);

  const tugat = (r: { ok: true } & BirlashtirNatija) => {
    onNatija({ kochirilgan_kompaniyalar: r.kochirilgan_kompaniyalar ?? [], qolgan_rollar: r.qolgan_rollar ?? [] });
    toast(t('Hisoblar birlashtirildi'), 'ok');
    void qc.invalidateQueries();
  };
  const google = async (credential: string) => {
    setXato(null); setBand(true);
    const r = await birlashtirGoogle(credential);
    setBand(false);
    if (r.ok) tugat(r); else setXato(xatoMatn(r.code));
  };
  const tgBoshla = async () => {
    setBand(true); setXato(null);
    const r = await birlashtirTelegramBoshla();
    setBand(false);
    if (r.ok && r.nonce && r.sir && r.havola && r.belgi) { tgTugadi.current = false; setTg({ nonce: r.nonce, sir: r.sir, belgi: r.belgi, havola: r.havola }); } else setXato(xatoMatn(r.ok ? 'YOQILMAGAN' : r.code));
  };
  useEffect(() => {
    if (!tg) return;
    const id = window.setInterval(async () => {
      const r = await birlashtirTelegramHolat(tg.nonce, tg.sir);
      if (tgTugadi.current) return;
      if (r.ok && r.holat === 'tayyor') { tgTugadi.current = true; setTg(null); tugat(r as { ok: true } & BirlashtirNatija); return; }
      if (!r.ok && r.code !== 'TARMOQ' && r.code !== 'SERVER_XATO') { tgTugadi.current = true; setTg(null); setXato(xatoMatn(r.code)); }
    }, 2500);
    return () => { tgTugadi.current = true; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg]);
  const kodYubor = async () => {
    setBand(true); setXato(null);
    const r = await emailKodYubor(email.trim());
    setBand(false);
    if (r.ok && r.tasdiqlash_id) setTid(r.tasdiqlash_id); else setXato(r.xabar || xatoMatn(r.code));
  };
  const tasdiqla = async () => {
    if (!tid) return;
    const ha = await tasdiqSora({ sarlavha: t('Hisoblarni birlashtirish'), matn: t('Bu email hisobi shu hisobga birlashtiriladi: kompaniya va rollari shu hisobga o‘tadi, u bilan kirsangiz ham shu hisobga tushasiz. Davom etasizmi?'), tasdiqMatni: t('Birlashtirish'), bekorMatni: t('Bekor qilish'), xavfli: true });
    if (!ha) return;
    setBand(true); setXato(null);
    const r = await birlashtirEmailKod({ email: email.trim(), tasdiqlashId: tid, kod: kod.replace(/\s+/g, '') });
    setBand(false);
    if (r.ok) tugat(r); else setXato(xatoMatn(r.code));
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3" aria-label={t('Parolsiz hisobni tasdiqlash')}>
      <p className="m-0 text-[12px] text-text-dim">{t('Ikkinchi hisobingizda parol yo‘qmi? Unga egaligingizni Google yoki email kodi bilan tasdiqlang.')}</p>
      <div><GoogleKirish matn="continue_with" onCredential={(c) => { void google(c); }} /></div>
      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-text-dim" htmlFor="birlashtir-email">{t('Ikkinchi hisob emaili')}</label>
        <div className="flex gap-2">
          <input id="birlashtir-email" type="email" autoComplete="off" className={INPUT_SINF} style={INPUT_STIL} value={email} disabled={!!tid} onChange={(e) => { setEmail(e.target.value); setXato(null); }} />
          {!tid && <button type="button" className="fz-btn" disabled={band || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())} onClick={() => void kodYubor()}>{t('Kod yuborish')}</button>}
        </div>
        {tid && <div className="flex gap-2">
          <input type="text" inputMode="numeric" maxLength={7} autoComplete="one-time-code" className={INPUT_SINF} style={INPUT_STIL} aria-label={t('Emailga kelgan 6 xonali kod')} value={kod} onChange={(e) => { setKod(e.target.value.replace(/[^\d\s]/g, '')); setXato(null); }} />
          <button type="button" className="fz-btn fz-btn--primary" disabled={band || kod.replace(/\s+/g, '').length !== 6} onClick={() => void tasdiqla()}><GitMerge aria-hidden="true" size={14} />{t('Birlashtirish')}</button>
        </div>}
      </div>
      {tgYoqilgan && !tg && <div><button type="button" className="fz-btn" disabled={band} onClick={() => void tgBoshla()}><Send size={14} aria-hidden="true" />{t('Telegram bilan tasdiqlash')}</button></div>}
      {tg && (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <p className="m-0 text-[12px] text-text-dim">{t('Ikkinchi hisobingiz ulangan Telegram akkauntida botni oching va moslik raqamini solishtiring:')} <strong data-testid="birlashtir-tg-belgi">{tg.belgi}</strong></p>
          <a className="fz-btn self-start" href={tg.havola} target="_blank" rel="noreferrer noopener"><Send size={14} aria-hidden="true" />{t('Telegramni ochish')}</a>
          <p className="m-0 text-[12px] text-text-dim">{t('Tasdiq kutilmoqda… (5 daqiqa)')}</p>
        </div>
      )}
      {xato && <Nota tur="danger">{xato}</Nota>}
    </div>
  );
}
