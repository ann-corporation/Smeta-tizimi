/**
 * «Foyda / zarar» — loyiha plyusdami yoki minusdami (egasi 2026-11-12): BIR ekran, katta raqam, tushunarli sabab.
 * Hisob YO'Q: daromad — tasdiqlangan F2 paketi (serverdan), xarajat/to'lov — mavjud jadvallar; yig'indi lib/foyda-zarar (hisob-yadro).
 * NULL ≠ 0: xarajat kiritilmagan joyda «—» va nima yetishmasligi aytiladi; soxta plyus ko'rsatilmaydi.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { useFoydaZarar } from '../../api/t2-foyda-zarar';
import { foydaZararDaraxti, FZ_KATLAR, FZ_KAT_NOM, type FzNode, type FzObyekt } from '../../lib/foyda-zarar';
import { foiz } from '../../lib/summa-paket';
import { ayirma2 } from '../../lib/hisob-yadro/yaxlit';
import XarajatKiritish from '../boss-decision/XarajatKiritish';

const RANG = { plyus: 'var(--ok)', minus: 'var(--danger)', nomalum: 'var(--text-mute)' } as const;
const DARAJA_NOM = { kompaniya: 'Butun kompaniya', loyiha: 'Loyiha', shartnoma: 'Shartnoma', obyekt: 'Obyekt' } as const;
const katNom = (k: string) => (k.startsWith('kat:') ? t(FZ_KAT_NOM[k.slice(4) as keyof typeof FZ_KAT_NOM] ?? k) : k);

const ishora = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '');

function Belgi({ n }: { n: FzNode }) {
  if (n.foyda == null) return <span className="text-text-mute" data-testid="fz-nomalum">—</span>;
  return <span style={{ color: RANG[n.turi] }} className="font-bold" data-testid={`fz-${n.turi}`}>{n.foyda >= 0 ? '+' : '−'}<FmtN val={Math.abs(n.foyda)} /></span>;
}

function Toliqlik({ n }: { n: FzNode }) {
  if (!n.toliqlik.length) return <span className="text-[11px] text-ok" data-testid="fz-toliq">{t('Ma’lumot to‘liq')}</span>;
  const matn = n.toliqlik.map((k) => (k === 'f2' ? t('tasdiqlangan F2') : k === 'tolov' ? t('to‘lov') : k === 'xarajat' ? t('xarajat') : katNom(k))).join(', ');
  return <span className="text-[11px] text-warn" data-testid="fz-toliqemas">{t('Kiritilmagan')}: {matn}</span>;
}

export default function FoydaZarar() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const perm = (joriy as { permissions?: string[] } | null | undefined)?.permissions;
  const yozadi = perm ? perm.includes('financial.write') : true;
  const q = useFoydaZarar(kid);
  const [yol, setYol] = useState<string[]>([]);
  const [forma, setForma] = useState(false);

  const d = q.data;
  const natija = useMemo(() => {
    if (!d) return null;
    const obyektlar: FzObyekt[] = d.panel.obyektlar.map((o) => ({
      obyekt_id: o.obyekt_id, nom: o.nom, loyiha_id: o.loyiha_id, loyiha_nom: o.loyiha_nom,
      shartnoma: o.shartnoma ? { id: o.shartnoma.id, raqam: o.shartnoma.raqam } : null, f2: o.f2,
    }));
    return foydaZararDaraxti({ kompaniyaNom: joriy?.nom ?? t('Kompaniya'), obyektlar, xarajat: d.xarajat, tolov: d.tolov });
  }, [d, joriy?.nom]);

  if (q.isLoading) return <div className="p-6 text-[13px] text-text-mute" data-testid="fz-yuklanmoqda">{t('Yuklanmoqda…')}</div>;
  if (q.isError || !natija || !d) {
    return (
      <div className="p-6" data-testid="fz-xato">
        <p className="text-[13px]">{t('Foyda / zararni o‘qib bo‘lmadi. Raqam ko‘rsatilmaydi (0 emas).')}</p>
        <button type="button" className="fz-btn mt-2" onClick={() => void q.refetch()}><RefreshCw size={13} /> {t('Qayta urinish')}</button>
      </div>
    );
  }

  // Tanlangan tugun (yo'l bo'ylab)
  let tugun = natija.root; const zanjir: FzNode[] = [tugun];
  for (const id of yol) { const b = tugun.bola.find((x) => x.id === id); if (!b) break; tugun = b; zanjir.push(b); }
  const xarajatYoq = natija.root.xarajat == null;
  const jur = d.manba === 'jurnal';

  return (
    <div className="h-full overflow-auto p-4 md:p-6" data-testid="foyda-zarar">
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-[12px] text-text-dim" aria-label={t('Daraja')}>
        {zanjir.map((z, i) => (
          <span key={z.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} />}
            <button type="button" className={i === zanjir.length - 1 ? 'font-semibold text-text' : 'underline'} onClick={() => setYol(yol.slice(0, i))}>{z.nom}</button>
          </span>
        ))}
      </nav>

      <p className="mb-2 rounded-md border border-border px-2 py-1 text-[11.5px] text-text-dim" data-testid="fz-manba" role="note">{jur ? t('Manba: buxgalteriya provodkalari jurnali — yagona hisob. Daromad = Forma-3 realizatsiyasi (QQS siz); xarajat = obyekt xarajatlari (2010); tushgan = to‘lovlar.') : t('Manba: F2, xarajat va to‘lov jadvallari (jurnalda hali provodka yo‘q). Buxgalteriyada «Hujjatlardan yangilash» bosilgach jurnal manba bo‘ladi.')}</p>
      <section className="fz-panel mb-3" data-testid="fz-bosh" style={{ borderLeft: `6px solid ${RANG[tugun.turi]}` }}>
        <p className="text-[12px] text-text-mute">{t(DARAJA_NOM[tugun.daraja])}: {tugun.turi === 'plyus' ? t('PLYUSDA') : tugun.turi === 'minus' ? t('MINUSDA') : t('hisoblanmaydi')}</p>
        <p className="text-[34px] leading-tight md:text-[44px]"><Belgi n={tugun} /> <span className="text-[13px] font-normal text-text-mute">{t('so‘m')}{tugun.foydaFoiz != null ? ` · ${tugun.foydaFoiz} %` : ''}</span></p>
        <p className="text-[14px]" data-testid="fz-sabab">{tugun.sabab || '\u00A0'}</p>
        <Toliqlik n={tugun} />
        <p className="mt-1 text-[11px] text-text-mute">{jur ? t('Foyda = daromad (jurnal, QQS siz) − xarajat (jurnal, QQS siz).') : t('Foyda = bajarilgan ish (tasdiqlangan F2, ustamali, QQS siz) − xarajat (QQS siz).')}</p>
      </section>

      <div className="mb-3 grid gap-2 md:grid-cols-3" data-testid="fz-uchlik">
        <section className="fz-panel">
          <h3 className="text-[12px] text-text-mute">{jur ? t('1. Daromad (Forma-3, jurnal)') : t('1. Bajarilgan ish (tasdiqlangan F2)')}</h3>
          {tugun.bajarilgan ? (<>
            <p className="text-[20px] font-bold"><FmtN val={tugun.bajarilgan.qqsBilan} /> <span className="text-[11px] font-normal text-text-mute">{t('QQS bilan')}</span></p>
            <p className="text-[12px] text-text-dim">{t('ustamali, QQS siz')}: <FmtN val={tugun.bajarilgan.ustamali} /> · {t('ustamasiz')}: <FmtN val={tugun.bajarilgan.ustamasiz} /></p>
          </>) : <p className="text-[20px] text-text-mute">—</p>}
          <p className="text-[10.5px] text-text-mute">{jur ? t('Manba: jurnal (hisob 9010)') : t('Manba: t2_akt (tasdiqlangan) · yangilandi')} {d.yangilandi.slice(0, 10)}</p>
        </section>
        <section className="fz-panel">
          <h3 className="text-[12px] text-text-mute">{t('2. Tushgan pul va qarz')}</h3>
          {tugun.tushgan != null ? <p className="text-[20px] font-bold"><FmtN val={tugun.tushgan} /></p> : <p className="text-[20px] text-text-mute">—</p>}
          <p className="text-[12px] text-text-dim">{t('Buyurtmachi qarzi')}: {tugun.qarz != null ? <FmtN val={tugun.qarz} /> : '—'}</p>
          <p className="text-[10.5px] text-text-mute">{jur ? t('Manba: jurnal (hisob 4010, to‘lov)') : <>{t('Manba: t2_tolov · oxirgi to‘lov')}: {d.oxirgiTolovSana ?? '—'}</>}</p>
        </section>
        <section className="fz-panel">
          <h3 className="text-[12px] text-text-mute">{t('3. Xarajat va pul qoldig‘i')}</h3>
          {tugun.xarajat != null ? <p className="text-[20px] font-bold"><FmtN val={tugun.xarajat} /></p> : <p className="text-[20px] text-text-mute">—</p>}
          <p className="text-[12px] text-text-dim">{t('Pul qoldig‘i (tushgan − to‘langan xarajat)')}: {tugun.pul != null ? <FmtN val={tugun.pul} /> : '—'}</p>
          <p className="text-[10.5px] text-text-mute">{jur ? t('Manba: jurnal (hisob 2010)') : <>{t('Manba: t2_xarajat · oxirgi yozuv')}: {d.oxirgiXarajatSana ?? '—'}</>}</p>
        </section>
      </div>

      {!jur && (xarajatYoq || d.qatorToliqEmas) && (
        <section className="fz-panel mb-3" data-testid="fz-kiritilmagan" style={{ borderLeft: '4px solid var(--warn)' }}>
          <p className="text-[13px] font-semibold">{d.qatorToliqEmas ? t('Xarajat yoki to‘lov qatorlari to‘liq o‘qilmadi — foyda ko‘rsatilmaydi.') : t('Xarajatlar tizimda hali kiritilmagan. Shuning uchun foyda ko‘rsatilmaydi — soxta plyus bo‘lmasin.')}</p>
          <p className="text-[12px] text-text-dim">{t('Eng qisqa yo‘l: xarajatni shu yerning o‘zida kiriting (sana, toifa, obyekt, summa — QQS siz).')}</p>
          {yozadi
            ? <button type="button" className="fz-btn fz-btn--sm mt-2" onClick={() => setForma((v) => !v)} data-testid="fz-forma-tugma">{forma ? t('Yopish') : t('Xarajat kiritish')}</button>
            : <p className="mt-1 text-[11px] text-text-mute">{t('Kiritish uchun moliya yozish huquqi kerak.')}</p>}
          {forma && kid != null && (
            <div className="mt-2"><XarajatKiritish companyId={kid} shartnomaId={null} obyektlar={d.panel.obyektlar.map((o) => ({ id: o.obyekt_id, nom: o.nom }))} boshObyektId={null} onSaqlandi={() => void q.refetch()} /></div>
          )}
        </section>
      )}

      <section className="fz-panel mb-3" data-testid="fz-kesim">
        <h3 className="mb-1 text-[13px] font-semibold">{t('Smeta va haqiqiy xarajat — foyda qayerdan chiqadi')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left text-text-mute"><th>{t('Toifa')}</th><th className="text-right">{t('Smeta puli (bajarilgan hajm)')}</th><th className="text-right">{t('Haqiqiy xarajat')}</th><th className="text-right">{t('Farq')}</th></tr></thead>
            <tbody>
              {FZ_KATLAR.map((k) => {
                const s = tugun.smetaKesim?.[k] ?? null, h = tugun.xarajatKat[k];
                const farq = tugun.xarajat != null && s != null ? ayirma2(h, s) : null;
                const f = farq != null && s ? foiz(farq, s) : null;
                return (
                  <tr key={k} className="border-t border-border">
                    <td>{t(FZ_KAT_NOM[k])}</td>
                    <td className="text-right">{s != null ? <FmtN val={s} /> : '—'}</td>
                    <td className="text-right">{tugun.xarajat != null && h > 0 ? <FmtN val={h} /> : '—'}</td>
                    <td className="text-right" style={{ color: farq != null ? (farq > 0 ? RANG.minus : RANG.plyus) : undefined }}>{farq != null ? <>{ishora(farq)}<FmtN val={Math.abs(farq)} />{f != null ? ` (${f} %)` : ''}</> : '—'}</td>
                  </tr>
                );
              })}
              {tugun.xarajatToifasiz !== 0 && <tr className="border-t border-border"><td>{t('toifasiz xarajat')}</td><td className="text-right">—</td><td className="text-right"><FmtN val={tugun.xarajatToifasiz} /></td><td className="text-right">—</td></tr>}
            </tbody>
          </table>
        </div>
        {tugun.daraja === 'kompaniya' && (natija.taqsimlanmaganXarajat !== 0 || natija.taqsimlanmaganTolov !== 0) && (
          <p className="mt-1 text-[11px] text-text-mute" data-testid="fz-taqsimlanmagan">{t('Obyekt/shartnomaga biriktirilmagan (faqat kompaniya jamida): xarajat')} <FmtN val={natija.taqsimlanmaganXarajat} />, {t('to‘lov')} <FmtN val={natija.taqsimlanmaganTolov} /></p>
        )}
      </section>

      {tugun.bola.length > 0 && (
        <section data-testid="fz-bolalar">
          <h3 className="mb-1 text-[13px] font-semibold">{t('Ichida')}</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {tugun.bola.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => setYol([...yol, b.id])} className="fz-panel w-full text-left" style={{ borderLeft: `4px solid ${RANG[b.turi]}` }}>
                  <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[13px] font-semibold">{b.nom}</span><span className="text-[18px]"><Belgi n={b} /></span></span>
                  <span className="block text-[11.5px] text-text-dim">{b.sabab || '\u00A0'}</span>
                  <Toliqlik n={b} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
