/**
 * «O'rganish halqasi» — foydalanuvchi ishidan o'rganadigan tizim (migratsiya 20261217400000).
 *  1) «Tizim nimani o'rgandi»: foydalanuvchi o'z tajribasini ko'radi/o'chiradi; kompaniya sozlamasi (o'rganish, anonim hissa).
 *  2) «Qayerda qiynalyapti»: ishqalanish reytingi (odam x nuqson) — rahbar o'z kompaniyasini, platforma egasi hammasini (anonim) ko'radi.
 *  3) «Tizim o'zi taklif qiladi» (faqat platforma egasi): takliflar navbati — qabul / rad / keyin. Kodni o'zi o'zgartirmaydi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import {
  osuvchiFriksiyaOl, osuvchiMeningOl, osuvchiPlatformaFriksiyaOl, osuvchiPlatformaHaftaOl, osuvchiPlatformaTakliflarOl, osuvchiSozlamaOl, osuvchiYoz,
  type FriksiyaQator, type TajribaQator, type TizimTaklif,
} from '../../api/t2-osuvchi';

type YozAmal = Parameters<typeof osuvchiYoz>[0]['amal'];
const tugma = 'inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[13px] hover:border-accent disabled:opacity-50';
const DORI: Record<FriksiyaQator['dori'], () => string> = {
  dars: () => t('dars (o‘rgatish)'), default: () => t('standart / lug‘at'), ui: () => t('interfeysni tuzatish'), funksiya: () => t('yetishmayotgan funksiya'),
};
const DOMEN: Record<string, () => string> = {
  lugat: () => t('qidiruv so‘zi (sinonim)'), moslash: () => t('qator mosligi'), naryad_qator: () => t('naryad: usta birligi va koef'), ustun: () => t('ustun mosligi'), birlik: () => t('birlik'),
};
const domenNomi = (d: string) => (DOMEN[d] ? DOMEN[d]() : d);

export function FriksiyaJadval({ royxat, bosh }: { royxat: FriksiyaQator[]; bosh: string }) {
  if (!royxat.length) return <p className="text-[13px] text-text-dim" data-testid="friksiya-bosh">{bosh}</p>;
  return (
    <table className="w-full text-left text-[12px]" data-testid="friksiya-jadval">
      <thead><tr className="text-text-mute"><th className="py-1 pr-2">{t('Joy')}</th><th className="pr-2">{t('Odam')}</th><th className="pr-2">{t('Nuqson')}</th><th className="pr-2">{t('Boshlandi')}</th><th className="pr-2">{t('Tashlandi')}</th><th className="pr-2">{t('Xato')}</th><th className="pr-2">{t('Topilmadi')}</th><th>{t('Taklif')}</th></tr></thead>
      <tbody>{royxat.map((r) => (
        <tr key={`${r.sahifa}:${r.amal}`} className="border-t border-border/50">
          <td className="py-1 pr-2 font-mono">{r.sahifa}:{r.amal}{r.top_kod && <div className="text-[10px] text-text-dim">{r.top_hodisa === 'xato' ? t('xato kodi') : t('qidiruv')}: {r.top_kod}</div>}</td>
          <td className="pr-2">{r.odam}</td><td className="pr-2">{Math.round(r.nuqson * 100)} %</td><td className="pr-2">{r.boshlandi}</td><td className="pr-2">{r.tashlandi}</td><td className="pr-2">{r.xato}</td><td className="pr-2">{r.nol_qidiruv}</td>
          <td>{(DORI[r.dori] ?? DORI.ui)()}</td>
        </tr>))}</tbody>
    </table>
  );
}

export default function Osuvchi() {
  const { joriyId: kid, superadmin } = useKompaniya();
  const [mening, setMening] = useState<TajribaQator[] | null>(null);
  const [sozlama, setSozlama] = useState<{ oqish: boolean; hissa: boolean } | null>(null);
  const [fr, setFr] = useState<FriksiyaQator[] | null>(null);
  const [frPlat, setFrPlat] = useState<FriksiyaQator[] | null>(null);
  const [takliflar, setTakliflar] = useState<TizimTaklif[]>([]);
  const [hafta, setHafta] = useState<{ yangi_tajriba: number; yangi_friksiya: number; bu_hafta: Record<string, number>; tizim_qoidalari: number; hajm_bayt: number } | null>(null);
  const [band, setBand] = useState(false);

  const yukla = useCallback(async () => {
    if (!kid) return;
    const [m, s, f] = await Promise.all([osuvchiMeningOl(kid), osuvchiSozlamaOl(kid), osuvchiFriksiyaOl(kid)]);
    setMening(m); setSozlama(s); setFr(f);
    if (superadmin) {
      const [fp, tk, h] = await Promise.all([osuvchiPlatformaFriksiyaOl(), osuvchiPlatformaTakliflarOl(), osuvchiPlatformaHaftaOl()]);
      setFrPlat(fp); setTakliflar(tk ?? []); setHafta(h ? { yangi_tajriba: h.yangi_tajriba, yangi_friksiya: h.yangi_friksiya, bu_hafta: h.bu_hafta, tizim_qoidalari: h.tizim_qoidalari, hajm_bayt: h.hajm_bayt } : null);
    }
  }, [kid, superadmin]);
  useEffect(() => { void yukla(); }, [yukla]);

  const yoz = async (amal: YozAmal, yuk: Record<string, unknown>, ok: string) => {
    if (!kid) return;
    setBand(true);
    const r = await osuvchiYoz({ kompaniyaId: kid, amal, yuk });
    setBand(false);
    if (!r.ok) { toast(`${t('Bajarilmadi')}: ${r.error ?? r.code ?? ''}`, 'danger'); return; }
    toast(ok, 'ok');
    await yukla();
  };

  return (
    <Sahifa sarlavha={t('Tizim o‘rganishi')} tavsif={t('Tizim sizning ishingizdan nimani o‘rgangani, qayerda qiynalishayotgani va nimani taklif qilayotgani.')}>
      <section className="karta space-y-2 p-3" data-testid="osuvchi-mening">
        <h2 className="text-sm font-semibold">{t('Tizim nimani o‘rgandi')}</h2>
        <p className="text-[12px] text-text-dim">{t('Bular sizning oldingi tanlovlaringiz. Tizim ularni keyingi safar «taklif (tajribadan)» deb ko‘rsatadi — o‘zi qo‘llamaydi, siz tasdiqlaysiz. Istalganini o‘chirishingiz mumkin.')}</p>
        {sozlama && (
          <div className="flex flex-wrap gap-4 text-[13px]">
            <label className="inline-flex items-center gap-2"><input type="checkbox" aria-label={t('Tajribadan o‘rganish')} checked={sozlama.oqish} disabled={band}
              onChange={(e) => void yoz('sozlama_saqla', { oqish: e.target.checked }, t('Sozlama saqlandi'))} />{t('Tajribadan o‘rganish (kompaniya)')}</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" aria-label={t('Anonim hissa')} checked={sozlama.hissa} disabled={band || !sozlama.oqish}
              onChange={(e) => void yoz('sozlama_saqla', { hissa: e.target.checked }, t('Sozlama saqlandi'))} />{t('Anonim hissa: lug‘at takliflarini platforma egasiga (kompaniya nomi va summalarsiz) yuborish')}</label>
          </div>)}
        {(mening == null || mening.length === 0) && <p className="text-[13px] text-text-dim">{mening == null ? t('Yuklanmoqda…') : t('Hozircha hech narsa o‘rganilmagan.')}</p>}
        {mening != null && mening.length > 0 && (
          <>
            <ul className="divide-y divide-border/50 text-[12px]" data-testid="osuvchi-royxat">{mening.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 py-1">
                <span><b>{domenNomi(x.domen)}</b>: {x.kalit} → <span className="font-mono">{x.qiymat}</span> <span className="text-text-dim">({x.tasdiq} / {x.rad})</span></span>
                <button type="button" className={tugma} disabled={band} aria-label={t('Unutish')} onClick={() => void yoz('tajriba_unut', { id: x.id }, t('O‘chirildi'))}><Trash2 size={13} /></button>
              </li>))}</ul>
            <button type="button" className={tugma} disabled={band} onClick={() => void yoz('tajriba_unut', { hammasi: true }, t('Hammasi o‘chirildi'))}>{t('Hammasini unutish')}</button>
          </>)}
      </section>

      <section className="karta mt-3 space-y-2 p-3" data-testid="osuvchi-qiynalish">
        <h2 className="text-sm font-semibold">{t('Qayerda qiynalyapti')}</h2>
        <p className="text-[12px] text-text-dim">{t('Reyting = odam soni x muvaffaqiyatsizlik ulushi (tashlab ketish, xato, topilmagan qidiruv). Hodisalar yakka-yakka saqlanmaydi, faqat sanoq.')}</p>
        {fr == null ? <p className="text-[13px] text-text-dim">{t('Bu bo‘lim rahbar uchun (yoki ma’lumot hali yo‘q).')}</p> : <FriksiyaJadval royxat={fr} bosh={t('Hozircha qiyinchilik qayd etilmagan.')} />}
        {superadmin && <>
          <h3 className="pt-2 text-[13px] font-semibold">{t('Hamma kompaniyalar (anonim)')}</h3>
          <FriksiyaJadval royxat={frPlat ?? []} bosh={t('Hozircha qiyinchilik qayd etilmagan.')} />
        </>}
      </section>

      {superadmin && (
        <section className="karta mt-3 space-y-2 p-3" data-testid="osuvchi-taklif">
          <h2 className="text-sm font-semibold">{t('Tizim o‘zi taklif qiladi')}</h2>
          {hafta && <p className="text-[12px] text-text-dim" data-testid="osuvchi-hafta">
            {t('Yangi: {a} ta lug‘at/moslik taklifi, {b} ta qiyin joy. Qabul qilingan tizim qoidalari: {c}. Jadvallar hajmi: {d} KB.', { a: hafta.yangi_tajriba, b: hafta.yangi_friksiya, c: hafta.tizim_qoidalari, d: Math.round(hafta.hajm_bayt / 1024) })}</p>}
          <button type="button" className={tugma} disabled={band} onClick={() => void yoz('taklif_yigish', {}, t('Takliflar yangilandi'))}>{t('Takliflarni yig‘ish')}</button>
          {!takliflar.length ? <p className="text-[13px] text-text-dim">{t('Hozircha taklif yo‘q.')}</p> : (
            <ul className="divide-y divide-border/50 text-[12px]" data-testid="osuvchi-navbat">{takliflar.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {x.tur === 'tajriba'
                    ? <><b>{domenNomi(x.domen)}</b>: «{x.kalit}» → «{x.qiymat}» <span className="text-text-dim">({t('{k} kompaniya, {u} kishi, {n} tasdiq', { k: Number(x.dalil.kompaniya_soni ?? 0), u: Number(x.dalil.foydalanuvchi_soni ?? 0), n: Number(x.dalil.tasdiq ?? 0) })})</span></>
                    : <><b>{x.kalit}</b>: {(DORI[(x.dalil.dori as FriksiyaQator['dori']) ?? 'ui'] ?? DORI.ui)()} <span className="text-text-dim">({t('{n} odam', { n: Number(x.dalil.odam ?? 0) })}, {Math.round(Number(x.dalil.nuqson ?? 0) * 100)} %)</span></>}
                  {x.holat !== 'yangi' && <span className="ml-2 rounded bg-surface-2 px-1 text-[10px]">{x.holat}</span>}
                </span>
                <span className="flex gap-1">
                  <button type="button" className={tugma} disabled={band} onClick={() => void yoz('taklif_qaror', { id: x.id, qaror: 'qabul' }, t('Qabul qilindi'))}>{t('Qabul')}</button>
                  <button type="button" className={tugma} disabled={band} onClick={() => void yoz('taklif_qaror', { id: x.id, qaror: 'rad' }, t('Rad etildi'))}>{t('Rad')}</button>
                  <button type="button" className={tugma} disabled={band} onClick={() => void yoz('taklif_qaror', { id: x.id, qaror: 'keyin' }, t('Keyinroqqa qoldirildi'))}>{t('Keyin')}</button>
                </span>
              </li>))}</ul>)}
          <p className="text-[11px] text-text-dim">{t('Qabul qilingan lug‘at taklifi tizim darajasidagi standart bo‘ladi; qiyin joylar esa vazifa ro‘yxati sifatida qoladi. Kod avtomatik o‘zgarmaydi.')}</p>
        </section>)}
    </Sahifa>
  );
}
