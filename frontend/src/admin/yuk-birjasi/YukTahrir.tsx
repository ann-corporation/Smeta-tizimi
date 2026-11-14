/** Yangi yuk e‘loni: marshrut, hajm, sana, to‘lov shakli; masofa serverdan (kesh), tavsiya narx t·km formulasi bilan (kelishish erkin). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Route } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { OpsMaydon, OpsOyna } from '../../components/kompaniya-ops/OpsUi';
import { yangiOperationId } from '../../api/supabase';
import { ybMarshrut, ybSozlama, ybXato, ybYoz } from '../../api/t2-yuk-birjasi';
import { t } from '../../i18n/til';
import { parametrlarServerdan, shoshilinchlik, SUKUT_PARAMETR, tavsiyaNarx, YUK_TURLARI, type NarxParametr, type Qaytish, type YukTuri } from '../../lib/yuk-birjasi/narx';
import { FmtN } from '../../lib/format';
import { nuqtaOqi, TOLOV_SHAKLI_NOM, YUK_TURI_NOM } from './yuk-ui';

const son = (v: string): number | null => { const n = Number(v.replace(',', '.')); return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; };
const bugunISO = () => new Date().toISOString().slice(0, 10);

/** Buyurtmadan transport so'ralganda oldindan to'ldiriladigan maydonlar (yetkazuvchi: «Transport so'rash»). */
export type YukBoshlang = { nom?: string; aNom?: string; bNom?: string; tonna?: string; izoh?: string };

export function YukTahrir({ ochiq, kompaniyaId, onYop, onSaqlandi, boshlang }: { ochiq: boolean; kompaniyaId: number; onYop: () => void; onSaqlandi: (id: number) => void; boshlang?: YukBoshlang }) {
  const [nom, setNom] = useState('');
  const [yukTuri, setYukTuri] = useState<YukTuri>('sochma');
  const [aNom, setANom] = useState('');
  const [aNuqta, setANuqta] = useState('');
  const [bNom, setBNom] = useState('');
  const [bNuqta, setBNuqta] = useState('');
  const [masofa, setMasofa] = useState('');
  const [masofaManba, setMasofaManba] = useState<string | null>(null);
  const [tonna, setTonna] = useState('');
  const [sanaDan, setSanaDan] = useState('');
  const [sanaGacha, setSanaGacha] = useState('');
  const [tolov, setTolov] = useState<'naqd' | 'otkazma' | 'ikkalasi'>('otkazma');
  const [escrow, setEscrow] = useState(false);
  const [qaytish, setQaytish] = useState<Qaytish>('bir_tomon');
  const [qatiyNarx, setQatiyNarx] = useState('');
  const [qqs, setQqs] = useState('12');
  const [izoh, setIzoh] = useState('');
  const [param, setParam] = useState<NarxParametr>(SUKUT_PARAMETR);
  const [komissiya, setKomissiya] = useState<number | null>(null);
  const [band, setBand] = useState(false);
  const [masofaBand, setMasofaBand] = useState(false);
  const op = useRef(yangiOperationId());

  useEffect(() => {
    if (!ochiq || !boshlang) return;
    if (boshlang.nom) setNom(boshlang.nom);
    if (boshlang.aNom) setANom(boshlang.aNom);
    if (boshlang.bNom) setBNom(boshlang.bNom);
    if (boshlang.tonna) setTonna(boshlang.tonna);
    if (boshlang.izoh) setIzoh(boshlang.izoh);
  }, [ochiq, boshlang]);

  useEffect(() => {
    if (!ochiq) return;
    let tirik = true;
    void ybSozlama(kompaniyaId).then((r) => {
      if (!tirik || !r.ok) return;
      const p = parametrlarServerdan(r.natija.parametrlar);
      setParam(p); setQqs(String(p.qqsFoiz)); setKomissiya(Number(r.natija.komissiya_foiz));
    });
    return () => { tirik = false; };
  }, [ochiq, kompaniyaId]);

  const tavsiya = useMemo(() => tavsiyaNarx({
    masofaKm: son(masofa), tonna: son(tonna), yukTuri, qaytish, shoshilinch: shoshilinchlik(sanaDan || null, bugunISO()), parametr: param,
  }), [masofa, tonna, yukTuri, qaytish, sanaDan, param]);

  const masofaHisobla = async () => {
    const a = nuqtaOqi(aNuqta), b = nuqtaOqi(bNuqta);
    if (!a || !b) { toast(t('Ikkala nuqta koordinatasini «41.3111, 69.2797» ko‘rinishida kiriting.'), 'warn'); return; }
    setMasofaBand(true);
    const r = await ybMarshrut(a, b);
    setMasofaBand(false);
    if (!r.ok) { toast(r.error ?? t('Masofani hisoblab bo‘lmadi.'), 'danger'); return; }
    setMasofa(String(r.km)); setMasofaManba(r.manba);
  };

  const saqla = async (elon: boolean) => {
    if (!nom.trim()) { toast(ybXato({ code: 'NOM_REQUIRED' }), 'warn'); return; }
    const foiz = Number(qqs.replace(',', '.'));
    if (!Number.isFinite(foiz) || foiz < 0 || foiz >= 100) { toast(ybXato({ code: 'QQS_NOTOGRI' }), 'warn'); return; }
    const a = nuqtaOqi(aNuqta), b = nuqtaOqi(bNuqta);
    setBand(true);
    const data: Record<string, unknown> = {
      nom: nom.trim(), yuk_turi: yukTuri, a_nom: aNom.trim() || null, a_lat: a?.lat ?? null, a_lng: a?.lng ?? null, b_nom: bNom.trim() || null, b_lat: b?.lat ?? null, b_lng: b?.lng ?? null,
      masofa_km: son(masofa), tonna: son(tonna), sana_dan: sanaDan || null, sana_gacha: sanaGacha || null, tolov_shakli: tolov, escrow: tolov === 'otkazma' && escrow,
      narx_taklif_qqs_siz: son(qatiyNarx), narx_tavsiya_qqs_siz: tavsiya.qqsSiz, qqs_foiz: foiz, izoh: izoh.trim() || null,
      narx_hisob: tavsiya.qqsSiz == null ? null : { masofa_km: son(masofa), tonna: son(tonna), stavka_tkm: param.stavkaTkm, k_yuk: tavsiya.tarkib.kYuk, k_qaytish: tavsiya.tarkib.kQaytish,
        k_shoshilinch: tavsiya.tarkib.kShoshilinch, k_mashina: tavsiya.tarkib.kMashina, min_tarif: param.minTarif, tavsiya_qqs_siz: tavsiya.qqsSiz, pastki_qqs_siz: tavsiya.pastki, yuqori_qqs_siz: tavsiya.yuqori, manba: masofaManba },
    };
    const r = await ybYoz(kompaniyaId, 'saqla', data, op.current);
    if (!r.ok || !r.id) { setBand(false); toast(ybXato(r), 'danger'); return; }
    if (elon) {
      const e = await ybYoz(kompaniyaId, 'elon', { id: r.id, versiya: r.versiya }, yangiOperationId());
      if (!e.ok) { setBand(false); toast(ybXato(e), 'danger'); onSaqlandi(r.id); return; }
    }
    setBand(false);
    op.current = yangiOperationId();
    toast(elon ? t('Yuk e’lon qilindi. Tashuvchilar takliflari shu yerda chiqadi.') : t('Qoralama saqlandi.'), 'ok');
    onSaqlandi(r.id);
  };

  return (
    <OpsOyna ochiq={ochiq} onYop={onYop} band={band} kenglik={720} sarlavha={t('Yangi yuk e’loni')}
      amallar={<>
        <button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={() => void saqla(false)}>{t('Qoralama')}</button>
        <button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void saqla(true)}>{t('E’lon qilish')}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <OpsMaydon nom={t('Yuk nomi')} majburiy><input type="text" maxLength={200} value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t('Masalan: sement M400')} /></OpsMaydon>
        <OpsMaydon nom={t('Yuk turi')}><select value={yukTuri} onChange={(e) => setYukTuri(e.target.value as YukTuri)}>{YUK_TURLARI.map((x) => <option key={x} value={x}>{t(YUK_TURI_NOM[x])}</option>)}</select></OpsMaydon>
        <OpsMaydon nom={t('Qayerdan')} majburiy><input type="text" maxLength={200} value={aNom} onChange={(e) => setANom(e.target.value)} placeholder={t('Toshkent, Sergeli')} /></OpsMaydon>
        <OpsMaydon nom={t('Qayerga')} majburiy><input type="text" maxLength={200} value={bNom} onChange={(e) => setBNom(e.target.value)} placeholder={t('Navoiy, bog‘ obyekti')} /></OpsMaydon>
        <OpsMaydon nom={t('Yuklash nuqtasi (lat, lng)')} izoh={t('Ixtiyoriy; masofani hisoblash uchun')}><input type="text" value={aNuqta} onChange={(e) => setANuqta(e.target.value)} placeholder="41.3111, 69.2797" /></OpsMaydon>
        <OpsMaydon nom={t('Tushirish nuqtasi (lat, lng)')}><input type="text" value={bNuqta} onChange={(e) => setBNuqta(e.target.value)} placeholder="40.0844, 65.3792" /></OpsMaydon>
        <OpsMaydon nom={t('Masofa, km')} izoh={masofaManba === 'taxminiy' ? t('Taxminiy (yo‘l xizmati javob bermadi)') : masofaManba === 'yol' ? t('Yo‘l bo‘yicha') : undefined}>
          <div className="flex gap-2"><input type="text" inputMode="decimal" value={masofa} onChange={(e) => { setMasofa(e.target.value); setMasofaManba(null); }} />
            <button type="button" className="fz-btn fz-btn--ghost" disabled={masofaBand} onClick={() => void masofaHisobla()}><Route /> {t('Hisoblash')}</button></div>
        </OpsMaydon>
        <OpsMaydon nom={t('Og‘irlik, tonna')} majburiy><input type="text" inputMode="decimal" value={tonna} onChange={(e) => setTonna(e.target.value)} /></OpsMaydon>
        <OpsMaydon nom={t('Yuklash sanasi')} majburiy><input type="date" value={sanaDan} onChange={(e) => setSanaDan(e.target.value)} /></OpsMaydon>
        <OpsMaydon nom={t('Taklif qabul qilish muddati (gacha)')}><input type="date" value={sanaGacha} onChange={(e) => setSanaGacha(e.target.value)} /></OpsMaydon>
        <OpsMaydon nom={t('To‘lov shakli')}>
          <select value={tolov} onChange={(e) => { const v = e.target.value as 'naqd' | 'otkazma' | 'ikkalasi'; setTolov(v); if (v !== 'otkazma') setEscrow(false); }}>
            {(['otkazma', 'naqd', 'ikkalasi'] as const).map((x) => <option key={x} value={x}>{t(TOLOV_SHAKLI_NOM[x])}</option>)}
          </select>
        </OpsMaydon>
        <OpsMaydon nom={t('Qaytishda yuk')}>
          <select value={qaytish} onChange={(e) => setQaytish(e.target.value as Qaytish)}>
            <option value="bir_tomon">{t('Yo‘q — mashina bo‘sh qaytadi')}</option>
            <option value="qaytishda_yuk">{t('Bor — qaytishda yuk topiladi')}</option>
          </select>
        </OpsMaydon>
        <OpsMaydon nom={t('Qat’iy narx (QQS siz), so‘m')} izoh={t('Bo‘sh qoldirsangiz tashuvchilar o‘z narxini taklif qiladi')}><MoneyInput value={qatiyNarx} onValueChange={setQatiyNarx} /></OpsMaydon>
        <OpsMaydon nom={t('QQS, %')}><input type="text" inputMode="decimal" value={qqs} onChange={(e) => setQqs(e.target.value)} /></OpsMaydon>
      </div>
      {tolov === 'otkazma' && (
        <label className="mt-3 flex items-start gap-2 text-[12.5px]">
          <input type="checkbox" checked={escrow} onChange={(e) => setEscrow(e.target.checked)} />
          <span>{t('Platforma orqali to‘lov: pul litsenziyali to‘lov provayderida ushlab turiladi va yetkazish tasdiqlangach tashuvchiga o‘tadi')}{komissiya != null && komissiya > 0 ? ` (${t('komissiya')}: ${komissiya}%)` : ''}</span>
        </label>
      )}
      <div className="fz-card mt-3">
        <div className="fz-card__head"><h3 className="fz-card__title"><Calculator /> {t('Tavsiya narx (t·km)')}</h3></div>
        {tavsiya.qqsSiz == null ? (
          <p className="p-3 text-[12.5px] text-text-mute">{tavsiya.yetishmaydi.includes('stavka') ? t('Narx stavkasi hali kiritilmagan — narxni o‘zingiz belgilang yoki tashuvchilar taklifini kuting.') : t('Masofa va og‘irlikni kiriting.')}</p>
        ) : (
          <div className="grid gap-1 p-3 text-[12.5px]">
            <div><b><FmtN val={tavsiya.qqsBilan} /></b> UZS · {t('QQS bilan')} ({t('QQS siz')}: <FmtN val={tavsiya.qqsSiz} />)</div>
            <div className="text-text-mute">{t('Diapazon')}: <FmtN val={tavsiya.pastki} /> – <FmtN val={tavsiya.yuqori} /> ({t('QQS siz')}) · {t('1 t·km')}: <FmtN val={tavsiya.tkmNarx} /></div>
            {tavsiya.minQollandi && <div className="text-text-mute">{t('Minimal reys narxi qo‘llandi.')}</div>}
            <div className="text-text-mute">{t('Bu faqat tavsiya: yakuniy narx va to‘lovni tomonlar o‘zaro kelishadi.')}</div>
          </div>
        )}
      </div>
      <OpsMaydon nom={t('Izoh')}><textarea rows={2} maxLength={2000} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></OpsMaydon>
    </OpsOyna>
  );
}