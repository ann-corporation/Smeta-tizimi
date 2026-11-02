import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { tenglashJami, type AktBekorFn, type EskiF2Akt, type TenglashReja } from '../../lib/fakt-f2-tenglash';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { toast } from '../../umumiy/ui/Toast';
import { qamrovBolaklari } from '../../lib/fakt-qamrov';
import { urinishYarat } from '../../lib/fakt-qamrov-urinish';
import type { JurnalHolat } from '../../lib/fakt-jurnal';
import { t } from '../../i18n/til';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { FaktUrinishPanel, useFaktUrinish } from './useFaktUrinish';

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
const KORSAT_CHEGARA = 300;

/**
 * «Fakt = F2» oldindan ko'rish (bo'lim yoki BUTUN OBYEKT): qaysi qatorlar, qancha hajm, summa (ustamasiz + ustamali),
 * bo'lim bo'yicha jami; egasi qator yoki butun bo'limni istisno qiladi. Yozish — Qamrov % bilan bir xil bitta urinish
 * yo'li (useFaktUrinish: fakt_yoz_v2, katta paket — bo'laklar, receipt, qayta yuborish bir xil ID bilan, bekor qilish).
 * Fakt F2 tomon, ishorasi bilan o'zgaradi (tasdiqlangan F2 — muhrlangan hujjat: minus qatorlar ham aynan); fakt F2 dan
 * oshgan qator o'zgarmaydi (signal); smeta qatorlariga tegilmaydi.
 */
export function FaktF2Tenglash({ sarlavha, reja, eskiAktlar = [], obyektId, kompaniyaId, sana, holatMap, onYop, onBajarildi, aktBekor }: {
  sarlavha: string; reja: TenglashReja;
  /** Oldin smeta narxida yozilgan «Fakt = F2» hujjatlari — bekor qilib qayta yozish taklifi (avtomatik bekor yo'q). */
  eskiAktlar?: readonly EskiF2Akt[];
  obyektId: number; kompaniyaId: number; sana: string;
  holatMap: ReadonlyMap<number, JurnalHolat>;
  onYop: () => unknown; onBajarildi: () => unknown;
  /** Hujjatni bekor qilish (akt_bekor). */
  aktBekor: AktBekorFn;
}) {
  const ur = useFaktUrinish({ kompaniyaId, obyektId, holatMap, onYop, onBajarildi, aktBekor, bekorMatn: t('Fakt = F2 bekor qilindi.') });
  const { band, urinish, jadvalYangi } = ur;
  const [chiqQator, setChiqQator] = useState<Set<number>>(new Set());
  const [chiqBolim, setChiqBolim] = useState<Set<string>>(new Set());
  const jami = useMemo(() => tenglashJami(reja, chiqQator, chiqBolim), [reja, chiqQator, chiqBolim]);
  const bolimli = jami.bolimlar.length > 1 || (jami.bolimlar[0]?.nom ?? '') !== '';
  const korinadi = useMemo(() => reja.qatorlar.filter((q) => !chiqBolim.has(q.bolim ?? '')), [reja, chiqBolim]);
  const qatorAlmashtir = (k: number) => setChiqQator((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const bolimAlmashtir = (k: string) => setChiqBolim((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const qollash = () => ur.yoz(() => {
    if (!jami.paket.length) return null;
    const faktlar = new Map(reja.qatorlar.map((q) => [q.id, q.fakt] as const));
    return urinishYarat({ kompaniyaId, obyektId, sana, sarlavha, foiz: 100, tur: 'f2', izohBosh: 'Fakt = F2' },
      qamrovBolaklari(jami.paket), yangiOperationId, undefined, (id) => faktlar.get(id) ?? 0);
  });
  const yozMumkin = !band && (!!urinish || (jami.paket.length > 0 && jadvalYangi));
  const [eskiBand, setEskiBand] = useState(false);
  /** Eski «Fakt = F2» hujjatlarini bekor qilish (tasdiq bilan, ro'yxat ko'rsatib). Keyin jadval yangilanadi va oyna yopiladi — qayta ochilsa reja F2 narxida hisoblanadi. */
  const eskiniBekorQil = async () => {
    if (eskiBand || !eskiAktlar.length) return;
    const royxat = eskiAktlar.map((a) => `№${a.raqam ?? a.id}${a.sana ? ` (${a.sana})` : ''}${a.jami != null ? ` — ${fmt(a.jami)}` : ''}`).join('\n');
    if (!await tasdiqSora(t('Quyidagi {n} ta «Fakt = F2» hujjati bekor qilinsinmi? Keyin «Fakt = F2» ni qayta oching — F2 narxida yoziladi.', { n: String(eskiAktlar.length) }) + '\n' + royxat)) return;
    setEskiBand(true);
    try {
      const natija = await Promise.all(eskiAktlar.map((a) => aktBekor(a.id)));
      const xato = natija.filter((b) => !b.ok);
      if (xato.length) toast(xato[0].error || t('Bekor qilinmadi.'), 'danger');
      else toast(t('{n} ta eski «Fakt = F2» hujjati bekor qilindi — «Fakt = F2» ni qayta oching.', { n: String(eskiAktlar.length) }), 'ok');
      await onBajarildi();
      if (!xato.length) onYop();
    } finally { setEskiBand(false); }
  };

  useHotkeys('fakt-f2', t('Fakt = F2 oynasi'), [
    { id: 'fakt-f2.yop', keys: 'esc', nom: t('Yopish'), inInput: true, run: () => { onYop(); } },
    { id: 'fakt-f2.qollash', keys: ['ctrl+enter', 'enter'], nom: t('Qo‘llash'), inInput: false, run: () => { if (!yozMumkin) return false; void qollash(); } },
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] p-4" role="dialog" aria-modal="true" aria-label={t('Fakt = F2')}>
      <div className="fz-card flex max-h-[88vh] w-full max-w-4xl flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-text">{t('Fakt = F2')}</h2>
            <p className="truncate text-[12px] text-text-dim" title={sarlavha}>{sarlavha}</p>
          </div>
          <button type="button" onClick={onYop} aria-label={t('Yopish')} className="fz-btn fz-btn--ghost fz-btn--icon"><X size={16} /></button>
        </div>
        <FaktUrinishPanel u={ur} />
        {eskiAktlar.length > 0 && <div className="fz-note fz-note--warn flex-col items-start text-[12px]" data-testid="f2-tenglash-eski">
          <p className="text-text">{t('Oldin smeta narxida yozilgan «Fakt = F2» hujjatlari bor: {n} ta — ularning qatorlari F2 narxiga o‘tmaydi.', { n: String(eskiAktlar.length) })}</p>
          <p className="text-text-dim">{eskiAktlar.map((a) => `№${a.raqam ?? a.id}${a.sana ? ` (${a.sana})` : ''}`).join(', ')}</p>
          <button type="button" className="fz-btn fz-btn--sm fz-btn--danger mt-1" disabled={eskiBand || band} onClick={() => void eskiniBekorQil()} data-testid="f2-tenglash-eski-bekor">{t('Bekor qilib qayta yozish')}</button>
        </div>}
        {reja.qatorlar.length === 0
          ? <p className="text-[13px] text-text-dim">{t('Fakt allaqachon F2 ga teng yoki undan ko‘p — qo‘shiladigan hajm yo‘q.')}</p>
          : <>
            <p className="text-[12px] text-text-dim">{t('Tasdiqlangan F2 qatorlari ishorasi, hajmi va narxi bilan aynan ko‘chiriladi (minus qatorlar ham). Fakt F2 dan oshgan qatorlar o‘zgarmaydi.')}</p>
            <div className="fz-note fz-note--info flex-wrap items-start gap-x-5 gap-y-1 text-[12px]" data-testid="f2-tenglash-jami">
              <span><b className="text-text">{jami.paket.length}</b> {t('qator yoziladi')}</span>
              <span className="inline-flex items-start gap-1">{t('Summa')}: <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami.ustamasiz} katKesim={jami.kesim} /></span>
              <span data-testid="f2-tenglash-narx-manba">{t('F2 narxi: {n} qator', { n: String(jami.f2Narxli) })} · {t('smeta narxi: {n} qator', { n: String(jami.smetaNarxli) })} · {t('narxsiz: {n} qator', { n: String(jami.narxsiz) })}{jami.qisman > 0 ? <> · <span className="text-warn" data-testid="f2-tenglash-qisman">{t('qisman narxli F2: {n} qator', { n: String(jami.qisman) })}</span></> : null}</span>
              {jami.narxsiz > 0 && <span className="text-warn">{t('summa noma’lum: {n} qator', { n: String(jami.narxsiz) })}</span>}
              {jami.rsHosila.soni > 0 && <span className="text-text-mute" data-testid="f2-tenglash-rs">{t('Mehnat/mashina: F2 da yo‘q {n} qator norma bo‘yicha smeta narxida ergashadi ({s}) — summaga kirgan.', { n: String(jami.rsHosila.soni), s: fmt(jami.rsHosila.summa) })}</span>}
              {jami.rsIstisno.soni > 0 && <span className="text-warn" data-testid="f2-tenglash-rs-istisno">{t('Istisno qilingan mehnat/mashina: {n} qator — F2 dan ko‘chirilgan ish ulushiga ergashmaydi, faktga tushmaydi ({s} jamiga kirmagan).', { n: String(jami.rsIstisno.soni), s: fmt(jami.rsIstisno.summa) })}</span>}
              {jami.nusxaSoni > 0 && <span data-testid="f2-tenglash-nusxa">{t('1:1: {n} ta F2 satri → {n} ta fakt qatori (hajm, narx, summa aynan, manbasi bilan)', { n: String(jami.nusxaSoni) })}</span>}
              {jami.manfiySoni > 0 && <span className="text-text-mute" data-testid="f2-tenglash-manfiy">{t('F2 dagi minus qatorlar: {n} — hujjatdagidek manfiy yoziladi.', { n: String(jami.manfiySoni) })}</span>}
              {jami.faktOrtiq.soni > 0 && <span className="text-text-mute" data-testid="f2-tenglash-fakt-ortiq">{t('Fakt F2 dan ko‘p: {n} qator ({s}) — topshirilmagan ish, o‘zgartirilmaydi.', { n: String(jami.faktOrtiq.soni), s: fmt(jami.faktOrtiq.summa) })}</span>}
              {reja.otkazildi.manfiyReja > 0 && <span className="text-text-mute">{reja.otkazildi.manfiyReja} {t('chegirma qatori o‘tkazib yuborildi')}</span>}
              {(chiqQator.size > 0 || chiqBolim.size > 0) && <span className="text-text-mute">{t('olib tashlangan: {n}', { n: String(reja.qatorlar.length - jami.paket.length) })}</span>}
              {jami.paket.length > 3000 && <span className="text-text-mute">{t('{n} ta hujjatga bo‘linadi', { n: String(qamrovBolaklari(jami.paket).length) })}</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {bolimli && <table className="fz-table mb-3 w-full text-[12px]" data-testid="f2-tenglash-bolimlar">
                <thead><tr className="border-b border-border text-left text-text-mute">
                  <th className="w-6 px-1" /><th className="px-1">{t('Bo‘lim')}</th><th className="px-1 text-right">{t('Qator')}</th><th className="px-1 text-right">{t('Summa')}</th>
                </tr></thead>
                <tbody>{jami.bolimlar.map((b) => { const chiq = chiqBolim.has(b.nom); return <tr key={b.nom} className={`border-b border-border/40 ${chiq ? 'opacity-50' : ''}`}>
                  <td className="px-1"><input type="checkbox" checked={!chiq} onChange={() => bolimAlmashtir(b.nom)} aria-label={t('Olinsin: {nom}', { nom: b.nom || t('Bo‘limsiz') })} /></td>
                  <td className="max-w-[360px] truncate px-1" title={b.nom}>{b.nom || t('Bo‘limsiz')}</td>
                  <td className="px-1 text-right tabular-nums">{b.soni}{b.narxsiz > 0 ? <span className="text-warn"> · {t('narxsiz')} {b.narxsiz}</span> : null}</td>
                  <td className="px-1 text-right">{chiq ? '—' : <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={b.ustamasiz} katKesim={b.kesim} className="items-end" />}</td>
                </tr>; })}</tbody>
              </table>}
              <table className="fz-table w-full text-[12px]">
                <thead><tr className="border-b border-border text-left text-text-mute">
                  <th className="w-6 px-1" /><th className="px-1">{t('Qator')}</th><th className="px-1 text-right">{t('Fakt')}</th><th className="px-1 text-right">F2</th>
                  <th className="px-1 text-right">{t('Qo‘shiladi')}</th><th className="px-1 text-right">{t('Summa')}</th>
                </tr></thead>
                <tbody>{korinadi.slice(0, KORSAT_CHEGARA).map((q) => { const chiq = chiqQator.has(q.id); return (
                  <tr key={q.id} className={`border-b border-border/40 ${chiq ? 'opacity-50' : ''}`} data-testid={`f2-tenglash-${q.id}`}>
                    <td className="px-1"><input type="checkbox" checked={!chiq} onChange={() => qatorAlmashtir(q.id)} aria-label={t('Olinsin: {nom}', { nom: q.nom })} /></td>
                    <td className="max-w-[320px] truncate px-1" title={q.nom}>{q.nom}{q.tur === 'ob' ? ` · ${t('uskuna')}` : q.tur === 'mat' ? ` · ${t('material')}` : ''}{q.nusxa?.length ? ` · ${t('{n} ta F2 satri', { n: String(q.nusxa.length) })}` : q.avtomatik > 0 ? ` · +${q.avtomatik} ${t('mehnat/mashina avtomatik')}` : ''}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(q.fakt)}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(q.f2)}</td>
                    <td className="px-1 text-right font-semibold tabular-nums">+{fmt(q.delta)} {q.birlik ?? ''}</td>
                    <td className="px-1 text-right tabular-nums" title={q.narxManba === 'f2' ? t('F2 narxi: {narx}', { narx: fmt(q.narx) }) : undefined}>{q.summa == null ? '—' : fmt(q.summa)}{q.narxManba === 'f2' ? <span className="ml-1 text-[10px] text-[var(--info)]">F2</span> : null}</td>
                  </tr>); })}</tbody>
              </table>
              {korinadi.length - KORSAT_CHEGARA > 0 && <p className="pt-1 text-[11px] text-text-mute">{t('yana {n} ta qator — bo‘lim jadvali bilan boshqaring', { n: String(korinadi.length - KORSAT_CHEGARA) })}</p>}
            </div>
          </>}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[12px]">
          <span className="text-text-mute">{t('Sana')}: {sana}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="fz-btn fz-btn--ghost" onClick={onYop}>{t('Bekor')}</button>
            <button type="button" className="fz-btn fz-btn--primary" disabled={!yozMumkin} onClick={() => void qollash()} aria-label={t('Qo‘llash')}>
              {band ? t('Yozilmoqda…') : urinish ? t('Faktga yozish — qayta yuborish (bir xil ID)') : t('Faktga yozish ({n})', { n: String(jami.paket.length) })} <kbd className="fz-kbd ml-1">{'Ctrl+Enter'}</kbd></button>
          </div>
        </div>
      </div>
    </div>
  );
}
