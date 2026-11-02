/**
 * Boshqaruv → Telegram bot (faqat superadmin; server har chaqiruvda bazada tekshiradi).
 * Bot holati (token/sir o'rnatilganmi, webhook to'g'ri manzilda turibdimi, navbat, oxirgi xato), ulangan foydalanuvchilar soni,
 * va bir martalik sozlash: setWebhook (secret_token bilan) + menyu tugmasi (Mini App) + buyruqlar. Token hech qachon ko'rsatilmaydi.
 */
import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n/til';
import { tgAdminHolat, tgAdminOrnat, tgXato, type TgAdminHolat } from '../api/t2-telegram';
import { toast } from '../umumiy/ui/Toast';

const son = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('ru-RU'));

function Belgi({ ha, yorliq }: { ha: boolean | null | undefined; yorliq: string }) {
  const matn = ha == null ? '—' : ha ? t('Ha') : t('Yo‘q');
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-t border-border/60 text-[13px]">
      <span className="text-text-dim">{t(yorliq)}</span>
      <span className={`fz-chip ${ha ? 'fz-chip--accent' : ''}`}>{matn}</span>
    </div>
  );
}

export default function TelegramBotPanel() {
  const [d, setD] = useState<TgAdminHolat | null>(null);
  const [band, setBand] = useState(false);
  const yukla = useCallback(async () => { setD(await tgAdminHolat()); }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  async function ornat() {
    setBand(true);
    const r = await tgAdminOrnat();
    setBand(false);
    if (!r.ok) toast(t(tgXato(r)) + (r.webhook_xato || r.menyu_xato ? ` (${r.webhook_xato || r.menyu_xato})` : ''), 'danger');
    else toast(t('Webhook va menyu tugmasi o‘rnatildi.'));
    await yukla();
  }

  if (!d) return <p className="text-[13px] text-text-dim">{t('Yuklanmoqda…')}</p>;
  if (!d.ok) return <p className="text-[13px] text-danger">{t(tgXato(d))}</p>;
  return (
    <div className="space-y-4">
      <section className="fz-table-wrap p-4 space-y-1">
        <h3 className="text-[14px] font-semibold text-text m-0 mb-2">{t('Telegram bot holati')}{d.bot ? ` · @${d.bot}` : ''}</h3>
        <Belgi ha={d.sozlangan} yorliq="TELEGRAM_BOT_TOKEN o‘rnatilgan" />
        <Belgi ha={d.sir_sozlangan} yorliq="TELEGRAM_WEBHOOK_SECRET o‘rnatilgan" />
        <Belgi ha={d.webhook ? d.webhook.ornatilgan : null} yorliq="Webhook to‘g‘ri manzilda" />
        {d.webhook?.url && d.webhook.url !== d.kutilgan_url && <p className="text-[12px] text-warn m-0">{t('Hozirgi webhook: {url}', { url: d.webhook.url })}</p>}
        <div className="flex items-center justify-between gap-3 py-1 border-t border-border/60 text-[13px]">
          <span className="text-text-dim">{t('Navbatdagi yangilanishlar')}</span><span className="tabular-nums">{son(d.webhook?.navbat)}</span>
        </div>
        {d.webhook?.oxirgi_xato && <p className="text-[12px] text-danger m-0">{t('Oxirgi xato')}: {d.webhook.oxirgi_xato} ({d.webhook.oxirgi_xato_vaqt})</p>}
      </section>
      <section className="fz-table-wrap p-4 space-y-1">
        <h3 className="text-[14px] font-semibold text-text m-0 mb-2">{t('Statistika')}</h3>
        <div className="flex items-center justify-between gap-3 py-1 text-[13px]"><span className="text-text-dim">{t('Ulangan foydalanuvchilar')}</span><span className="tabular-nums">{son(d.statistika?.ulangan)}</span></div>
        <div className="flex items-center justify-between gap-3 py-1 border-t border-border/60 text-[13px]"><span className="text-text-dim">{t('Bot xabarlari (24 soat)')}</span><span className="tabular-nums">{son(d.statistika?.update_24s)}</span></div>
        <div className="flex items-center justify-between gap-3 py-1 border-t border-border/60 text-[13px]"><span className="text-text-dim">{t('Mini App kirishlari (24 soat)')}</span><span className="tabular-nums">{son(d.statistika?.miniapp_24s)}</span></div>
      </section>
      <section className="fz-table-wrap p-4 space-y-2">
        <p className="text-[13px] text-text-dim m-0">{t('Bir martalik sozlash: webhook (maxfiy sarlavha bilan), menyu tugmasi (Mini App) va buyruqlar ro‘yxati Telegram’ga yuboriladi. Token serverda qoladi.')}</p>
        <div className="flex gap-2">
          <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={band || !d.sozlangan || !d.sir_sozlangan} onClick={() => { void ornat(); }}>
            {t('Webhook va menyu tugmasini o‘rnatish')}
          </button>
          <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => { void yukla(); }}>{t('Yangilash')}</button>
        </div>
      </section>
    </div>
  );
}
