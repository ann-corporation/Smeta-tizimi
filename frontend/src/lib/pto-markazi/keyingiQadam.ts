/**
 * «Keyingi qadam»: PTO markazida BITTA eng muhim keyingi amal (sof funksiya; tartib = muhimlik).
 * Qoida: noma'lum (null) hech qachon «0» deb hisoblanmaydi — noma'lum holatda taxmin qilinmaydi, keyingi qoidaga o'tiladi.
 */
import { t } from '../../i18n/til';
import type { MarkazHolat, QadamId } from './markaz';

export type KeyingiQadam = {
  /** Barqaror kod (test/analitika uchun). */
  kod: 'smeta-yoq' | 'fakt-yakunla' | 'import-davom' | 'f2-tasdiqla' | 'fakt-kiriting' | 'f2-yasang' | 'forma3' | 'paket';
  sarlavha: string;
  izoh: string;
  tugma: string;
  /** Qaysi qadam sahifasiga olib boradi (yo'l — QADAM_YOL). */
  qadam: QadamId | 'obyektlar';
};

export const QADAM_YOL: Record<QadamId | 'obyektlar', string> = {
  obyektlar: '/admin/obyektlar',
  smeta: '/admin/holat',
  fakt: '/admin/fakt',
  'f2-import': '/admin/f2',
  'f2-yasash': '/admin/f2-tayyorlash',
  nakopitelniy: '/admin/nakopitelniy',
  'f2-paket': '/admin/f2-reestr',
  slichitelniy: '/admin/holat',
};

const musbat = (n: number | null): boolean => n != null && n > 0;

export function keyingiQadam(h: MarkazHolat): KeyingiQadam {
  if (h.smetaJami == null) {
    return { kod: 'smeta-yoq', sarlavha: t('Avval smetani yuklang'), izoh: t('Bu obyektda smeta summasi hali yo‘q.'), tugma: t('Smetani yuklash'), qadam: 'obyektlar' };
  }
  if (musbat(h.faktQoralama)) {
    return { kod: 'fakt-yakunla', sarlavha: t('Faktni yakunlang'), izoh: t('{n} ta fakt qoralamada turibdi.', { n: h.faktQoralama as number }), tugma: t('Faktga o‘tish'), qadam: 'fakt' };
  }
  if (musbat(h.importQoralama)) {
    return { kod: 'import-davom', sarlavha: t('F2 importni davom ettiring'), izoh: t('{n} ta F2 import ishi tugallanmagan.', { n: h.importQoralama as number }), tugma: t('Importga o‘tish'), qadam: 'f2-import' };
  }
  if (musbat(h.f2Qoralama)) {
    return { kod: 'f2-tasdiqla', sarlavha: t('F2 qoralamasini tugating'), izoh: t('{n} ta F2 qoralamada — tekshirib tasdiqlang.', { n: h.f2Qoralama as number }), tugma: t('F2 yasashga o‘tish'), qadam: 'f2-yasash' };
  }
  if (h.faktSaqlangan === 0) {
    return { kod: 'fakt-kiriting', sarlavha: t('Fakt kiriting'), izoh: t('Bu obyektda hali bajarilgan ish kiritilmagan.'), tugma: t('Fakt kiritish'), qadam: 'fakt' };
  }
  if (musbat(h.faktSaqlangan) && h.f2BuOyda === false) {
    return { kod: 'f2-yasang', sarlavha: t('F2 yasang'), izoh: t('Fakt saqlangan, {oy} uchun F2 hali yo‘q.', { oy: h.oy }), tugma: t('F2 yasash'), qadam: 'f2-yasash' };
  }
  if (musbat(h.f2Tasdiq) && h.forma3 === 0) {
    return { kod: 'forma3', sarlavha: t('Forma 3 tayyorlang'), izoh: t('F2 tasdiqlangan, Forma 3 hali yo‘q.'), tugma: t('Forma 3 ga o‘tish'), qadam: 'nakopitelniy' };
  }
  return { kod: 'paket', sarlavha: t('Hammasi joyida'), izoh: t('Oylik F2 paketini olishingiz mumkin.'), tugma: t('F2 paketi'), qadam: 'f2-paket' };
}
