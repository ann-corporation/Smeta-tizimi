import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import './hujjat-korinish.css';
import { Download, Search, X } from 'lucide-react';
import { hujjatKorinishi, type KorinishQator, type KorinishVaraq } from '../../lib/hujjat-yozuvchi';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';

/**
 * Hujjatni saytda AYNAN hujjatdagiday ko'rish (egasi, 2026-09-25): "hamma hujjatni
 * saytda har bir qatorini aynan hujjatdagiday qulay ko'ra olishimiz, tushuna
 * olishimiz, ajrata olishimiz kerak".
 *
 * Manba — yuklab olinadigan faylning o'zi (ikkinchi haqiqat yo'q): qatorlar,
 * birlashmalar, ustun kengligi, qalin shrift, son formatlari; yashirin texnik
 * ustunlar ko'rinmaydi. Qidiruv, "faqat bo'lim va jamilar", katta hujjatda
 * sahifalash.
 */
const SAHIFA = 400;

export function HujjatKorinish({ bytes, faylNomi, onClose }: { bytes: Uint8Array; faylNomi: string; onClose: () => void }) {
  const varaqlar = useMemo<KorinishVaraq[]>(() => { try { return hujjatKorinishi(bytes); } catch { return []; } }, [bytes]);
  const [vi, setVi] = useState(0);
  const [qidiruv, setQidiruv] = useState('');
  const [faqatJami, setFaqatJami] = useState(false);
  const [sahifa, setSahifa] = useState(0);
  const v = varaqlar[vi];
  const oyna = useRef<HTMLDivElement>(null);
  // Esc yopadi, fokus oynada qoladi (Tab aylanadi) va yopilganda avvalgi elementga qaytadi.
  useEffect(() => {
    const oldingi = document.activeElement as HTMLElement | null;
    oyna.current?.focus();
    const tugma = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !oyna.current) return;
      const el = [...oyna.current.querySelectorAll<HTMLElement>('input,button,select,a[href],[tabindex]:not([tabindex="-1"])')].filter(x => !(x as HTMLButtonElement).disabled);
      if (!el.length) return;
      if (e.shiftKey && (document.activeElement === el[0] || document.activeElement === oyna.current)) { e.preventDefault(); el[el.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === el[el.length - 1]) { e.preventDefault(); el[0].focus(); }
    };
    document.addEventListener('keydown', tugma, true);
    return () => { document.removeEventListener('keydown', tugma, true); oldingi?.focus?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { yuqori, bosh, malumot } = useMemo(() => {
    if (!v) return { yuqori: [] as KorinishQator[], bosh: [] as KorinishQator[], malumot: [] as KorinishQator[] };
    const chegara = v.raqamQatori ?? 0;
    const hammasi = v.qatorlar.filter((q) => q.r <= chegara);
    // Jadval sarlavhasi — raqamlash qatoridan yuqoriga bo'sh qatorgacha (sticky);
    // undan yuqorisi — hujjat nomi va titul (Объект, Заказчик…).
    let k = hammasi.length - 1;
    while (k > 0 && hammasi[k - 1].turi !== 'bosh') k--;
    const b = chegara ? hammasi.slice(k) : [];
    const y = chegara ? hammasi.slice(0, k) : hammasi;
    let m = v.qatorlar.filter((q) => q.r > chegara);
    const f = qidiruv.trim().toLowerCase();
    if (faqatJami) m = m.filter((q) => q.turi === 'bolim' || q.turi === 'jami');
    if (f) m = m.filter((q) => q.turi === 'bolim' || q.kataklar.some((k) => k.matn.toLowerCase().includes(f)));
    return { yuqori: y, bosh: b, malumot: m };
  }, [v, qidiruv, faqatJami]);

  const sahifalar = Math.max(1, Math.ceil(malumot.length / SAHIFA));
  const korinadigan = malumot.slice(sahifa * SAHIFA, sahifa * SAHIFA + SAHIFA);

  if (!v) {
    return (
      <div role="dialog" aria-modal="true" aria-label={t('Hujjatni ko‘rish')} className="hk-overlay hk-overlay--center">
        <div ref={oyna} tabIndex={-1} className="fz-note fz-note--warn">{t('Hujjatni ko‘rsatib bo‘lmadi.')} <button onClick={onClose} className="fz-btn fz-btn--sm">{t('Yopish')}</button></div>
      </div>
    );
  }

  const qatorRender = (q: KorinishQator) => {
    const cells: React.ReactNode[] = [];
    const joy = new Map(q.kataklar.map((k) => [k.c, k]));
    for (let i = 0; i < v.ustunlar.length;) {
      const col = v.ustunlar[i].c;
      const k = joy.get(col);
      if (!k) { cells.push(<td key={`${q.r}-${col}`} className={q.turi === 'sarlavha' && !v.raqamQatori ? '' : 'hk-cell'} />); i++; continue; }
      cells.push(
        <td key={`${q.r}-${col}`} colSpan={k.span}
          className={`hk-cell align-top ${k.qalin ? 'font-semibold' : ''} ${k.tekis === 'right' ? 'text-right tabular-nums' : k.tekis === 'center' ? 'text-center' : 'text-left'} ${k.formula ? 'hk-formula' : ''}`}
          title={k.formula ? t('Excel formulasi bilan hisoblanadi (Excelda o‘zgartirsangiz qayta hisoblanadi)') : undefined}>
          {k.matn}
        </td>,
      );
      i += k.span;
    }
    // Qog'oz ko'rinishi — mavzudan qat'i nazar oq fon, qora matn (hujjatdagiday).
    const fon = q.turi === 'bolim' ? 'hk-bolim' : q.turi === 'jami' ? 'hk-jami' : q.turi === 'sarlavha' ? 'hk-sarlavha' : '';
    return <tr key={q.r} className={fon}>{cells}</tr>;
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t('Hujjatni ko‘rish')} className="hk-overlay">
      <div ref={oyna} tabIndex={-1} className="fz-card hk-dialog">
        <div className="hk-bar">
          <b className="hk-name">{faylNomi}</b>
          {varaqlar.length > 1 && varaqlar.map((x, i) => (
            <button key={x.nom} onClick={() => { setVi(i); setSahifa(0); }} className={`fz-btn fz-btn--sm ${i === vi ? 'fz-btn--primary' : ''}`} aria-pressed={i === vi}>{x.nom}</button>
          ))}
          <label className="hk-search">
            <Search size={13} aria-hidden="true" />
            <input aria-label={t('Hujjatdan qidirish')} value={qidiruv} onChange={(e) => { setQidiruv(e.target.value); setSahifa(0); }} placeholder={t('Qidirish (kod, nom)…')} />
          </label>
          <label className="hk-check"><input type="checkbox" checked={faqatJami} onChange={(e) => { setFaqatJami(e.target.checked); setSahifa(0); }} /> {t('faqat bo‘lim va jamilar')}</label>
          <button onClick={() => downloadBlob(bytes, faylNomi)} className="fz-btn fz-btn--sm fz-btn--primary"><Download size={13} /> {t('Excel')}</button>
          <button onClick={onClose} aria-label={t('Yopish')} className="fz-btn fz-btn--sm fz-btn--icon"><X size={14} /></button>
        </div>
        <div className="hk-desk">
          <div className="hk-paper">
          {/* Hujjat nomi va titul — ramkasiz, hujjatdagiday. */}
          <table className="mb-2 border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>{v.ustunlar.map((u) => <col key={u.c} style={{ width: Math.round(u.kenglik * 7.2) }} />)}</colgroup>
            <tbody>{yuqori.map((q) => (
              <tr key={q.r}>{q.kataklar.length ? q.kataklar.map((k) => (
                <td key={k.c} colSpan={k.span} className={`px-1.5 py-0.5 ${k.qalin ? 'font-semibold' : ''} ${k.tekis === 'center' ? 'text-center' : k.tekis === 'right' ? 'text-right' : ''}`}>{k.matn}</td>
              )) : <td colSpan={v.ustunlar.length} className="h-2" />}</tr>
            ))}</tbody>
          </table>
          <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>{v.ustunlar.map((u) => <col key={u.c} style={{ width: Math.round(u.kenglik * 7.2) }} />)}</colgroup>
            <thead className="hk-thead">{bosh.map(qatorRender)}</thead>
            <tbody>{korinadigan.filter((q) => q.turi !== 'bosh').map(qatorRender)}</tbody>
          </table>
          {!korinadigan.length && <p className="hk-empty">{t('Mos qator yo‘q.')}</p>}
          </div>
        </div>
        {sahifalar > 1 && (
          <div className="hk-pager">
            <button disabled={sahifa === 0} onClick={() => setSahifa((p) => p - 1)} className="fz-btn fz-btn--sm">{t('Oldingi')}</button>
            <span>{sahifa + 1} / {sahifalar} ({t('{n} qator',{n:malumot.length})})</span>
            <button disabled={sahifa + 1 >= sahifalar} onClick={() => setSahifa((p) => p + 1)} className="fz-btn fz-btn--sm">{t('Keyingi')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ko'rish oynasi holati: `ochish(bytes, nom)` — oynani ochadi; `oyna` — render qilinadigan element. */
export function useHujjatKorinish() {
  const [hujjat, setHujjat] = useState<{ bytes: Uint8Array; nom: string } | null>(null);
  const ochish = useCallback((bytes: Uint8Array, nom: string) => setHujjat({ bytes, nom }), []);
  const oyna = hujjat ? <HujjatKorinish bytes={hujjat.bytes} faylNomi={hujjat.nom} onClose={() => setHujjat(null)} /> : null;
  return { ochish, oyna };
}
