import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TilChegarasi, TilTanlagich } from '../i18n/TilTanlagich';
import { useTil } from '../i18n/til';
import { paketdanHolatlar, paketdanQatorlar, type Paket } from '../ombor/paket';
import { SummaJuft } from '../umumiy/ui/SummaJuft';
import { QiymatUchlik } from '../umumiy/ui/QiymatUchlik';
import { summaPaket } from '../lib/summa-paket';
import { nativeInvoke } from './fetch-shim';
import { base64urlDecode } from './offline-lease';
import { DesktopOfflineRuntime, type DesktopOpenedPacket } from './offline-runtime';
import './offline-panel.css';

type ObjectItem = { id: number; nom: string | null };
function DesktopOfflinePanel() {
  const { t } = useTil();
  const [shown, setShown] = useState(false), [busy, setBusy] = useState(false);
  const [companies, setCompanies] = useState<number[]>([]), [company, setCompany] = useState(0);
  const [objects, setObjects] = useState<ObjectItem[]>([]), [opened, setOpened] = useState<DesktopOpenedPacket>();
  const [error, setError] = useState('');
  const launcher = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDivElement>(null);
  const runtime = useMemo(() => {
    let key = new Uint8Array();
    try { key = base64urlDecode(import.meta.env.VITE_DESKTOP_LEASE_PK ?? ''); } catch { /* missing pin closes offline access */ }
    return new DesktopOfflineRuntime({ invoke: nativeInvoke, request: window.fetch.bind(window), publicKey: key,
      kid: import.meta.env.VITE_DESKTOP_LEASE_KID ?? '', onInvalidate: () => setOpened(undefined) });
  }, []);
  useEffect(() => () => runtime.dispose(), [runtime]);
  useEffect(() => {
    if (!shown) return;
    let current = true;
    void (async () => {
      try {
        const response = await fetch('/api/sessiya');
        if (response.status === 401 || response.status === 403) { await runtime.revoke(); throw new Error(); }
        if (!response.ok) throw new Error();
        const session = await response.json();
        const ids = (session.kompaniyalar ?? []).map((c: { kompaniya_id: number }) => c.kompaniya_id).filter((n: number) => Number.isSafeInteger(n) && n > 0);
        if (current) { setCompanies(ids); setCompany(ids[0] ?? 0); }
      } catch {
        try { const ids = await runtime.companies(); if (current) { setCompanies(ids); setCompany(ids[0] ?? 0); } }
        catch { if (current) setError(t('Avval tizimga kiring.')); }
      }
    })();
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { current = false; };
  }, [shown, runtime, t]);
  useEffect(() => {
    if (!shown || !company) return;
    let current = true; setObjects([]); setOpened(undefined); setError('');
    void (async () => {
      try {
        const response = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jadval: 't2_obyekt_jami', filtr: 'kompaniya_id=eq.' + company, ustunlar: 'id,nom,kompaniya_id', tartib: 'nom.asc', limit: 5000 }) });
        if (response.status === 401 || response.status === 403) { await runtime.revoke(); throw new Error(); }
        const body = await response.json();
        if (!response.ok || body.ok !== true || !Array.isArray(body.qatorlar)) throw new Error();
        const rows = body.qatorlar.filter((r: { id: number; kompaniya_id: number }) => Number.isSafeInteger(r.id) && r.id > 0 && r.kompaniya_id === company);
        if (current) setObjects(rows);
      } catch {
        try { const rows = await runtime.cachedObjects(company); if (current) setObjects(rows); }
        catch { if (current) setError(t('Oflayn ruxsat yoki saqlangan obyekt topilmadi.')); }
      }
    })();
    return () => { current = false; };
  }, [company, shown, runtime, t]);
  const close = () => { runtime.dispose(); setOpened(undefined); setShown(false); launcher.current?.focus(); };
  async function openObject(id: number) {
    setBusy(true); setError('');
    try { setOpened(await runtime.open(company, id)); }
    catch { setOpened(undefined); setError(t('Obyektni ochib boʻlmadi. Ruxsat va aloqani tekshiring.')); }
    finally { setBusy(false); }
  }
  return <>
    <button className="desktop-offline-launch" ref={launcher} onClick={() => setShown(true)}>{t('Oflayn obyektlar')}</button>
    {shown && <div className="desktop-offline-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={t('Oflayn obyektlar')}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key === 'Tab') {
          const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href]');
          if (!elements?.length) return;
          const first = elements[0], last = elements[elements.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }}>
      <header><strong>{t('Oflayn obyektlar')}</strong><TilTanlagich /><button onClick={close}>{t('Yopish')}</button></header>
      <div className="desktop-offline-layout">
        <aside>
          <label>{t('Ish joyi')} <select aria-label={t('Ish joyi')} value={company} disabled={busy} onChange={e => setCompany(Number(e.target.value))}>
            {companies.map(id => <option key={id} value={id}>{t('Ish joyi #{id}', { id })}</option>)}
          </select></label>
          <nav aria-label={t('Obyektlar')}>
            {objects.map(o => <button key={o.id} disabled={busy} aria-pressed={opened?.paket.obyekt_id === o.id} onClick={() => void openObject(o.id)}>{o.nom ?? t('Obyekt #{id}', { id: o.id })}</button>)}
          </nav>
          <p>{t('Oflayn rejimda faqat oʻqish mumkin.')}</p>
          <button onClick={() => { void runtime.revoke().finally(close); }}>{t('Qurilmadan chiqish')}</button>
        </aside>
        <section aria-busy={busy}>
          {error && <p role="alert">{error}</p>}
          {busy && <p role="status">{t('Yuklanmoqda…')}</p>}
          {!opened && !busy && <p>{t('Obyektni tanlang.')}</p>}
          {opened && <>
            <div className="desktop-offline-status" role="status">
              <strong>{opened.offline ? t('Oflayn · saqlangan nusxa') : t('Server tasdiqlagan nusxa')}</strong>
              <span>{t('Ruxsat muddati: {sana}', { sana: new Date(opened.leaseUntil).toLocaleString() })}</span>
              <button disabled={busy} onClick={() => void openObject(opened.paket.obyekt_id)}>{t('Yangilash')}</button>
            </div>
            <PacketReadView paket={opened.paket} />
          </>}
        </section>
      </div>
    </div>}
  </>;
}

function PacketReadView({ paket }: { paket: Paket }) {
  const { t } = useTil();
  const [tab, setTab] = useState<'smeta' | 'fakt' | 'f2' | 'holat'>('smeta'), [page, setPage] = useState(0);
  const rows = useMemo(() => paketdanQatorlar(paket), [paket]);
  const states = useMemo(() => new Map(paketdanHolatlar(paket).map(h => [h.qator_id, h])), [paket]);
  const amount = (v: number | null | undefined) => v == null ? t('Nomaʼlum') : v.toLocaleString();
  return <>
    <h2>{paket.obyekt_nom ?? t('Obyekt #{id}', { id: paket.obyekt_id })}</h2>
    <div className="desktop-offline-tabs" role="tablist">
      {(['smeta', 'fakt', 'f2', 'holat'] as const).map(v => <button role="tab" key={v} aria-selected={tab === v} onClick={() => { setTab(v); setPage(0); }}>
        {v === 'smeta' ? t('Smeta') : v === 'fakt' ? t('Fakt') : v === 'f2' ? t('F2') : t('Holat')}
      </button>)}
    </div>
    <SummaJuft paket={summaPaket(paket.meta.summa_paket)} kesimYoq />
    {tab !== 'f2' ? <>
      <div className="desktop-offline-table"><table><thead><tr><th>{t('Shifr')}</th><th>{t('Nomi')}</th><th>{t('Birlik')}</th><th>{t('Smeta hajmi')}</th><th>{tab === 'fakt' ? t('Fakt hajmi') : t('Qoldiq hajmi')}</th></tr></thead>
        <tbody>{rows.slice(page * 150, (page + 1) * 150).map(q => <tr key={q.id}><td>{q.kod}</td><td>{q.nom}</td><td>{q.birlik}</td><td>{amount(q.hajm)}</td><td>{amount(tab === 'fakt' ? states.get(q.id)?.fakt_hajm : states.get(q.id)?.qoldiq_hajm)}</td></tr>)}</tbody>
      </table></div>
      <footer><button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('Oldingi')}</button><span>{t('{son} qator', { son: rows.length })}</span><button disabled={(page + 1) * 150 >= rows.length} onClick={() => setPage(page + 1)}>{t('Keyingi')}</button></footer>
    </> : <>
      <ul>{paket.f2.map(akt => <li key={akt.akt_id}>{akt.raqam ?? akt.akt_id} · {akt.oy} · {akt.holat}</li>)}</ul>
      <details><summary>{t('F2 hujjatlarining oʻz podvali')}</summary>
        {(paket.meta.akt_podval as Array<{ akt_id?: number; nk?: Record<string, number | null>; hujjat_vsego?: number | null; hujjat_itogo4?: number | null; hujjat_pryamye?: number | null }>).map((podval, index) => <section key={index}>
          <h3>{t('Akt #{id}', { id: podval.akt_id ?? t('Nomaʼlum') })}</h3>
          <QiymatUchlik q={{ qqsBilan: podval.hujjat_vsego ?? null, ustamali: podval.hujjat_itogo4 ?? null,
            ustamasiz: podval.hujjat_pryamye ?? null, taxminiy: false, nomalum: 0,
            sabab: podval.hujjat_vsego == null ? 'SUMMA_YOQ' : null }} tafsilYoq />
          <dl>{Object.entries(podval.nk ?? {}).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{amount(value)}</dd></div>)}</dl>
        </section>)}
      </details>
    </>}
  </>;
}

export function mountDesktopOfflinePanel() {
  if (document.getElementById('desktop-offline-root')) return;
  const host = document.createElement('div'); host.id = 'desktop-offline-root'; document.body.append(host);
  createRoot(host).render(<TilChegarasi><DesktopOfflinePanel /></TilChegarasi>);
}
