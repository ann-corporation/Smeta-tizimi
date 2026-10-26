/**
 * F2NavbatChip.tsx — DOIMIY NAVBAT KO'RSATKICHI
 *
 * Foydalanuvchi (2026-08-16):
 *   «hozir yangi f2 import ni bossam shu bilan bu joriy navbatdagini
 *    ko'ra olmayman nazorat qila olmayman — shuning uchun bu narsani
 *    monitoring tabi ichiga muntazam navbatni ko'rsatib turadigan
 *    qilishing kerak»
 *
 * MUAMMO: yozish ishi SERVERDA fonda bajariladi va soatlab davom
 * etishi mumkin. Lekin uni faqat F2 import sahifasining 3-qadamida
 * ko'rish mumkin edi. «Yangi Ф2 import» bosilsa yoki boshqa sahifaga
 * o'tilsa — jarayon ko'zdan g'oyib bo'lardi. Foydalanuvchi ish
 * tugadimi, qotdimi, xato berdimi — bilolmasdi.
 *
 * YECHIM: bu chip ekranning pastki o'ng burchagida FAOL ish bo'lganda
 * o'z-o'zidan paydo bo'ladi va istalgan sahifada ko'rinib turadi.
 * Ish tugasa yoki xato bersa ham ko'rsatadi (yopilguncha).
 *
 * QOTIB QOLGANDA: 10 daqiqadan beri siljimasa OGOHLANTIRADI va
 * «To'xtatish» tugmasini beradi — avval bu imkoniyat umuman yo'q edi
 * (foydalanuvchi: «1 soatdan beri shu ahvolda qotib turibdi»).
 */
import { useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import { useF2JobHolat, useF2JobTozala } from '../../api/hooks';
import { toast } from './Toast';
import { tasdiqSora } from './Tasdiq';
import { t } from '../../i18n/til';

/** Siljimay turgan ish shu vaqtdan oshsa — qotgan deb ogohlantiramiz */
const QOTDI_MS = 10 * 60 * 1000;

export default function F2NavbatChip() {
  const job = useF2JobHolat(true);
  const tozala = useF2JobTozala();
  const [yigilgan, setYigilgan] = useState(false);
  const [yopilgan, setYopilgan] = useState<string | null>(() => sessionStorage.getItem("f2_chip_yopiq"));

  const j = job.data?.job;
  if (!j || !j.status) return null;

  const kalit = `${j.obyekt || ''}|${j.oyNom || ''}|${j.boshlandi || ''}`;
  if (yopilgan === kalit) return null;

  const ishlayapti = j.status === 'navbat' || j.status === 'ishlayapti';
  const xato = j.status === 'xato';
  const tugadi = j.status === 'tugadi';

  const jami = j.total || 0;
  const bajarildi = j.done || 0;
  const foiz = jami ? Math.min(100, Math.round((bajarildi / jami) * 100)) : (tugadi ? 100 : 0);

  /* Qotib qolganini aniqlash — server `yangilandi` ni har qadamda yangilaydi */
  const jim = j.yangilandi ? Date.now() - Number(j.yangilandi) : 0;
  const qotdi = ishlayapti && jim > QOTDI_MS;

  // F5 (reload) qilganda tugagan yoki xato bilan to'xtagan ESKI ishlarni yashiramiz. QOTGAN ish (hali ishlayapti, lekin 10 daqiqadan beri
  // siljimagan) yashirilmaydi: aynan shu holatda ogohlantirish va «To'xtatish» kerak (avval bu shart qotganni ham yashirib, ogohlantirish hech qachon chiqmasdi).
  if ((tugadi || xato) && jim > 60_000) return null;

  const yomon = xato || qotdi;
  const rang = yomon ? 'var(--danger)' : tugadi ? 'var(--ok)' : 'var(--accent)';
  const sarlavha = qotdi ? t('F2 yozish — qotgan')
    : xato ? t('F2 yozish — xato')
    : tugadi ? t('F2 yozish tugadi')
    : t('F2 yozilmoqda… {foiz}%', { foiz });
  const jimDaq = Math.round(jim / 60000);

  async function toxtat() {
    const ok = await tasdiqSora({
      xavfli: true,
      sarlavha: t('Yozish ishini to‘xtatamizmi?'),
      tasdiqMatni: t('To‘xtatish va tozalash'),
      matn: t('Qotib qolgan yozish ishi to‘xtatiladi va tozalanadi.') + '\n\n' + t('Smetaga ALLAQACHON yozilgan qatorlar JOYIDA QOLADI — ular o‘chmaydi.') + '\n\n' + t('Davom etamizmi?'),
    });
    if (!ok) return;
    tozala.mutate(undefined, {
      onSuccess: (r) => toast(r.xabar || t('Tozalandi'), 'ok', undefined, 8000),
      onError: (e: Error) => toast(e.message, 'danger'),
    });
  }

  return (
    /* AI tugmasidan yuqorida (pastki o'ng burchak). Tinch (polite) e'lon: xato bo'lsagina — alert. */
    <div role={yomon ? 'alert' : 'status'} aria-live={yomon ? 'assertive' : 'polite'} data-f2-navbat={j.status}
      className="fz-card fixed bottom-24 right-4 z-[60] w-[330px] max-w-[calc(100vw-2rem)]"
      style={{ borderColor: `color-mix(in srgb, ${rang} 50%, var(--border))`, boxShadow: 'var(--shadow-pop)' }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={!yigilgan}
          aria-label={yigilgan ? t('Batafsil ko‘rsatish') : t('Yig‘ish')} onClick={() => setYigilgan((x) => !x)}>
          {yomon ? <AlertTriangle size={16} className="shrink-0" style={{ color: rang }} aria-hidden />
            : tugadi ? <CheckCircle2 size={16} className="shrink-0" style={{ color: rang }} aria-hidden />
            : <Loader2 size={16} className="shrink-0 animate-spin" style={{ color: rang }} aria-hidden />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-text">{sarlavha}</span>
            <span className="block truncate text-[11px] text-text-mute">{j.oyNom || ''}{j.obyekt ? ` · ${j.obyekt}` : ''}</span>
          </span>
          {yigilgan ? <ChevronUp size={14} className="text-text-mute" aria-hidden /> : <ChevronDown size={14} className="text-text-mute" aria-hidden />}
        </button>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" title={t('Yashirish')} aria-label={t('Yashirish')}
          onClick={() => { setYopilgan(kalit); sessionStorage.setItem("f2_chip_yopiq", kalit); }}>
          <X size={14} aria-hidden />
        </button>
      </div>

      {/* Progress chizig'i — yig'ilganda ham ko'rinadi */}
      <div className="fz-meter__t" style={{ height: 4, borderRadius: 0 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={xato ? 100 : foiz} aria-label={t('Yozish jarayoni')}>
        <i style={{ width: `${xato ? 100 : foiz}%`, background: rang, transition: 'width .5s ease' }} />
      </div>

      {!yigilgan && (
        <div className="space-y-2 px-3 py-2">
          <p className="m-0 text-[12px] tabular-nums text-text-dim">
            {t('{a} / {b} qator', { a: bajarildi, b: jami })}
            {jim > 60_000 && ishlayapti && <span className="text-text-mute"> · {t('{n} daq. jim', { n: jimDaq })}</span>}
          </p>

          {job.data?.hozir && (
            <p className="m-0 line-clamp-3 text-[12px] leading-snug text-text">{String(job.data.hozir)}</p>
          )}

          {qotdi && (
            <p className="fz-note fz-note--danger m-0" style={{ padding: '8px 10px' }}>
              <AlertTriangle aria-hidden />
              <span>{t('{n} daqiqadan beri siljimadi. Server ishni tashlab yuborgan bo‘lishi mumkin.', { n: jimDaq })}</span>
            </p>
          )}

          {xato && j.xabar && <p className="m-0 text-[12px] leading-snug text-danger">{j.xabar}</p>}

          {/* To'xtatish DOIM mavjud: qotmagan bo'lsa ham xato yuborilgan F2 ni to'xtatish huquqi bo'lishi kerak. */}
          {(ishlayapti || xato) && (
            <button type="button" onClick={() => void toxtat()} disabled={tozala.isPending}
              className={`fz-btn fz-btn--sm w-full ${qotdi ? 'fz-btn--danger' : 'fz-btn--ghost'}`}>
              {tozala.isPending ? t('To‘xtatilmoqda…') : t('To‘xtatish va tozalash')}
            </button>
          )}

          {ishlayapti && !qotdi && <p className="m-0 text-[11px] text-text-mute">{t('Brauzerni yopsangiz ham davom etadi.')}</p>}
        </div>
      )}
    </div>
  );
}
