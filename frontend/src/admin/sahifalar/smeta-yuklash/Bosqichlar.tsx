import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { t } from '../../../i18n/til';
import type { Muammo, YuklashSanoq } from './xulosa';
import type { OldindanKorinish } from './korinish';

/** 3 bosqichli yo'l: Fayl tanlash → Tekshiruv → Import. `joriy` 3 bo'lsa — hammasi tayyor. */
export function YuklashQadamlari({ joriy }: { joriy: number }) {
  const nomlar = ['Fayl tanlash', 'Tekshiruv', 'Ko‘rib chiqish', 'Import', 'Natija'];
  return (
    <ol aria-label={t('Yuklash bosqichlari')} className="flex flex-wrap items-center gap-x-2 gap-y-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {nomlar.map((nom, i) => (
        <li key={nom} aria-current={i === joriy ? 'step' : undefined} className="flex items-center gap-2 text-[12.5px]"
          style={{ color: i <= joriy ? 'var(--text)' : 'var(--text-mute)', fontWeight: i === joriy ? 600 : 500 }}>
          <span className={`fz-chip ${i < joriy ? 'fz-chip--accent' : ''}`}
            style={i === joriy ? { background: 'var(--accent)', color: 'var(--on-accent)' } : undefined}>{i < joriy ? '✓' : i + 1}</span>
          {t(nom)}
          {i < nomlar.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

const IKON = { xato: XCircle, ogoh: AlertTriangle, info: Info } as const;
const SINF = { xato: 'fz-check__q--bad', ogoh: 'fz-check__q--warn', info: 'fz-check__q--ok' } as const;

/** Muammolar ro'yxati: oddiy o'zbekcha jumla, har birida «tafsilot» ochiladigan qism. */
export function MuammolarRoyxati({ muammolar, bosh }: { muammolar: readonly Muammo[]; bosh?: string }) {
  if (!muammolar.length) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-success" data-testid="muammo-yoq">
        <CheckCircle2 size={16} aria-hidden="true" />{bosh ?? t('Muammo topilmadi.')}
      </p>
    );
  }
  return (
    <ul className="fz-check" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="muammolar">
      {muammolar.map((m) => {
        const Ikon = IKON[m.ton];
        return (
          <li key={m.kalit} className={`fz-check__q ${SINF[m.ton]}`}>
            <Ikon aria-hidden="true" />
            <span className="flex-1">
              {m.matn}
              {m.tafsilot && m.tafsilot.length > 0 && (
                <details className="mt-1 text-[12px] text-text-dim">
                  <summary className="cursor-pointer">{t('tafsilot')}</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">{m.tafsilot.slice(0, 30).map((x, i) => <li key={i}>{x}</li>)}</ul>
                </details>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Qisqa xulosa: 3 ta son (bo'lim / ish / resurs). */
export function SanoqQatori({ sanoq }: { sanoq: YuklashSanoq }) {
  const q: Array<[string, number]> = [['Bo‘limlar', sanoq.bolim], ['Ishlar', sanoq.ish], ['Resurslar', sanoq.resurs]];
  return (
    <div className="fz-kpis" data-testid="yuklash-sanoq">
      {q.map(([nom, n]) => (
        <div key={nom} className="fz-kpi"><span className="fz-kpi__label">{t(nom)}</span><span className="fz-kpi__value">{n.toLocaleString('ru-RU')}</span></div>
      ))}
    </div>
  );
}

export type VaraqQatori = { nom: string; teg: string; taxmin: string };

/** Varaq tanlagichi: har varaq uchun tizim taxmini ko'rinadi, kerak bo'lsa tuzatiladi (ko'p varaqli svod / LRV fayllar). */
export function VaraqTanlagich({ varaqlar, onTanla, bosh }: {
  varaqlar: readonly VaraqQatori[]; onTanla: (nom: string, teg: 'lrv' | 'res' | 'etibor_bermaslik') => void; bosh?: boolean;
}) {
  return (
    <div className="fz-panel" data-testid="varaq-tanlagich">
      <p className="text-[12.5px] font-semibold text-text">{t('Faylda {n} ta varaq bor — tizim har birini tanidi', { n: varaqlar.length })}</p>
      <p className="text-[11.5px] text-text-mute">{t('Bir nechta «Ish va hajm» varag‘i (uchastka) belgilash mumkin — hammasi bitta smetaga qo‘shiladi. Taxmin noto‘g‘ri bo‘lsa, shu yerda tuzating.')}</p>
      <table className="fz-table">
        <tbody>
          {varaqlar.map((v) => (
            <tr key={v.nom} className="border-t border-border/40">
              <td className="py-1 pr-2">{v.nom}</td>
              <td className="py-1 pr-2 text-text-mute">{v.taxmin}</td>
              <td className="py-1">
                <select aria-label={t('{nom} — varaq turi', { nom: v.nom })} className="rounded border px-1 py-0.5" disabled={bosh}
                  value={v.teg === 'lrv' || v.teg === 'res' ? v.teg : 'etibor_bermaslik'}
                  onChange={(e) => onTanla(v.nom, e.target.value as 'lrv' | 'res' | 'etibor_bermaslik')}>
                  <option value="lrv">{t('Ish va hajm (LRV)')}</option>
                  <option value="res">{t('Narxlar (RES)')}</option>
                  <option value="etibor_bermaslik">{t('Kerak emas')}</option>
                </select>
                {v.teg === 'hamroh' && <span className="ml-2 text-[11px] text-text-mute">{t('svod / perevozka — avtomatik o‘qiladi')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Asosiy tugma doim ko'rinadigan pastki panel (sahifa uzun bo'lsa ham). */
export function YopishqoqPanel({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-3 py-2.5" data-testid="yopishqoq-panel">
      {children}
    </div>
  );
}

/** Import natijasi: nima yozildi, muammolar, keyingi qadamlar. */
export function NatijaEkrani({ qatorSoni, sanoq, muammolar, rollupXato, narxsizSoni = 0, onSmeta, onFakt, onNarxlash, onYana }: {
  qatorSoni: number; sanoq: YuklashSanoq | null; muammolar: readonly Muammo[]; rollupXato?: boolean;
  /** Narxsiz qolgan resurslar soni — keyingi qadam «narxlash» bo‘lishini aytadi. */
  narxsizSoni?: number;
  onSmeta?: () => void; onFakt?: () => void; onNarxlash?: () => void; onYana?: () => void;
}) {
  return (
    <section role="status" className="fz-panel" data-testid="yuklash-natija" style={{ borderColor: 'color-mix(in srgb, var(--ok) 45%, transparent)' }}>
      <div className="flex items-center gap-2"><span className="fz-stamp fz-stamp--ok">{t('Smeta yuklandi')}</span></div>
      <p className="text-success">{t('{n} qator tizimga yozildi.', { n: qatorSoni.toLocaleString('ru-RU') })}</p>
      {sanoq && <SanoqQatori sanoq={sanoq} />}
      {rollupXato && <p className="text-[12.5px] text-warn">{t('Jami summalar hali hisoblanmadi — «Jamlarni qayta hisoblash» tugmasini bosing.')}</p>}
      <MuammolarRoyxati muammolar={muammolar} bosh={t('Yuklashda muammo bo‘lmadi.')} />
      <div className="fz-note fz-note--info" data-testid="keyingi-qadam">
        <Info aria-hidden="true" />
        <span>
          <b>{t('Keyingi qadam:')}</b>{' '}
          {narxsizSoni > 0
            ? t('{n} ta resursga narx qo‘ying (narxlash) — shundan keyin smeta jami to‘liq bo‘ladi. So‘ng fakt (bajarilgan hajm) kiritiladi.', { n: narxsizSoni.toLocaleString('ru-RU') })
            : t('smetani ko‘zdan kechiring, so‘ng fakt (bajarilgan hajm) kiritishni boshlang.')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onSmeta && <button type="button" className="fz-btn fz-btn--primary" onClick={onSmeta}>{t('Smetani ochish')}</button>}
        {onNarxlash && narxsizSoni > 0 && <button type="button" className="fz-btn" onClick={onNarxlash}>{t('Narxlashga o‘tish')}</button>}
        {onFakt && <button type="button" className="fz-btn" onClick={onFakt}>{t('Faktga o‘tish')}</button>}
        {onYana && <button type="button" className="fz-btn" onClick={onYana}>{t('Yana fayl yuklash')}</button>}
      </div>
    </section>
  );
}

const pul = (x: number | null) => (x == null ? '—' : x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** «Ko‘rib chiqish»: jami (QQS bilan birinchi), ustama podvali topildimi. Noma’lum summa — «—», hech qachon 0 emas. */
export function JamiKorinish({ k }: { k: OldindanKorinish }) {
  const podvalMatn = k.podval === 'topildi' ? t('topildi ({n} ta foiz)', { n: k.podvalFoizSoni })
    : k.podval === 'qisman' ? t('qisman topildi ({n} ta foiz)', { n: k.podvalFoizSoni }) : t('topilmadi');
  return (
    <div className="fz-kpis" data-testid="yuklash-jami">
      <div className="fz-kpi">
        <span className="fz-kpi__label">{k.faylVsego != null ? t('Fayldagi jami (QQS bilan)') : t('Resurslar jami (QQS {f}% bilan)', { f: k.qqsFoiz })}</span>
        <span className="fz-kpi__value">{pul(k.faylVsego != null ? k.faylVsego : k.resursQqsBilan)}</span>
      </div>
      <div className="fz-kpi">
        <span className="fz-kpi__label">{t('Resurslar yig‘indisi (ustamasiz, QQS siz)')}</span>
        <span className="fz-kpi__value">{pul(k.resursSumma)}</span>
      </div>
      <div className="fz-kpi">
        <span className="fz-kpi__label">{t('Ustama podvali')}</span>
        <span className="fz-kpi__value" style={{ fontSize: 13 }}>{podvalMatn}</span>
      </div>
      {k.pryamyeFarq != null && (
        <div className="fz-kpi" data-testid="pryamye-farq">
          <span className="fz-kpi__label">{t('Fayldagi «to‘g‘ridan-to‘g‘ri xarajat» bilan farq')}</span>
          <span className="fz-kpi__value" style={{ fontSize: 14, ...(k.pryamyeFarq.daraja === 'tasdiq' ? { color: 'var(--danger)' } : k.pryamyeFarq.daraja === 'ogoh' ? { color: 'var(--warn)' } : {}) }}>{pul(k.pryamyeFarq.farq)}</span>
        </div>
      )}
    </div>
  );
}

/** Faylda «Ish va hajm» varag‘i topilmadi: foydalanuvchi qotib qolmasin — sabab, varaqlar va chiqish yo‘li. */
export function IshVarogiTopilmadi({ varaqlar, onYana, children }: { varaqlar: readonly string[]; onYana: () => void; children?: ReactNode }) {
  return (
    <section className="fz-panel" role="alert" data-testid="lrv-topilmadi">
      <div className="flex items-center gap-2"><span className="fz-stamp fz-stamp--warn">{t('Ish va hajm varag‘i topilmadi')}</span></div>
      <p className="text-[13px]">{t('Bu faylda ishlar va hajmlar jadvali (LRV) topilmadi. Faylda {n} ta varaq bor: {nomlar}.', { n: varaqlar.length, nomlar: varaqlar.slice(0, 8).join(', ') || '—' })}</p>
      <p className="text-[12px] text-text-mute">{t('Bu svod, titul yoki dastur sarlavhasi bo‘lishi mumkin. Agar ish va hajmlar boshqa faylda bo‘lsa — o‘shani tanlang. Varaq turini o‘zingiz belgilash uchun quyida ro‘yxat bor.')}</p>
      {children}
      <div className="flex flex-wrap gap-2"><button type="button" className="fz-btn fz-btn--primary" onClick={onYana}>{t('Boshqa fayl tanlash')}</button></div>
    </section>
  );
}
