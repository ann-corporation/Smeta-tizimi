import { Check } from 'lucide-react';
import { t } from '../../i18n/til';
import type { HrXodimlarJavob } from '../../api/t2-hr';
import { boshlashHolati } from '../../lib/hr/qarorlar';

export type BoshlashQadam = 'sozlama' | 'xodim' | 'tabel';

/**
 * Birinchi ishga tushirish (jadvallar bo'sh): 3 ta katta qadam, har biri bitta tugma. «PlayStation pult» soddaligi:
 * 1. stavkalar va ish kuni, 2. xodimlar, 3. tabel. Tugagan qadam belgilanadi; stavka va xodim tayyor bo'lgach ekran o'zi yo'qoladi.
 */
export function HrBoshlash({ d, tanla }: { d: HrXodimlarJavob; tanla: (q: BoshlashQadam) => void }) {
  const h = boshlashHolati(d);
  if (!h.kerak) return null;
  const qadamlar: Array<{ kod: BoshlashQadam; nom: string; izoh: string; tugma: string; tayyor: boolean; ochiq: boolean }> = [
    { kod: 'sozlama', nom: '1. Sozlamalar (soliq stavkalari, ish kuni)', izoh: 'NDFL va INPS foizini, ish kuni soatini kiriting. Kiritmaguncha «qo‘lga» summa noma’lum bo‘lib turadi.', tugma: 'Sozlamalarni ochish', tayyor: h.stavka, ochiq: true },
    { kod: 'xodim', nom: '2. Xodimlarni kiriting', izoh: 'Ism, lavozim va maosh turini yozing. Tizimdan foydalanadigan xodimni foydalanuvchisiga ulang: u o‘z oyligini o‘zi ko‘radi.', tugma: 'Xodim qo‘shish', tayyor: h.xodim, ochiq: true },
    { kod: 'tabel', nom: '3. Tabelni yuriting', izoh: 'Har kuni kim ishga chiqqanini belgilang. Ish haqi shu tabeldan hisoblanadi.', tugma: 'Tabelni ochish', tayyor: false, ochiq: h.xodim },
  ];
  return (
    <section className="rounded-md border border-border bg-surface p-4" aria-label={t('Boshlash')} data-testid="hr-boshlash">
      <h2 className="mb-1 text-[16px] font-semibold text-text">{t('Boshlash: 3 qadam')}</h2>
      <p className="mb-3 text-[13px] text-text-mute">{t('Kadrlar bo‘limi hali bo‘sh. Quyidagi qadamlarni ketma-ket bajaring.')}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {qadamlar.map((q) => (
          <div key={q.kod} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-text">{q.tayyor && <Check size={16} aria-label={t('Tayyor')} />}{t(q.nom)}</div>
            <p className="flex-1 text-[13px] text-text-mute">{t(q.izoh)}</p>
            <button type="button" className={`fz-btn ${q.tayyor ? '' : 'fz-btn--primary'}`} disabled={!q.ochiq} onClick={() => tanla(q.kod)}>{t(q.tugma)}</button>
          </div>
        ))}
      </div>
    </section>
  );
}
