import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Search, Sparkles } from 'lucide-react';
import { modelOpenrouterdanQosh, openrouterModellarOl, type ModelKatalogi, type ModelMoslik } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

const DARAJA: Record<string, [string, string]> = {
  juda_mos: ['Juda mos', 'bg-ok/20 text-ok'], mos: ['Mos', 'bg-ok/15 text-ok'], chegarada: ['Chegarada', 'bg-warn/20 text-warn'], kuchsiz: ['Kuchsiz', 'bg-danger/20 text-danger'],
};
const QIDIRUV_NAMUNA = 'Model nomini qidiring (masalan: gemini, llama, qwen)…';

export const narxMatni = (m: Pick<ModelMoslik, 'kirish_usd' | 'chiqish_usd'>) => `$${m.kirish_usd}/$${m.chiqish_usd}`;

function Nishon({ m }: { m: ModelMoslik }) {
  const [nom, uslub] = DARAJA[m.daraja] ?? DARAJA.chegarada;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${uslub}`} title={m.sabablar.join('\n')}>{t(nom)}{m.manba === 'taxmin' ? ' *' : ''}</span>;
}

function Qator({ m, tavsiya, katalogda, tanlangan, onTanla }: { m: ModelMoslik; tavsiya: boolean; katalogda: boolean; tanlangan: boolean; onTanla: (m: ModelMoslik) => void }) {
  return (
    <li role="presentation">
      <button type="button" role="option" aria-selected={tanlangan} onClick={() => onTanla(m)} className={`flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-white/5 ${tanlangan ? 'bg-accent/10' : ''}`}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-text">
            {m.nom}{tavsiya && <span className="inline-flex items-center gap-0.5 rounded bg-accent/20 px-1 text-[10px] text-accent"><Sparkles size={9} />{t('Tavsiya')}</span>}
            {m.vision && <span title={t('Rasmni ko‘ra oladi')}>👁</span>}{m.reasoning && <span title={t('Fikrlash rejimi')}>🧠</span>}
          </span>
          <span className="block truncate text-[10px] text-text-mute">{m.id}{!katalogda ? ` · ${t('katalogda yo‘q')}` : ''}</span>
        </span>
        <span className="shrink-0 text-right"><Nishon m={m} /><span className="mt-0.5 block text-[10px] tabular-nums text-text-mute">{narxMatni(m)} · ≈${m.javob_narxi_usd.toFixed(4)}</span></span>
      </button>
    </li>
  );
}

/**
 * Model tanlagich. «Standart» — server tanlovi. Har variant shu ISHCHI talabiga nisbatan baholanadi (Juda mos / Mos / Chegarada / Kuchsiz);
 * kuchsiz model tanlansa — sababi bilan tasdiq so'raladi. Superadmin OpenRouter'dagi ISTALGAN modelni qidirib katalogga qo'sha oladi;
 * kompaniya admini faqat platforma tasdiqlagan katalogdan tanlaydi (xarajat nazorati).
 */
export function ModelTanlagich({ profil, qiymat, katalog, rejim, onTanla, yorliq }: {
  profil: string; qiymat: string | null; katalog: ModelKatalogi[]; rejim: 'superadmin' | 'kompaniya'; onTanla: (modelId: string | null) => void; yorliq: string;
}) {
  const [och, setOch] = useState(false);
  const [q, setQ] = useState('');
  const [katalogBaho, setKatalogBaho] = useState<ModelMoslik[]>([]);
  const [tavsiya, setTavsiya] = useState<string[]>([]);
  const [talab, setTalab] = useState<{ min: number; izoh: string } | null>(null);
  const [qidiruv, setQidiruv] = useState<ModelMoslik[]>([]);
  const [yuk, setYuk] = useState(false);
  const [baholandi, setBaholandi] = useState(false);   // katalog baholari yuklanib bo'ldimi (yuklanguncha «baholanmagan» ko'rsatilmaydi)
  const idlar = useMemo(() => katalog.map((x) => x.id), [katalog]);
  const katalogSet = useMemo(() => new Set(idlar), [idlar]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let tirik = true;
    setBaholandi(false);
    void openrouterModellarOl({ profil, ids: idlar }).then((r) => { if (!tirik) return; if (r.ok) { setKatalogBaho(r.natija.natija); setTavsiya(r.natija.tavsiya); setTalab(r.natija.talab); } setBaholandi(true); });
    return () => { tirik = false; };
  }, [profil, idlar]);

  useEffect(() => {
    if (!och || rejim !== 'superadmin') return undefined;
    setYuk(true);
    const id = window.setTimeout(() => { void openrouterModellarOl({ profil, q }).then((r) => { setQidiruv(r.ok ? r.natija.natija : []); if (r.ok) setTavsiya(r.natija.tavsiya); setYuk(false); }); }, q ? 250 : 0);
    return () => window.clearTimeout(id);
  }, [och, q, profil, rejim]);

  useEffect(() => {
    if (!och) return undefined;
    const yop = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOch(false); };
    document.addEventListener('mousedown', yop);
    return () => document.removeEventListener('mousedown', yop);
  }, [och]);

  const joriy = katalogBaho.find((x) => x.id === qiymat) ?? null;
  const tanla = useCallback(async (m: ModelMoslik) => {
    if (m.daraja === 'kuchsiz' && !window.confirm(`${m.ogohlantirish ?? t('Bu model bu ish uchun kuchsiz.')}\n\n${t('Baribir tanlaysizmi?')}`)) return;
    if (!katalogSet.has(m.id)) {
      if (rejim !== 'superadmin') return;
      const r = await modelOpenrouterdanQosh(m.id);
      if (!r.ok) { toast(r.error, 'danger'); return; }
      toast(t('Model katalogga qo‘shildi'), 'ok');
    }
    setOch(false); onTanla(m.id);
  }, [katalogSet, rejim, onTanla]);

  const katalogQatorlari = katalogBaho.slice().sort((a, c) => (tavsiya.includes(c.id) ? 1 : 0) - (tavsiya.includes(a.id) ? 1 : 0) || a.javob_narxi_usd - c.javob_narxi_usd);
  const baholanmagan = baholandi ? katalog.filter((k) => !katalogBaho.some((b) => b.id === k.id)) : [];
  const qidiruvNatija = qidiruv.filter((x) => !katalogSet.has(x.id));

  return (
    <div ref={ref} className="relative text-[12px]">
      <button type="button" onClick={() => setOch(!och)} aria-haspopup="listbox" aria-expanded={och} aria-label={yorliq}
        className="input flex h-8 w-full items-center gap-1.5 px-2 text-left">
        <span className="min-w-0 flex-1 truncate">{joriy?.nom ?? katalog.find((x) => x.id === qiymat)?.nom ?? (qiymat ?? t('Server standarti'))}</span>
        {joriy && <Nishon m={joriy} />}<ChevronDown size={14} className="shrink-0 text-text-mute" />
      </button>
      {joriy?.ogohlantirish && (
        <p role="alert" className={`mt-1 flex items-start gap-1 rounded px-1.5 py-1 text-[11px] ${joriy.daraja === 'kuchsiz' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn'}`}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />{joriy.ogohlantirish}
        </p>
      )}
      {talab && !och && <p className="mt-1 text-[10px] text-text-mute">{t('Talab')}: ≥ {talab.min} · {t(talab.izoh)}</p>}
      {och && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-96 overflow-y-auto rounded-lg border border-border bg-surface shadow-2xl" style={{ minWidth: '22rem' }}>
          {rejim === 'superadmin' && (
            <div className="sticky top-0 border-b border-border bg-surface p-2">
              <label className="relative block"><span className="sr-only">{t('Model qidirish')}</span>
                <Search size={13} className="absolute left-2 top-2 text-text-mute" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(QIDIRUV_NAMUNA)} className="input h-7 w-full pl-7 pr-2 text-[12px]" />
              </label>
            </div>
          )}
          <ul role="listbox" aria-label={t('Modellar')}>
            <li role="presentation"><button type="button" role="option" aria-selected={!qiymat} onClick={() => { setOch(false); onTanla(null); }} className={`w-full px-2.5 py-1.5 text-left text-[12px] hover:bg-white/5 ${!qiymat ? 'bg-accent/10' : ''}`}>{t('Server standarti')}</button></li>
            {katalogQatorlari.length > 0 && <li className="px-2.5 pt-2 text-[10px] uppercase text-text-mute" role="presentation">{t('Tasdiqlangan katalog')}</li>}
            {katalogQatorlari.map((m) => <Qator key={m.id} m={m} tavsiya={tavsiya.includes(m.id)} katalogda tanlangan={m.id === qiymat} onTanla={(x) => void tanla(x)} />)}
            {baholanmagan.map((k) => (
              <li key={k.id} role="presentation"><button type="button" role="option" aria-selected={k.id === qiymat} onClick={() => { setOch(false); onTanla(k.id); }} className="w-full px-2.5 py-1.5 text-left text-[12px] hover:bg-white/5">{k.nom} <span className="text-[10px] text-text-mute">{t('baholanmagan')}</span></button></li>
            ))}
            {rejim === 'superadmin' && (<>
              <li className="px-2.5 pt-2 text-[10px] uppercase text-text-mute" role="presentation">{t('OpenRouter ro‘yxati')} {yuk ? '…' : ''}</li>
              {qidiruvNatija.map((m) => <Qator key={m.id} m={m} tavsiya={tavsiya.includes(m.id)} katalogda={false} tanlangan={false} onTanla={(x) => void tanla(x)} />)}
              {!yuk && qidiruvNatija.length === 0 && <li className="px-2.5 py-2 text-[11px] text-text-mute" role="presentation">{t('Hech narsa topilmadi')}</li>}
              <li className="px-2.5 py-1.5 text-[10px] text-text-mute" role="presentation">* {t('taxminiy baho: model tanilgan ro‘yxatda yo‘q, narx va hajmdan hisoblangan')}</li>
            </>)}
          </ul>
        </div>
      )}
    </div>
  );
}
