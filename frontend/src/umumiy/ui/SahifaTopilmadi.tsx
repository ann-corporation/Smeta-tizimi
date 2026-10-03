/**
 * SahifaTopilmadi.tsx — noma'lum `/admin/...` manzil uchun sahifa
 * ═══════════════════════════════════════════════════════════════════
 *
 * NIMA UCHUN BOR (2026-08-17). Foydalanuvchi: «шартномалар табига
 * кирсам кириш панелига қайтариб юборайапди».
 *
 * ILDIZ: `App.tsx` da yagona zaxira marshrut bor edi —
 *     <Route path="*" element={<Navigate to="/" replace />} />
 * ya'ni MOS KELMAGAN HAR QANDAY manzil kirish sahifasiga otib
 * yuborardi. Menyudagi bitta harf xatosi ham (`shartnoma` ↔
 * `shartnomalar`) shu yo'l bilan «tizim meni chiqarib tashladi» ga
 * aylanardi.
 *
 * Menyu havolasi tuzatilgach ham muammo qaytdi, chunki eski manzil
 * FOYDALANUVCHIDA saqlanib qolgan bo'lishi mumkin: brauzer xatcho'pi,
 * tarix, avtoto'ldirish, ish stolidagi yorliq, boshqaga yuborilgan
 * havola. Ular hammasi `/admin/shartnoma` ga boradi va yana kirish
 * sahifasi chiqadi. Shuning uchun bitta havolani tuzatish YETMAYDI.
 *
 * YECHIM IKKI QISM:
 *   1) `App.tsx` da eski nomlar uchun KO'PRIK marshrutlar (redirect).
 *   2) Shu sahifa: noma'lum `/admin/...` manzil endi qobiq ICHIDA
 *      ochiladi — foydalanuvchi tizimda QOLADI, menyu joyida turadi va
 *      nima bo'lganini o'qiydi.
 *
 * QOIDA: adashgan manzil — bu chiqarib yuborish uchun sabab EMAS.
 */
import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Sahifa } from './Sahifa';
import { t } from '../../i18n/til';

export default function SahifaTopilmadi() {
  const joy = useLocation();

  return (
    <Sahifa sarlavha="Sahifa topilmadi" tavsif="Bunday manzil tizimda yo'q">
      <div className="karta p-6 max-w-xl">
        <div className="flex items-start gap-3">
          <Compass size={22} className="text-warn flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[13px] text-text mb-2">
              {t("So'ralgan manzil mavjud emas:")}
            </p>
            <p className="text-[12px] font-mono text-text-dim bg-[var(--surface-2)]/60
                          border border-border rounded px-2 py-1 mb-3 break-all">
              {joy.pathname}
            </p>
            <p className="text-[12px] text-text-dim mb-4">
              {t("Sababi odatda eski havola: xatcho'p, brauzer tarixi yoki boshqadan olingan manzil.")} <b>{t('Sessiyangiz joyida')}</b> — {t("chapdagi menyudan istagan bo'limga o'tavering.")}
            </p>
            <Link to="/admin/obyektlar"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-accent text-white
                         text-[13px] font-medium hover:bg-accent/90 transition-colors">
              {t('Obyektlarga qaytish')}
            </Link>
          </div>
        </div>
      </div>
    </Sahifa>
  );
}
