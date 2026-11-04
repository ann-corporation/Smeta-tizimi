/**
 * «Uy sotish» — sotuvchi ekrani (/admin/sotuv). Tablar: Shaxmatka · Bitimlar · Mijozlar · Panel · Sozlama.
 * Ko'rinish ruxsatga qarab: sales.read — shaxmatka, panel, bitim kartasi; sales.write — bitimlar, mijozlar, bron;
 * sales.price — narx, birlik holati, sozlama; sales.payment — to'lovlar. Server baribir har RPC da tekshiradi.
 * Tab, bino va ochiq bitim URL da (?tab=&bino=&bitim=) — havola bilan ulashsa bo'ladi.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { t } from '../../i18n/til';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useSotuvRuxsat } from './sotuv-umumiy';
import { useBinolar, usePanel } from './sorovlar';
import { Shaxmatka } from './Shaxmatka';
import { Kanban } from './Kanban';
import { Mijozlar } from './Mijozlar';
import { Panel } from './Panel';
import { Sozlama } from './Sozlama';
import { BitimKarta } from './BitimKarta';

/** So'rov holati: ma'lumot / xato / yuklanmoqda. */
function Holat<T>({ q, children }: { q: { data?: T; error: unknown }; children: (d: T) => ReactNode }) {
  if (q.data) return <>{children(q.data)}</>;
  if (q.error) return <p className="fz-note fz-note--danger">{t((q.error as Error).message)}</p>;
  return <p className="text-text-mute">{t('Yuklanmoqda…')}</p>;
}

type Tab = 'shaxmatka' | 'bitimlar' | 'mijozlar' | 'panel' | 'sozlama';

export default function SotuvSahifa() {
  const r = useSotuvRuxsat();
  const kid = r.kompaniyaId;
  const [qp, setQp] = useSearchParams();
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [kanbanQidiruv, setKanbanQidiruv] = useState('');

  const tablar = useMemo(() => ([
    { id: 'shaxmatka', nom: t('Shaxmatka'), bor: r.oqish },
    { id: 'bitimlar', nom: t('Bitimlar'), bor: r.yozish },
    { id: 'mijozlar', nom: t('Mijozlar'), bor: r.yozish },
    { id: 'panel', nom: t('Panel'), bor: r.oqish },
    { id: 'sozlama', nom: t('Sozlama'), bor: r.narx },
  ] as Array<{ id: Tab; nom: string; bor: boolean }>).filter((x) => x.bor), [r.oqish, r.yozish, r.narx]);
  const tab: Tab = tablar.find((x) => x.id === qp.get('tab'))?.id ?? tablar[0]?.id ?? 'shaxmatka';
  const obyektId = Number(qp.get('bino')) || null;
  const bitimId = Number(qp.get('bitim')) || null;
  const qoy = (o: Record<string, string | null>) => setQp((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(o)) { if (v == null) n.delete(k); else n.set(k, v); }
    return n;
  }, { replace: true });

  const asosiy = usePanel(kid, null, !r.oqish);
  const filtrli = usePanel(kid, loyihaId, !r.oqish || tab !== 'panel');
  const obyektlar = useBinolar(kid);
  const binolar = useMemo(() => {
    const m = new Map<number, { id: number; nom: string }>();
    for (const o of obyektlar.data ?? []) m.set(o.id, { id: o.id, nom: o.nom });
    for (const b of asosiy.data?.binolar ?? []) if (!m.has(b.obyekt_id)) m.set(b.obyekt_id, { id: b.obyekt_id, nom: b.nom });
    return [...m.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [obyektlar.data, asosiy.data]);

  const bitimOch = (id: number) => qoy({ bitim: String(id) });

  if (!kid) return <Sahifa sarlavha="Uy sotish"><p className="p-4 text-text-mute">{t('Kompaniyani tanlang.')}</p></Sahifa>;
  if (!r.oqish) return <Sahifa sarlavha="Uy sotish"><p className="fz-note fz-note--warn m-4">{t('Bu bo‘lim uchun «sales.read» ruxsati kerak.')}</p></Sahifa>;

  return (
    <Sahifa sarlavha="Uy sotish" tavsif="Shaxmatka, bitimlar, bron, to‘lov grafigi va sotuv paneli">
      <div className="flex min-h-0 flex-col gap-3 p-3 sm:p-4">
        <div role="tablist" aria-label={t('Uy sotish bo‘limlari')} className="flex gap-1 overflow-x-auto border-b border-border pb-1">
          {tablar.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => qoy({ tab: x.id })}
              className={`whitespace-nowrap rounded-t-md px-3 py-1.5 text-[13px] ${tab === x.id ? 'border-b-2 border-accent font-semibold text-accent' : 'text-text-dim hover:text-text'}`}>
              {x.nom}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="min-h-0">
          {tab === 'shaxmatka' && (
            <Shaxmatka kid={kid} ruxsat={r} binolar={binolar} obyektId={obyektId} setObyektId={(id) => qoy({ bino: id ? String(id) : null })} bitimOch={bitimOch} />
          )}
          {tab === 'bitimlar' && <Kanban key={kanbanQidiruv} kid={kid} binolar={binolar} boshQidiruv={kanbanQidiruv} bitimOch={bitimOch} />}
          {tab === 'mijozlar' && <Mijozlar kid={kid} bitimlariniOch={(tel) => { setKanbanQidiruv(tel); qoy({ tab: 'bitimlar' }); }} />}
          {tab === 'panel' && <Holat q={filtrli}>{(d) => <Panel p={d} loyihaId={loyihaId} setLoyihaId={setLoyihaId} bitimOch={bitimOch} />}</Holat>}
          {tab === 'sozlama' && <Holat q={asosiy}>{(d) => <Sozlama kid={kid} loyihalar={d.loyihalar} />}</Holat>}
        </div>
      </div>
      {bitimId && <BitimKarta kid={kid} bitimId={bitimId} ruxsat={r} binolar={binolar} yop={() => qoy({ bitim: null })} />}
    </Sahifa>
  );
}
