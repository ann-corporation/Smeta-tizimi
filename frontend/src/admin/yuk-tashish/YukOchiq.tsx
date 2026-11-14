/** /yuk — ochiq kirish sahifasi (kirmasdan ko'rinadi): yuk e'lon qilish yoki haydovchi bo'lish. Amallar uchun hisob kerak: kirish sahifasiga yo'naltiriladi. */
import { Link } from 'react-router-dom';
import { t } from '../../i18n/til';

export default function YukOchiq() {
  const katta = 'flex min-h-[56px] items-center justify-center rounded-xl px-4 text-[17px] font-semibold';
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="text-[24px] font-bold">{t('Yuk tashish')}</h1>
      <p className="text-[15px] text-text-mute">{t('Yukni xaritada belgilang — yaqin haydovchi qabul qiladi. Yoki mashinangiz bilan yuk toping.')}</p>
      <Link to="/" state={{ qaytish: '/admin/yuk-chaqirish' }} className={`${katta} bg-blue-600 text-white`}>{t('Yuk e‘lon qilish')}</Link>
      <Link to="/" state={{ qaytish: '/admin/haydovchi' }} className={`${katta} border border-border`}>{t('Haydovchi bo‘lish')}</Link>
      <p className="text-[12px] text-text-mute">{t('Kirish yoki ro‘yxatdan o‘tish kerak. To‘lov platformada ushlanmaydi: narxni tomonlar kelishadi, to‘lov holati belgilanadi.')}</p>
    </main>
  );
}
