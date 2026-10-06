import { useCallback, useEffect, useState } from 'react';
import { modelKatalogYoz, modelTanla, modellarOl, type AgentModelQatori, type Markaz, type ModellarJavobi } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { agentTavsifi, MANBA_NOMI, rejimMatni, usd } from './ai-markaz-yordam';
import { ModelTanlagich } from './ModelTanlagich';

const MODEL_NAMUNA = 'ishlab-chiqaruvchi/model-nomi';
const NOM_NAMUNA = 'Ko‘rinadigan nom';
const NARX_NAMUNA = '0.00';

function AgentKarta({ a, d, sarf, onTanla }: { a: AgentModelQatori; d: ModellarJavobi; sarf: number; onTanla: (kod: string, id: string) => void }) {
  const tanlangan = d.katalog.find((m) => m.id === a.model_id);
  return (
    <article className="karta flex flex-col gap-2 p-3" aria-label={a.nom || a.kod}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-text">{a.nom || a.kod}</h3>
          <div className="text-[11px] text-text-mute">{a.kod}</div>
        </div>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-dim" title={t('Ishlash doirasi')}>{a.default_scope}</span>
      </div>
      <p className="text-[12px] text-text-dim">{agentTavsifi(a.kod, a.izoh)}</p>
      <div className="rounded-md border border-border/70 bg-surface-2/50 px-2 py-1 text-[11px] text-text-dim">🛡 {rejimMatni(a.permission_mode)}</div>
      <div>
        <div className="mb-1 text-[11px] text-text-mute">{t('Ishlatadigan modeli')}</div>
        <ModelTanlagich profil={a.kod} qiymat={a.model_id} katalog={d.katalog} rejim="superadmin" yorliq={`${t('Model')} — ${a.nom || a.kod}`} onTanla={(id) => onTanla(a.kod, id ?? '')} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-text-mute">
        <span>{t(MANBA_NOMI[a.model_manba] ?? a.model_manba)}{tanlangan?.narx_kirish_usd != null ? ` · $${tanlangan.narx_kirish_usd}/$${tanlangan.narx_chiqish_usd} ${t('1M token uchun')}` : ''}</span>
        <span title={t('Shu oy sarfi')}>{usd(sarf)}</span>
      </div>
    </article>
  );
}

/** Tizim agentlari + kompaniya agentlarining STANDART modeli (kompaniya o'zi o'zgartira oladi) + model katalogi (narxlari bilan). */
export function AiAgentlarBolimi({ markaz }: { markaz: Markaz | null }) {
  const [d, setD] = useState<ModellarJavobi | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yId, setYId] = useState(''); const [yNom, setYNom] = useState(''); const [yKir, setYKir] = useState(''); const [yChiq, setYChiq] = useState(''); const [yVis, setYVis] = useState(false);

  const yukla = useCallback(async () => { const r = await modellarOl(null); if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error); }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  const tanla = async (kod: string, id: string) => {
    const r = await modelTanla(null, kod, id || null);
    if (r.ok) { toast(t('Model saqlandi'), 'ok'); void yukla(); } else toast(r.error, 'danger');
  };
  const qosh = async () => {
    const son = (v: string) => (v.trim() === '' ? null : Number(v));
    const r = await modelKatalogYoz({ id: yId.trim(), nom: yNom.trim(), vision: yVis, narxKirishUsd: son(yKir), narxChiqishUsd: son(yChiq) });
    if (r.ok) { toast(t('Katalogga qo‘shildi'), 'ok'); setYId(''); setYNom(''); setYKir(''); setYChiq(''); setYVis(false); void yukla(); } else toast(r.error, 'danger');
  };

  if (xato) return <section role="alert" className="karta border-danger/40 p-4 text-danger">{xato}</section>;
  if (!d) return <p className="p-4 text-text-dim">{t('Yuklanmoqda…')}</p>;
  const sarfOf = (kod: string) => (markaz?.agentlar ?? []).filter((x) => x.profil === kod).reduce((a, x) => a + x.narx_usd, 0);
  const tizim = d.agentlar.filter((a) => a.default_scope === 'global');
  const kompaniya = d.agentlar.filter((a) => a.default_scope !== 'global');
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold text-text">{t('Tizim agentlari')}</h2>
        <p className="text-[12px] text-text-mute">{t('Butun platformani kuzatadi. Faqat siz (superadmin) boshqarasiz; kompaniyalar ularni ko‘rmaydi va o‘zgartira olmaydi.')}</p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{tizim.map((a) => <AgentKarta key={a.kod} a={a} d={d} sarf={sarfOf(a.kod)} onTanla={(k, i) => void tanla(k, i)} />)}</div>
      </section>
      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold text-text">{t('Kompaniya agentlari — standart model')}</h2>
        <p className="text-[12px] text-text-mute">{t('Bu yerda tanlangan model hamma kompaniya uchun standart bo‘ladi. Kompaniya admini o‘zi uchun boshqa modelni tanlashi mumkin.')}</p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{kompaniya.map((a) => <AgentKarta key={a.kod} a={a} d={d} sarf={sarfOf(a.kod)} onTanla={(k, i) => void tanla(k, i)} />)}</div>
      </section>
      <section className="karta overflow-x-auto p-4" aria-label={t('Modellar galereyasi')}>
        <h2 className="mb-1 text-[14px] font-semibold text-text">{t('Modellar galereyasi')}</h2>
        <p className="mb-2 text-[12px] text-text-mute">{t('OpenRouter orqali istalgan model qo‘shiladi. Narxlarni (1 million token uchun, dollarda) kiriting — xarajat hisobi va limit shunga tayanadi. Narx kiritilmasa, haqiqiy narx provayderdan olinadi.')}</p>
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th>{t('Model')}</th><th>{t('Kirish $/1M')}</th><th>{t('Chiqish $/1M')}</th><th>{t('Rasm')}</th></tr></thead>
          <tbody>{d.katalog.map((m) => (
            <tr key={m.id} className="border-t border-border/60"><td className="py-1"><div className="text-text">{m.nom}</div><div className="text-[10px] text-text-mute">{m.id}</div></td>
              <td>{m.narx_kirish_usd ?? '—'}</td><td>{m.narx_chiqish_usd ?? '—'}</td><td>{m.vision ? '👁' : ''}</td></tr>
          ))}</tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-end gap-2 text-[11px] text-text-mute">
          <label className="flex flex-col gap-1">{t('Model identifikatori')}<input value={yId} onChange={(e) => setYId(e.target.value)} placeholder={MODEL_NAMUNA} className="input h-8 w-64 px-2 text-[12px]" /></label>
          <label className="flex flex-col gap-1">{t('Nomi')}<input value={yNom} onChange={(e) => setYNom(e.target.value)} placeholder={t(NOM_NAMUNA)} className="input h-8 w-44 px-2 text-[12px]" /></label>
          <label className="flex flex-col gap-1">{t('Kirish $/1M')}<input inputMode="decimal" value={yKir} onChange={(e) => setYKir(e.target.value)} placeholder={NARX_NAMUNA} className="input h-8 w-20 px-2 text-[12px]" /></label>
          <label className="flex flex-col gap-1">{t('Chiqish $/1M')}<input inputMode="decimal" value={yChiq} onChange={(e) => setYChiq(e.target.value)} placeholder={NARX_NAMUNA} className="input h-8 w-20 px-2 text-[12px]" /></label>
          <label className="flex items-center gap-1 pb-1.5"><input type="checkbox" checked={yVis} onChange={(e) => setYVis(e.target.checked)} />{t('Rasm ko‘ra oladi')}</label>
          <button type="button" disabled={!yId.trim() || yNom.trim().length < 2} onClick={() => void qosh()} className="tugma-asosiy h-8 px-3 text-[12px] disabled:opacity-40">{t('Katalogga qo‘shish')}</button>
        </div>
      </section>
    </div>
  );
}
