/**
 * IsmQadam — birinchi kirishdan keyin profilda ism bo'sh bo'lsa, bitta qisqa qadam: «Ismingiz nima?» (Telegram modeli; Android
 * ilovasidagi «profil ismi» qadami bilan bir xil server amali: /api/profil `yangila`). Majburiy emas: «Keyinroq» shu sessiyada yopadi.
 * Profil API yo'q/xato bo'lsa — hech narsa ko'rsatilmaydi (halol: soxta qadam yo'q).
 */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { PROFIL_KALIT, ismTekshir, profilYangila, useProfil, xatoMatn, type ProfilJavobi } from '../../api/profil';
import { INPUT_SINF, INPUT_STIL } from './AkkauntUi';

const KEYIN_KALIT = 'fz-ism-qadam-keyin';
const keyinOqi = () => { try { return sessionStorage.getItem(KEYIN_KALIT) === '1'; } catch { return false; } };
const keyinYoz = () => { try { sessionStorage.setItem(KEYIN_KALIT, '1'); } catch { /* ixtiyoriy */ } };

export function IsmQadam() {
  const q = useProfil();
  const qc = useQueryClient();
  const [ism, setIsm] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [yopiq, setYopiq] = useState(keyinOqi);
  const profil = q.data?.profil;
  if (yopiq || !profil || (profil.ism ?? '').trim().length >= 2) return null;

  const kod = ismTekshir(ism);
  async function saqla(e: FormEvent) {
    e.preventDefault();
    if (kod || band) return;
    setBand(true); setXato(null);
    const r = await profilYangila({ ism: ism.trim() });
    setBand(false);
    if (!r.ok) { setXato(xatoMatn(r.code)); return; }
    qc.setQueryData<ProfilJavobi>(PROFIL_KALIT, (eski) => (eski ? { ...eski, profil: { ...eski.profil, ...(r.profil ?? {}), ism: ism.trim() } } : eski));
    void qc.invalidateQueries({ queryKey: PROFIL_KALIT });
    toast(t('Profil saqlandi'), 'ok');
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <form role="dialog" aria-modal="true" aria-labelledby="ism-qadam-sarlavha" onSubmit={(e) => { void saqla(e); }} noValidate
        className="fz-card w-full max-w-md p-4 flex flex-col gap-3">
        <h2 id="ism-qadam-sarlavha" className="text-[16px] font-semibold text-text m-0">{t('Ismingiz nima?')}</h2>
        <p className="text-[12px] text-text-dim m-0">{t('Hamkasblaringiz sizni shu ism bilan ko‘radi. Keyin profilda o‘zgartirish mumkin.')}</p>
        <input type="text" value={ism} maxLength={80} autoComplete="name" autoFocus aria-label={t('Ism')} placeholder={t('Ism')}
          onChange={(e) => setIsm(e.target.value)} className={INPUT_SINF} style={INPUT_STIL} />
        {xato && <p role="alert" className="text-[12px] text-rose-300 m-0">{xato}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" className="fz-btn fz-btn--primary" disabled={band || !!kod}>{t('Saqlash')}</button>
          <button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={() => { keyinYoz(); setYopiq(true); }}>{t('Keyinroq')}</button>
        </div>
      </form>
    </div>
  );
}
