/**
 * Tizim xaritasi — tanlangan tugun paneli: holat, oxirgi amal, xatolar, navbat va tegishli sahifalarga havolalar.
 * Hech narsa tanlanmagan bo'lsa — ildiz (butun tizim yoki kompaniya) umumiy holati.
 * Sonlar kelmagan joyda «—» (0 emas); manbasi yo'q navbat — «navbat manbai yo‘q».
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Info, X } from 'lucide-react';
import type { TizimFaolObyekt, TizimMeta, TizimModulKod } from '../../../api/t2-tizim-xaritasi';
import { t } from '../../../i18n/til';
import type { XDaraxt, XTugun } from '../../../lib/mindmap-korinish';
import { MODUL_YOLI, modulNomi, oldin } from '../../../lib/tizim-xaritasi';
import { Romb } from '../../../components/mindmap/belgilar';
import { holatNomi } from '../../../components/mindmap/holat';

const son = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '—');

function Raqam({ nom, qiymat, izoh, ogoh = false }: { nom: string; qiymat: string; izoh?: string; ogoh?: boolean }) {
  return (
    <div className="fz-kpi min-w-0">
      <span className="fz-kpi__label">{nom}</span>
      <span className={'fz-kpi__value text-[17px] leading-6 ' + (ogoh ? 'text-danger' : '')}>{qiymat}</span>
      {izoh ? <span className="fz-kpi__sub">{izoh}</span> : null}
    </div>
  );
}

function Havola({ to, matn }: { to: string; matn: string }) {
  return (
    <Link to={to} className="fz-btn fz-btn--sm justify-start no-underline">
      <span className="truncate">{matn}</span>
      <ExternalLink aria-hidden className="ml-auto opacity-60" />
    </Link>
  );
}

function Sarlavha({ x, nom, onYop }: { x: XTugun; nom: string; onYop?: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <Romb holat={x.holat} olcham={11} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[16px] font-semibold text-text">{nom}</h2>
        <p className="text-[12px] text-text-dim">{holatNomi(x.holat)}</p>
      </div>
      {onYop ? (
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={onYop} aria-label={t('Yopish')}><X /></button>
      ) : null}
    </div>
  );
}

function BolalarRoyxati({ d, x, onTanla }: { d: XDaraxt; x: XTugun; onTanla: (id: string) => void }) {
  const bolalar = x.bolalar.map((id) => d.tugunlar.get(id)!).filter(Boolean);
  if (!bolalar.length) return null;
  return (
    <ul className="space-y-1" data-testid="tizim-bolalar">
      {bolalar.map((b) => (
        <li key={b.id}>
          <button type="button" onClick={() => onTanla(b.id)}
            className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--surface-2)]">
            <Romb holat={b.holat} olcham={8} />
            <span className="min-w-0 flex-1 truncate">{b.tur === 'modul' ? modulNomi(b.tizim?.meta.modul) : b.nom}</span>
            <span className="text-[11.5px] text-text-mute">{holatNomi(b.holat)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FaolObyektlar({ qatorlar }: { qatorlar: TizimFaolObyekt[] }) {
  if (!qatorlar.length) return <p className="text-[12px] text-text-mute">{t('7 kunda obyekt bo‘yicha amal yo‘q')}</p>;
  return (
    <ul className="space-y-1">
      {qatorlar.map((o) => (
        <li key={o.id} className="flex items-center gap-2 text-[12.5px]">
          <Link to={`/admin/holat/${o.id}`} className="min-w-0 flex-1 truncate underline decoration-dotted">{o.nom}</Link>
          <span className="font-mono text-[11.5px] text-text-dim" title={t('7 kundagi amallar')}>{o.soni_7k}</span>
          {o.ochiq_signal > 0 ? <span className="fz-chip fz-chip--warn text-[11px]">{t('{n} signal', { n: o.ochiq_signal })}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ModulTafsilot({ m }: { m: TizimMeta }) {
  const oa = m.oxirgi_amal ?? null;
  const xatolar = Array.isArray(m.xatolar) ? m.xatolar : [];
  const kod = m.modul as TizimModulKod | undefined;
  const xatoBor = (m.xato_24s ?? 0) > 0;
  const qotganBor = (m.navbat_qotgan ?? 0) > 0;
  return (
    <>
      <section className="fz-panel">
        <div className="fz-panel__h"><span>{t('Oxirgi amal')}</span></div>
        {oa ? (
          <div className="space-y-0.5 text-[13px]" data-testid="tizim-oxirgi-amal">
            <p><b>{oa.amal ?? '—'}</b>{oa.matn ? ' — ' + oa.matn : ''}</p>
            <p className="text-[12px] text-text-dim">{oldin(oa.vaqt)} · {oa.kim_nom || oa.kim || t('tizim')}</p>
          </div>
        ) : <p className="text-[12.5px] text-text-mute">{t('7 kunda amal yo‘q')}</p>}
      </section>
      <div className="grid grid-cols-3 gap-3">
        <Raqam nom={t('24 soat')} qiymat={son(m.soni_24s)} izoh={t('7 kun: {n}', { n: son(m.soni_7k) })} />
        <Raqam nom={t('Xatolar (24 soat)')} qiymat={son(m.xato_24s)} ogoh={xatoBor} />
        <Raqam nom={t('Ochiq signal')} qiymat={son(m.ochiq_signal)} izoh={t('{n} kritik', { n: son(m.kritik_signal) })} />
      </div>
      <section className="fz-panel">
        <div className="fz-panel__h"><span>{t('Navbat')}</span></div>
        {m.navbat == null
          ? <p className="text-[12.5px] text-text-mute">{t('Bu modulda navbat manbai yo‘q')}</p>
          : (
            <p className="text-[13px]">
              {t('{n} ta ish navbatda', { n: son(m.navbat) })}
              {qotganBor ? <span className="text-warn">{' · ' + t('{n} tasi 1 soatdan beri qotgan', { n: son(m.navbat_qotgan) })}</span> : null}
              {m.navbat_eng_eski ? <span className="block text-[12px] text-text-dim">{t('eng eskisi: {v}', { v: oldin(m.navbat_eng_eski) })}</span> : null}
            </p>
          )}
      </section>
      {xatolar.length > 0 ? (
        <section className="fz-panel" data-testid="tizim-xatolar">
          <div className="fz-panel__h"><span>{t('Oxirgi xatolar')}</span></div>
          <ul className="space-y-1.5">
            {xatolar.map((x, i) => (
              <li key={i} className="fz-note fz-note--danger text-[12.5px]">
                <AlertTriangle aria-hidden />
                <span className="min-w-0 flex-1 break-words">{x.matn}<span className="block text-[11.5px] opacity-80">{oldin(x.vaqt)}</span></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {kod && MODUL_YOLI[kod] ? <Havola to={MODUL_YOLI[kod]} matn={t('{m} sahifasini ochish', { m: modulNomi(kod) })} /> : null}
    </>
  );
}

function PlatformaTafsilot({ m }: { m: TizimMeta }) {
  const qatorlar = Array.isArray(m.qatorlar) ? m.qatorlar : [];
  const kalitlar = ['main_sha', 'frontend_deploy_id', 'gas_deploy_version', 'db_migration_head', 'updated_at'];
  if (!qatorlar.length) {
    return (
      <dl className="space-y-1 text-[12.5px]">
        {kalitlar.filter((k) => m[k] != null).map((k) => (
          <div key={k} className="flex gap-2"><dt className="text-text-dim">{k}</dt><dd className="min-w-0 flex-1 truncate font-mono">{String(m[k])}</dd></div>
        ))}
      </dl>
    );
  }
  return (
    <ul className="space-y-1.5 text-[12.5px]">
      {qatorlar.map((q, i) => (
        <li key={i} className="rounded-[var(--radius-sm)] border border-border px-2 py-1.5">
          <b>{String(q.nom ?? q.kod ?? '—')}</b> · <span className="text-text-dim">{String(q.holat ?? '—')}</span>
          {q.xato || q.last_error ? <span className="block text-danger">{String(q.xato ?? q.last_error)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function TizimPanel({ d, tanlangan, onTanla, malumotYoq }: {
  d: XDaraxt; tanlangan: string | null; onTanla: (id: string | null) => void; malumotYoq: readonly string[];
}) {
  const x = d.tugunlar.get(tanlangan ?? '') ?? d.tugunlar.get(d.ildiz);
  if (!x || !x.tizim) return <p className="p-4 text-[13px] text-text-mute">{t('Ma’lumot yo‘q.')}</p>;
  const m = x.tizim.meta;
  const ildizmi = x.id === d.ildiz;
  const nom = x.tur === 'tizim' ? t('Tizim') : x.tur === 'modul' ? modulNomi(m.modul) : x.nom;
  const otaNom = x.tur === 'modul' && x.ota ? d.tugunlar.get(x.ota)?.nom : null;
  const yoqNomi: Record<string, string> = { integratsiya: t('Integratsiya holati'), deploy: t('Deploy holati'), ishlar: t('Fon ishlari') };
  return (
    <div className="space-y-3 p-4" data-testid="tizim-panel">
      <Sarlavha x={x} nom={nom} onYop={ildizmi ? undefined : () => onTanla(null)} />
      {otaNom ? <p className="-mt-2 text-[12px] text-text-dim">{otaNom}</p> : null}

      {(x.tur === 'tizim' || x.tur === 'kompaniya') ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {x.tur === 'tizim'
              ? <Raqam nom={t('Kompaniyalar')} qiymat={son(m.kompaniya_soni)} izoh={t('jami {n}', { n: son(m.kompaniya_jami) })} />
              : <Raqam nom={t('Oxirgi faollik')} qiymat={m.oxirgi_faollik ? oldin(m.oxirgi_faollik) : '—'} />}
            <Raqam nom={t('Obyektlar')} qiymat={son(m.obyekt_soni)} />
            <Raqam nom={t('Ochiq signal')} qiymat={son(m.ochiq_signal)} izoh={t('{n} kritik', { n: son(m.kritik_signal) })} />
            <Raqam nom={t('Xatolar (24 soat)')} qiymat={son(m.xato_24s)} ogoh={(m.xato_24s ?? 0) > 0} />
            <Raqam nom={t('Navbatdagi ishlar')} qiymat={son(m.navbat)}
              izoh={typeof m.sinxron_navbat === 'number' && m.sinxron_navbat > 0 ? t('{n} tasi hujjat sinxroni', { n: m.sinxron_navbat }) : undefined} />
          </div>
          <section className="fz-panel">
            <div className="fz-panel__h"><span>{x.tur === 'tizim' ? t('Kompaniyalar va platforma') : t('Modullar')}</span></div>
            <BolalarRoyxati d={d} x={x} onTanla={onTanla} />
          </section>
          {x.tur === 'kompaniya' ? (
            <section className="fz-panel">
              <div className="fz-panel__h"><span>{t('Eng faol obyektlar (7 kun)')}</span></div>
              <FaolObyektlar qatorlar={Array.isArray(m.faol_obyektlar) ? m.faol_obyektlar : []} />
            </section>
          ) : null}
          {x.tur === 'tizim' && malumotYoq.length > 0 ? (
            <div className="fz-note fz-note--info text-[12.5px]" data-testid="tizim-malumot-yoq">
              <Info aria-hidden />
              <span>{malumotYoq.map((k) => yoqNomi[k] ?? k).join(', ') + ': ' + t('ma’lumot yo‘q')}</span>
            </div>
          ) : null}
          {x.tur === 'kompaniya' ? (
            <div className="grid gap-1.5">
              <Havola to="/admin/system-control" matn={t('Integratsiyalar va audit')} />
              <Havola to="/admin/mindmap" matn={t('Kompaniya xaritasi')} />
              <p className="text-[11.5px] text-text-mute">{t('Havolalar joriy tanlangan kompaniya kontekstida ochiladi.')}</p>
            </div>
          ) : null}
        </>
      ) : null}

      {x.tur === 'modul' ? <ModulTafsilot m={m} /> : null}
      {x.tur === 'platforma' ? <PlatformaTafsilot m={m} /> : null}
    </div>
  );
}
