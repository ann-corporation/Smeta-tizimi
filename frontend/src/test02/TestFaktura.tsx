import { moveRow, RowOrderControls } from '../components/row-order/RowOrderControls';
import { useState, useEffect, useRef } from 'react';
import { sbFakturalarOl, sbFakturaYoz, sbSkladgaYozish, sbT2ObyektlarOl, yangiOperationId, type T2Faktura, type T2Obyekt } from '../api/supabase';
import { useFakturaAiParse } from '../api/hooks';
import { CheckCircle2, PackagePlus, AlertCircle, Building2, FileUp, X, Save } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';
import { FmtN } from '../lib/format';
import { Sahifa } from '../umumiy/ui/Sahifa';

const invoiceRowKeys = new WeakMap<object, string>();
function invoiceRowKey(row: object) { let key=invoiceRowKeys.get(row); if(!key){key=crypto.randomUUID();invoiceRowKeys.set(row,key);}return key; }

export default function TestFaktura() {
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id ?? 0;
  const [opId, setOpId] = useState(yangiOperationId());

  const [fakturalar, setFakturalar] = useState<T2Faktura[]>([]);
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [tanlanganObId, setTanlanganObId] = useState<number | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');

  // AI o'qish uchun holatlar
  const aiParse = useFakturaAiParse();
  const [modalOchiq, setModalOchiq] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsingStatus, setParsingStatus] = useState('');
  const [yangiFaktura, setYangiFaktura] = useState<T2Faktura | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aktKomp) { setObyektlar([]); return; }
    sbT2ObyektlarOl(aktKomp).then(r => {
      if (r.ok && r.qatorlar) {
        setObyektlar(r.qatorlar);
        if (r.qatorlar.length > 0) setTanlanganObId(r.qatorlar[0].id);
      }
    });
    fakturalarniYukla();
  }, [aktKomp]);

  const fakturalarniYukla = () => {
    setYuklanmoqda(true);
    sbFakturalarOl(aktKomp).then((r: any) => {
      setYuklanmoqda(false);
      if (r.ok) {
        setFakturalar(r.qatorlar || []);
      } else {
        setXato(r.error || t('Xato yuz berdi'));
      }
    });
  };

  const skladgaQabulQil = async (faktura: T2Faktura) => {
    if (!tanlanganObId) {
      setXato(t('Obyekt tanlanmagan!'));
      return;
    }
    
    setYuklanmoqda(true);
    setXato('');
    
    try {
      if (!faktura.items || faktura.items.length === 0) {
        setXato(t('Bu fakturada tovarlar ro‘yxati yo‘q. Skladga qabul qilib bo‘lmaydi.'));
        setYuklanmoqda(false);
        return;
      }
      const items = faktura.items;

      for (const item of items) {
        const res = await sbSkladgaYozish(aktKomp, 'prixod', {
          obyekt_id: tanlanganObId, operatsiya: 'prixod',
          turi: 'mat',
          sana: new Date().toISOString().split('T')[0],
          nomi: item.nomi,
          birligi: item.birligi,
          obyomi: Number(item.miqdori || item.obyomi)
        });
        if (!res.ok) throw new Error(res.error || 'Skladga yozishda xato');
      }

      const fRes = await sbFakturaYoz({ ...faktura, holat: 'tasdiqlangan', operation_id: opId });
      if (!fRes.ok) throw new Error(fRes.error || 'Faktura holatini yangilashda xato');

      fakturalarniYukla();
      setOpId(yangiOperationId());
      toast(t('Skladga muvaffaqiyatli qabul qilindi'), 'ok');
    } catch (err: any) {
      setXato(err.message);
      toast(err.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsParsing(true);
    setYangiFaktura(null);
    const file = files[0];
    
    try {
      setParsingStatus(`AI o'qimoqda: ${file.name}`);
      
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const parseRes = await aiParse.mutateAsync({ 
        base64, 
        mimeType: file.type || 'application/pdf', 
        nomi: file.name 
      });

      if (!parseRes?.ok || !parseRes.items) {
         toast(`${file.name} ni o'qishda xato: ${parseRes?.xabar}`, 'danger');
         return;
      }

      const items = parseRes.items;
      const supplier = parseRes.supplier || "Noma'lum";
      
      if (items.length > 0) {
        const jamiSumma = items.reduce((acc: number, item: any) => acc + (Number(item.jamiNdsBilan) || 0), 0);
        const yangi: T2Faktura = {
          kompaniya_id: aktKomp,
          raqam: items[0].fakturaRaqami || 'NO_NUM',
          sana: items[0].kelganSana || new Date().toLocaleDateString('ru-RU'),
          kontragent: supplier,
          inn: items[0].postavshikInn || '',
          summa: jamiSumma,
          holat: 'yangi',
          items: items.map((it: any) => ({
             nomi: it.nomi,
             birligi: it.birligi,
             miqdori: it.miqdori,
             narxi: it.narxi,
             summa: it.jamiNdsBilan
          }))
        };
        setYangiFaktura(yangi);
        toast(`Jami ${items.length} ta tovar topildi`, 'ok');
      } else {
        toast("Faktura ichidan tovarlarni ajratib bo'lmadi.", 'warn');
      }
      
    } catch (err: any) {
      console.error(err);
      toast("Fakturani o'qishda xato: " + (err.message || err));
    } finally {
      setIsParsing(false);
      setParsingStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleYangiFakturaSaqlash = async () => {
    if (!yangiFaktura) return;
    setYuklanmoqda(true);
    try {
      const res = await sbFakturaYoz({ ...yangiFaktura, operation_id: yangiOperationId() });
      if (res.ok) {
        toast(t('Faktura muvaffaqiyatli saqlandi'), 'ok');
        setModalOchiq(false);
        setYangiFaktura(null);
        fakturalarniYukla();
      } else {
        toast(`Xato: ${res.error}`, 'danger');
      }
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  const summaOl = (f: T2Faktura): number | null => { const x = Number(f.summa); return f.summa == null || !Number.isFinite(x) ? null : x; };
  const qabul = fakturalar.filter((f) => f.holat === 'tasdiqlangan');
  const kutil = fakturalar.filter((f) => f.holat !== 'tasdiqlangan');
  const yig = (r: T2Faktura[]) => r.reduce((a, f) => a + (summaOl(f) ?? 0), 0);
  const summasizSoni = fakturalar.filter((f) => summaOl(f) == null).length;
  const jamiSumma = yig(fakturalar), qabulSumma = yig(qabul), kutilSumma = yig(kutil);
  const kontragentlar = (() => {
    const m = new Map<string, number>();
    for (const f of fakturalar) m.set(f.kontragent || '—', (m.get(f.kontragent || '—') ?? 0) + (summaOl(f) ?? 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();
  const maxK = Math.max(1, ...kontragentlar.map(([, v]) => v));
  const [filtr, setFiltr] = useState<'hammasi' | 'yangi' | 'qabul'>('hammasi');
  const korinadi = fakturalar.filter((f) => filtr === 'hammasi' || (filtr === 'qabul') === (f.holat === 'tasdiqlangan'));
  const FILTRLAR: Array<['hammasi' | 'yangi' | 'qabul', string]> = [['hammasi', t('Hammasi')], ['yangi', t('Kutilmoqda')], ['qabul', t('Qabul qilingan')]];

  return (
    <Sahifa sarlavha={t('Fakturalar')} tavsif={t('Fakturalarni sun‘iy intellekt orqali o‘qish va skladga avto-kirim qilish (PDF / Didox)')}
      amallar={<button type="button" className="fz-btn fz-btn--primary" onClick={() => setModalOchiq(true)}><FileUp /> {t('Faktura yuklash (AI)')}</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {xato && <div role="alert" className="fz-note fz-note--danger"><AlertCircle /><span>{xato}</span></div>}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Building2 size={18} style={{ color: 'var(--text-mute)' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-dim)' }}>{t('Qaysi obyekt skladiga qabul qilinadi')}:</span>
            <select className="input" style={{ height: 'var(--control-md)', padding: '0 8px', minWidth: 240 }} value={tanlanganObId || ''} onChange={e => setTanlanganObId(Number(e.target.value))}>
              {obyektlar.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <div role="group" aria-label={t('Holat bo‘yicha filtr')} style={{ display: 'flex', gap: 4 }}>
            {FILTRLAR.map(([k, nom]) => <button key={k} type="button" aria-pressed={filtr === k} className={'fz-btn fz-btn--sm' + (filtr === k ? '' : ' fz-btn--ghost')} style={filtr === k ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined} onClick={() => setFiltr(k)}>{nom}</button>)}
          </div>
        </div>

        {yuklanmoqda && <p role="status" style={{ margin: 0, color: 'var(--text-dim)' }}>{t('Yuklanmoqda…')}</p>}

        {fakturalar.length > 0 && (
          <section className="fz-card" aria-label={t('Fakturalar ko‘rsatkichlari')}>
            <div className="fz-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="fz-kpis">
                <div className="fz-kpi"><span className="fz-kpi__label">{t('Jami fakturalar')}</span><span className="fz-kpi__value">{fakturalar.length}</span><span className="fz-kpi__sub">{t('summasi noma’lum: {n}', { n: summasizSoni })}</span></div>
                <div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: 'var(--border-strong)' }} />{t('Jami summa')}</span><span className="fz-kpi__value"><FmtN val={jamiSumma} /></span><span className="fz-kpi__sub">{t('so‘m')}</span></div>
                <div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: 'var(--warn)' }} />{t('Kutilmoqda (skladga kirim qilinmagan)')}</span><span className="fz-kpi__value"><FmtN val={kutilSumma} /></span><span className="fz-kpi__sub">{t('{n} ta faktura', { n: kutil.length })}</span></div>
                <div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: 'var(--ok)' }} />{t('Qabul qilingan')}</span><span className="fz-kpi__value"><FmtN val={qabulSumma} /></span><span className="fz-kpi__sub">{t('{n} ta faktura', { n: qabul.length })}</span></div>
              </div>
              <div>
                <div className="fz-panel__h" style={{ marginBottom: 6 }}><span>{t('Qabul qilingan va kutilayotgan ulushi')}</span><span>{jamiSumma > 0 ? `${Math.round((qabulSumma / jamiSumma) * 100)}%` : '—'}</span></div>
                <div className="fz-split" role="img" aria-label={t('Qabul qilingan va kutilayotgan fakturalar ulushi')}>
                  <i style={{ width: `${jamiSumma > 0 ? (qabulSumma / jamiSumma) * 100 : 0}%`, background: 'var(--ok)' }} />
                  <i style={{ width: `${jamiSumma > 0 ? (kutilSumma / jamiSumma) * 100 : 0}%`, background: 'var(--warn)' }} />
                </div>
              </div>
              <div>
                <div className="fz-panel__h" style={{ marginBottom: 6 }}><span>{t('Kontragentlar bo‘yicha (eng katta 5)')}</span></div>
                <div className="fz-bars">
                  {kontragentlar.map(([nom, v]) => (
                    <div key={nom} className="fz-bars__q"><span title={nom}>{nom}</span><b><FmtN val={v} /></b><i style={{ ['--w' as string]: `${(v / maxK) * 100}%` }} /></div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
          {korinadi.map((f, i) => {
            const qabulQilingan = f.holat === 'tasdiqlangan';
            const sm = summaOl(f);
            return (
              <article key={i} className="fz-card" style={{ position: 'relative' }}>
                <div className="fz-card__head">
                  <h2 className="fz-card__title">№ {f.raqam}</h2>
                  <span className={'fz-stamp ' + (qabulQilingan ? 'fz-stamp--ok' : 'fz-stamp--warn')}>{qabulQilingan ? <><CheckCircle2 size={12} /> {t('Qabul qilingan')}</> : t('Yangi')}</span>
                </div>
                <div className="fz-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div className="fz-doc__meta" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                    <span>{t('Sana')}: <b>{f.sana || '—'}</b></span>
                    <span>{t('INN')}: <b className="font-mono">{f.inn || '—'}</b></span>
                    <span style={{ gridColumn: '1 / -1' }}>{t('Kontragent')}: <b>{f.kontragent || '—'}</b></span>
                  </div>
                  <div className="fz-kpi"><span className="fz-kpi__label">{t('Summa')}</span><span className="fz-kpi__value">{sm == null ? '—' : <><FmtN val={sm} /> <small style={{ fontSize: 12, color: 'var(--text-mute)' }}>{t('so‘m')}</small></>}</span></div>
                  <div className="fz-table-wrap" style={{ maxHeight: 150 }}>
                    {f.items && f.items.length > 0 ? (
                      <table className="fz-table"><thead><tr><th>{t('Tovar')}</th><th style={{ textAlign: 'right' }}>{t('Miqdor')}</th></tr></thead>
                        <tbody>{f.items.map((item: any, idx: number) => (
                          <tr key={idx}><td title={item.nomi} style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nomi}</td>
                            <td className="fz-c-num">{item.miqdori || item.obyomi || '—'} {item.birligi}</td></tr>
                        ))}</tbody></table>
                    ) : <p style={{ margin: 8, color: 'var(--text-mute)' }}>{t('Tovarlar ro‘yxati kelmagan')}</p>}
                  </div>
                  {f.holat === 'yangi' && (
                    <button type="button" onClick={() => skladgaQabulQil(f)} disabled={yuklanmoqda} className="fz-btn fz-btn--primary" style={{ width: '100%' }}>
                      <PackagePlus /> {t('Skladga kirim qilish')}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {korinadi.length === 0 && !yuklanmoqda && (
            <div className="fz-note fz-note--info" style={{ gridColumn: '1 / -1' }}><span>{t('Hozircha fakturalar yo‘q. EHF (PDF) fayllarni yuklang.')}</span></div>
          )}
        </div>

        {modalOchiq && (
          <div role="dialog" aria-modal="true" aria-label={t('AI orqali PDF o‘qish')} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'color-mix(in srgb, var(--bg) 70%, transparent)' }}>
            <div className="fz-card" style={{ width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-pop)' }}>
              <div className="fz-card__head">
                <h2 className="fz-card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileUp size={18} />{t('AI orqali PDF o‘qish')}</h2>
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon" aria-label={t('Yopish')} onClick={() => setModalOchiq(false)}><X /></button>
              </div>
              <div className="fz-card__body" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {!yangiFaktura ? (
                  <div style={{ border: '2px dashed var(--border-strong)', borderRadius: 'var(--radius-md)', padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', cursor: 'pointer' }} onClick={() => !isParsing && fileInputRef.current?.click()}>
                    <input type="file" accept=".pdf, image/png, image/jpeg, image/jpg" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    <FileUp size={32} style={{ color: 'var(--accent-text)' }} />
                    <div><h3 style={{ margin: 0, font: '600 15px/22px var(--font-display)' }}>{t('PDF hujjat tanlang')}</h3>
                      <p style={{ margin: 0, color: 'var(--text-dim)' }}>{t('Faktura PDF faylini yuklang, AI o‘zi o‘qiydi')}</p></div>
                    <button type="button" disabled={isParsing} className="fz-btn fz-btn--primary">{isParsing ? t('O‘qilmoqda…') : t('Fayl tanlash')}</button>
                    {parsingStatus && <div role="status" style={{ color: 'var(--accent-text)' }}>{parsingStatus}</div>}
                  </div>
                ) : (
                  <>
                    <div className="fz-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="fz-kpi"><span className="fz-kpi__label">{t('Faktura №')}</span><b>{yangiFaktura.raqam}</b></div>
                      <div className="fz-kpi"><span className="fz-kpi__label">{t('Sana')}</span><b>{yangiFaktura.sana}</b></div>
                      <div className="fz-kpi" style={{ gridColumn: '1 / -1' }}><span className="fz-kpi__label">{t('Kontragent')}</span><b>{yangiFaktura.kontragent}</b></div>
                      <div className="fz-kpi"><span className="fz-kpi__label">{t('INN')}</span><b className="font-mono">{yangiFaktura.inn || '—'}</b></div>
                      <div className="fz-kpi"><span className="fz-kpi__label">{t('Jami summa')}</span><b>{summaOl(yangiFaktura) == null ? '—' : <><FmtN val={summaOl(yangiFaktura)} /> {t('so‘m')}</>}</b></div>
                    </div>
                    <div>
                      <h3 className="fz-panel__h" style={{ marginBottom: 8 }}>{t('O‘qilgan tovarlar')} ({yangiFaktura.items?.length})</h3>
                      <div style={{ maxHeight: '30vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {yangiFaktura.items?.map((it, idx) => (
                          <div key={invoiceRowKey(it)} className="fz-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '6px 10px' }}>
                            <RowOrderControls disabled={yuklanmoqda} index={idx} count={yangiFaktura.items?.length ?? 0} label={it.nomi} onMove={to=>setYangiFaktura(current=>current ? {...current, items:moveRow(current.items ?? [],idx,to)} : current)} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={it.nomi}>{it.nomi}</span>
                            <span className="fz-chip font-mono">{it.miqdori} {it.birligi} × {it.narxi == null ? '—' : it.narxi.toLocaleString('ru-RU')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <button type="button" className="fz-btn" onClick={() => setYangiFaktura(null)}>{t('Bekor qilish')}</button>
                      <button type="button" className="fz-btn fz-btn--primary" onClick={handleYangiFakturaSaqlash} disabled={yuklanmoqda}><Save /> {t('Tizimga saqlash')}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Sahifa>
  );
}
