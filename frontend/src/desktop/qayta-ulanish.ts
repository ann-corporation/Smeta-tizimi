import { useEffect, useRef } from 'react';
import { desktopReadStatus, subscribeDesktopReadStatus } from './read-status';

/**
 * Tarmoq qaytganda (brauzer 'online' hodisasi yoki desktop o'qish holati offline -> online) bir marta chaqiriladi.
 * Sabab (M5 stend): oflayn boshlangan ilova tarmoq qaytgach ham eski xato va bo'sh tanlagichni ko'rsatardi.
 */
export function useQaytaUlanish(qaytaUlandi: () => void) {
  const ref = useRef(qaytaUlandi);
  ref.current = qaytaUlandi;
  useEffect(() => {
    const chaqir = () => ref.current();
    let offline = desktopReadStatus().offline;
    const obuna = subscribeDesktopReadStatus(() => {
      const hozir = desktopReadStatus().offline;
      if (offline && !hozir) chaqir();
      offline = hozir;
    });
    window.addEventListener('online', chaqir);
    return () => { obuna(); window.removeEventListener('online', chaqir); };
  }, []);
}
