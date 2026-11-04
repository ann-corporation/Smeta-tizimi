/** Yuk kartasi (egasi): takliflar (qabul / qarshi narx / rad), bron va qabul kodi, isbot, to‘lov holati, tasdiq, baho, nizo, hodisalar. */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, KeyRound, MessageSquareReply, X } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { OpsMaydon, OpsOyna } from '../../components/kompaniya-ops/OpsUi';
import { yangiOperationId } from '../../api/supabase';
import { ybXato, ybYoz, ybYuk, type TaklifQator, type YukTafsilot as Tafsilot } from '../../api/t2-yuk-birjasi';
import { t } from '../../i18n/til';
import { egaAmallari } from '../../lib/yuk-birjasi/holat';
import { tavsiyadanFarqFoiz } from '../../lib/yuk-birjasi/narx';
import { FmtN } from '../../lib/format';
import { Bosh, sanaKun, sanaVaqt, TOLOV_SHAKLI_NOM, TolovBelgi, YukHolatBelgi, YukPul, YUK_TURI_NOM } from './yuk-ui';

type Amal = 'qarshi' | 'bekor' | 'nizo' | 'baho';
const AMAL_NOM: Readonly<Record<Amal, string>> = { qarshi: 'Qarshi narx taklif qilish', bekor: 'Yukni bekor qilish', nizo: 'Nizo ochish', baho: 'Tashuvchini baholash' };
const HODISA_NOM: Readonly<Record<string, string>> = {
  yaratildi: 'Qoralama yaratildi', elon: 'E’lon qilindi', taklif: 'Taklif keldi', qarshi_taklif: 'Qarshi taklif yuborildi', taklif_rad: 'Taklif rad etildi', bron: 'Bron qilindi',
  dalil: 'Isbot yuklandi', yolda: 'Yo‘lga chiqdi', kod_xato: 'Qabul kodi noto‘g‘ri kiritildi', yetkazildi: 'Yetkazildi', yopildi: 'Yopildi', baho: 'Baho berildi', nizo: 'Nizo ochildi',
  bekor: 'Bekor qilindi', bron_bekor: 'Bron bekor qilindi',
};

export function YukTafsilot({ kompaniyaId, yukId, orqaga }: { kompaniyaId: number; yukId: number; orqaga: () => void }) {
  const [td, setTd] = useState<Tafsilot | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [amal, setAmal] = useState<Amal | null>(null);
  const [taklif, setTaklif] = useState<TaklifQator | null>(null);
  const [narx, setNarx] = useState('');
  const [matn, setMatn] = useState('');
  const [ball, setBall] = useState('5');
  const [band, setBand] = useState(false);

  const yukla = useCallback(async () => {
    const r = await ybYuk(kompaniyaId, yukId);
    if (r.ok) { setTd(r.natija); setXato(null); } else { setTd(null); setXato(ybXato(r)); }
  }, [kompaniyaId, yukId]);
  useEffect(() => { void yukla(); }, [yukla]);

  const yoz = async (a: Parameters<typeof ybYoz>[1], data: Record<string, unknown>, xabar: string) => {
    setBand(true);
    const r = await ybYoz(kompaniyaId, a, data, yangiOperationId());
    setBand(false);
    if (!r.ok) { toast(ybXato(r), 'danger'); return false; }
    toast(t(xabar), 'ok');
    await yukla();
    return true;
  };

  if (xato) return <Bosh>{t(xato)}</Bosh>;
  if (!td) return <Bosh>{t('Yuklanmoqda…')}</Bosh>;
  const { yuk, bron, tolov } = td;
  const baholangan = td.baho.some((b) => b.kimdan_turi === 'ega');
  const mumkin = egaAmallari(yuk.holat, baholangan);
  const faol = td.takliflar.filter((x) => x.holat === 'faol' && x.kimdan === 'tashuvchi');

  const tasdiqlash = async () => {
    if (!taklif && amal === 'qarshi') return;
    let ok = false;
    if (amal === 'qarshi' && taklif) {
      const n = Number(narx.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) { toast(ybXato({ code: 'NARX_KERAK' }), 'warn'); return; }
      ok = await yoz('javob', { yuk_id: yuk.id, taklif_id: taklif.id, harakat: 'qarshi', narx_qqs_siz: n, izoh: matn.trim() || undefined }, 'Qarshi taklif yuborildi.');
    } else if (amal === 'bekor') {
      ok = await yoz('bekor', { yuk_id: yuk.id, sabab: matn.trim() || undefined }, 'Yuk bekor qilindi.');
    } else if (amal === 'nizo' && bron) {
      if (matn.trim().length < 3) { toast(ybXato({ code: 'SABAB_KERAK' }), 'warn'); return; }
      ok = await yoz('nizo', { bron_id: bron.id, sabab: matn.trim() }, 'Nizo ochildi. Moderator ko‘rib chiqadi.');
    } else if (amal === 'baho' && bron) {
      ok = await yoz('baho', { bron_id: bron.id, ball: Number(ball), izoh: matn.trim() || undefined }, 'Baho saqlandi.');
    }
    if (ok) { setAmal(null); setTaklif(null); setNarx(''); setMatn(''); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fz-btn fz-btn--ghost" onClick={orqaga}><ArrowLeft /> {t('Orqaga')}</button>
        <h3 className="text-[15px] font-semibold">{yuk.nom}</h3>
        <YukHolatBelgi holat={yuk.holat} />
        <span className="fz-chip">{t(TOLOV_SHAKLI_NOM[yuk.tolov_shakli])}{yuk.escrow ? ` · ${t('platforma orqali')}` : ''}</span>
        <span className="flex-1" />
        {mumkin.includes('tasdiq') && <button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void yoz('tasdiq', { yuk_id: yuk.id }, 'Yetkazish tasdiqlandi. Yuk yopildi.')}><Check /> {t('Yetkazildi — tasdiqlayman')}</button>}
        {mumkin.includes('baho') && <button type="button" className="fz-btn" onClick={() => setAmal('baho')}>{t(AMAL_NOM.baho)}</button>}
        {mumkin.includes('nizo') && <button type="button" className="fz-btn fz-btn--ghost" onClick={() => setAmal('nizo')}>{t(AMAL_NOM.nizo)}</button>}
        {mumkin.includes('bekor') && <button type="button" className="fz-btn fz-btn--ghost" onClick={() => setAmal('bekor')}><X /> {t(AMAL_NOM.bekor)}</button>}
      </div>

      <div className="fz-card"><div className="grid gap-2 p-3 text-[12.5px] sm:grid-cols-3">
        <div><div className="text-text-mute">{t('Marshrut')}</div>{yuk.a_nom ?? '—'} → {yuk.b_nom ?? '—'}{yuk.masofa_km != null && <> · <FmtN val={yuk.masofa_km} /> km</>}</div>
        <div><div className="text-text-mute">{t('Yuk')}</div>{t(YUK_TURI_NOM[yuk.yuk_turi])} · {yuk.tonna != null ? <><FmtN val={yuk.tonna} /> t</> : '—'}</div>
        <div><div className="text-text-mute">{t('Sana')}</div>{sanaKun(yuk.sana_dan)}{yuk.sana_gacha ? ` – ${sanaKun(yuk.sana_gacha)}` : ''}</div>
        <div><div className="text-text-mute">{t('Qat’iy narx')}</div><YukPul qqsSiz={yuk.narx_taklif_qqs_siz} foiz={yuk.qqs_foiz} /></div>
        <div><div className="text-text-mute">{t('Tavsiya narx')}</div><YukPul qqsSiz={yuk.narx_tavsiya_qqs_siz} foiz={yuk.qqs_foiz} /></div>
        {yuk.izoh && <div><div className="text-text-mute">{t('Izoh')}</div>{yuk.izoh}</div>}
      </div></div>

      {bron && (
        <div className="fz-card">
          <div className="fz-card__head"><h3 className="fz-card__title">{t('Bron')}</h3></div>
          <div className="grid gap-2 p-3 text-[12.5px] sm:grid-cols-3">
            <div><div className="text-text-mute">{t('Tashuvchi')}</div>{bron.tashuvchi}{bron.telefon ? ` · ${bron.telefon}` : ''}<div className="text-text-mute">{bron.mashina}</div></div>
            <div><div className="text-text-mute">{t('Kelishilgan narx')}</div><YukPul qqsSiz={bron.narx_qqs_siz} foiz={bron.qqs_foiz} />
              {tavsiyadanFarqFoiz(bron.narx_qqs_siz, yuk.narx_tavsiya_qqs_siz) != null && <div className="text-text-mute">{t('Tavsiyadan farq')}: {tavsiyadanFarqFoiz(bron.narx_qqs_siz, yuk.narx_tavsiya_qqs_siz)}%</div>}</div>
            <div><div className="text-text-mute"><KeyRound className="inline h-3.5 w-3.5" /> {t('Qabul kodi (qabul qiluvchiga ayting)')}</div><span className="text-[20px] font-bold tracking-widest">{bron.qabul_kod}</span></div>
          </div>
          {tolov && <div className="flex flex-wrap items-center gap-2 border-t border-border p-3 text-[12.5px]">
            <TolovBelgi holat={tolov.holat} /> <span><FmtN val={tolov.summa_jami} /> UZS ({t('QQS bilan')})</span>
            {tolov.komissiya_summa != null && <span className="text-text-mute">{t('Komissiya')}: <FmtN val={tolov.komissiya_summa} /> · {t('Tashuvchiga')}: <FmtN val={tolov.tashuvchiga_summa} /></span>}
          </div>}
        </div>
      )}

      <div className="fz-card">
        <div className="fz-card__head"><h3 className="fz-card__title">{t('Takliflar')} ({faol.length})</h3></div>
        {td.takliflar.length === 0 ? <p className="p-3 text-[12.5px] text-text-mute">{t('Hozircha taklif yo‘q.')}</p> : (
          <div className="fz-table-wrap"><table className="fz-table min-w-[640px]">
            <thead><tr><th>{t('Tashuvchi')}</th><th>{t('Mashina')}</th><th className="fz-c-num">{t('Narx')}</th><th>{t('Raund')}</th><th>{t('Holat')}</th><th /></tr></thead>
            <tbody>{td.takliflar.map((x) => (
              <tr key={x.id}>
                <td>{x.tashuvchi}<div className="text-[11px] text-text-mute">{x.tur === 'firma' ? t('Firma') : t('Yakka haydovchi')} · {t('daraja')} {x.daraja}{x.reyting != null ? ` · ★ ${x.reyting} (${x.reyting_soni})` : ''}</div></td>
                <td>{x.mashina.raqam ?? '—'}{x.mashina.yuk_t != null ? ` · ${x.mashina.yuk_t} t` : ''}</td>
                <td className="fz-c-num"><YukPul qqsSiz={x.narx_qqs_siz} foiz={x.qqs_foiz} />{x.kimdan === 'ega' && <div className="text-[11px] text-text-mute">{t('sizning qarshi taklifingiz')}</div>}</td>
                <td>{x.raund}</td>
                <td>{x.holat}</td>
                <td className="whitespace-nowrap">{x.holat === 'faol' && x.kimdan === 'tashuvchi' && mumkin.includes('javob') && <>
                  <button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void yoz('javob', { yuk_id: yuk.id, taklif_id: x.id, harakat: 'qabul' }, 'Taklif qabul qilindi — yuk bron qilindi.')}><Check /> {t('Qabul')}</button>{' '}
                  <button type="button" className="fz-btn" onClick={() => { setTaklif(x); setNarx(String(x.narx_qqs_siz)); setAmal('qarshi'); }}><MessageSquareReply /> {t('Qarshi narx')}</button>{' '}
                  <button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={() => void yoz('javob', { yuk_id: yuk.id, taklif_id: x.id, harakat: 'rad' }, 'Taklif rad etildi.')}><X /></button>
                </>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>

      {td.dalil.length > 0 && (
        <div className="fz-card"><div className="fz-card__head"><h3 className="fz-card__title">{t('Isbot (foto / hujjat)')}</h3></div>
          <ul className="grid gap-1 p-3 text-[12.5px]">{td.dalil.map((d) => <li key={d.id}>{d.tur === 'yuklash' ? t('Yuklash') : d.tur === 'yetkazish' ? t('Yetkazish') : t('Nizo')} · {sanaVaqt(d.yaratildi)} · <span className="text-text-mute">{d.r2_kalit ?? `#${d.document_id}`}</span></li>)}</ul>
        </div>
      )}
      {td.nizo && <Bosh>{t('Nizo')}: {td.nizo.sabab} — {td.nizo.holat === 'ochiq' ? t('moderator ko‘rib chiqmoqda') : `${t('qaror')}: ${td.nizo.qaror ?? ''}`}</Bosh>}
      {td.baho.length > 0 && <Bosh>{td.baho.map((b) => `${b.kimdan_turi === 'ega' ? t('Sizning bahoyingiz') : t('Tashuvchi bahosi')}: ${b.ball}/5`).join(' · ')}</Bosh>}

      <div className="fz-card"><div className="fz-card__head"><h3 className="fz-card__title">{t('Tarix')}</h3></div>
        <ul className="grid gap-1 p-3 text-[12px] text-text-mute">{td.hodisalar.map((h, i) => <li key={i}>{sanaVaqt(h.yaratildi)} · {t(HODISA_NOM[h.tur] ?? h.tur)}</li>)}</ul>
      </div>

      <OpsOyna ochiq={amal != null} onYop={() => { setAmal(null); setTaklif(null); }} band={band} kenglik={460} sarlavha={amal ? t(AMAL_NOM[amal]) : ''}
        amallar={<button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void tasdiqlash()}>{t('Tasdiqlash')}</button>}>
        {amal === 'qarshi' && <OpsMaydon nom={t('Sizning narxingiz (QQS siz), so‘m')} majburiy><MoneyInput value={narx} onValueChange={setNarx} /></OpsMaydon>}
        {amal === 'baho' && <OpsMaydon nom={t('Baho (1–5)')}><select value={ball} onChange={(e) => setBall(e.target.value)}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></OpsMaydon>}
        <OpsMaydon nom={amal === 'bekor' || amal === 'nizo' ? t('Sabab') : t('Izoh')} majburiy={amal === 'nizo'}><textarea rows={3} maxLength={1000} value={matn} onChange={(e) => setMatn(e.target.value)} /></OpsMaydon>
      </OpsOyna>
    </div>
  );
}