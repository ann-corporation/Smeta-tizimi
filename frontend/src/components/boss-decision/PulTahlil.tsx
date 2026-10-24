import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { t } from '../../i18n/til';
import { pulTahlilOl, pulXarajatBekor, type PulDalilQator, type PulTahlilJavob, type PulXarajatQator } from '../../api/t2-pul-tahlil';
import { toast } from '../../umumiy/ui/Toast';
import XarajatKiritish from './XarajatKiritish';
import { PUL_ZANJIR, pulBannerlar, pulFarq, pulFarqFoiz, pulUmumiyKoef, pulZanjirQiymat, xarajatQamrovFoiz, type PulKesim, type PulUstamali } from '../../lib/pul-tahlil';

/**
 * Rahbarlar uchun pul tahlili (egasi 2026-10-24, P0): Nakopitelniy → Shartnoma svodi ichidagi rejim (yangi sahifa emas).
 * Hisob bazada (`t2_pul_tahlil_v1`); bu yerda faqat ko'rsatish. Xarajat (P1) kiritilmaguncha «noma'lum» — nol emas.
 */
const KAT_NOM: Record<string, string> = {
  'ЧЕЛ': 'ЧЕЛ — chel-soat (ishchi kuchi)', 'МАШ': 'МАШ — mash-soat (mashina)', 'МАТ': 'МАТ — materiallar', 'МАТ_ODDIY': 'МАТ (oddiy)',
  'М/К': 'М/К — metall konstruksiya', 'КАБ': 'КАБ — kabel', 'БЕЗСКЛАД': 'БЕЗСКЛАД — skladsiz', 'ОБ': 'ОБ — uskunalar',
  KATSIZ: 'Kategoriyasiz', SUB: 'Subpudrat', OTK: "O'tkazma (ustamasiz)",
};
const pul = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const foiz = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`);
const rang = (x: number | null) => (x == null || x === 0 ? '' : x > 0 ? 'text-danger' : 'text-success');
const nom = (k: string) => t(KAT_NOM[k] ?? k);

/** Summa katagi: ASOSIY = ustamali (QQS siz); kichik: ustamasiz va QQS bilan (egasi qoidasi 2026-10-24). Ustama bazadan keladi — bu yerda hisoblanmaydi. */
function UstamaliKatak({ ustamali, ustamasiz, bosish }: { ustamali: PulUstamali | null | undefined; ustamasiz: number | null | undefined; bosish?: () => void }) {
  const asosiy = ustamali ? pul(ustamali.itogo4) : pul(ustamasiz);
  return (
    <div>
      {bosish ? <button type="button" className="underline decoration-dotted" onClick={bosish}>{asosiy}</button> : asosiy}
      <div className="text-[10px] leading-tight text-text-mute">
        {t('ustamasiz')}: {pul(ustamasiz)}
        {ustamali && <> · {t('QQS bilan')}: {pul(ustamali.vsego)}</>}
      </div>
    </div>
  );
}

export default function PulTahlil({ companyId, shartnomaId, obyektlar }: { companyId: number; shartnomaId: number | null; obyektlar: Array<{ id: number; nom: string }> }) {
  const [qamrov, setQamrov] = useState<string>(shartnomaId ? 'sh' : 'jami'); // 'sh' | 'jami' | 'o:<id>'
  const [gacha, setGacha] = useState('');
  const [data, setData] = useState<PulTahlilJavob | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [dalil, setDalil] = useState<Array<PulDalilQator | PulXarajatQator> | null>(null);
  const [dalilTuri, setDalilTuri] = useState<'f2' | 'xarajat'>('f2');
  const [yangila, setYangila] = useState(0);
  const [ochiq, setOchiq] = useState(false); // МАТ ochiladi

  const soro = useMemo(() => ({
    kompaniyaId: companyId,
    shartnomaId: qamrov === 'sh' ? shartnomaId : null,
    obyektId: qamrov.startsWith('o:') ? Number(qamrov.slice(2)) : null,
    davrGacha: gacha || null,
  }), [companyId, shartnomaId, qamrov, gacha]);

  useEffect(() => {
    let bekor = false;
    setBand(true); setTanlangan(null); setDalil(null);
    void pulTahlilOl(soro).then((r) => {
      if (bekor) return;
      setBand(false);
      if (r.ok) { setData(r.natija); setXato(null); } else { setData(null); setXato(r.error); }
    });
    return () => { bekor = true; };
  }, [soro, yangila]);

  async function dalilOch(kat: string, turi: 'f2' | 'xarajat' = 'f2') {
    if (tanlangan === kat && dalilTuri === turi) { setTanlangan(null); setDalil(null); return; }
    setTanlangan(kat); setDalilTuri(turi); setDalil(null);
    const r = await pulTahlilOl({ ...soro, dalilKat: kat, dalilTuri: turi === 'xarajat' ? 'xarajat' : null });
    if (r.ok) setDalil(r.natija.dalil ?? []);
  }

  async function xarajatniBekor(q: PulXarajatQator) {
    if (!window.confirm(t('Xarajatni bekor qilasizmi?'))) return;
    const r = await pulXarajatBekor({ kompaniyaId: companyId, id: q.id, versiya: q.versiya });
    if (!r.ok) { toast(t(r.error || 'Bekor qilib bo‘lmadi'), 'danger'); return; }
    toast(t('Bekor qilindi'), 'ok'); setTanlangan(null); setDalil(null); setYangila((n) => n + 1);
  }

  const kesimlar = data?.kesimlar ?? [];
  const korinadi = (k: PulKesim) => k.ota == null || ochiq;
  const bannerlar = data ? pulBannerlar({ kesimlar, f2Nomalum: data.jami.f2_nomalum, smetaNomalum: data.jami.smeta_nomalum }) : [];
  const zanjir = data?.zanjir;
  const jamiZ = zanjir?.jami ?? null;

  return (
    <details className="rounded-lg border border-border p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">{t('Pul tahlili')}</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2 text-[12px]">
        <label>{t('Qamrov')}
          <select className="block rounded border border-border bg-surface px-2 py-1 text-[13px]" value={qamrov} onChange={(e) => setQamrov(e.target.value)}>
            {shartnomaId != null && <option value="sh">{t('Shartnoma')}</option>}
            <option value="jami">{t('Jami (kompaniya)')}</option>
            {obyektlar.map((o) => <option key={o.id} value={`o:${o.id}`}>{o.nom}</option>)}
          </select>
        </label>
        <label>{t('Davr (gacha)')}
          <input type="month" className="block rounded border border-border bg-surface px-2 py-1 text-[13px]" value={gacha} onChange={(e) => setGacha(e.target.value)} />
        </label>
        {band && <span className="text-text-mute">{t('Yuklanmoqda…')}</span>}
      </div>
      {xato && <p className="mt-2 text-sm text-danger">{t(xato)}</p>}
      {data && (
        <>
          {bannerlar[0] && (
            <div className="mt-2 flex items-start gap-1 text-[12px] text-warning">
              <AlertTriangle size={13} className="mt-0.5" />
              <span>{t(bannerlar[0].matn, { foiz: String(xarajatQamrovFoiz(kesimlar)), soni: String(bannerlar[0].kod === 'f2_nomalum' ? data.jami.f2_nomalum : data.jami.smeta_nomalum) })}</span>
              {bannerlar.length > 1 && (
                <details className="ml-1"><summary className="cursor-pointer">{t('yana {n} ▸', { n: String(bannerlar.length - 1) })}</summary>
                  {bannerlar.slice(1).map((b) => <div key={b.kod}>{t(b.matn, { foiz: String(xarajatQamrovFoiz(kesimlar)), soni: String(b.kod === 'f2_nomalum' ? data.jami.f2_nomalum : data.jami.smeta_nomalum) })}</div>)}
                </details>
              )}
            </div>
          )}
          <table className="mt-2 w-full text-[12px]">
            <thead><tr className="border-b text-text-mute">
              <th className="px-1 text-left">{t('Kesim')}</th><th className="px-1 text-right">{t('Smeta')}</th><th className="px-1 text-right">{t('F2 yopilgan')}</th>
              <th className="px-1 text-right">{t('Xarajat')}</th><th className="px-1 text-right" title={t('Farq = xarajat − F2 (ustamasiz)')}>{t('Farq = xarajat − F2 (ustamasiz)')}</th><th className="px-1 text-right">%</th>
            </tr></thead>
            <tbody>
              {kesimlar.filter(korinadi).map((k) => {
                const hisoblanmagan = k.xarajat_holat === 'hisoblanmagan';
                const farq = pulFarq(k.xarajat, k.f2_yopilgan);
                const bosiladi = !hisoblanmagan;
                return (
                  <tr key={k.kat} className={`border-b border-border/40 ${tanlangan === k.kat ? 'bg-accent/10' : ''} ${k.ota ? 'text-text-dim' : ''}`}>
                    <td className={`px-1 ${k.ota ? 'pl-4' : ''}`}>
                      {k.kat === 'МАТ' && <button type="button" className="mr-1 text-accent" aria-expanded={ochiq} onClick={() => setOchiq(!ochiq)}>{ochiq ? '▾' : '▸'}</button>}
                      {nom(k.kat)}{hisoblanmagan && <span className="ml-1 text-warning">· {t('hisoblanmagan')}</span>}
                    </td>
                    <td className="px-1 text-right tabular-nums">{bosiladi ? <UstamaliKatak ustamali={k.smeta_ustamali} ustamasiz={k.smeta_ustamasiz} bosish={() => void dalilOch(k.kat)} /> : '—'}</td>
                    <td className="px-1 text-right tabular-nums">{bosiladi ? <UstamaliKatak ustamali={k.f2_ustamali} ustamasiz={k.f2_yopilgan} bosish={() => void dalilOch(k.kat)} /> : '—'}</td>
                    <td className="px-1 text-right tabular-nums text-text-mute" title={t("Xarajat hali kiritilmagan — noma'lum")}>{k.xarajat == null ? '—' : <button type="button" className="underline decoration-dotted" onClick={() => void dalilOch(k.kat, 'xarajat')}>{pul(k.xarajat)}</button>}</td>
                    <td className={`px-1 text-right tabular-nums ${rang(farq)}`}>{pul(farq)}</td>
                    <td className={`px-1 text-right tabular-nums ${rang(farq)}`}>{foiz(pulFarqFoiz(k.xarajat, k.f2_yopilgan))}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="px-1">{t('JAMI (ustama bilan, QQS siz)')}</td>
                <td className="px-1 text-right tabular-nums"><UstamaliKatak ustamali={data.jami.smeta_ustamali} ustamasiz={data.jami.smeta_ustamasiz} /></td>
                <td className="px-1 text-right tabular-nums"><UstamaliKatak ustamali={data.jami.f2_ustamali} ustamasiz={data.jami.f2_yopilgan} /></td>
                <td className="px-1 text-right tabular-nums">{pul(data.jami.xarajat)}</td>
                <td className={`px-1 text-right tabular-nums ${rang(data.jami.farq)}`}>{pul(data.jami.farq)}</td><td className={`px-1 text-right tabular-nums ${rang(data.jami.farq)}`}>{foiz(data.jami.farq_foiz)}</td>
              </tr>
            </tbody>
          </table>

          {tanlangan && (
            <div className="mt-2 rounded border border-border p-2 text-[12px]">
              <div className="mb-1 font-semibold">{t('Dalil — manba qatorlar')}: {nom(tanlangan)}</div>
              {dalil == null && <span className="text-text-mute">{t('Yuklanmoqda…')}</span>}
              {dalil != null && !dalil.length && <span className="text-text-mute">{t('Qator yo‘q')}</span>}
              {dalil != null && dalil.length > 0 && dalilTuri === 'xarajat' && (
                <div className="max-h-64 overflow-auto">
                  <table className="w-full"><thead><tr className="text-text-mute"><th className="text-left">{t('Sana')}</th><th className="text-right">{t('Summa')}</th><th className="text-left pl-2">{t('Hujjat')}</th><th className="text-left pl-2">{t('Izoh')}</th><th /></tr></thead>
                    <tbody>{(dalil as PulXarajatQator[]).map((q) => (
                      <tr key={q.id} className="border-t border-border/40">
                        <td>{q.sana}</td><td className="text-right tabular-nums">{pul(q.summa)}</td><td className="pl-2">{q.hujjat_ref ?? '—'}</td><td className="pl-2">{q.izoh ?? ''}</td>
                        <td className="text-right"><button type="button" className="text-danger underline" onClick={() => void xarajatniBekor(q)}>{t('Bekor qilish')}</button></td>
                      </tr>))}</tbody></table>
                </div>
              )}
              {dalil != null && dalil.length > 0 && dalilTuri === 'f2' && (
                <div className="max-h-64 overflow-auto">
                  <table className="w-full"><thead><tr className="text-text-mute"><th className="text-left">{t('Shifr')}</th><th className="text-left">{t('Nomi')}</th><th className="text-right">{t('Smeta')}</th><th className="text-right">F2</th><th className="text-left pl-2">{t('Akt')}</th></tr></thead>
                    <tbody>{(dalil as PulDalilQator[]).map((q) => (
                      <tr key={q.qator_id} className="border-t border-border/40">
                        <td className="pr-1">{q.kod}</td><td className="pr-1">{q.nom}</td>
                        <td className="text-right tabular-nums">{pul(q.smeta_summa)}</td><td className="text-right tabular-nums">{pul(q.f2_summa)}</td>
                        <td className="pl-2">{(q.aktlar ?? []).map((a) => `№${a.raqam ?? a.akt_id} (${a.oy})`).join(', ')}</td>
                      </tr>))}</tbody></table>
                  <p className="mt-1 text-text-mute">{t('Eng katta 300 qator ko‘rsatilgan. F2 = tasdiqlangan aktlar (certified_amount, bo‘lmasa summa).')}</p>
                </div>
              )}
            </div>
          )}

          <XarajatKiritish companyId={companyId} shartnomaId={shartnomaId} obyektlar={obyektlar} boshObyektId={qamrov.startsWith('o:') ? Number(qamrov.slice(2)) : null} onSaqlandi={() => setYangila((n) => n + 1)} />

          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] font-semibold">{t('Koeffitsient zanjiri (smeta → ustama → QQS)')}</summary>
            {!jamiZ || !zanjir?.obyektlar.length ? <p className="mt-1 text-[12px] text-text-mute">{t('Zanjir yo‘q (smeta qatorlari topilmadi).')}</p> : (
              <>
                <p className="mt-1 text-[11px] text-text-mute">
                  {t('Manba: mavjud nakrutka hisobi (t2_obyekt_nakrutka_v1). Bu yerda yangi formula yo‘q; bir nechta obyektda bosqichlar qo‘shiladi.')}
                  {pulUmumiyKoef(jamiZ) != null && <> {t('Umumiy koeffitsient')}: <b>{pulUmumiyKoef(jamiZ)}</b></>}
                </p>
                <table className="mt-1 w-full text-[12px]">
                  <thead><tr className="border-b text-text-mute"><th className="px-1 text-left">{t('Bosqich')}</th><th className="px-1 text-left">{t('Formula')}</th><th className="px-1 text-right">{t('Smeta')}</th><th className="px-1 text-right">{t('F2 yopilgan')}</th></tr></thead>
                  <tbody>{PUL_ZANJIR.map((b) => (
                    <tr key={b.kalit} className={`border-b border-border/40 ${b.kalit.startsWith('itogo') || b.kalit === 'vsego' || b.kalit === 'pryamye' ? 'font-semibold' : ''}`}>
                      <td className="px-1">{t(b.nom)}</td><td className="px-1 text-text-mute">{b.formula}</td>
                      <td className="px-1 text-right tabular-nums">{pul(pulZanjirQiymat(jamiZ, b.kalit))}</td>
                      <td className="px-1 text-right tabular-nums">{pul(pulZanjirQiymat(zanjir?.f2_jami ?? null, b.kalit))}</td>
                    </tr>))}</tbody>
                </table>
              </>
            )}
          </details>
        </>
      )}
    </details>
  );
}
