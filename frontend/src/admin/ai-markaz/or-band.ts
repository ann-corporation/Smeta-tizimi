import type { Markaz } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { usd } from './ai-markaz-yordam';

export type OrBand = { holat: 'ok' | 'ogoh' | 'kerak'; nom: string; izoh: string };

/** OpenRouter: kalit bormi, OpenRouter uni qabul qiladimi va hisobda qancha pul qolgan (egasi 2026-10-19). */
export function orBand(m: Markaz): OrBand {
  const nom = 'OpenRouter ulanishi';
  const b = m.openrouter_balans;
  if (!m.sozlama.openrouter || b?.holat === 'kalit_yoq') return { holat: 'kerak', nom, izoh: 'Cloudflare sozlamalarida OPENROUTER_API_KEY yo‘q.' };
  if (b?.holat === 'rad_etildi') return { holat: 'kerak', nom, izoh: 'OpenRouter kalitni rad etdi (bekor qilingan yoki noto‘g‘ri) — yangi kalitni Cloudflare’ga kiriting.' };
  if (!b || b.holat === 'xato') return { holat: 'ogoh', nom, izoh: 'Kalit sozlangan, lekin balansni hozir o‘qib bo‘lmadi.' };
  const qoldiq = b.kalit_qoldiq_usd != null && (b.qoldiq_usd == null || b.kalit_qoldiq_usd < b.qoldiq_usd) ? b.kalit_qoldiq_usd : b.qoldiq_usd;
  const sarf = b.sarflangan_usd != null ? ` · ${t('jami sarflangan')}: ${usd(b.sarflangan_usd)}` : '';
  const matn = `${t('Balans')}: ${qoldiq == null ? '—' : usd(qoldiq)}${sarf}`;
  if (qoldiq != null && qoldiq <= 0) return { holat: 'kerak', nom, izoh: `${t('Kredit tugagan — AI ishlamaydi. OpenRouter’da hisobni to‘ldiring.')} ${matn}` };
  if (qoldiq != null && qoldiq < 2) return { holat: 'ogoh', nom, izoh: `${t('Kredit kam qoldi — to‘ldiring.')} ${matn}` };
  return { holat: 'ok', nom, izoh: matn };
}
