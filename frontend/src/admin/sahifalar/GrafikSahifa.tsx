import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useT2ObyektlarRoyxati } from '../../api/t2-obyektlar-kesh';
import { grafikOl, grafikSozlamaSaqla } from '../../api/t2-grafik-avto';
import { cashflowHisobla, grafikHisobla, type GrafikMalumot, type GrafikQator } from '../../lib/grafik/reja';
import { GrafikGantt } from '../../components/grafik/GrafikGantt';
import { HOLAT_NOMI, foizMatni } from '../../lib/grafik/gantt';
import { GrafikPulOqimi } from '../../components/grafik/GrafikPulOqimi';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';

/**
 * Ish grafigi (P6) va oylik pul oqimi prognozi (P7) - bitta sahifa, obyekt tanlanadi.
 * Grafik smetadan avtomatik: razdel davomiyligi = mehnat (chel-soat) / (brigada x smena), tartib bo'yicha ketma-ket,
 * boshlanish - shartnoma sanasi. Faqat o'zgartirilgan qiymatlar (override) saqlanadi. `?beruvchi=ID` - buyurtmachi (faqat ko'rish).
 */
type Tab = 'grafik' | 'pul';

function SozlamaMaydon({ nom, qiymat, tur = 'number', onSaqla, disabled, w = 'w-24' }: { nom: string; qiymat: string; tur?: 'number' | 'date'; onSaqla: (v: string) => void; disabled?: boolean; w?: string }) {
  const [v, setV] = useState(qiymat);
  useEffect(() => setV(qiymat), [qiymat]);
  return (
    <label className="flex flex-col gap-0.5 text-xs text-text-mute">{nom}
      <input className={`fz-input ${w}`} type={tur} value={v} disabled={disabled} min={tur === 'number' ? 1 : undefined}
        onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== qiymat) onSaqla(v); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

export default function GrafikSahifa() {
  const { joriy } = useKompaniya();
  const [params, setParams] = useSearchParams();
  const obyektId = Number(params.get('obyekt')); const valid = Number.isSafeInteger(obyektId) && obyektId > 0;
  const beruvchi = Number(params.get('beruvchi')); const tomon = Number.isSafeInteger(beruvchi) && beruvchi > 0;
  const tab: Tab = params.get('tab') === 'pul' ? 'pul' : 'grafik';
  const { obyektlar } = useT2ObyektlarRoyxati(joriy?.id ?? null);
  const [m, setM] = useState<GrafikMalumot | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [tanlangan, setTanlangan] = useState<GrafikQator | null>(null);
  const kompaniyaId = joriy?.id ?? null;

  const yangila = useCallback(async () => {
    if (!kompaniyaId || !valid) { setM(null); return; }
    setYuk(true); setXato(null);
    const r = await grafikOl(kompaniyaId, obyektId, tomon ? beruvchi : null);
    setYuk(false);
    if (r.ok) setM(r.malumot); else { setM(null); setXato(r.error); }
  }, [kompaniyaId, obyektId, valid, tomon, beruvchi]);
  useEffect(() => { void yangila(); }, [yangila]);

  const g = useMemo(() => (m ? grafikHisobla(m) : null), [m]);
  const cf = useMemo(() => (m && g ? cashflowHisobla(m, g) : null), [m, g]);
  const sozOb = m?.sozlama.find((s) => s.razdel_id === 0);

  const saqla = async (razdelId: number, p: { brigada?: number | null; smenaSoat?: number | null; boshlanishSana?: string | null; kun?: number | null }, tozala = false) => {
    if (!kompaniyaId || !m) return;
    const joriyS = m.sozlama.find((s) => s.razdel_id === razdelId);
    const r = await grafikSozlamaSaqla({
      kompaniyaId, obyektId, razdelId, tozala,
      brigada: 'brigada' in p ? p.brigada : joriyS?.brigada ?? null, smenaSoat: 'smenaSoat' in p ? p.smenaSoat : joriyS?.smena_soat ?? null,
      boshlanishSana: 'boshlanishSana' in p ? p.boshlanishSana : joriyS?.boshlanish_sana ?? null, kun: 'kun' in p ? p.kun : joriyS?.kun ?? null,
      kutilganVersiya: joriyS?.versiya ?? null,
    });
    if (!r.ok) { toast(r.error); void yangila(); return; }
    await yangila();
  };
  const sonYoki = (s: string): number | null => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; };
  const sanaYoki = (s: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const tahrirlanadigan = !tomon && !!m;
  const ozli = g?.qatorlar.filter((q) => q.oz) ?? [];
  const setTab = (x: Tab) => { const n = new URLSearchParams(params); n.set('tab', x); setParams(n, { replace: true }); };

  return (
    <Sahifa sarlavha="Ish grafigi va pul oqimi" tavsif="Smetadan avtomatik grafik; reja va fakt solishtiriladi; oylik hisob prognozi" onYangila={() => void yangila()} yangilanmoqda={yuk}>
      <div className="flex flex-col gap-3">
        {!tomon && (
          <select aria-label={t('Obyekt')} className="fz-input max-w-md" value={valid ? obyektId : ''}
            onChange={(e) => { const n = new URLSearchParams(params); if (e.target.value) n.set('obyekt', e.target.value); else n.delete('obyekt'); setParams(n); }}>
            <option value="">{t('Obyektni tanlang')}</option>
            {valid && !obyektlar.some((o) => o.id === obyektId) && <option value={obyektId}>{t('Obyekt')} #{obyektId}</option>}
            <ObyektOptionlari obyektlar={obyektlar} />
          </select>
        )}
        {!valid && <p className="text-sm text-text-mute">{t('Grafikni ko‘rish uchun obyektni tanlang.')}</p>}
        {xato && <p role="alert" className="text-sm text-danger">{xato}</p>}
        {valid && yuk && !m && <p className="text-sm text-text-mute">{t('Grafik hisoblanmoqda…')}</p>}

        {m && g && cf && (
          <>
            <div role="tablist" className="flex gap-2">
              <button role="tab" aria-selected={tab === 'grafik'} className={`fz-btn ${tab === 'grafik' ? 'is-active' : ''}`} onClick={() => setTab('grafik')}>{t('Grafik')}</button>
              <button role="tab" aria-selected={tab === 'pul'} className={`fz-btn ${tab === 'pul' ? 'is-active' : ''}`} onClick={() => setTab('pul')}>{t('Pul oqimi')}</button>
            </div>

            {tab === 'grafik' && (
              <>
                <div className="grid gap-2 rounded-md border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="grafik-xulosa">
                  <div><div className="text-xs text-text-mute">{t('Boshlanish')}</div><b>{g.boshSana ?? '—'}</b>
                    <span className="ml-1 text-[11px] text-text-mute">{g.boshManba === 'shartnoma' ? t('(shartnoma sanasi)') : g.boshManba === 'override' ? t('(qo‘lda)') : ''}</span></div>
                  <div><div className="text-xs text-text-mute">{t('Tugash (reja)')}</div><b>{g.tugashSana ?? '—'}</b></div>
                  <div><div className="text-xs text-text-mute">{t('Mehnat jami')}</div><b>{Math.round(g.jamiChelSoat).toLocaleString('ru-RU')} {t('chel-soat')}</b></div>
                  <div><div className="text-xs text-text-mute">{t('Kechikmoqda')}</div><b className={g.kechikmoqda ? 'text-danger' : ''}>{g.kechikmoqda} {t('ta razdel')}</b></div>
                </div>

                {tahrirlanadigan && (
                  <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface p-3" data-testid="grafik-sukut">
                    <SozlamaMaydon nom={t('Brigada (kishi)')} qiymat={String(g.birlamchi.brigada)} onSaqla={(v) => void saqla(0, { brigada: sonYoki(v) })} />
                    <SozlamaMaydon nom={t('Smena (soat)')} qiymat={String(g.birlamchi.smena)} onSaqla={(v) => void saqla(0, { smenaSoat: sonYoki(v) })} />
                    <SozlamaMaydon nom={t('Boshlanish sanasi')} tur="date" w="w-40" qiymat={sozOb?.boshlanish_sana ?? g.boshSana ?? ''} onSaqla={(v) => void saqla(0, { boshlanishSana: sanaYoki(v) })} />
                    {sozOb && <button type="button" className="fz-btn" onClick={() => void saqla(0, {}, true)}>{t('Sukutga qaytarish')}</button>}
                    <p className="basis-full text-[11px] text-text-mute">{t('Taxmin: brigada va smena sukut qiymatlari — o‘zgartiring. Davomiylik = chel-soat / (brigada × smena); yakshanba dam olish kuni; razdellar tartib bo‘yicha ketma-ket.')}</p>
                  </div>
                )}

                <GrafikGantt natija={g} bugun={m.bugun} tanlangan={tanlangan?.id ?? null} onTanla={setTanlangan} />

                {g.grafiksizSoni > 0 && <p className="text-xs text-warn" data-testid="grafiksiz-soni">{g.grafiksizSoni} {t('ta razdelda mehnat (chel-soat) yo‘q — grafikka qo‘yilmadi, muddati o‘ylab topilmaydi.')}</p>}

                {tanlangan && (
                  <div className="rounded-md border border-border bg-surface p-3 text-sm" data-testid="grafik-tafsilot">
                    <b>{tanlangan.nom}</b> — {t(HOLAT_NOMI[tanlangan.holat])}
                    <div className="text-xs text-text-mute">{t('Reja')}: {tanlangan.bosh ?? '—'} → {tanlangan.tugash ?? '—'} · {t('reja bajarilishi')} {foizMatni(tanlangan.rejaFoiz)} · {t('fakt')} {foizMatni(tanlangan.faktFoiz)}
                      {tanlangan.kechikishKun > 0 && <> · <b className="text-danger">{tanlangan.kechikishKun} {t('ish kuni kechikish')}</b></>}</div>
                  </div>
                )}

                {tahrirlanadigan && ozli.length > 0 && (
                  <details className="rounded-md border border-border bg-surface p-3" data-testid="grafik-override">
                    <summary className="cursor-pointer text-sm">{t('Razdel bo‘yicha brigada va sanalar (faqat o‘zgartirish uchun)')}</summary>
                    <div className="mt-2 max-h-80 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-surface-2 text-text-dim"><tr><th className="px-1 text-left">{t('Razdel')}</th><th>{t('chel-soat')}</th><th>{t('Brigada')}</th><th>{t('Kun')}</th><th>{t('Boshlanish')}</th><th /></tr></thead>
                        <tbody>
                          {ozli.slice(0, 300).map((q) => {
                            const s = m.sozlama.find((x) => x.razdel_id === q.id);
                            return (
                              <tr key={q.id} className="border-t border-border">
                                <td className="max-w-[260px] truncate px-1" title={q.nom}>{q.nom}</td>
                                <td className="text-right tabular-nums">{Math.round(q.oz!.chelSoat).toLocaleString('ru-RU')}</td>
                                <td><SozlamaMaydon nom="" w="w-16" qiymat={s?.brigada != null ? String(s.brigada) : ''} onSaqla={(v) => void saqla(q.id, { brigada: sonYoki(v) })} /></td>
                                <td><SozlamaMaydon nom="" w="w-16" qiymat={s?.kun != null ? String(s.kun) : ''} onSaqla={(v) => void saqla(q.id, { kun: sonYoki(v) })} /></td>
                                <td><SozlamaMaydon nom="" tur="date" w="w-36" qiymat={s?.boshlanish_sana ?? ''} onSaqla={(v) => void saqla(q.id, { boshlanishSana: sanaYoki(v) })} /></td>
                                <td>{s && <button type="button" className="fz-btn" onClick={() => void saqla(q.id, {}, true)}>{t('Tozalash')}</button>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {ozli.length > 300 && <p className="mt-1 text-[11px] text-text-mute">{t('Dastlabki 300 ta razdel ko‘rsatildi; boshqalarini grafikdagi nomini bosib tanlang.')}</p>}
                    </div>
                  </details>
                )}
              </>
            )}

            {tab === 'pul' && <GrafikPulOqimi malumot={m} cf={cf} />}
          </>
        )}
      </div>
    </Sahifa>
  );
}
