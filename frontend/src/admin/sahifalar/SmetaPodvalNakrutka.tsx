import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, RefreshCw, Undo2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { t2ObyektNakrutka, NAKRUTKA_KOEF_IZOH, type NakrutkaKoeffitsientlar, type NakrutkaManba } from '../../api/t2-nakrutka';
import { sbPodvallarOl, sbPodvalOchir, sbPodvalSaqla, type PodvalYozuv } from '../../api/t2-nakrutka-podval';
import { hujjatOl, hujjatRoyxatOl } from '../../api/t2-hujjat-canonical';
import { yangiOperationId } from '../../api/supabase';
import type { NakrutkaPodvalOqish } from '../../lib/smeta-anatomiya/nakrutka';
import { kaskadCats, type SvodYaxlit } from '../../lib/svod-yaxlit';
import { catsKat, fayldanNakrutkaOqi, koefFarqi, smetadanPodval, SMETA_PODVAL_NOMI, ustamaTasiri } from '../../lib/nakrutka-smetadan';

/** Koeffitsient manbai yorlig'i (UI): smeta podvalidan / shartnoma / kompaniya / sukut. */
export function NakrutkaManbaChip({ manba }: { manba: NakrutkaManba | null | undefined }) {
  if (!manba) return null;
  const nom = manba === 'smeta_podvali' ? t('smeta podvalidan') : manba === 'shartnoma' ? t('shartnoma') : manba === 'kompaniya' ? t('kompaniya standarti') : t('sukut');
  return <span className={`fz-chip ${manba === 'smeta_podvali' ? 'fz-chip--accent' : ''}`} data-testid="nakrutka-manba">{t('Nakrutka manbai')}: {nom}</span>;
}

type Holat = {
  koef: NakrutkaKoeffitsientlar;
  cats: { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number };
  manba: NakrutkaManba | null;
  podval: PodvalYozuv | null;
  /** Svod yaxlit (belgi bo'lsa): cats shunda kaskad kategoriyalari (cats_kaskad). */
  svodYaxlit: SvodYaxlit | null;
};

/**
 * Smeta podvalidan nakrutka: o'qilgan qatorlar (dalil va katak bilan), arifmetik isbot, eski/yangi
 * koeffitsientlar va obyekt jami summasiga ta'siri (ustamasiz + ustamali) → operator tasdig'i bilan
 * obyekt podvaliga yozish. `oqish` berilmasa — R2 dagi asl smeta faylidan qayta o'qish tugmasi.
 */
export function SmetaPodvalNakrutka({ kompaniyaId, obyektId, oqish: tashqi, fayl, avtoSaqla = false }: {
  kompaniyaId: number; obyektId: number; oqish: NakrutkaPodvalOqish | null; fayl?: string;
  /**
   * Egasi 2026-10-27: YANGI smeta importi tugagach podvaldan o'qilgan foizlar (manba='smeta') obyektga
   * avtomatik yoziladi — natija, ogohlantirishlar va «bekor qilish» ko'rinib turadi. Mavjud obyektda — preview + tasdiq.
   */
  avtoSaqla?: boolean;
}) {
  const [holat, setHolat] = useState<Holat | null>(null);
  const [r2Oqish, setR2Oqish] = useState<{ o: NakrutkaPodvalOqish; fayl: string } | null>(null);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [saqlandi, setSaqlandi] = useState(false);
  /** Avtomatik yozuvdan oldingi holat («bekor qilish» uchun): avvalgi podval yoki null (podval yo'q edi). */
  const [avto, setAvto] = useState<{ oldingi: PodvalYozuv | null; id: number; eskiKoef: NakrutkaKoeffitsientlar; bekorQilindi: boolean } | null>(null);
  const avtoUrinildi = useRef(false);
  const oqish = tashqi ?? r2Oqish?.o ?? null;
  const faylNomi = fayl ?? r2Oqish?.fayl ?? oqish?.fayl ?? '';

  const yukla = async (): Promise<Holat | null> => {
    const [n, p] = await Promise.all([t2ObyektNakrutka(obyektId), sbPodvallarOl(kompaniyaId)]);
    if (!n.ok || !n.koeffitsientlar || !n.cats) { setXato(n.error || t('Joriy nakrutka o‘qilmadi')); return null; }
    const h: Holat = { koef: n.koeffitsientlar, cats: kaskadCats(n) ?? n.cats, svodYaxlit: n.svod_yaxlit ?? null, manba: n.nk_manba ?? null, podval: (p.ok ? p.qatorlar ?? [] : []).find((x) => x.obyekt_id === obyektId) ?? null };
    setHolat(h);
    return h;
  };
  useEffect(() => { setSaqlandi(false); setAvto(null); avtoUrinildi.current = false; void yukla(); }, [kompaniyaId, obyektId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Avtomatik yozuvdan keyin ham «avval → smeta podvali bilan» ko'rinsin: taqqoslash asosi — yozuvdan oldingi foizlar.
  const avtoFaol = !!avto && !avto.bekorQilindi;
  const joriy = (avtoFaol ? avto!.eskiKoef : holat?.koef) ?? null;
  const farq = useMemo(() => (oqish && joriy ? koefFarqi(oqish, joriy) : []), [oqish, joriy]);
  const tasir = useMemo(() => {
    if (!oqish || !holat || !joriy) return null;
    const yangi = { ...joriy, ...oqish.koeffitsientlar };
    return ustamaTasiri(catsKat(holat.cats), joriy, yangi, holat.svodYaxlit);
  }, [oqish, holat, joriy]);

  const r2danOqi = async () => {
    setBand(true); setXato('');
    try {
      const reg = await hujjatRoyxatOl({ kompaniyaId, obyektId, limit: 200 });
      const doc = reg.documents
        .filter((d) => /smeta/i.test(d.type) && /\.(xlsx|xlsm|xls)$/i.test(d.filename))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
      if (!doc) { setXato(t('R2 da bu obyektning asl smeta fayli topilmadi — faylni qayta tanlang.')); return; }
      const blob = await hujjatOl(Number(doc.id));
      if (!(blob instanceof Blob)) { setXato(t('Asl fayl o‘qilmadi ({kod}).', { kod: blob.code })); return; }
      setR2Oqish({ o: await fayldanNakrutkaOqi(doc.filename, await blob.arrayBuffer()), fayl: doc.filename });
    } catch (e) {
      setXato(t('Asl fayl o‘qilmadi ({kod}).', { kod: e instanceof Error ? e.message : String(e) }));
    } finally { setBand(false); }
  };

  const saqla = async (avtomatik = false) => {
    if (!oqish || !holat) return;
    setBand(true); setXato('');
    try {
      // Meros qatorlar (smetada topilmagan kodlar) — amaldagi qiymat; server ularni hisobga olmaydi (manba='meros').
      const p = smetadanPodval(oqish, holat.koef, faylNomi);
      const oldingi = holat.podval;
      const r = await sbPodvalSaqla({
        kompaniyaId, doira: { obyektId }, nom: p.nom ?? SMETA_PODVAL_NOMI, qatorlar: p.qatorlar,
        ...(oldingi ? { id: oldingi.id, kutilganVersiya: oldingi.versiya } : { operationId: yangiOperationId() }),
      });
      if (!r.ok) { setXato(r.error || (r.sabab === 'versiya' ? t('Podval boshqa joyda o‘zgargan — sahifani yangilang.') : t('Saqlanmadi'))); return; }
      setSaqlandi(true);
      if (avtomatik && r.id != null) setAvto({ oldingi, id: r.id, eskiKoef: holat.koef, bekorQilindi: false });
      await yukla();
    } finally { setBand(false); }
  };

  // Yangi smeta importi: podvaldan o'qilgan foizlar bir marta avtomatik yoziladi (tasdiq so'ralmaydi).
  useEffect(() => {
    if (!avtoSaqla || avtoUrinildi.current || !oqish || !holat || band) return;
    if (oqish.holat === 'topilmadi' || !Object.keys(oqish.koeffitsientlar).length) return;
    // Bloklovchi review (masalan БЕЗ СКЛАД bloki) — avtomatik yozilmaydi, operator ko'rib tasdiqlaydi.
    if (oqish.review.some((r) => r.bloklovchi)) return;
    avtoUrinildi.current = true;
    void saqla(true);
  }, [avtoSaqla, oqish, holat, band]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Avtomatik yozuvni bekor qilish: avvalgi podval qaytariladi, avval podval bo'lmagan bo'lsa — faolsizlantiriladi. */
  const bekorQil = async () => {
    if (!avto || avto.bekorQilindi) return;
    setBand(true); setXato('');
    try {
      const h = await yukla();
      const joriyPodval = h?.podval;
      if (!joriyPodval || joriyPodval.id !== avto.id) { setXato(t('Podval boshqa joyda o‘zgargan — sahifani yangilang.')); return; }
      const r = avto.oldingi
        ? await sbPodvalSaqla({ kompaniyaId, doira: { obyektId }, nom: avto.oldingi.nom, qatorlar: avto.oldingi.qatorlar, id: joriyPodval.id, kutilganVersiya: joriyPodval.versiya })
        : await sbPodvalOchir(kompaniyaId, joriyPodval.id, joriyPodval.versiya);
      if (!r.ok) { setXato(r.error || (r.sabab === 'versiya' ? t('Podval boshqa joyda o‘zgargan — sahifani yangilang.') : t('Bekor qilinmadi'))); return; }
      setAvto({ ...avto, bekorQilindi: true });
      setSaqlandi(false);
      await yukla();
    } finally { setBand(false); }
  };

  const isbotMos = oqish?.isbot.filter((b) => b.mos).length ?? 0;
  const isbotNomos = oqish?.isbot.filter((b) => !b.mos) ?? [];
  const bloklovchiSoni = oqish?.review.filter((r) => r.bloklovchi).length ?? 0;
  const masshtabNom = oqish?.masshtab === 1000 ? t('ming so‘m') : t('so‘m');

  return (
    <section className="fz-card" aria-label={t('Smeta podvalidan nakrutka')} data-testid="smeta-podval-nakrutka">
      <div className="fz-card__head">
        <div>
          <h3 className="fz-card__title">{t('Smeta podvalidan nakrutka')}</h3>
          <p className="fz-card__sub">{avtoSaqla
            ? t('Har smetaning o‘z foizlari: yangi smetada podvaldan o‘qilgan foizlar obyektga avtomatik yoziladi (bekor qilish mumkin).')
            : t('Har smetaning o‘z foizlari: hujjat podvalidan o‘qiladi, isbotlanadi va faqat tasdiqlasangiz obyektga yoziladi.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NakrutkaManbaChip manba={holat?.manba} />
          {!tashqi && (
            <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void r2danOqi()}>
              <FileSearch size={12} aria-hidden="true" /> {t('Podvalni smetadan qayta o‘qish')}
            </button>
          )}
        </div>
      </div>
      <div className="fz-card__body flex flex-col gap-3">
        {xato && <p className="fz-note fz-note--danger">{xato}</p>}
        {avtoFaol && (
          <div className="fz-note fz-note--info items-center" role="status" data-testid="podval-avto-saqlandi">
            <CheckCircle2 size={14} aria-hidden="true" />
            <span className="flex-1">{t('Yangi smeta: podvaldagi foizlar obyektga avtomatik yozildi (manba — smeta podvali). Natija va ogohlantirishlar quyida.')}</span>
            <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void bekorQil()}>
              <Undo2 size={12} aria-hidden="true" /> {t('Bekor qilish')}
            </button>
          </div>
        )}
        {avto?.bekorQilindi && <p className="fz-note fz-note--warn" role="status">{t('Avtomatik yozuv bekor qilindi — obyekt avvalgi koeffitsientlarga qaytdi. Kerak bo‘lsa pastda qayta tasdiqlang.')}</p>}
        {!oqish && !tashqi && <p className="fz-note fz-note--info">{t('Asl smeta fayli R2 da bo‘lsa — tugma uni o‘qiydi; bo‘lmasa yuqorida faylni qayta tanlang (hech narsa yozilmaydi, faqat preview).')}</p>}
        {oqish && oqish.holat === 'topilmadi' && <p className="fz-note fz-note--warn">{t('Smetada nakrutka podvali topilmadi — shartnoma/sukut koeffitsientlari qoladi.')}</p>}
        {oqish && oqish.holat !== 'topilmadi' && (
          <>
            <div className="flex flex-wrap gap-1.5 text-[12px]">
              <span className="fz-chip">{t('Varaqlar')}: {oqish.varaqlar.join(', ') || '—'}</span>
              <span className="fz-chip">{t('Hujjat birligi')}: {masshtabNom}</span>
              <span className={`fz-chip ${isbotNomos.length ? 'fz-chip--warn' : 'fz-chip--accent'}`}>{t('Arifmetik isbot: {a} mos, {b} nomos', { a: String(isbotMos), b: String(isbotNomos.length) })}</span>
              {oqish.lokal && <span className="fz-chip">{t('Lokal podval: prochie/ҚҚС meros qoladi')}</span>}
            </div>
            {bloklovchiSoni > 0 && (
              <div className="fz-note fz-note--warn" role="alert" data-testid="podval-bloklovchi">
                <AlertTriangle aria-hidden="true" />
                <span>{t('Hal qilinmagan podval bloklari ({n}): isboti yo‘q — operator tekshiradi, tafsilot ogohlantirishlarda.', { n: String(bloklovchiSoni) })}</span>
              </div>
            )}
            <div className="fz-table-wrap">
              <table className="fz-table">
                <thead><tr>
                  <th>{t('Koeffitsient')}</th><th className="fz-c-num">{avtoFaol ? t('Avval %') : t('Joriy %')}</th><th className="fz-c-num">{t('Smetada %')}</th><th>{t('Dalil (katak)')}</th>
                </tr></thead>
                <tbody>
                  {farq.map((f) => (
                    <tr key={f.kod} className={f.manba === 'smeta' && f.yangi !== f.eski ? 'fz-row-res' : ''}>
                      <td title={f.kod}>{NAKRUTKA_KOEF_IZOH[f.kod]}</td>
                      <td className="fz-c-num">{f.eski}</td>
                      <td className="fz-c-num">{f.manba === 'smeta' ? <b>{f.yangi}</b> : <span className="text-text-mute">{t('topilmadi')}</span>}</td>
                      <td className="text-[12px] text-text-dim">{f.dalil ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tasir && (
              <div className="grid grid-cols-[auto_1fr_1fr] items-baseline gap-x-4 gap-y-1 text-[13px]" data-testid="podval-tasir">
                <span />
                <b className="text-right">{avtoFaol ? t('Avval') : t('Joriy')}</b>
                <b className="text-right">{t('Smeta podvali bilan')}</b>
                <span className="text-text-dim">{t('To‘g‘ri xarajat (ustamasiz)')}</span>
                <span className="text-right tabular-nums"><FmtN val={tasir.ustamasiz} /></span>
                <span className="text-right tabular-nums"><FmtN val={tasir.ustamasiz} /></span>
                <span className="text-text-dim">{t('ИТОГО-4 (ustamali, ҚҚС siz)')}</span>
                <span className="text-right tabular-nums"><FmtN val={tasir.eski.itogo4} /></span>
                <span className="text-right tabular-nums"><FmtN val={tasir.yangi.itogo4} /></span>
                <span className="text-text-dim">{t('ВСЕГО (ustamali, ҚҚС bilan)')}</span>
                <span className="text-right tabular-nums"><FmtN val={tasir.eski.vsego} /></span>
                <span className="text-right tabular-nums"><b><FmtN val={tasir.yangi.vsego} /></b></span>
                <span className="text-text-dim">{t('Farq (ВСЕГО)')}</span>
                <span />
                <span className="text-right tabular-nums"><FmtN val={tasir.yangi.vsego == null || tasir.eski.vsego == null ? null : tasir.yangi.vsego - tasir.eski.vsego} /></span>
              </div>
            )}
            {(isbotNomos.length > 0 || oqish.review.length > 0) && (
              <details className="text-[12px]" open={avtoFaol}>
                <summary className="cursor-pointer">{t('Ogohlantirishlar ({n})', { n: String(oqish.review.length) })}</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-dim">
                  {oqish.review.map((r, i) => <li key={i}>{r.izoh}{r.manzil ? ` — ${r.manzil.varaq}!${r.manzil.qator}` : ''}</li>)}
                </ul>
              </details>
            )}
            <p className="text-[12px] text-text-mute">{t('Topilmagan foizlar uchun joriy (shartnoma/sukut) qiymat qoladi. Nomos isbot importni to‘xtatmaydi.')}</p>
            {!avtoFaol && <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="fz-btn fz-btn--primary" disabled={band || !holat || !Object.keys(oqish.koeffitsientlar).length} onClick={() => void saqla()}>
                {band ? <RefreshCw size={12} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                {holat?.podval ? t('Obyekt podvalini smeta bo‘yicha yangilash') : t('Tasdiqlash: obyektga smeta podvalini yozish')}
              </button>
              {saqlandi && <span className="fz-chip fz-chip--accent">{t('Saqlandi')}</span>}
            </div>}
          </>
        )}
      </div>
    </section>
  );
}
