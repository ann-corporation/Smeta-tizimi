/**
 * TomonlarAloqa.tsx — /admin/aloqalar. Boshqa kompaniyalar (zakazchik, pudratchi, texnadzor, laboratoriya…) bilan
 * HANDSHAKE bilan ulanish va ularga nimani ko'rsatishni (grant) boshqarish. Deny-by-default: grant bermaguningizcha
 * ikkinchi tomon hech narsa ko'rmaydi. Ruxsat serverda majburlanadi.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Search, X } from 'lucide-react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import {
  aloqaHolati, aloqaTafsilotOl, aloqalarOl, grantBekor, grantSaqla, kodBilanQabul, kompaniyaQidir, resurslarOl, taklifYubor, taklifgaJavob,
  type Aloqa, type AloqaTafsilot, type GrantKirish, type TomonResurs,
} from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { Bolim, HolatBelgi } from './tomon-ui';
import { HODISA_NOMI, ROL_TAKLIFLARI, TUR_TAKLIFLARI, inp, resursNomi, sana, tugma, tugmaAsosiy } from './tomon-yordam';

/** Zakazchikka sukut bo'yicha beriladigan kuzatuv to'plami (foydalanuvchi o'zgartira oladi). */
const KOD_NAMUNA = 'XXXX-XXXX-XXXX';
const STANDART_TOPLAM: Record<string, string[]> = { obyekt_holat: ['korish'], shartnoma_xulosa: ['korish'], f2: ['korish'] };

function YangiAloqa({ kompaniyaId, onYaratildi }: { kompaniyaId: number; onYaratildi: () => void }) {
  const [inn, setInn] = useState('');
  const [topilgan, setTopilgan] = useState<{ id: number; nom: string; inn: string } | null>(null);
  const [qidirildi, setQidirildi] = useState(false);
  const [nom, setNom] = useState('');
  const [menRol, setMenRol] = useState('pudratchi');
  const [qarshiRol, setQarshiRol] = useState('zakazchik');
  const [turi, setTuri] = useState('shartnoma');
  const [izoh, setIzoh] = useState('');
  const [kod, setKod] = useState<string | null>(null);
  const [band, setBand] = useState(false);

  const qidir = async () => {
    setBand(true); setKod(null);
    const r = await kompaniyaQidir(kompaniyaId, inn.trim());
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    setQidirildi(true); setTopilgan(r.natija.topildi && r.natija.kompaniya ? r.natija.kompaniya : null);
  };
  const yubor = async () => {
    setBand(true);
    const r = await taklifYubor(kompaniyaId, {
      qabulKompaniyaId: topilgan?.id ?? null, qabulInn: topilgan ? topilgan.inn : (inn.trim() || undefined), qabulNom: topilgan ? undefined : nom,
      taklifRol: menRol, qabulRol: qarshiRol, turi, nom: undefined, izoh,
    });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    if (r.natija.kod) setKod(r.natija.kod); else toast(t('Taklif yuborildi — javob kutilmoqda'), 'ok');
    setIzoh(''); onYaratildi();
  };
  const nusxa = async (matn: string) => { try { await navigator.clipboard.writeText(matn); toast(t('Nusxalandi'), 'ok'); } catch { toast(t('Nusxalab bo‘lmadi — kodni qo‘lda ko‘chiring'), 'danger'); } };
  const tayyor = topilgan != null || nom.trim().length >= 2;

  return (
    <Bolim sarlavha="Yangi aloqa o‘rnatish">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-dim">{t('Qarshi tomon INN')}
          <input className={`${inp} mt-1 block w-40`} inputMode="numeric" maxLength={9} value={inn} onChange={(e) => { setInn(e.target.value.replace(/\D/g, '')); setQidirildi(false); setTopilgan(null); }} placeholder="301234567" />
        </label>
        <button type="button" className={tugma} disabled={band || inn.length !== 9} onClick={() => void qidir()}><Search size={13} /> {t('Tizimdan izlash')}</button>
        {qidirildi && (topilgan
          ? <span className="text-xs text-ok">✓ {topilgan.nom} ({topilgan.inn})</span>
          : <span className="text-xs text-warn">{t('Tizimda topilmadi — taklif kodi yaratiladi, uni qarshi tomonga o‘zingiz yetkazasiz')}</span>)}
      </div>
      {qidirildi && !topilgan && (
        <label className="mt-2 block text-xs text-text-dim">{t('Qarshi tomon nomi')}
          <input className={`${inp} mt-1 block w-full max-w-md`} value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t('MCHJ / tashkilot nomi')} />
        </label>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-dim">{t('Mening rolim')}
          <input className={`${inp} mt-1 block w-36`} list="tomon-rollar" value={menRol} onChange={(e) => setMenRol(e.target.value)} /></label>
        <label className="text-xs text-text-dim">{t('Qarshi tomon roli')}
          <input className={`${inp} mt-1 block w-36`} list="tomon-rollar" value={qarshiRol} onChange={(e) => setQarshiRol(e.target.value)} /></label>
        <label className="text-xs text-text-dim">{t('Aloqa turi')}
          <input className={`${inp} mt-1 block w-32`} list="tomon-turlar" value={turi} onChange={(e) => setTuri(e.target.value)} /></label>
        <label className="min-w-[200px] flex-1 text-xs text-text-dim">{t('Izoh')}
          <input className={`${inp} mt-1 block w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder={t('masalan: Navoiy bog‘i asosiy shartnomasi')} /></label>
        <button type="button" className={tugmaAsosiy} disabled={band || !qidirildi || !tayyor} onClick={() => void yubor()}>{t('Taklif yuborish')}</button>
      </div>
      <datalist id="tomon-rollar">{ROL_TAKLIFLARI.map((r) => <option key={r} value={r} />)}</datalist>
      <datalist id="tomon-turlar">{TUR_TAKLIFLARI.map((r) => <option key={r} value={r} />)}</datalist>
      {kod && (
        <div role="alert" className="mt-3 rounded border border-accent/50 bg-accent/5 p-3 text-sm">
          <div className="text-xs text-text-dim">{t('Taklif kodi — FAQAT HOZIR ko‘rinadi. Uni qarshi tomonga xavfsiz kanal orqali yuboring (7 kun amal qiladi, bir marta ishlatiladi).')}</div>
          <div className="mt-1 flex items-center gap-2"><code className="rounded bg-surface-2 px-2 py-1 text-base tracking-widest">{kod}</code>
            <button type="button" className={tugma} onClick={() => void nusxa(kod)}><Copy size={12} /> {t('Nusxalash')}</button></div>
        </div>
      )}
    </Bolim>
  );
}

function KodQabul({ kompaniyaId, onQabul }: { kompaniyaId: number; onQabul: () => void }) {
  const [kod, setKod] = useState('');
  const [band, setBand] = useState(false);
  const yubor = async () => {
    setBand(true); const r = await kodBilanQabul(kompaniyaId, kod); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Aloqa faollashtirildi'), 'ok'); setKod(''); onQabul();
  };
  return (
    <Bolim sarlavha="Taklif kodi bilan qabul qilish">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-dim">{t('Sizga yuborilgan kod')}
          <input className={`${inp} mt-1 block w-52 tracking-widest`} value={kod} onChange={(e) => setKod(e.target.value.toUpperCase())} placeholder={KOD_NAMUNA} maxLength={14} /></label>
        <button type="button" className={tugmaAsosiy} disabled={band || kod.replace(/[^A-Z0-9]/g, '').length !== 12} onClick={() => void yubor()}><Check size={13} /> {t('Qabul qilish')}</button>
      </div>
    </Bolim>
  );
}

function GrantEditor({ kompaniyaId, aloqa, tafsilot, resurslar, yangila }: { kompaniyaId: number; aloqa: Aloqa; tafsilot: AloqaTafsilot; resurslar: TomonResurs[]; yangila: () => void }) {
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [tanlanganObyekt, setTanlanganObyekt] = useState<Set<number>>(new Set());
  const [tanlanganResurs, setTanlanganResurs] = useState<Record<string, Set<string>>>({});
  const [band, setBand] = useState(false);
  useEffect(() => { void sbT2ObyektlarOlKomp(kompaniyaId).then((r) => setObyektlar((r.ok ? r.qatorlar ?? [] : []) as T2Obyekt[])); }, [kompaniyaId]);

  const ochiq = aloqa.holat === 'faol';
  const beriladigan = useMemo(() => resurslar.filter((r) => r.amallar.length), [resurslar]);
  const belgila = (kalit: string, amal: string, on: boolean) => setTanlanganResurs((s) => {
    const n = { ...s }; const set = new Set(n[kalit] ?? []);
    if (on) set.add(amal); else set.delete(amal);
    if (set.size) n[kalit] = set; else delete n[kalit];
    return n;
  });
  const standart = () => {
    const n: Record<string, Set<string>> = {};
    for (const [k, a] of Object.entries(STANDART_TOPLAM)) if (beriladigan.some((r) => r.kalit === k)) n[k] = new Set(a);
    setTanlanganResurs(n);
  };
  const saqla = async () => {
    const grantlar: GrantKirish[] = [];
    for (const oid of tanlanganObyekt) for (const [resurs, amallar] of Object.entries(tanlanganResurs)) grantlar.push({ resurs, amallar: [...amallar], obyekt_id: oid });
    if (!grantlar.length) return;
    setBand(true); const r = await grantSaqla(kompaniyaId, aloqa.id, grantlar); setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('{n} ta ruxsat saqlandi', { n: r.natija.saqlandi ?? grantlar.length }), 'ok');
    setTanlanganObyekt(new Set()); setTanlanganResurs({}); yangila();
  };
  const bekor = async (id: number) => { const r = await grantBekor(kompaniyaId, id); if (!r.ok) toast(r.error, 'danger'); else { toast(t('Ruxsat qaytarildi'), 'ok'); yangila(); } };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold">{t('Men bergan ruxsatlar')} ({tafsilot.berilgan.length})</div>
        {tafsilot.berilgan.length === 0 && <p className="text-xs text-text-dim">{t('Hali hech narsa ochilmagan — qarshi tomon sizdan hech narsani ko‘rmaydi.')}</p>}
        <ul className="mt-1 space-y-1">
          {tafsilot.berilgan.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-xs">
              <span className="font-medium">{resursNomi(g.resurs, resurslar)}</span><span className="text-text-dim">· {g.doira_nom ?? '—'} · {g.amallar.join(', ')}</span>
              <button type="button" className="ml-auto text-text-dim hover:text-danger" title={t('Ruxsatni qaytarish')} onClick={() => void bekor(g.id)}><X size={13} /></button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-xs font-semibold">{t('Menga ochilgan ruxsatlar')} ({tafsilot.olingan.length})</div>
        <ul className="mt-1 space-y-0.5">{tafsilot.olingan.map((g) => <li key={g.id} className="text-xs text-text-dim">{resursNomi(g.resurs, resurslar)} · {g.doira_nom ?? '—'} · {g.amallar.join(', ')}</li>)}</ul>
      </div>
      {ochiq && (
        <div className="rounded border border-border p-2">
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{t('Yangi ruxsat berish')}</span>
            <button type="button" className={tugma} onClick={standart}>{t('Kuzatuv to‘plami (holat + shartnoma + F2)')}</button></div>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase text-text-dim">{t('Obyektlar')}</div>
              <div className="max-h-40 overflow-auto">{obyektlar.filter((o) => (o as T2Obyekt & { holat?: string }).holat !== 'bekor').map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={tanlanganObyekt.has(o.id)} onChange={(e) => setTanlanganObyekt((s) => { const n = new Set(s); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n; })} />{o.nom}</label>
              ))}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-text-dim">{t('Nimani ko‘rsatish')}</div>
              {beriladigan.map((r) => (
                <div key={r.kalit} className="text-xs"><span className="font-medium">{resursNomi(r.kalit, resurslar)}</span>
                  {r.amallar.map((a) => (
                    <label key={a} className="ml-3 inline-flex items-center gap-1"><input type="checkbox" checked={tanlanganResurs[r.kalit]?.has(a) ?? false} onChange={(e) => belgila(r.kalit, a, e.target.checked)} />{a}</label>
                  ))}</div>
              ))}
            </div>
          </div>
          <button type="button" className={`${tugmaAsosiy} mt-2`} disabled={band || !tanlanganObyekt.size || !Object.keys(tanlanganResurs).length} onClick={() => void saqla()}>{t('Ruxsat berish')}</button>
        </div>
      )}
    </div>
  );
}

function AloqaTafsiloti({ kompaniyaId, aloqa, resurslar, yangila }: { kompaniyaId: number; aloqa: Aloqa; resurslar: TomonResurs[]; yangila: () => void }) {
  const [tafsilot, setTafsilot] = useState<AloqaTafsilot | null>(null);
  const [sabab, setSabab] = useState('');
  const ol = useCallback(async () => { const r = await aloqaTafsilotOl(kompaniyaId, aloqa.id); if (r.ok) setTafsilot(r.natija); }, [kompaniyaId, aloqa.id]);
  useEffect(() => { void ol(); }, [ol]);
  const harakat = async (h: 'toxtatish' | 'davom' | 'yopish' | 'bekor') => {
    if (h === 'yopish' && sabab.trim().length < 3) { toast(t('Yopish sababini yozing'), 'danger'); return; }
    const r = await aloqaHolati(kompaniyaId, aloqa.id, h, sabab);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    setSabab(''); yangila(); void ol();
  };
  if (!tafsilot) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  return (
    <div className="space-y-3">
      <GrantEditor kompaniyaId={kompaniyaId} aloqa={aloqa} tafsilot={tafsilot} resurslar={resurslar} yangila={() => { yangila(); void ol(); }} />
      <div className="flex flex-wrap items-center gap-2">
        {aloqa.holat === 'faol' && <button type="button" className={tugma} onClick={() => void harakat('toxtatish')}>{t('To‘xtatish')}</button>}
        {aloqa.holat === 'toxtatilgan' && <button type="button" className={tugma} onClick={() => void harakat('davom')}>{t('Davom ettirish')}</button>}
        {aloqa.holat === 'taklif' && aloqa.men_taklif_qildim && <button type="button" className={tugma} onClick={() => void harakat('bekor')}>{t('Taklifni bekor qilish')}</button>}
        {(aloqa.holat === 'faol' || aloqa.holat === 'toxtatilgan') && <>
          <input className={`${inp} w-56`} value={sabab} onChange={(e) => setSabab(e.target.value)} placeholder={t('Yopish sababi')} />
          <button type="button" className={tugma} onClick={() => void harakat('yopish')}>{t('Aloqani yopish')}</button></>}
      </div>
      <div>
        <div className="text-xs font-semibold">{t('Tarix')}</div>
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
          {tafsilot.hodisalar.map((h) => <li key={h.id} className="text-xs text-text-dim"><span className="tabular-nums">{sana(h.vaqt)}</span> · {h.kompaniya_nom ?? '—'} · <b className="text-text">{t(HODISA_NOMI[h.tur] ?? h.tur)}</b>{h.matn ? ` — ${h.matn}` : ''}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default function TomonlarAloqa() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [aloqalar, setAloqalar] = useState<Aloqa[]>([]);
  const [resurslar, setResurslar] = useState<TomonResurs[]>([]);
  const [ochiq, setOchiq] = useState<number | null>(null);
  const [xato, setXato] = useState('');

  const yukla = useCallback(async () => {
    if (!kompaniyaId) return;
    const [a, r] = await Promise.all([aloqalarOl(kompaniyaId), resurslarOl(kompaniyaId)]);
    if (!a.ok) { setXato(a.error); return; }
    setXato(''); setAloqalar(a.natija); if (r.ok) setResurslar(r.natija);
  }, [kompaniyaId]);
  useEffect(() => { void yukla(); }, [yukla]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Tomonlar aloqasi" />;
  const kelgan = aloqalar.filter((a) => a.holat === 'taklif' && !a.men_taklif_qildim && !a.kod_kutilmoqda);
  const javob = async (a: Aloqa, qaror: 'qabul' | 'rad') => {
    const r = await taklifgaJavob(kompaniyaId, a.id, qaror);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(qaror === 'qabul' ? t('Aloqa faollashtirildi') : t('Taklif rad etildi'), 'ok'); void yukla();
  };

  return (
    <Sahifa sarlavha="Tomonlar aloqasi" tavsif="Zakazchik, pudratchi, texnadzor va boshqalar bilan ikki tomonlama tasdiq orqali ulanish; ularga nimani ko‘rsatishni siz belgilaysiz">
      <div className="space-y-4">
        {xato && <div role="alert" className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{xato}</div>}
        {kelgan.length > 0 && (
          <Bolim sarlavha="Sizga kelgan takliflar">
            <ul className="space-y-2">{kelgan.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                <b>{a.qarshi_nom}</b><span className="text-text-dim">{t('sizni “{rol}” sifatida taklif qildi, o‘zi — “{qarshi}”', { rol: a.men_rol, qarshi: a.qarshi_rol })}</span>
                <span className="ml-auto flex gap-2"><button type="button" className={tugmaAsosiy} onClick={() => void javob(a, 'qabul')}>{t('Qabul qilish')}</button>
                  <button type="button" className={tugma} onClick={() => void javob(a, 'rad')}>{t('Rad etish')}</button></span>
              </li>))}</ul>
          </Bolim>
        )}
        <div className="grid gap-4 lg:grid-cols-2"><YangiAloqa kompaniyaId={kompaniyaId} onYaratildi={() => void yukla()} /><KodQabul kompaniyaId={kompaniyaId} onQabul={() => void yukla()} /></div>
        <Bolim sarlavha="Aloqalar">
          {aloqalar.length === 0 ? <p className="text-sm text-text-dim">{t('Hali aloqa yo‘q. Yuqoridan qarshi tomon INN sini kiriting yoki sizga yuborilgan kodni qabul qiling.')}</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs">
              <thead className="text-left text-text-dim"><tr><th className="px-2 py-1.5">{t('Qarshi tomon')}</th><th className="px-2 py-1.5">{t('Rollar (men → u)')}</th><th className="px-2 py-1.5">{t('Holat')}</th>
                <th className="px-2 py-1.5 text-right">{t('Bergan / olgan ruxsat')}</th><th className="px-2 py-1.5 text-right">{t('Ochiq hujjat (kelgan / yuborilgan)')}</th></tr></thead>
              <tbody>{aloqalar.map((a) => (
                <Fragment key={a.id}>
                  <tr className="cursor-pointer border-t hover:bg-surface-2" onClick={() => setOchiq(ochiq === a.id ? null : a.id)}>
                    <td className="px-2 py-1.5"><div className="font-medium">{a.qarshi_nom}</div><div className="text-text-dim">{a.qarshi_inn ?? ''} {a.turi}</div></td>
                    <td className="px-2 py-1.5">{a.men_rol} → {a.qarshi_rol}</td>
                    <td className="px-2 py-1.5"><HolatBelgi holat={a.holat} turi="aloqa" />{a.kod_kutilmoqda && <div className="text-[10px] text-warn">{t('kod qabul qilinishi kutilmoqda')}</div>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.berilgan_grant_soni} / {a.olingan_grant_soni}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.kelgan_ochiq_taqdim} / {a.yuborilgan_ochiq_taqdim}</td>
                  </tr>
                  {ochiq === a.id && <tr className="border-t bg-surface-2/40"><td colSpan={5} className="px-3 py-3"><AloqaTafsiloti kompaniyaId={kompaniyaId} aloqa={a} resurslar={resurslar} yangila={() => void yukla()} /></td></tr>}
                </Fragment>
              ))}</tbody>
            </table></div>
          )}
        </Bolim>
      </div>
    </Sahifa>
  );
}
