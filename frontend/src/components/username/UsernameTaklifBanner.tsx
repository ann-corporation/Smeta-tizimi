/**
 * UsernameTaklifBanner — ro'yxatdan o'tgan/onboarding foydalanuvchiga @username tanlashni taklif qiladi (ismdan tayyor variantlar bilan).
 * Majburiy EMAS: «Keyinroq» bosilsa shu brauzerda qayta so'ralmaydi (localStorage — faqat qulaylik; asosiy holat serverda: username bo'sh).
 */
import { useEffect, useState } from 'react';
import { usernameOl } from '../../api/username';
import { KEYINROQ_KALIT } from '../../lib/username/username';
import { Karta } from '../akkaunt/AkkauntUi';
import { UsernameKarta } from './UsernameKarta';

const oqi = (): boolean => { try { return localStorage.getItem(KEYINROQ_KALIT) === '1'; } catch { return false; } };
const yoz = () => { try { localStorage.setItem(KEYINROQ_KALIT, '1'); } catch { /* ixtiyoriy */ } };

export function UsernameTaklifBanner() {
  const [ism, setIsm] = useState<string | null | undefined>(undefined); // undefined = ko'rsatilmaydi
  useEffect(() => {
    if (oqi()) return;
    let tirik = true;
    void usernameOl().then((r) => { if (tirik && r.ok && !r.username) setIsm(r.ism ?? null); });
    return () => { tirik = false; };
  }, []);
  if (ism === undefined) return null;
  return (
    <Karta sarlavha="Username tanlang" tavsif="Telegram’dagi kabi @username — odamlar sizni shu orqali topib, kompaniyaga qo‘shadi va topshiriq beradi. Keyinroq ham tanlashingiz mumkin.">
      <UsernameKarta ism={ism} rejim="tanlov" onTayyor={() => setIsm(undefined)} onKeyin={() => { yoz(); setIsm(undefined); }} />
    </Karta>
  );
}