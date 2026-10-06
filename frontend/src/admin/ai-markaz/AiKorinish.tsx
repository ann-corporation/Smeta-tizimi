import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import type { Markaz } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { foiz, usd, ustunBalandligi } from './ai-markaz-yordam';

type Holat = 'ok' | 'ogoh' | 'kerak';
type Band = { holat: Holat; nom: string; izoh: string; amal?: string; bolim?: string };

function tayyorlik(m: Markaz): Band[] {
  const limitBor = m.limit_usd != null && m.limit_faol;
  return [
    { holat: limitBor ? 'ok' : 'kerak', nom: 'Oylik xarajat limiti', izoh: limitBor ? `${t('Limit')}: ${usd(m.limit_usd)} / ${t('oy')}` : 'Limit belgilanmagan — shuning uchun AI ISHLAMAYDI (xavfsiz standart).', amal: 'Limit belgilash', bolim: 'xarajat' },
    { holat: m.sozlama.openrouter ? 'ok' : 'kerak', nom: 'OpenRouter ulanishi', izoh: m.sozlama.openrouter ? 'Kalit serverda sozlangan (qiymati hech qayerda ko‘rinmaydi).' : 'Cloudflare sozlamalarida OPENROUTER_API_KEY yo‘q.' },
    { holat: m.sonlar.model_soni >= 2 ? 'ok' : 'ogoh', nom: 'Modellar galereyasi', izoh: m.sonlar.model_soni >= 2 ? `${m.sonlar.model_soni} ${t('ta model katalogda')}` : 'Katalogda faqat avto-tanlov bor. Modellarni narxi bilan qo‘shing.', amal: 'Modellarni sozlash', bolim: 'agentlar' },
    { holat: m.sozlama.ai_yoqilgan ? 'ok' : 'ogoh', nom: 'AI holati', izoh: m.sozlama.ai_yoqilgan ? 'Yoqilgan.' : 'Hozircha o‘chiq (AGENT_ISH_YOQILGAN). Yuqoridagilar tayyor bo‘lgach yoqing.' },
    { holat: m.sozlama.github ? 'ok' : 'ogoh', nom: 'Ijrochi (GitHub)', izoh: m.sozlama.github ? 'Ulangan: tasdiqlangan ishlar issue sifatida ijrochiga yuboriladi.' : 'Ulanmagan: tasdiqlangan ishlarni ijrochiga yuborib bo‘lmaydi.' },
  ];
}

function Belgi({ h }: { h: Holat }) {
  if (h === 'ok') return <CheckCircle2 size={16} className="text-ok" />;
  if (h === 'ogoh') return <AlertTriangle size={16} className="text-warn" />;
  return <Circle size={16} className="text-danger" />;
}

export function AiKorinish({ m, bolimOch }: { m: Markaz; bolimOch: (b: string) => void }) {
  const bandlar = tayyorlik(m);
  const kerak = bandlar.filter((b) => b.holat === 'kerak').length;
  const sarfFoiz = m.limit_usd ? foiz(m.oy_sarfi_usd, m.limit_usd) : 0;
  const balandlik = ustunBalandligi(m.kunlar);
  const s = m.sonlar;
  return (
    <div className="space-y-3">
      <section className={`karta p-4 ${kerak ? 'border-danger/40' : 'border-ok/40'}`} aria-label={t('AI tayyorligi')}>
        <h2 className="mb-1 text-[14px] font-semibold text-text">{kerak ? t('AI hali ishga tayyor emas') : t('AI ishga tayyor')}</h2>
        <ul className="space-y-1.5">
          {bandlar.map((b) => (
            <li key={b.nom} className="flex items-start gap-2 text-[13px]">
              <span className="mt-0.5"><Belgi h={b.holat} /></span>
              <span className="flex-1"><span className="font-medium text-text">{t(b.nom)}</span> <span className="text-text-dim">— {t(b.izoh)}</span></span>
              {b.bolim && b.holat !== 'ok' && <button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => bolimOch(b.bolim!)}>{t(b.amal ?? 'Ochish')}</button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-2 md:grid-cols-4" aria-label={t('Asosiy ko‘rsatkichlar')}>
        <div className="karta p-3">
          <div className="text-[11px] uppercase text-text-mute">{t('Shu oy sarfi')}</div>
          <div className="text-[22px] font-semibold tabular-nums text-text">{usd(m.oy_sarfi_usd)}</div>
          {m.limit_usd != null && (<>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-surface-2" role="progressbar" aria-valuenow={sarfFoiz} aria-valuemin={0} aria-valuemax={100} aria-label={t('Limit sarfi')}>
              <div className={`h-full ${sarfFoiz >= (m.ogohlantirish_foiz ?? 80) ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${sarfFoiz}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-text-mute">{sarfFoiz}% {t('limit')}: {usd(m.limit_usd)}</div>
          </>)}
          <div className="mt-1 text-[11px] text-text-mute">{t('Foyda')}: <span className={m.foyda_oy_usd >= 0 ? 'text-ok' : 'text-danger'}>{usd(m.foyda_oy_usd)}</span> · {t('ustama')} {m.ustama_foiz}%</div>
        </div>
        <button type="button" className="karta p-3 text-left hover:border-accent" onClick={() => bolimOch('takliflar')}>
          <div className="text-[11px] uppercase text-text-mute">{t('Tasdiq kutayotgan takliflar')}</div>
          <div className="text-[22px] font-semibold tabular-nums text-text">{s.taklif_kutilmoqda}</div>
          <div className="text-[11px] text-text-mute">{t('Ishdagi buyruqlar')}: {s.buyruq_navbat + s.buyruq_ishda} · {t('bajarilgan')}: {s.buyruq_bitgan}</div>
        </button>
        <button type="button" className="karta p-3 text-left hover:border-accent" onClick={() => bolimOch('organish')}>
          <div className="text-[11px] uppercase text-text-mute">{t('Yangi signallar')}</div>
          <div className="text-[22px] font-semibold tabular-nums text-text">{s.signal_yangi}</div>
          <div className="text-[11px] text-text-mute">{t('Foydalanuvchi fikrlari (30 kun)')}: {s.fikr_30kun}</div>
        </button>
        <button type="button" className="karta p-3 text-left hover:border-accent" onClick={() => bolimOch('qoidalar')}>
          <div className="text-[11px] uppercase text-text-mute">{t('Faol qoidalar')}</div>
          <div className="text-[22px] font-semibold tabular-nums text-text">{s.qoida_faol}</div>
          <div className="text-[11px] text-text-mute">{t('Tasdiqlangan manbalar')}: {s.manba_faol} · {t('agentlar')}: {s.agent_soni}</div>
        </button>
      </section>

      <section className="karta p-4" aria-label={t('Oxirgi 14 kun sarfi')}>
        <h2 className="mb-2 text-[13px] font-semibold text-text">{t('Oxirgi 14 kun sarfi')}</h2>
        {m.kunlar.length === 0 ? <p className="text-[12px] text-text-mute">{t('Hali AI chaqiruvlari bo‘lmagan.')}</p> : (
          <div className="flex h-24 items-end gap-1">
            {m.kunlar.map((k, i) => (
              <div key={k.kun} className="flex flex-1 flex-col items-center justify-end" title={`${k.kun}: ${usd(k.narx_usd)} · ${k.chaqiruv}`}>
                <div className="w-full rounded-t bg-accent/70" style={{ height: `${balandlik[i]}%` }} />
                <div className="mt-1 text-[9px] text-text-mute">{k.kun.slice(8)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="karta p-4" aria-label={t('AI qanday o‘rganadi')}>
        <h2 className="mb-2 text-[13px] font-semibold text-text">{t('AI qanday o‘rganadi va rivojlanadi')}</h2>
        <ol className="grid gap-2 text-[12px] text-text-dim md:grid-cols-4">
          <li><b className="text-text">1. {t('Kuzatadi')}</b><br />{t('Foydalanuvchi fikri, skrinshoti va agentlar signallari yig‘iladi (kompaniya nomi, raqam va matn tozalanadi).')}</li>
          <li><b className="text-text">2. {t('Taklif beradi')}</b><br />{t('Rivojlantiruvchi agent signallarni guruhlab, aniq ish taklif qiladi.')}</li>
          <li><b className="text-text">3. {t('Siz tasdiqlaysiz')}</b><br />{t('Hech narsa tasdiqsiz o‘zgarmaydi. Xavfi pastlar avto-birlashtirilishi mumkin.')}</li>
          <li><b className="text-text">4. {t('Ijrochi bajaradi')}</b><br />{t('Ijrochi agent alohida branchda ishlaydi, test yozadi va PR ochadi. Birlashtirish — CI va sizning nazoratingizda.')}</li>
        </ol>
      </section>
    </div>
  );
}
