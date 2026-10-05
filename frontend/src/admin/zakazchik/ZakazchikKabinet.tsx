/**
 * ZakazchikKabinet.tsx — /admin/zakazchik. Buyurtmachi (zakazchik) ko'zi bilan: ulangan pudratchilar, ularning
 * FAQAT SIZGA OCHILGAN obyektlari (grant), tasdiqlangan F2 jami, shartnoma va kutayotgan hujjatlar.
 * Raqamlar server tomonda grant bo'yicha qirqiladi — ruxsat berilmagan ko'rsatkich bu yerga kelmaydi.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { aloqalarOl, taqdimlarOl, zakazchikObyektlarOl, type Aloqa, type TaqdimQisqa, type ZakazchikObyekt } from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { Bolim, HolatBelgi } from './tomon-ui';
import { oyMatn, pul, sana } from './tomon-yordam';

function Kartochka({ nom, qiymat, izoh }: { nom: string; qiymat: string; izoh?: string }) {
  return <div className="rounded-lg border border-border px-3 py-2"><div className="text-[11px] uppercase text-text-dim">{t(nom)}</div><div className="text-xl font-semibold tabular-nums">{qiymat}</div>{izoh && <div className="text-[11px] text-text-dim">{t(izoh)}</div>}</div>;
}

export default function ZakazchikKabinet() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [aloqalar, setAloqalar] = useState<Aloqa[]>([]);
  const [obyektlar, setObyektlar] = useState<ZakazchikObyekt[]>([]);
  const [kelgan, setKelgan] = useState<TaqdimQisqa[]>([]);
  const [xato, setXato] = useState('');
  const [yuklandi, setYuklandi] = useState(false);

  useEffect(() => {
    if (!kompaniyaId) return;
    let bekor = false;
    void Promise.all([aloqalarOl(kompaniyaId), zakazchikObyektlarOl(kompaniyaId), taqdimlarOl(kompaniyaId, { yonalish: 'kelgan' })]).then(([a, o, q]) => {
      if (bekor) return;
      const e = [a, o, q].find((x) => !x.ok);
      setXato(e && !e.ok ? e.error : '');
      if (a.ok) setAloqalar(a.natija); if (o.ok) setObyektlar(o.natija); if (q.ok) setKelgan(q.natija);
      setYuklandi(true);
    });
    return () => { bekor = true; };
  }, [kompaniyaId]);

  const faol = useMemo(() => aloqalar.filter((a) => a.holat === 'faol'), [aloqalar]);
  const kutayotgan = useMemo(() => kelgan.filter((x) => x.holat === 'yuborilgan' || x.holat === 'ko_rilmoqda'), [kelgan]);
  const f2Jami = useMemo(() => obyektlar.reduce((s, o) => s + (o.f2?.jami ?? 0), 0), [obyektlar]);
  const guruhlar = useMemo(() => {
    const m = new Map<number, { nom: string; rol: string; obyektlar: ZakazchikObyekt[] }>();
    for (const o of obyektlar) { const g = m.get(o.qarshi_kompaniya_id) ?? { nom: o.qarshi_nom, rol: o.qarshi_rol, obyektlar: [] }; g.obyektlar.push(o); m.set(o.qarshi_kompaniya_id, g); }
    return [...m.entries()];
  }, [obyektlar]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Buyurtmachi kabineti" />;
  return (
    <Sahifa sarlavha="Buyurtmachi kabineti" tavsif="Ulangan pudratchilar, ularning sizga ochilgan obyektlari, sertifikatlangan ishlar va qaror kutayotgan hujjatlar">
      <div className="space-y-4">
        {xato && <div role="alert" className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{xato}</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kartochka nom="Faol aloqalar" qiymat={String(faol.length)} />
          <Kartochka nom="Ko‘rinadigan obyektlar" qiymat={String(obyektlar.length)} />
          <Kartochka nom="Tasdiqlangan F2 jami" qiymat={pul(f2Jami)} izoh="faqat sizga ochilgan obyektlar bo‘yicha" />
          <Kartochka nom="Qaror kutayotgan hujjat" qiymat={String(kutayotgan.length)} />
        </div>

        {kutayotgan.length > 0 && (
          <Bolim sarlavha="Qaror kutayotgan hujjatlar" amal={<Link to="/admin/taqdimlar" className="text-xs text-accent underline">{t('Hammasi')}</Link>}>
            <ul className="space-y-1">{kutayotgan.slice(0, 6).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm"><b>{x.nom}</b><span className="text-text-dim">{x.qarshi_nom} · {x.obyekt_nom ?? '—'} · {oyMatn(x.oy)}</span><HolatBelgi holat={x.holat} turi="taqdim" />
                <span className="ml-auto text-xs text-text-dim">{sana(x.taqdim_vaqti)}</span></li>))}</ul>
          </Bolim>
        )}

        {yuklandi && faol.length === 0 && (
          <Bolim sarlavha="Boshlash">
            <p className="text-sm text-text-dim">{t('Hali pudratchi ulanmagan. Pudratchingizning INN sini kiriting yoki u yuborgan taklif kodini qabul qiling.')}</p>
            <Link to="/admin/aloqalar" className="mt-2 inline-block text-sm text-accent underline">{t('Aloqalarga o‘tish')}</Link>
          </Bolim>
        )}
        {yuklandi && faol.length > 0 && obyektlar.length === 0 && (
          <Bolim sarlavha="Obyektlar"><p className="text-sm text-text-dim">{t('Pudratchilaringiz hali sizga obyekt ochmagan. Ular “Tomonlar aloqasi” sahifasidan ruxsat berishlari kerak.')}</p></Bolim>
        )}

        {guruhlar.map(([id, g]) => (
          <Bolim key={id} sarlavha={`${g.nom} — ${g.rol}`}>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-text-dim"><tr><th className="px-2 py-1.5">{t('Obyekt')}</th><th className="px-2 py-1.5">{t('Shartnoma')}</th><th className="px-2 py-1.5 text-right">{t('Shartnoma summasi (QQS bilan)')}</th>
                <th className="px-2 py-1.5 text-right">{t('Tasdiqlangan F2 (soni / jami)')}</th><th className="px-2 py-1.5">{t('Oxirgi F2 oyi')}</th><th className="px-2 py-1.5 text-right">{t('Kutayotgan')}</th></tr></thead>
              <tbody>{g.obyektlar.map((o) => (
                <tr key={o.obyekt_id} className="border-t">
                  <td className="px-2 py-1.5 font-medium">{o.obyekt_nom}</td>
                  <td className="px-2 py-1.5">{o.shartnoma ? `№ ${o.shartnoma.raqam}` : <span className="text-text-dim">{t('ochilmagan')}</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{o.shartnoma ? pul(o.shartnoma.jami_nds_bilan) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{o.f2 ? `${o.f2.soni} / ${pul(o.f2.jami)}` : <span className="text-text-dim">{t('ochilmagan')}</span>}</td>
                  <td className="px-2 py-1.5">{o.f2 ? oyMatn(o.f2.oxirgi_oy) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{o.kutayotgan_taqdim || ''}</td>
                </tr>))}</tbody>
            </table></div>
          </Bolim>
        ))}
      </div>
    </Sahifa>
  );
}
