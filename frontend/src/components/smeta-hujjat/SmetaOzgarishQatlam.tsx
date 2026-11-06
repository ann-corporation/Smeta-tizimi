import { useEffect, useMemo, useState } from 'react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { katKesimYigish } from '../../lib/ustamali-summa';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import {
  smetaOzgarishQatlamOl, type OzgarishAkt, type OzgarishAsos, type OzgarishKesimQismi, type SmetaOzgarishQatlam as Qatlam,
} from '../../api/t2-ozgarish';

/**
 * SMETA (ASL) CONST + ASOSLANGAN O'ZGARISHLAR (egasi 2026-11-06: «smeta — const; undan boshqa farqlari asoslanib ko'rsatilishi
 * kerak»). Uch alohida ko'rsatkich: «Smeta (asl)» — o'zgarmas; «O'zgarishlar» — qo'shimcha ishlar (+), zamena farqi (zamena −
 * aslning almashtirilgan qismi, ikki marta emas), narx farqi, bajarilmaydi (−), har guruh asosi bilan; «Smeta + o'zgarishlar» —
 * faqat hosila. Hisob bazada (`t2_smeta_ozgarish_qatlam_v1`), bu yerda faqat ko'rsatish; ustama — yagona `SummaJuft`.
 */
const kesim = (q: readonly OzgarishKesimQismi[] | undefined) => katKesimYigish(q ?? [], (x) => x.kat, (x) => x.summa);
const sana = (s?: string | null) => (s ? s.slice(0, 10) : '—');

function Asos({ asos, akt }: { asos?: OzgarishAsos; akt?: OzgarishAkt }) {
  if (!asos && !akt) return <span className="fz-chip fz-chip--warn">{t('asos yo‘q')}</span>;
  return <span className="text-[11.5px]">
    {asos?.sabab && <span className="block">{asos.sabab}</span>}
    {asos?.izoh && <span className="block text-text-mute">{asos.izoh}</span>}
    {asos?.hujjat_nom && <span className="block">{t('Hujjat')}: {asos.hujjat_nom}</span>}
    {akt && <span className="block text-text-mute">{t('Akt')}: {akt.raqam ?? `#${akt.akt_id}`} · {sana(akt.oy)}</span>}
    {asos?.holat && <span className="fz-chip">{asos.holat}</span>}
  </span>;
}

export function SmetaOzgarishQatlam({ obyektId }: { obyektId: number | null }) {
  const [d, setD] = useState<Qatlam | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  useEffect(() => {
    if (obyektId == null) return;
    let tirik = true;
    setD(null); setXato(null);
    Promise.resolve().then(() => smetaOzgarishQatlamOl(obyektId))
      .then((r) => { if (!tirik) return; if (r.ok) setD(r.natija); else setXato(r.error); })
      .catch((e: unknown) => { if (tirik) setXato(String((e as Error)?.message ?? e)); });
    return () => { tirik = false; };
  }, [obyektId]);
  const k = useMemo(() => d ? {
    q: kesim(d.ozgarish.kesim.qoshimcha), z: kesim(d.ozgarish.kesim.zamena), b: kesim(d.ozgarish.kesim.bajarilmadi),
    jami: kesim([...d.ozgarish.kesim.qoshimcha, ...d.ozgarish.kesim.zamena, ...d.ozgarish.kesim.bajarilmadi]),
  } : null, [d]);
  if (obyektId == null) return null;
  if (xato) return <p className="fz-note fz-note--warn" role="status" data-testid="smeta-ozgarish-xato">{t('Smeta o‘zgarishlari o‘qilmadi')}: {xato}</p>;
  if (!d || !k) return null;
  const oz = d.ozgarish;
  const bor = d.qoshimcha.soni + d.zamena.soni + d.bajarilmadi.soni > 0;

  return (
    <section className="fz-panel" aria-label={t('Smeta va o‘zgarishlar')} data-testid="smeta-ozgarish-qatlam">
      <div className="fz-panel__h"><span>{t('Smeta va o‘zgarishlar')}</span><span>{t('smeta — o‘zgarmas; farqlar asosi bilan')}</span></div>
      <div className="fz-kpis">
        <div className="fz-kpi" data-testid="smeta-asl"><span className="fz-kpi__label">{t('Smeta (asl)')}</span>
          {d.asl.paket ? <SummaJuft paket={d.asl.paket} /> : <SummaJuft obyektId={obyektId} ustamasiz={d.asl.ustamasiz} />}
          <span className="fz-kpi__sub">{t('o‘zgarmas — qo‘shimcha va zamena kirmaydi')}</span></div>
        <div className="fz-kpi" data-testid="smeta-ozgarish"><span className="fz-kpi__label">{t('O‘zgarishlar')}</span>
          <SummaJuft obyektId={obyektId} ustamasiz={oz.ustamasiz} katKesim={k.jami} />
          <span className="fz-kpi__sub">{t('{n} ta asoslangan farq', { n: String(d.qoshimcha.soni + d.zamena.soni + d.bajarilmadi.soni) })}</span></div>
        <div className="fz-kpi" data-testid="smeta-joriy"><span className="fz-kpi__label">{t('Smeta + o‘zgarishlar')}</span>
          {d.joriy.paket ? <SummaJuft paket={d.joriy.paket} /> : <SummaJuft obyektId={obyektId} ustamasiz={d.joriy.ustamasiz} />}
          <span className="fz-kpi__sub">{t('hosila ko‘rsatkich, smeta o‘rnini bosmaydi')}</span></div>
      </div>

      {bor && <div className="fz-legend" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
        <span>+</span><span>{t('Qo‘shimcha ishlar')} ({d.qoshimcha.soni})</span>
        <SummaJuft kichik obyektId={obyektId} ustamasiz={oz.qoshimcha} katKesim={k.q} className="items-end text-right" />
        <span>±</span><span>{t('Zamena farqi')} ({d.zamena.soni}): {t('zamena')} <FmtN val={oz.zamena_summa} kasr={0} /> − {t('almashtirilgan asl qism')} <FmtN val={oz.almashtirilgan_summa} kasr={0} /></span>
        <SummaJuft kichik obyektId={obyektId} ustamasiz={oz.zamena_farq} katKesim={k.z} className="items-end text-right" />
        <span>±</span><span>{t('Narx farqi')}</span><span className="text-right text-text-mute" title={oz.narx_farqi_izoh}>—</span>
        <span>−</span><span>{t('Bajarilmaydi')} ({d.bajarilmadi.soni})</span>
        <SummaJuft kichik obyektId={obyektId} ustamasiz={oz.bajarilmadi} katKesim={k.b} className="items-end text-right" />
      </div>}
      {!bor && <p className="text-[12px] text-text-mute">{t('O‘zgarish yo‘q: smeta asl holicha')}</p>}
      {oz.ikki_marta_sanalgan > 0 && <p className="fz-note text-[11.5px]" role="note" data-testid="smeta-ikki-marta">
        {t('Avval smeta jamisiga zamena bilan almashtirilgan asl qism ham qo‘shilardi (ikki marta): {s} so‘m (ustamasiz). Endi farq faqat «Zamena farqi» da.', { s: Math.round(oz.ikki_marta_sanalgan).toLocaleString('ru-RU') })}</p>}
      {(d.qoshimcha.asossiz_soni > 0 || d.zamena.asossiz_soni > 0) && <p className="fz-note fz-note--warn text-[11.5px]" role="status">
        {t('Asosi ko‘rsatilmagan: {q} ta qo‘shimcha, {z} ta zamena — sabab yoki hujjat kiriting', { q: String(d.qoshimcha.asossiz_soni), z: String(d.zamena.asossiz_soni) })}</p>}
      {(d.zamena.narxsiz_soni > 0 || d.zamena.noaniq_soni > 0) && <p className="fz-note fz-note--warn text-[11.5px]" role="status">
        {t('Zamena: {n} tasi narxsiz (farqi noma’lum, asl kamaytirilmadi), {m} tasida almashtirilgan qism aniqlanmadi', { n: String(d.zamena.narxsiz_soni), m: String(d.zamena.noaniq_soni) })}</p>}

      {bor && <details className="mt-2">
        <summary className="cursor-pointer text-[12.5px] font-semibold">{t('Har bir o‘zgarish asosi')}</summary>
        <div className="max-h-[520px] overflow-auto">
          {d.qoshimcha.qatorlar.length > 0 && <table className="w-full text-[12px]" data-testid="ozgarish-qoshimcha">
            <caption className="py-1 text-left font-semibold">{t('Qo‘shimcha ishlar')}</caption>
            <thead><tr className="text-left text-text-mute"><th>{t('Qator')}</th><th className="text-right">{t('Summa (ustamasiz)')}</th><th>{t('Asos')}</th><th>{t('Kim')}</th><th>{t('Qachon')}</th></tr></thead>
            <tbody>{d.qoshimcha.qatorlar.map((x) => <tr key={x.qator_id} className="border-t border-border align-top">
              <td>{x.kod && <span className="fz-c-shifr mr-1">{x.kod}</span>}{x.nom}{x.ota_nom && <small className="block text-text-mute">{x.ota_nom}</small>}</td>
              <td className="text-right tabular-nums"><FmtN val={x.summa ?? null} kasr={0} />{x.narxsiz_soni > 0 && <small className="block text-warn">{t('narxsiz: {n}', { n: String(x.narxsiz_soni) })}</small>}</td>
              <td><Asos asos={x.asos} akt={x.akt} /></td><td>{x.asos?.kim ?? '—'}</td><td>{sana(x.asos?.qachon)}</td>
            </tr>)}</tbody>
          </table>}
          {d.zamena.qatorlar.length > 0 && <table className="mt-3 w-full text-[12px]" data-testid="ozgarish-zamena">
            <caption className="py-1 text-left font-semibold">{t('Zamenalar')}</caption>
            <thead><tr className="text-left text-text-mute"><th>{t('Zamena')}</th><th>{t('Asl qator')}</th><th className="text-right">{t('Zamena summasi')}</th><th className="text-right">{t('Almashtirilgan')}</th><th className="text-right">{t('Farq')}</th><th>{t('Asos')}</th><th>{t('Kim')}</th><th>{t('Qachon')}</th></tr></thead>
            <tbody>{d.zamena.qatorlar.map((x) => <tr key={x.qator_id} className="border-t border-border align-top">
              <td>{x.kod && <span className="fz-c-shifr mr-1">{x.kod}</span>}{x.nom}</td>
              <td>{x.asl_kod && <span className="fz-c-shifr mr-1">{x.asl_kod}</span>}{x.asl_nom ?? '—'}</td>
              <td className="text-right tabular-nums">{x.narxsiz ? <span className="text-warn">{t('narxsiz')}</span> : <FmtN val={x.summa ?? null} kasr={0} />}</td>
              <td className="text-right tabular-nums"><FmtN val={x.almashtirilgan_summa ?? null} kasr={0} /></td>
              <td className="text-right tabular-nums"><FmtN val={x.farq ?? null} kasr={0} /></td>
              <td><Asos asos={x.asos} akt={x.akt} /></td><td>{x.asos?.kim ?? '—'}</td><td>{sana(x.asos?.qachon)}</td>
            </tr>)}</tbody>
          </table>}
          {d.bajarilmadi.qatorlar.length > 0 && <table className="mt-3 w-full text-[12px]" data-testid="ozgarish-bajarilmadi">
            <caption className="py-1 text-left font-semibold">{t('Bajarilmaydi')}</caption>
            <thead><tr className="text-left text-text-mute"><th>{t('Qator')}</th><th className="text-right">{t('Hajm')}</th><th className="text-right">{t('Summa (ustamasiz)')}</th><th>{t('Asos')}</th><th>{t('Kim')}</th><th>{t('Qachon')}</th></tr></thead>
            <tbody>{d.bajarilmadi.qatorlar.map((x) => <tr key={x.id} className="border-t border-border align-top">
              <td>{x.kod && <span className="fz-c-shifr mr-1">{x.kod}</span>}{x.nom}</td>
              <td className="text-right tabular-nums"><FmtN val={x.bajarilmagan_hajm ?? x.smeta_hajm ?? null} /> {x.birlik ?? ''}</td>
              <td className="text-right tabular-nums"><FmtN val={x.summa ?? null} kasr={0} /></td>
              <td><Asos asos={x.asos} /></td><td>{x.asos?.kim ?? '—'}</td><td>{sana(x.asos?.qachon)}</td>
            </tr>)}</tbody>
          </table>}
          {(d.qoshimcha.qisqartirildi || d.zamena.qisqartirildi) && <p className="text-[11px] text-text-mute">{t('Ro‘yxat eng katta 500 ta bilan cheklangan')}</p>}
        </div>
      </details>}
    </section>
  );
}
