/** AI markazi uchun umumiy yordamchilar (komponent emas — fast refresh qoidasi). */
import { t } from '../../i18n/til';

export const usd = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + (Math.abs(n) < 1 && n !== 0 ? n.toFixed(4) : n.toFixed(2));
};
export const foiz = (qism: number, jami: number): number => (jami > 0 ? Math.min(100, Math.round((qism / jami) * 100)) : 0);

/** Agent nima qilishi — oddiy tilda (bazadagi `izoh` qisqa/texnik bo'lgani uchun). */
const AGENT_TAVSIFI: Record<string, string> = {
  platform_orchestrator: 'Butun tizimni kuzatadi: signallar, agentlar ishi va xarajatni umumlashtirib, admin uchun taklif tayyorlaydi.',
  company_access: 'Foydalanuvchi savol va fikrlariga javob beradi, kompaniya a’zolari va ruxsatlar bo‘yicha yordam beradi.',
  project_contract: 'Loyiha va shartnoma ma’lumotlarini tekshiradi, nomuvofiqliklarni ko‘rsatadi.',
  pto_smeta: 'Smeta va narxlarni tekshiradi: narx dalili yo‘q yoki me’yordan chetga chiqqan qatorlarni topadi.',
  document_control: 'Hujjatlar to‘liqligi va muddatlarini nazorat qiladi, yetishmayotganini aytadi.',
  procurement: 'Ta’minot talablari va yetkazib berish holatini kuzatadi.',
  warehouse: 'Ombor qoldig‘i va БЕЗСКЛАД qoidasi bo‘yicha istisnolarni topadi.',
  finance: 'To‘lov va xarajatlardagi nomuvofiqliklarni ko‘rsatadi (har amal tasdiq bilan).',
  schedule_execution: 'Grafik va haqiqiy bajarilish o‘rtasidagi kechikishlarni topadi.',
  quality_handover: 'АОСР va laboratoriya qamrovini tekshiradi, topshirishga tayyorlikni ko‘rsatadi.',
};
export const agentTavsifi = (kod: string, izoh: string | null): string => t(AGENT_TAVSIFI[kod] ?? izoh ?? 'Ishchi agent');

const REJIM: Record<string, string> = {
  read_only: 'Faqat o‘qiydi — hech narsani o‘zgartirmaydi',
  command_prepare: 'Buyruq tayyorlaydi — bajarish tasdiqdan keyin',
  human_approval_required: 'Har bir amal odam tasdig‘ini talab qiladi',
};
export const rejimMatni = (r: string): string => t(REJIM[r] ?? r);

export const MANBA_NOMI: Record<string, string> = { kompaniya: 'Kompaniya tanlagan', platforma: 'Platforma tanlagan', standart: 'Server standarti' };

export const BUYRUQ_HOLATI: Record<string, string> = {
  navbat: 'Navbatda', bajarilmoqda: 'Bajarilmoqda', pr_ochildi: 'PR ochildi', birlashtirildi: 'Birlashtirildi', muvaffaqiyatsiz: 'Muvaffaqiyatsiz', bekor: 'Bekor',
};

/** Kun bo'yicha sarf ustunlari uchun nisbiy balandlik (0..100). */
export function ustunBalandligi(kunlar: Array<{ narx_usd: number }>): number[] {
  const m = Math.max(0, ...kunlar.map((k) => k.narx_usd));
  return kunlar.map((k) => (m > 0 ? Math.max(4, Math.round((k.narx_usd / m) * 100)) : 4));
}
