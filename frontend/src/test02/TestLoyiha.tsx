import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, Search, MapPin, Network, Building2, FileSignature, Users } from 'lucide-react';
import { FmtN } from '../lib/format';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';
import { sbT2LoyihalarOl, sbT2LoyihaYoz, type T2Loyiha } from '../api/t2-loyiha';
import { EntityFormModal } from '../umumiy/ui/forms/SharedForms';
import { onEntityChanged } from '../api/entity-consistency';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { t } from '../i18n/til';
import { shartnomaSvodOl } from '../api/t2-nakopitelniy';
import { shartnomaSvodi, type ShartnomaSvodi } from '../lib/nakopitelniy-svod';
import { loyihaChizigi } from '../lib/shartnoma-zanjir-korinish';
import { PortfelSummaJuft } from '../umumiy/ui/PortfelSummaJuft';
import { ArxivTugma } from '../components/arxiv/ArxivTugma';
import { HisobStack, type HisobQator } from '../components/pto-workspace/ObyektGrafik';

const HOLAT: Record<string, { nom: string; cls: string }> = {
  faol: { nom: 'faol', cls: 'fz-stamp--ok' }, tuxtatilgan: { nom: 'to‘xtatilgan', cls: 'fz-stamp--warn' },
  yakunlangan: { nom: 'yakunlangan', cls: 'fz-stamp--info' }, bekor: { nom: 'bekor qilingan', cls: 'fz-stamp--danger' },
};
const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }));

/**
 * Loyihalar reestri (Firuza, 2026-10-25): loyiha → shartnomalar → obyektlar, har loyihada shartnoma bo'yicha
 * hisob (F3) va to'lov chizig'i. Pul — /api/sb `shartnoma_svod_v1` (o'qilmasa chiziq ko'rinmaydi, ro'yxat ishlayveradi).
 */
export default function TestLoyiha() {
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id ?? 0;
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loyihalar, setLoyihalar] = useState<T2Loyiha[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [svod, setSvod] = useState<ShartnomaSvodi[] | null>(null);

  const yukla = async () => {
    if (!aktKomp) return;
    setYuklanmoqda(true);
    const r = await sbT2LoyihalarOl(aktKomp);
    setYuklanmoqda(false);
    if (r.ok && r.qatorlar) {
      setLoyihalar(r.qatorlar);
    }
    try { const s = await shartnomaSvodOl(aktKomp); setSvod(s.ok ? s.natija.shartnomalar.map(shartnomaSvodi) : null); } catch { setSvod(null); }
  };

  useEffect(() => {
    void yukla();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktKomp]);
  useEffect(() => onEntityChanged((event) => {
    if (event.detail.kompaniyaId === aktKomp && event.detail.type === 'loyiha') void yukla();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [aktKomp]);

  const filtered = loyihalar.filter(l => l.nom.toLowerCase().includes(searchTerm.toLowerCase()));
  const loyihaSvod = useMemo(() => {
    const m = new Map<number, ShartnomaSvodi[]>();
    for (const s of svod ?? []) if (s.shartnoma.loyiha_id != null) m.set(s.shartnoma.loyiha_id, [...(m.get(s.shartnoma.loyiha_id) ?? []), s]);
    return m;
  }, [svod]);
  const hisobQatorlari = useMemo<HisobQator[]>(() => filtered.flatMap((l) => {
    const sv = loyihaSvod.get(l.id) ?? [];
    const c = sv.length ? loyihaChizigi(sv) : null;
    if (!c || c.shartnoma == null) return [];
    return [{ kalit: String(l.id), nom: l.nom, tolov: c.tolov, qarz: Math.max(0, c.f3 - c.tolov), qolgan: Math.max(0, c.shartnoma - c.f3) }];
  }), [filtered, loyihaSvod]);
  const jami = useMemo(() => ({
    loyiha: loyihalar.length,
    obyekt: loyihalar.reduce((s, l) => s + (l.obyekt_soni ?? l.obyektlar?.length ?? 0), 0),
    shartnoma: svod?.filter((s) => s.shartnoma.loyiha_id != null).length ?? null,
    faol: loyihalar.filter((l) => l.holat === 'faol').length,
  }), [loyihalar, svod]);

  return (
    <Sahifa sarlavha="Loyihalar" tavsif="Bir nechta obyekt bitta loyihaga guruhlanadi («32 gektar park» — 40 obyekt, 5 shartnoma); loyiha ostida qatnashchilar turli rolda: buyurtmachi, bosh pudratchi, subpudratchi."
      amallar={<button type="button" onClick={() => setIsFormOpen(true)} className="fz-btn fz-btn--primary"><Plus size={16} />{t('Yangi loyiha')}</button>}>
      {isFormOpen && (
        <EntityFormModal
          entityType="loyiha"
          title="Yangi loyiha"
          onClose={() => setIsFormOpen(false)}
          isLoading={yuklanmoqda}
          onSubmit={async (data) => {
            setYuklanmoqda(true);
            const r = await sbT2LoyihaYoz(aktKomp, {
              nom: data.nom,
              hudud: data.hudud,
              byudjet: data.byudjet === '' ? null : Number(data.byudjet)
            });
            setYuklanmoqda(false);
            if (r.ok) {
              toast(t('Loyiha yaratildi'), 'ok');
              setIsFormOpen(false);
              void yukla();
            } else {
              toast(r.error || t('Xato'), 'danger');
            }
          }}
        />
      )}

      <div className="flex flex-col gap-3">
        <section className="fz-card p-4" aria-label={t('Loyihalar bo‘yicha jami')}>
          <div className="fz-kpis">
            <div className="fz-kpi"><span className="fz-kpi__label">{t('Loyihalar')}</span><span className="fz-kpi__value">{jami.loyiha}</span><span className="fz-kpi__sub">{t('{n} tasi faol', { n: jami.faol })}</span></div>
            <div className="fz-kpi"><span className="fz-kpi__label">{t('Shartnomalar')}</span><span className="fz-kpi__value">{jami.shartnoma ?? '—'}</span><span className="fz-kpi__sub">{t('loyihaga biriktirilgan')}</span></div>
            <div className="fz-kpi"><span className="fz-kpi__label">{t('Obyektlar')}</span><span className="fz-kpi__value">{jami.obyekt}</span><span className="fz-kpi__sub">{t('loyihalar ichida')}</span></div>
          </div>
        </section>

        <HisobStack qatorlar={hisobQatorlari} />

        <section className="fz-card" aria-label={t('Loyihalar ro‘yxati')}>
          <div className="fz-card__head">
            <label className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-mute" size={15} />
              <input type="text" aria-label={t('Loyiha qidirish')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('Loyiha qidirish…')} className="input w-full py-1.5 pl-9 pr-3 text-[13px]" />
            </label>
            <span className="text-[12px] text-text-mute">{t('{n} ta loyiha', { n: filtered.length })}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="fz-table">
              <thead><tr>
                <th>{t('Loyiha')}</th><th>{t('Tarkib')}</th><th className="fz-c-num">{t('Smeta (ustamali / ustamasiz)')}</th><th className="fz-c-num">{t('Byudjet, so‘m')}</th><th style={{ minWidth: 220 }}>{t('Shartnoma bo‘yicha hisob (F3)')}</th><th>{t('Holat')}</th><th className="fz-c-num">{t('Amal')}</th>
              </tr></thead>
              <tbody>
                {yuklanmoqda && !loyihalar.length ? (
                  <tr><td colSpan={7}><div className="skel h-24 rounded-md" /></td></tr>
                ) : filtered.map(l => {
                  const sv = loyihaSvod.get(l.id) ?? [];
                  const c = sv.length ? loyihaChizigi(sv) : null;
                  const h = HOLAT[l.holat] ?? { nom: l.holat, cls: '' };
                  const obSoni = l.obyekt_soni ?? l.obyektlar?.length ?? 0;
                  return (
                    <tr key={l.id}>
                      <td>
                        <button type="button" className="flex items-center gap-2 text-left font-semibold text-text hover:text-accent" onClick={() => navigate(`/admin/obyektlar?loyiha=${l.id}`)}>
                          <FolderKanban size={15} className="shrink-0 text-accent" />{l.nom}
                        </button>
                        <div className="mt-0.5 flex items-center gap-1 text-[12px] text-text-mute"><MapPin size={12} />{l.hudud || '—'}<span className="fz-c-shifr ml-2">#{l.id}</span></div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <span className="fz-chip" title={t('Shartnomalar')}><FileSignature size={11} />{svod ? sv.length : '—'}</span>
                          <span className="fz-chip" title={t('Obyektlar')}><Building2 size={11} />{obSoni}</span>
                          <span className="fz-chip" title={t('Qatnashchilar')}><Users size={11} />{l.qatnashchilar?.length ?? 0}</span>
                        </div>
                      </td>
                      <td className="fz-c-num">{l.obyektlar?.length ? <PortfelSummaJuft className="items-end" kichik obyektlar={l.obyektlar.map((o) => ({ obyektId: o.obyekt_id }))} /> : <span className="text-text-mute">—</span>}</td>
                      <td className="fz-c-num">{l.byudjet == null ? <span className="text-text-mute">—</span> : <FmtN val={l.byudjet} kasr={0} />}</td>
                      <td>
                        {!c ? <span className="text-[12px] text-text-mute">{svod ? t('shartnoma yo‘q') : '—'}</span>
                          : c.foiz == null ? <span className="text-[12px] text-text-mute">{t('F3: {s} · shartnoma summasi yo‘q', { s: fmt(c.f3) })}</span>
                          : <div className="flex flex-col gap-1" title={t('Shartnoma {sh} · F3 {f3} · to‘lov {tl}', { sh: fmt(c.shartnoma), f3: fmt(c.f3), tl: fmt(c.tolov) })}>
                            <span className={`fz-meter ${c.oshdi ? 'fz-meter--over' : ''}`}>
                              <span className="fz-meter__t"><i style={{ width: `${c.tolovUlush * 100}%`, background: 'var(--ok)' }} /><i className="fz-meter__shu" style={{ width: `${c.qarzUlush * 100}%` }} /></span>
                              <span className="fz-meter__f">{Math.round(c.foiz)}%</span>
                            </span>
                            <span className="text-[11.5px] text-text-mute">{t('qoldiq hisob: {q}', { q: fmt(c.qolgan) })}{c.nomalum ? ` · ${t('{n} ta shartnomada summa yo‘q', { n: c.nomalum })}` : ''}</span>
                          </div>}
                      </td>
                      <td><span className={`fz-stamp ${h.cls}`}>{t(h.nom)}</span></td>
                      <td className="fz-c-num">
                        <button type="button" onClick={() => navigate(`/admin/mindmap?tugun=loyiha:${l.id}`)} className="fz-btn fz-btn--ghost fz-btn--sm"><Network size={14} />{t('Mindmapda ko‘rish')}</button>
                        <ArxivTugma tur="loyiha" id={l.id} nom={l.nom} onDone={() => void yukla()} />
                      </td>
                    </tr>
                  );
                })}
                {!yuklanmoqda && filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-text-mute">
                    {loyihalar.length ? t('Qidiruvga mos loyiha yo‘q.') : t('Hali loyiha yaratilmagan — «Yangi loyiha» tugmasi bilan boshlang.')}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-4 py-2.5 text-[12px] text-text-mute">
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: 'var(--ok)' }} />{t('to‘langan')}</span>{' · '}
            <span className="inline-flex items-center gap-1"><i className="fz-meter__shu inline-block h-2 w-3 rounded-sm" />{t('hisoblangan, to‘lanmagan')}</span>{' · '}
            {t('shartnoma summasi (DS bilan) = 100%')}
          </p>
        </section>
      </div>
    </Sahifa>
  );
}
