import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { buxKontragentOl, type BuxKontragent } from '../../api/t2-bux-hisob';
import { kontragentGuruhla, sverkaQatorlari, MANBA_NOM, type KontragentGuruh } from '../../lib/buxgalteriya/hisob';
import { aktSverkaHujjat } from '../../lib/buxgalteriya/eksport';
import { yigindi2 } from '../../lib/hisob-yadro';
import { Izoh, Son, SonBosh, XatoQator } from './umumiy';
import { DT_IZOH, KT_IZOH, ddmmyyyy, kirit, td, th, type Davr } from './yordamchi';

/** «Kontragent bilan hisob-kitob»: kim bizga qarz, biz kimga qarz — hujjatlargacha (akt-sverka uslubi). */
export function HisobKitob({ kid, davr, versiya }: { kid: number; davr: Davr; versiya: number }) {
  const [d, setD] = useState<BuxKontragent | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [qidir, setQidir] = useState('');
  const [ochiq, setOchiq] = useState<string | null>(null);
  const [sverka, setSverka] = useState<{ g: KontragentGuruh; d: BuxKontragent } | null>(null);

  const yukla = useCallback(async () => {
    setYuk(true);
    const r = await buxKontragentOl(kid, { dan: davr.dan, gacha: davr.gacha });
    setYuk(false);
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid, davr.dan, davr.gacha]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const guruhlar = useMemo(() => kontragentGuruhla(d?.qatorlar ?? [], qidir), [d, qidir]);
  const jami = useMemo(() => ({
    debitor: yigindi2(guruhlar.map((g) => g.debitor)), kreditor: yigindi2(guruhlar.map((g) => g.kreditor)),
  }), [guruhlar]);

  const hujjatlarOch = async (g: KontragentGuruh) => {
    if (g.kontragent_id == null) return;
    if (sverka?.g.kalit === g.kalit) { setSverka(null); return; }
    const r = await buxKontragentOl(kid, { dan: davr.dan, gacha: davr.gacha, kontragent_id: g.kontragent_id });
    if (r.ok) setSverka({ g, d: r.natija }); else toast(r.error, 'danger');
  };

  const eksport = async (g: KontragentGuruh, x: BuxKontragent) => {
    const ochilish = yigindi2(g.qatorlar.map((q) => q.ochilish));
    const { bytes, faylNomi } = aktSverkaHujjat({
      kompaniya: x.kompaniya?.nom ?? null, kontragent: g.nom, kontragentInn: g.inn, dan: davr.dan, gacha: davr.gacha, ochilish, hujjatlar: x.hujjatlar ?? [],
    });
    const r = await hujjatTokenBilan({ kompaniyaId: kid, bytes, hujjat: 'AKT_SVERKI', sabab: `Акт сверки · ${g.nom}`.slice(0, 120) }, () => downloadBlob(bytes, faylNomi));
    toast(r.ok ? (r.xabar || t('Akt-sverka yuklandi')) : r.xabar, r.ok ? 'ok' : 'danger');
  };

  const ru = tilLocale().startsWith('ru');
  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label={t('Qidiruv')} className={`${kirit} w-64`} placeholder={t('Kontragent yoki STIR…')} value={qidir} onChange={(e) => setQidir(e.target.value)} />
        <span className="text-[11.5px] text-text-mute">{t('Saldo = Debet − Kredit. Plyus — ular bizga qarz (debitor); minus — biz qarzmiz (kreditor). Summalar QQS bilan.')}</span>
      </div>
      <div className="fz-panel grid grid-cols-2 gap-2 text-[12.5px]" aria-label={t('Jami')}>
        <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Bizga qarz (debitor)')}<Izoh matn={t('Xaridor va buyurtmachilarning bizdan qarzi (4010 hisob saldosi, Debet tomonda).')} /></span><Son v={jami.debitor} qalin /></div>
        <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Biz qarzmiz (kreditor)')}<Izoh matn={t('Yetkazuvchi va pudratchilar oldidagi qarzimiz (6010 hisob saldosi, Kredit tomonda).')} /></span><Son v={jami.kreditor} qalin /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[12.5px]" aria-label={t('Kontragent bilan hisob-kitob')}>
          <thead>
            <tr className="text-left text-[11px] uppercase text-text-mute">
              <th className="w-6" /><th className={th}>{t('Kontragent')}</th><th className={th}>{t('STIR')}</th>
              <th className={`${th} text-right`}>{t('Bizga qarz')}</th><th className={`${th} text-right`}>{t('Biz qarzmiz')}</th><th className={th} />
            </tr>
          </thead>
          <tbody>
            {!yuk && guruhlar.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-text-mute">{d ? t('Hisob-kitob yo‘q. Avval «Hujjatlardan yangilash» ni bosing.') : t('Yuklanmoqda…')}</td></tr>}
            {guruhlar.map((g) => {
              const och = ochiq === g.kalit;
              return (
                <Fragment key={g.kalit}>
                  <tr className={`cursor-pointer border-t border-border/60 hover:bg-surface-2 ${och ? 'bg-surface-2' : ''}`} onClick={() => setOchiq(och ? null : g.kalit)}>
                    <td className="px-1"><button type="button" aria-label={och ? t('Yig‘ish') : t('Ochish')} aria-expanded={och} className="text-text-mute">{och ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                    <td className={`${td} font-medium`}>{g.kontragent_id == null ? t('Kontragent ko‘rsatilmagan') : g.nom}</td>
                    <td className={td}>{g.inn ?? '—'}</td>
                    <td className={`${td} text-right`}><SonBosh v={g.debitor} /></td>
                    <td className={`${td} text-right`}><SonBosh v={g.kreditor} /></td>
                    <td className={`${td} text-right`}>
                      {g.kontragent_id != null && <button type="button" className="fz-btn" onClick={(e) => { e.stopPropagation(); void hujjatlarOch(g); }}><FileText size={13} /> {t('Hujjatlar')}</button>}
                    </td>
                  </tr>
                  {och && (
                    <tr className="border-t border-border/40 bg-surface-2/40"><td colSpan={6} className="px-4 py-2">
                      <table className="w-full text-[12px]" aria-label={t('Hisoblar bo‘yicha')}>
                        <thead><tr className="text-left text-[10.5px] uppercase text-text-mute">
                          <th className={th}>{t('Hisob')}</th><th className={`${th} text-right`}>{t('Davr boshida')}</th>
                          <th className={`${th} text-right`}>{t('Debet')}<Izoh matn={DT_IZOH()} /></th><th className={`${th} text-right`}>{t('Kredit')}<Izoh matn={KT_IZOH()} /></th>
                          <th className={`${th} text-right`}>{t('Davr oxirida')}</th>
                        </tr></thead>
                        <tbody>{g.qatorlar.map((q) => (
                          <tr key={q.kod} className="border-t border-border/30">
                            <td className={td}><b>{q.kod}</b> <span className="text-text-mute">{ru ? q.nom_ru : q.nom_uz}</span></td>
                            <td className={`${td} text-right`}><Son v={q.ochilish} /></td><td className={`${td} text-right`}><Son v={q.dt} /></td>
                            <td className={`${td} text-right`}><Son v={q.kt} /></td><td className={`${td} text-right`}><Son v={q.yopilish} qalin /></td>
                          </tr>
                        ))}</tbody>
                      </table>
                      {sverka?.g.kalit === g.kalit && <Hujjatlar g={g} x={sverka.d} onEksport={() => void eksport(g, sverka.d)} />}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Hujjatlar({ g, x, onEksport }: { g: KontragentGuruh; x: BuxKontragent; onEksport: () => void }) {
  const ochilish = yigindi2(g.qatorlar.map((q) => q.ochilish));
  const s = sverkaQatorlari(ochilish, x.hujjatlar ?? []);
  return (
    <div className="mt-3 rounded-md border border-border/60 p-2">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-[12.5px]">{t('Hujjatlar (akt-sverka)')}</b>
        <button type="button" className="fz-btn" onClick={onEksport}><Download size={13} /> {t('Akt-sverka (Excel)')}</button>
      </div>
      <table className="w-full text-[12px]" aria-label={t('Akt-sverka qatorlari')}>
        <thead><tr className="text-left text-[10.5px] uppercase text-text-mute">
          <th className={th}>{t('Sana')}</th><th className={th}>{t('Hujjat')}</th><th className={th}>{t('Shartnoma')}</th><th className={th}>{t('Hisob')}</th>
          <th className={`${th} text-right`}>{t('Debet')}</th><th className={`${th} text-right`}>{t('Kredit')}</th><th className={`${th} text-right`}>{t('Saldo')}</th>
        </tr></thead>
        <tbody>
          <tr className="border-t border-border/30 text-text-mute"><td className={td} colSpan={6}>{t('Davr boshiga saldo')}</td><td className={`${td} text-right`}><Son v={ochilish} /></td></tr>
          {s.qatorlar.map((h, i) => (
            <tr key={i} className="border-t border-border/30">
              <td className={td}>{ddmmyyyy(h.sana)}</td>
              <td className={td}>{h.hujjat ?? '—'} <span className="text-[10.5px] text-text-mute">{MANBA_NOM[h.manba_tur] ? t(MANBA_NOM[h.manba_tur]) : h.manba_tur}</span></td>
              <td className={td}>{h.shartnoma_raqam ?? '—'}</td><td className={td}>{h.hisob}</td>
              <td className={`${td} text-right`}><SonBosh v={h.dt} /></td><td className={`${td} text-right`}><SonBosh v={h.kt} /></td><td className={`${td} text-right`}><Son v={h.saldo} /></td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold"><td className={td} colSpan={4}>{t('Jami')}</td>
            <td className={`${td} text-right`}><Son v={s.dt} /></td><td className={`${td} text-right`}><Son v={s.kt} /></td><td className={`${td} text-right`}><Son v={s.yopilish} qalin /></td></tr>
        </tbody>
      </table>
    </div>
  );
}
