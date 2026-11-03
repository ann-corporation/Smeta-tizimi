/**
 * Rahbar paneli §6 (tahlil yorliqlari) va §7 (obyekt paneli). Raqamlar — server paketi; hisob yo'q.
 * Manbasi tizimda hali yo'q bo'limlar (yetkazuvchilar, haqiqiy xarajat, jamoa) — «kiritilmagan» deb aniq aytiladi.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { useRahbarPanel, type RahbarPanel } from '../../api/t2-rahbar-panel';
import { resursJadvali, subpudratchilar, type Davr, type ResursKalit } from '../../lib/rahbar-panel/markaz';
import { DiqqatRoyxati, PulOqimi, RahbarKartalar, TasdiqNavbati } from './RahbarMarkaz';

const KESIM_NOM: Record<ResursKalit, () => string> = {
  chel: () => 'ЧЕЛ', mash: () => 'МАШ', mat: () => 'МАТ', ob: () => 'ОБ',
  subpudrat: () => t('Subpudrat / maxsus ishlar'), svod: () => t('Svod («письмо»), ustamasiz'),
  ustamasiz: () => t('Boshqa ustamasiz (bojxona va h.k.)'), nomalum: () => t('Kategoriyasi noma’lum'),
};
const Pul = ({ v }: { v: number | null | undefined }) => (v == null ? <span className="text-text-mute">—</span> : <FmtN val={v} />);

export function ResursTahlili({ p }: { p: RahbarPanel }) {
  const smeta = p.kartalar.portfel.smeta, fakt = p.fakt, f2 = p.kartalar.bajarildi.jami;
  const qatorlar = resursJadvali(smeta, fakt, f2);
  return (
    <div className="fz-table-wrap" data-testid="resurs-tahlili">
      <table className="fz-table min-w-[640px]">
        <thead><tr>
          <th>{t('Resurs (to‘g‘ri xarajat)')}</th><th className="fz-c-num">{t('Smeta')}</th><th className="fz-c-num">{t('Fakt')}</th>
          <th className="fz-c-num">{t('Tasdiqlangan F2')}</th><th className="fz-c-num">{t('F2 / smeta')}</th><th className="fz-c-num">{t('Haqiqiy xarajat')}</th>
        </tr></thead>
        <tbody>
          {qatorlar.map((q) => (
            <tr key={q.kalit}>
              <td>{KESIM_NOM[q.kalit]()}</td>
              <td className="fz-c-num"><Pul v={q.smeta} /></td><td className="fz-c-num"><Pul v={q.fakt} /></td><td className="fz-c-num"><Pul v={q.f2} /></td>
              <td className="fz-c-num">{q.f2Foiz != null ? `${q.f2Foiz}%` : '—'}</td>
              <td className="fz-c-num text-text-mute">{t('kiritilmagan')}</td>
            </tr>
          ))}
          <tr className="fz-row-total">
            <td>{t('chel-soat / mash-soat')}</td>
            <td className="fz-c-num">{smeta ? <><FmtN val={smeta.soat.chel} /> / <FmtN val={smeta.soat.mash} /></> : '—'}</td>
            <td className="fz-c-num">{fakt ? <><FmtN val={fakt.soat.chel} /> / <FmtN val={fakt.soat.mash} /></> : '—'}</td>
            <td className="fz-c-num">{f2 ? <><FmtN val={f2.soat.chel} /> / <FmtN val={f2.soat.mash} /></> : '—'}</td>
            <td /><td />
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11.5px] text-text-mute">{t('Haqiqiy xarajat (sklad kirim narxi, 1C prixod, ish haqi) tizimga hali kiritilmagan — shu ustun to‘ladi.')}</p>
    </div>
  );
}

export function SubpudratTahlili({ p }: { p: RahbarPanel }) {
  const royxat = subpudratchilar(p.kartalar.portfel.smeta, p.kartalar.bajarildi.jami);
  if (royxat.length === 0) {
    return <p className="p-4 text-[13px] text-text-dim" data-testid="subpudrat-bosh">{t('Subpudrat qatorlari hali belgilanmagan. Smeta qatorini «subpudrat» deb belgilasangiz (kontragent bilan), u bu yerda ustamasiz ko‘rinadi.')}</p>;
  }
  return (
    <div className="fz-table-wrap" data-testid="subpudrat-tahlili">
      <table className="fz-table min-w-[560px]">
        <thead><tr>
          <th>{t('Kontragent')}</th><th className="fz-c-num">{t('Smeta (shartnoma qismi)')}</th><th className="fz-c-num">{t('Bajarilgan (F2)')}</th>
          <th className="fz-c-num">{t('To‘langan')}</th><th className="fz-c-num">{t('Qarz')}</th>
        </tr></thead>
        <tbody>{royxat.map((x) => (
          <tr key={x.kontragent}>
            <td>{x.kontragent}</td><td className="fz-c-num"><Pul v={x.smeta} /></td><td className="fz-c-num"><Pul v={x.f2} /></td>
            <td className="fz-c-num text-text-mute">{t('kiritilmagan')}</td><td className="fz-c-num text-text-mute">{t('kiritilmagan')}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

const MANBA_YOQ: Record<'yetkazuvchi' | 'jamoa', () => string> = {
  yetkazuvchi: () => t('Yetkazuvchilar bo‘yicha kirim (C11 sklad) va to‘lovlar tizimga ulangach shu yerda: kirim · to‘langan · qarz.'),
  jamoa: () => t('Kim qancha fakt / F2 kiritgani va kechikkan vazifalar (mindmap mas’ullari) — keyingi bosqichda ulanadi.'),
};

type Yorliq = 'resurs' | 'subpudrat' | 'yetkazuvchi' | 'jamoa';

/** §6 Tahlil yorliqlari. */
export function TahlilYorliqlari({ p }: { p: RahbarPanel }) {
  const [y, setY] = useState<Yorliq>('resurs');
  const yorliqlar: Array<[Yorliq, string]> = [['resurs', t('Resurslar')], ['subpudrat', t('Subpudratchilar')], ['yetkazuvchi', t('Yetkazuvchilar')], ['jamoa', t('Jamoa')]];
  return (
    <section className="fz-card" aria-label={t('Tahlil')}>
      <div className="fz-card__head flex-wrap gap-2">
        <h2 className="fz-card__title">{t('Tahlil')}</h2>
        <div role="tablist" className="inline-flex flex-wrap gap-1">
          {yorliqlar.map(([k, nom]) => (
            <button key={k} type="button" role="tab" aria-selected={y === k} onClick={() => setY(k)}
              className={`fz-btn fz-btn--sm ${y === k ? 'fz-btn--primary' : 'fz-btn--ghost'}`}>{nom}</button>
          ))}
        </div>
      </div>
      {y === 'resurs' && <ResursTahlili p={p} />}
      {y === 'subpudrat' && <SubpudratTahlili p={p} />}
      {(y === 'yetkazuvchi' || y === 'jamoa') && <p className="p-4 text-[13px] text-text-dim" data-testid={`tahlil-${y}`}>{t('kiritilmagan')} — {MANBA_YOQ[y]()}</p>}
    </section>
  );
}

/** §7 Obyekt paneli (drill-down): xuddi shu tuzilma bitta obyekt uchun. */
export function ObyektPaneli({ kompaniyaId, obyektId, nom, davr, onYop }: {
  kompaniyaId: number; obyektId: number; nom: string; davr: Davr; onYop: () => void;
}) {
  const q = useRahbarPanel(kompaniyaId, davr, obyektId);
  const p = q.data && q.data.kartalar?.tolandi && Array.isArray(q.data.pul_oqimi?.oylar) ? q.data : null;
  return (
    <section className="fz-card border-2 border-accent/40" aria-label={`${t('Obyekt paneli')}: ${nom}`} data-testid="obyekt-paneli">
      <div className="fz-card__head">
        <div className="min-w-0">
          <h2 className="fz-card__title truncate">{nom}</h2>
          <p className="fz-card__sub"><Link to={`/admin/holat/${obyektId}?obyekt=${obyektId}`} className="underline">{t('Obyekt sahifasini ochish')}</Link></p>
        </div>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={onYop} aria-label={t('Yopish')}><X size={14} /></button>
      </div>
      <div className="fz-card__body flex flex-col gap-4">
        {q.isPending && <p className="text-text-mute">{t('Hisoblanmoqda…')}</p>}
        {q.isError && <p role="alert" className="text-danger">{t('Obyekt paneli yuklanmadi.')}</p>}
        {p && <>
          <RahbarKartalar p={p} />
          <PulOqimi p={p} />
          <div className="grid gap-4 xl:grid-cols-2">
            <DiqqatRoyxati diqqat={p.diqqat} />
            <TasdiqNavbati royxat={p.tasdiq_kutmoqda} obyektNomi={() => nom} />
          </div>
          <ResursTahlili p={p} />
        </>}
      </div>
    </section>
  );
}
