import { MoneyInput } from './MoneyInput';
/**
 * QatorTahrirModal.tsx — TIZIM_02: kanonik qatorni to'g'ridan-to'g'ri
 * saytning o'zida tahrirlash (ziddiyat nazorati bilan)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Foydalanuvchi ko'rsatmasi: "saytni o'zida maksimal ideal va kuchli
 * boshqaruv bo'lishi kerak... har bir hujjatda edit imkoniyati bo'lishi
 * kerak" — Drive orqali yuklab-tahrirlab-qayta yuklash EMAS, balki
 * saytning o'zida to'g'ridan-to'g'ri.
 *
 * Bitta panelda BARCHA tahrirlanadigan maydonlar (nom/hajm/narx/
 * birlik/kat) ko'rsatiladi, lekin har biri ALOHIDA saqlanadi — chunki
 * backend (`t2_qator_tahrir`) bitta chaqiruvda bitta maydonni yozadi
 * (optimistik qulf shu bilan ishlaydi). Saqlangan har bir maydondan
 * keyin mahalliy versiya yangilanadi, shuning uchun bitta seansda bir
 * nechta maydonni ketma-ket saqlash ziddiyatga olib kelmaydi.
 *
 * ⚠️ ZIDDIYAT — «xato» EMAS, normal holat: boshqa foydalanuvchi
 * o'sha qatorni tezroq o'zgartirgan bo'lishi mumkin.
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import './qator-tahrir-modal.css';
import { X, Save, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { toast } from './Toast';
import { sbT2QatorTahrir, type T2TahrirNatija } from '../../api/supabase';

export type QatorTahrirMaydon = 'nom' | 'hajm' | 'narx' | 'birlik' | 'kat';

export type QatorTahrirNishon = {
  qatorId: number;
  versiya: number;
  nom: string;
  maydonlar: Partial<Record<QatorTahrirMaydon, string | number | null | undefined>>;
};

const MAYDON_TARTIB: QatorTahrirMaydon[] = ['nom', 'hajm', 'narx', 'birlik', 'kat'];
const MAYDON_NOMI: Record<QatorTahrirMaydon, string> = {
  nom: 'Nomi', hajm: 'Hajm', narx: 'Narx', birlik: 'Birlik', kat: 'Kategoriya',
};

function boshQiymat(v: string | number | null | undefined): string {
  return v == null ? '' : String(v);
}

export function QatorTahrirModal({
  nishon, yop, saqlandi, ziddiyatda,
}: {
  nishon: QatorTahrirNishon;
  yop: () => void;
  /** Har bir muvaffaqiyatli saqlashdan keyin chaqiriladi — chaqiruvchi
   *  daraxtni yangilashi mumkin (masalan `yuklash()`). */
  saqlandi: () => void;
  /** Ziddiyatda (bazada boshqa versiya) — chaqiruvchi shu qatorni qayta o'qiydi; foydalanuvchi qayta urinadi. */
  ziddiyatda?: () => void;
}) {
  const [versiya, setVersiya] = useState(nishon.versiya);
  const [qiymatlar, setQiymatlar] = useState<Record<QatorTahrirMaydon, string>>(() => {
    const boshlangich = {} as Record<QatorTahrirMaydon, string>;
    for (const m of MAYDON_TARTIB) boshlangich[m] = boshQiymat(nishon.maydonlar[m]);
    return boshlangich;
  });
  const [saqlangan] = useState<Record<QatorTahrirMaydon, string>>(qiymatlar);
  const [ketyapti, setKetyapti] = useState<QatorTahrirMaydon | null>(null);
  const [saqlandiBelgi, setSaqlandiBelgi] = useState<Partial<Record<QatorTahrirMaydon, boolean>>>({});
  const [ziddiyat, setZiddiyat] = useState<Partial<Record<QatorTahrirMaydon, T2TahrirNatija>>>({});

  const dialog = useRef<HTMLDivElement>(null);
  // Esc yopadi; Tab modal ichida aylanadi; yopilganda fokus avvalgi elementga qaytadi.
  useEffect(() => {
    const oldingi = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('input,button')?.focus();
    const tugma = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); yop(); return; }
      if (e.key !== 'Tab' || !dialog.current) return;
      const el = [...dialog.current.querySelectorAll<HTMLElement>('input,button,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !(x as HTMLButtonElement).disabled);
      if (!el.length) return;
      const birinchi = el[0], oxirgi = el[el.length - 1];
      if (e.shiftKey && document.activeElement === birinchi) { e.preventDefault(); oxirgi.focus(); }
      else if (!e.shiftKey && document.activeElement === oxirgi) { e.preventDefault(); birinchi.focus(); }
      else if (!dialog.current.contains(document.activeElement)) { e.preventDefault(); birinchi.focus(); }
    };
    document.addEventListener('keydown', tugma, true);
    return () => { document.removeEventListener('keydown', tugma, true); oldingi?.focus?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ozgartir = (maydon: QatorTahrirMaydon, val: string) => {
    setQiymatlar((prev) => ({ ...prev, [maydon]: val }));
    setSaqlandiBelgi((prev) => ({ ...prev, [maydon]: false }));
  };

  const saqla = async (maydon: QatorTahrirMaydon, kutilganVersiya: number) => {
    setKetyapti(maydon);
    setZiddiyat((prev) => ({ ...prev, [maydon]: undefined }));
    const r = await sbT2QatorTahrir(nishon.qatorId, maydon, qiymatlar[maydon], kutilganVersiya);
    setKetyapti(null);

    if (r.ok && r.versiya != null) {
      setVersiya(r.versiya);
      setSaqlandiBelgi((prev) => ({ ...prev, [maydon]: true }));
      toast(t('{m} saqlandi', { m: t(MAYDON_NOMI[maydon]) }), 'ok');
      saqlandi();
      return;
    }
    if (r.sabab === 'ziddiyat') {
      /* Bu XATO EMAS — boshqa klient tezroq yozgan. Ko'rsatamiz. */
      setZiddiyat((prev) => ({ ...prev, [maydon]: r }));
      ziddiyatda?.();
      return;
    }
    toast(r.xabar || r.error || t('Saqlanmadi'), 'danger', undefined, 9000);
  };

  return (
    <div className="qt-overlay" onClick={yop}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="qt-title" className="fz-card qt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="fz-card__head">
          <div className="min-w-0">
            <h3 id="qt-title" className="fz-card__title">{t('Qatorni tahrirlash')}</h3>
            <p className="fz-card__sub truncate">{nishon.nom}</p>
          </div>
          <button type="button" onClick={yop} aria-label={t('Yopish')} title={t('Yopish')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"><X size={16} /></button>
        </div>

        <div className="fz-card__body qt-body">
          {MAYDON_TARTIB.map((maydon) => {
            const konflikt = ziddiyat[maydon];
            const ozgargan = qiymatlar[maydon] !== saqlangan[maydon];
            const eski = saqlangan[maydon];
            return (
              <div key={maydon} className="qt-field">
                <label className="qt-label" htmlFor={`qt-${maydon}`}>{t(MAYDON_NOMI[maydon])}</label>
                {!konflikt && (
                  <div className="qt-row">
                    {maydon === 'narx' ? <MoneyInput value={qiymatlar[maydon]} onValueChange={(v) => ozgartir(maydon, v)} onKeyDown={(e) => { if (e.key === 'Enter' && ozgargan) void saqla(maydon, versiya); }} className="qt-input" /> : (
                    <input
                      id={`qt-${maydon}`}
                      value={qiymatlar[maydon]}
                      onChange={(e) => ozgartir(maydon, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && ozgargan) void saqla(maydon, versiya); }}
                      type={maydon === 'hajm' ? 'number' : 'text'}
                      step="any"
                      className="qt-input"
                    />
                    )}
                    <button type="button"
                      onClick={() => void saqla(maydon, versiya)}
                      disabled={!ozgargan || ketyapti === maydon}
                      title={t('Shu maydonni saqlash')}
                      aria-label={t('Shu maydonni saqlash')}
                      className="fz-btn fz-btn--primary fz-btn--icon">
                      {ketyapti === maydon
                        ? <RefreshCw size={13} className="animate-spin" />
                        : saqlandiBelgi[maydon] && !ozgargan ? <Check size={13} /> : <Save size={13} />}
                    </button>
                  </div>
                )}
                {!konflikt && ozgargan && (
                  <div className="qt-diff" aria-live="polite">
                    <span className="qt-diff__eski"><small>{t('Oldin')}</small>{eski || '—'}</span>
                    <span aria-hidden="true">→</span>
                    <span className="qt-diff__yangi"><small>{t('Keyin')}</small>{qiymatlar[maydon] || '—'}</span>
                  </div>
                )}

                {konflikt && (
                  <div className="fz-note fz-note--warn qt-conflict" role="alert">
                    <div className="min-w-0 flex-1">
                      <p className="qt-conflict__h"><AlertTriangle size={14} />{t('Bu maydonni boshqa foydalanuvchi o‘zgartirdi')}</p>
                      <p className="qt-conflict__p">{t('Siz {a}-versiyani ko‘rgansiz, bazada esa allaqachon {b}-versiya.', { a: konflikt.sizning_versiya ?? '—', b: konflikt.bazadagi_versiya ?? '—' })}</p>
                      <div className="qt-vs">
                        <div className="qt-vs__q"><small>{t('Hozir bazada')}</small><b>{String((konflikt.joriy as any)?.[maydon] ?? '—')}</b></div>
                        <div className="qt-vs__q qt-vs__q--siz"><small>{t('Siz yozmoqchisiz')}</small><b>{qiymatlar[maydon] || '—'}</b></div>
                      </div>
                      <div className="qt-actions">
                        <button type="button"
                          onClick={() => {
                            const j = (konflikt.joriy as any)?.[maydon];
                            ozgartir(maydon, j == null ? '' : String(j));
                            if (konflikt.bazadagi_versiya != null) setVersiya(konflikt.bazadagi_versiya);
                            setZiddiyat((prev) => ({ ...prev, [maydon]: undefined }));
                          }}
                          className="fz-btn fz-btn--sm"><RefreshCw size={12} /> {t('Bazadagini olish')}</button>
                        <button type="button"
                          onClick={() => void saqla(maydon, konflikt.bazadagi_versiya!)}
                          disabled={ketyapti === maydon}
                          className="fz-btn fz-btn--sm fz-btn--danger">{t('Baribir o‘zimniki bilan yozish')}</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Halollik qoidasi (t2_kompaniya.test.cjs shuni tekshiradi):
              bo'sh maydon — bu 0 EMAS. */}
          <p className="qt-hint">
            Bo‘sh qoldirilsa qiymat <b>yo‘q</b> bo‘ladi (0 emas). 0 va «kiritilmagan» — boshqa-boshqa narsa.
          </p>
        </div>

        <div className="qt-foot">
          <span className="qt-keys"><kbd className="fz-kbd">{'Esc'}</kbd> {t('yopish')} · <kbd className="fz-kbd">↵</kbd> {t('maydonni saqlash')}</span>
          <button type="button" onClick={yop} className="fz-btn">{t('Yopish')}</button>
        </div>
      </div>
    </div>
  );
}
