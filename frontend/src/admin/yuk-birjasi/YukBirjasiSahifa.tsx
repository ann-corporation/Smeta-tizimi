/**
 * Yuk birjasi — yuk egasi (ta’minot xodimi) ekrani: yuk e’lon qilish, takliflarni ko‘rish, qabul / qarshi narx, bron, holat va isbot.
 * Tashuvchi (haydovchi) tomoni Telegram botda (PR4). Narx — tavsiya (t·km), yakuniy narx va to‘lov shaklini tomonlar kelishadi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { OpsQidiruv, OpsTablar } from '../../components/kompaniya-ops/OpsUi';
import { t } from '../../i18n/til';
import { ybXato, ybYuklarim, type YukQator } from '../../api/t2-yuk-birjasi';
import { YUK_YAKUNIY } from '../../lib/yuk-birjasi/holat';
import { FmtN } from '../../lib/format';
import { Bosh, sanaKun, TOLOV_SHAKLI_NOM, YukHolatBelgi } from './yuk-ui';
import { YukTafsilot } from './YukTafsilot';
import { YukTahrir, type YukBoshlang } from './YukTahrir';

type Tab = 'faol' | 'yopiq';

export default function YukBirjasiSahifa() {
  const { joriy } = useKompaniya();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('faol');
  const [qatorlar, setQatorlar] = useState<YukQator[]>([]);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [yangi, setYangi] = useState(() => params.get('yangi') === '1');
  const tanlangan = Number(params.get('id')) || null;
  /* Yetkazuvchi «Transport so'rash» (buyurtmadan): marshrut va yuk oldindan to'ldiriladi (/admin/yuk-birjasi?yangi=1&nom=&a=&b=&tonna=&izoh=). */
  const nomP = params.get('nom'), aP = params.get('a'), bP = params.get('b'), tonnaP = params.get('tonna'), izohP = params.get('izoh');
  const boshlang = useMemo<YukBoshlang | undefined>(() => (params.get('yangi') === '1'
    ? { nom: nomP ?? undefined, aNom: aP ?? undefined, bNom: bP ?? undefined, tonna: tonnaP ?? undefined, izoh: izohP ?? undefined } : undefined),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [nomP, aP, bP, tonnaP, izohP]);

  const yukla = useCallback(async () => {
    if (!joriy) return;
    setYuk(true);
    const r = await ybYuklarim(joriy.id, { limit: 100 });
    setYuk(false);
    if (r.ok) { setQatorlar(r.natija.yuklar); setXato(null); } else { setQatorlar([]); setXato(ybXato(r)); }
  }, [joriy]);
  useEffect(() => { void yukla(); }, [yukla]);

  const ochish = (id: number | null) => { const p = new URLSearchParams(params); if (id) p.set('id', String(id)); else p.delete('id'); setParams(p, { replace: false }); };
  const korinadi = qatorlar.filter((q) => (tab === 'yopiq') === YUK_YAKUNIY.has(q.holat)
    && (!qidiruv || `${q.nom} ${q.a_nom ?? ''} ${q.b_nom ?? ''}`.toLowerCase().includes(qidiruv.toLowerCase())));
  const faolSoni = qatorlar.filter((q) => !YUK_YAKUNIY.has(q.holat)).length;
  if (!joriy) return <Sahifa sarlavha="Yuk birjasi"><Bosh>{t('Kompaniya tanlang.')}</Bosh></Sahifa>;

  return (
    <Sahifa
      sarlavha="Yuk birjasi"
      tavsif="Materialni tez yetkazish: yuk e’lon qiling, tashuvchilar takliflarini ko‘ring, narxni kelishing, yo‘ldagi yukni kuzating."
      amallar={!tanlangan ? <>
        <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void yukla()} disabled={yuk}><RefreshCw className={yuk ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
        <button type="button" className="fz-btn fz-btn--primary" onClick={() => setYangi(true)}><Plus /> {t('Yangi yuk')}</button>
      </> : undefined}
    >
      <div className="flex flex-col gap-3 overflow-auto">
        {tanlangan ? (
          <YukTafsilot key={tanlangan} kompaniyaId={joriy.id} yukId={tanlangan} orqaga={() => { ochish(null); void yukla(); }} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <OpsTablar<Tab> tablar={[{ id: 'faol', nom: t('Faol'), soni: faolSoni }, { id: 'yopiq', nom: t('Yopilgan') }]} joriy={tab} onTanla={setTab} yorliq={t('Yuklar')} />
              <OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={t('Yuk yoki manzil bo‘yicha qidirish')} />
            </div>
            {xato ? <Bosh>{t(xato)}</Bosh> : korinadi.length === 0 ? <Bosh>{yuk ? t('Yuklanmoqda…') : t('Yuk yo‘q. «Yangi yuk» tugmasi bilan birinchi e’lonni bering.')}</Bosh> : (
              <div className="fz-table-wrap"><table className="fz-table min-w-[720px]">
                <thead><tr><th>{t('Yuk')}</th><th>{t('Marshrut')}</th><th className="fz-c-num">{t('Tonna')}</th><th>{t('Sana')}</th><th>{t('To‘lov')}</th><th>{t('Holat')}</th><th className="fz-c-num">{t('Takliflar')}</th></tr></thead>
                <tbody>{korinadi.map((q) => (
                  <tr key={q.id} className="cursor-pointer" onClick={() => ochish(q.id)}>
                    <td className="font-medium">{q.nom}</td>
                    <td>{q.a_nom ?? '—'} → {q.b_nom ?? '—'}{q.masofa_km != null && <span className="text-text-mute"> · <FmtN val={q.masofa_km} />{' km'}</span>}</td>
                    <td className="fz-c-num">{q.tonna != null ? <FmtN val={q.tonna} /> : '—'}</td>
                    <td>{sanaKun(q.sana_dan)}</td>
                    <td>{t(TOLOV_SHAKLI_NOM[q.tolov_shakli])}</td>
                    <td><YukHolatBelgi holat={q.holat} /></td>
                    <td className="fz-c-num">{q.faol_takliflar || '—'}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </>
        )}
      </div>
      <YukTahrir ochiq={yangi} kompaniyaId={joriy.id} boshlang={boshlang} onYop={() => setYangi(false)} onSaqlandi={(id) => { setYangi(false); void yukla(); ochish(id); }} />
    </Sahifa>
  );
}