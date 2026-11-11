import { useMemo, useState, useEffect } from 'react';
import { useNarxlar, useNarxBelgilangan, useNarxKat, useObyektlar,
         useOraliqlar, useOraliqlarSkan, useOraliqlarSaqla, type Oraliq } from '../../api/hooks';
import {
  Sahifa, Holatlar, Jadval, Nishon, KpiKarta, Qidiruv, Yon, Juft,
  Maydon, Kiritma, Tanlov, Tugma, type Ustun,
} from '../../umumiy/ui/Sahifa';
import { FmtN } from '../../lib/format';
import { toast } from '../../umumiy/ui/Toast';
import { AlertTriangle, Save, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { NarxQator } from '../../api/types';
import NarxlarNative from './NarxlarNative';
import { t } from '../../i18n/til';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { narxOgish } from '../../lib/narx-korinish';
import { OgishMeter } from '../../components/narx/NarxKorinish';

/* ЧЕЛ va МАШ — birlikdan avtomat aniqlanadi va QULFLANGAN (qat'iy qoida).
 * Qolganlari qo'lda tanlanadi. */
const KATEGORIYALAR = ['МАТ', 'ОБ', 'М/К', 'КАБ'];
const QULF = ['ЧЕЛ', 'МАШ'];

const KAT_RANG: Record<string, 'ok' | 'warn' | 'danger' | 'neytral'> = {
  'ЧЕЛ': 'neytral', 'МАШ': 'neytral', 'МАТ': 'ok', 'ОБ': 'warn', 'КАБ': 'neytral', 'М/К': 'neytral',
};

/* T2-PTO-CLOSURE-007: bosqichma-bosqich (feature flag) cutover — F2Import.tsx
 * bilan bir xil naqsh. Flag O'CHIQ bo'lsa quyidagi NarxlarLegacy BAYT-BAYTIGA
 * o'zgarishsiz ishlaydi. */
export function Narxlar() {
  const [native, setNative] = useState(() => {
    try { return localStorage.getItem('t2-narxlar-native-mode') !== 'false'; } catch { return true; }
  });
  const rejimAlmashtir = async (useLegacy: boolean) => {
    if (!(await tasdiqSora({ sarlavha: t('Rejimni almashtirish'), matn: t('Rejim almashsa, saqlanmagan tahrirlar yopiladi. Davom etasizmi?') }))) return;
    try { localStorage.setItem('t2-narxlar-native-mode', String(!useLegacy)); } catch { /* Joriy sessiyada ishlaydi. */ }
    setNative(!useLegacy);
  };
  return <>
    {!native && <label className="flex items-center gap-2 px-6 pt-3 text-[12px] text-text-mute">
      <input type="checkbox" checked={!native} onChange={(e) => { void rejimAlmashtir(e.target.checked); }} />
      {t('Eski rejim yoqilgan — yangi rejimga qaytish')}
      <span className="fz-stamp fz-stamp--warn">{t('Eski rejim')}</span>
    </label>}
    {native ? <NarxlarNative /> : <NarxlarLegacy />}
  </>;
}

function NarxlarLegacy() {
  const [filter, setFilter] = useState('ALL');
  /* ⚡ 2026-08-16 ORALIQLAR bloki uchun */
  const obyektlar = useObyektlar();
  const [orObyekt, setOrObyekt] = useState('');
  const [orTahrir, setOrTahrir] = useState<Oraliq[] | null>(null);
  const oraliqlar = useOraliqlar(orObyekt);
  const orSkan = useOraliqlarSkan();
  const orSaqla = useOraliqlarSaqla();
  const soragan = useNarxlar(filter);
  const belgila = useNarxBelgilangan();
  const katSaqla = useNarxKat();

  const [q, setQ] = useState('');
  const [faqatXavf, setFaqatXavf] = useState(false);
  const [tanlangan, setTanlangan] = useState<NarxQator | null>(null);
  const [narxKiritma, setNarxKiritma] = useState('');

  useEffect(() => {
    setNarxKiritma(tanlangan?.belgilangan === '' || tanlangan?.belgilangan == null
      ? '' : String(tanlangan.belgilangan));
  }, [tanlangan]);

  const hammasi = useMemo(() => soragan.data?.rows ?? [], [soragan.data]);

  const satrlar = useMemo(() => {
    const s = q.trim().toUpperCase();
    return hammasi.filter((r) => {
      if (s && !r.nom.toUpperCase().includes(s)) return false;
      if (faqatXavf && !r.xavf) return false;
      return true;
    });
  }, [hammasi, q, faqatXavf]);

  const stat = useMemo(() => ({
    jami: hammasi.length,
    belgilangan: hammasi.filter((r) => r.belgilangan !== '' && r.belgilangan != null).length,
    xavf: hammasi.filter((r) => r.xavf).length,
    narxsiz: hammasi.filter((r) => !r.natija).length,
  }), [hammasi]);

  async function narxSaqla() {
    if (!tanlangan) return;
    const v = narxKiritma.trim();
    const qiymat: number | '' = v === '' ? '' : Number(v.replace(/[^\d.-]/g, ''));
    if (v !== '' && (!isFinite(qiymat as number) || (qiymat as number) < 0)) {
      toast("Narx noto'g'ri"); return;
    }
    try {
      await belgila.mutateAsync({ nom: tanlangan.nom, birlik: tanlangan.birlik, belgilangan: qiymat });
      toast(v === '' ? 'Belgilangan narx olib tashlandi' : 'Narx saqlandi');
      soragan.refetch();
      setTanlangan(null);
    } catch (e: any) { toast(`Saqlanmadi: ${e.message}`); }
  }

  async function katOzgartir(yangi: string) {
    if (!tanlangan) return;
    try {
      await katSaqla.mutateAsync({ nom: tanlangan.nom, birlik: tanlangan.birlik, yangiKat: yangi });
      setTanlangan({ ...tanlangan, kat: yangi });
      toast(`Kategoriya: ${yangi}`);
      soragan.refetch();
    } catch (e: any) { toast(`Xato: ${e.message}`); }
  }

  const ustunlar: Ustun<NarxQator>[] = [
    {
      kalit: 'nom', nom: 'Resurs',
      chiz: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          {r.xavf && <AlertTriangle size={14} className="text-warn flex-shrink-0" />}
          <span className="text-text truncate" title={r.nom}>{r.nom}</span>
        </div>
      ),
    },
    { kalit: 'birlik', nom: 'Birlik', en: '90px', chiz: (r) => <span className="text-text-dim">{r.birlik || '—'}</span> },
    {
      kalit: 'kat', nom: 'Kat.', en: '90px',
      chiz: (r) => <Nishon matn={r.kat || '—'} tur={KAT_RANG[r.kat] ?? 'neytral'} />,
    },
    {
      kalit: 'max', nom: 'Smetada (max)', raqam: true, en: '150px',
      chiz: (r) => <span className="text-text-dim"><FmtN val={r.max} /></span>,
    },
    {
      kalit: 'belgilangan', nom: 'Belgilangan', raqam: true, en: '150px',
      chiz: (r) => r.belgilangan === '' || r.belgilangan == null
        ? <span className="text-text-mute">—</span>
        : <span className="text-accent font-medium"><FmtN val={Number(r.belgilangan)} /></span>,
    },
    {
      kalit: 'natija', nom: 'Ishlatiladi', raqam: true, en: '160px',
      chiz: (r) => r.natija
        ? <span className="text-text font-medium"><FmtN val={r.natija} /></span>
        : <span className="text-danger">narx yo'q</span>,
    },
    {
      kalit: 'manba', nom: 'Manba', en: '150px',
      chiz: (r) => <span className="text-xs text-text-mute truncate block" title={r.manba}>{r.manba || '—'}</span>,
    },
  ];

  return (
    <Sahifa
      sarlavha="Narxlar markazi"
      tavsif="Barcha resurs narxlari shu yerdan boshqariladi — belgilangan narx smetadagidan ustun"
      yangilangan={soragan.dataUpdatedAt}
      onYangila={() => soragan.refetch()}
      yangilanmoqda={soragan.isFetching}
      amallar={
        <div className="flex items-center gap-3">
          <Tanlov qiymat={filter} ozgardi={setFilter} variantlar={['ALL', 'ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К']} />
          <Qidiruv qiymat={q} ozgardi={setQ} placeholder="Resurs nomi…" />
        </div>
      }
    >
      {/* ⚡⚡⚡ 2026-08-16 ORALIQLAR — eski paneldan yetishmayotgan qism.
          Svodka faylida qaysi qatordan boshlab qaysi KATEGORIYA (ЧЕЛ/МАШ/
          МАТ/ОБ) turishini belgilaydi. Narxlash dvigateli AYNAN shundan
          foydalanadi — noto'g'ri bo'lsa resurs xato kategoriyaga tushadi
          va narxi ham xato bo'ladi.
          GAS da uchta API bor edi (apiOraliqlarOl/Skan/Saqla), saytda
          umuman yo'q edi — sozlash uchun eski panelga qaytish kerak edi. */}
      <details className="karta p-4 mb-4 group">
        <summary className="cursor-pointer list-none flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-text flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-accent" />
              Svodka oraliqlari
            </h3>
            <p className="text-xs text-text-mute mt-0.5">
              Qaysi qatordan qaysi kategoriya boshlanadi — narxlash shunga tayanadi
            </p>
          </div>
          <span className="text-xs text-text-mute group-open:hidden">ochish ▾</span>
          <span className="text-xs text-text-mute hidden group-open:inline">yopish ▴</span>
        </summary>

        <div className="mt-3 space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="text-[12px] font-medium text-text block mb-1.5">Obyekt</label>
              <select value={orObyekt} onChange={(e) => { setOrObyekt(e.target.value); setOrTahrir(null); }}
                className="h-8 w-full px-2 text-[12px] text-text">
                <option value="">— tanlang —</option>
                {(obyektlar.data ?? []).map((o) => (
                  <option key={o.obyekt} value={o.obyekt}>{o.obyekt}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (!orObyekt) { toast('Obyekt tanlang', 'warn'); return; }
                orSkan.mutate({ obyekt: orObyekt }, {
                  onSuccess: (r) => {
                    setOrTahrir(r || []);
                    toast(`${(r || []).length} ta oraliq topildi — tekshirib saqlang`, 'ok', undefined, 8000);
                  },
                  onError: (e: Error) => toast(e.message, 'danger', undefined, 9000),
                });
              }}
              disabled={orSkan.isPending || !orObyekt}
              className="fz-btn">
              {orSkan.isPending ? 'Skanlanmoqda…' : '🔍 Svodkani skanlash'}
            </button>
          </div>

          {(() => {
            const royxat = orTahrir ?? oraliqlar.data ?? [];
            if (oraliqlar.isLoading) return <div className="skel h-16 rounded" />;
            if (!orObyekt) {
              return <p className="text-[12px] text-text-mute italic">Avval obyekt tanlang</p>;
            }
            if (!royxat.length) {
              return (
                <p className="text-[12px] text-warn">
                  Bu obyekt uchun oraliq belgilanmagan. «Svodkani skanlash» bilan
                  avtomatik topib ko'ring — tizim kategoriya sarlavhalarini qidiradi.
                </p>
              );
            }
            return (
              <>
                <div className="fz-table-wrap max-h-64">
                  <table className="fz-table text-[12px]">
                    <thead>
                      <tr>
                        <th>{t('Varaq')}</th>
                        <th className="fz-c-num">{t('Qator')}</th>
                        <th>{t('Kategoriya')}</th>
                        <th>{t('Sarlavha')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {royxat.map((o, i) => (
                        <tr key={`${o.varaq}-${o.qator}-${i}`}>
                          <td className="py-1 px-2 text-text-dim truncate max-w-[160px]">{o.varaq}</td>
                          <td className="py-1 px-2 text-right tabular-nums text-text-dim">{o.qator}</td>
                          <td className="py-1 px-2">
                            {orTahrir ? (
                              <select value={o.kat}
                                onChange={(e) => setOrTahrir((p) => (p ?? []).map((x, j) =>
                                  j === i ? { ...x, kat: e.target.value } : x))}
                                className="h-7 px-1.5 text-xs text-text">
                                {['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К'].map((k) =>
                                  <option key={k} value={k}>{k}</option>)}
                              </select>
                            ) : (
                              <span className="fz-chip">{o.kat}</span>
                            )}
                          </td>
                          <td className="py-1 px-2 text-text-mute truncate max-w-[260px]"
                              title={o.sarlavha}>{o.sarlavha}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {orTahrir && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => orSaqla.mutate({ obyekt: orObyekt, oraliqlar: orTahrir }, {
                        onSuccess: () => {
                          toast('Oraliqlar saqlandi — endi obyektni qayta hisoblang', 'ok', undefined, 9000);
                          setOrTahrir(null);
                        },
                        onError: (e: Error) => toast(e.message, 'danger', undefined, 9000),
                      })}
                      disabled={orSaqla.isPending}
                      className="fz-btn fz-btn--primary">
                      {orSaqla.isPending ? 'Saqlanmoqda…' : 'Tasdiqlash va saqlash'}
                    </button>
                    <button onClick={() => setOrTahrir(null)}
                      className="fz-btn fz-btn--ghost">
                      Bekor qilish
                    </button>
                    <span className="fz-chip fz-chip--warn">
                      {t('Saqlangach obyektni «Ishla» bilan qayta hisoblang')}
                    </span>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </details>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiKarta nom="Resurslar" qiymat={stat.jami} />
        <KpiKarta nom="Qo'lda belgilangan" qiymat={stat.belgilangan} ost="smetadan ustun" />
        <button onClick={() => setFaqatXavf(!faqatXavf)} className={`text-left rounded-[10px] cursor-pointer ${faqatXavf ? 'ring-1 ring-[var(--warn)]' : ''}`}>
          <KpiKarta nom="Narx farqi" qiymat={stat.xavf} ost="5% dan ortiq tafovut" />
        </button>
        <KpiKarta nom="Narxsiz" qiymat={stat.narxsiz} ost={stat.narxsiz ? 'e’tibor bering' : 'hammasi narxlangan'} />
      </div>

      {faqatXavf && (
        <p className="text-xs text-text-dim mb-3">
          Faqat narx tafovuti bor resurslar —{' '}
          <button onClick={() => setFaqatXavf(false)} className="text-accent underline cursor-pointer">hammasini ko'rsat</button>
        </p>
      )}

      <Holatlar soragan={soragan} bosh={{ matn: 'Narxlar topilmadi', izoh: 'Avval obyektlarni ishlang — narxlar smetalardan yig‘iladi.' }}>
        {() => satrlar.length === 0
          ? <div className="karta py-12 text-center text-text-dim text-sm">Filtrga mos resurs yo'q</div>
          : <Jadval ustunlar={ustunlar} satrlar={satrlar} kalit={(r, i) => `${r.nom}|${r.birlik}|${i}`} onSatrBos={setTanlangan} />}
      </Holatlar>

      {/* ---------- Batafsil ---------- */}
      <Yon
        ochiq={!!tanlangan}
        yop={() => setTanlangan(null)}
        sarlavha={tanlangan?.nom ?? ''}
        tavsif={tanlangan ? `${tanlangan.birlik || '—'} · ${tanlangan.kat}` : undefined}
        past={
          <div className="flex gap-3 justify-end">
            <Tugma onBos={() => setTanlangan(null)}>Yopish</Tugma>
            <Tugma tur="primary" onBos={narxSaqla} band={belgila.isPending} ikonka={<Save size={16} />}>
              Narxni saqlash
            </Tugma>
          </div>
        }
      >
        {tanlangan && (
          <>
            <section className="karta p-4">
              <Juft nom="Smetada (eng katta)" qiymat={<FmtN val={tanlangan.max} />} />
              <Juft
                nom="Belgilangan"
                qiymat={tanlangan.belgilangan === '' || tanlangan.belgilangan == null
                  ? <span className="text-text-mute">yo'q</span>
                  : <span className="text-accent"><FmtN val={Number(tanlangan.belgilangan)} /></span>}
              />
              <Juft nom="Ishlatiladi" qiymat={<span className="text-text font-medium"><FmtN val={tanlangan.natija} /></span>} />
              <Juft nom="Manba" qiymat={<span className="text-text-dim">{tanlangan.manba || '—'}</span>} />
            </section>

            {tanlangan.xavf && (
              <div className="fz-note fz-note--warn">
                <AlertTriangle size={14} aria-hidden="true" />
                Obyektlar bo'yicha narxlar <strong className="text-text">5% dan ortiq</strong> farq qiladi.
                Qaysi biri to'g'riligini tanlab, qo'lda belgilab qo'ying.
              </div>
            )}

            <section className="space-y-3">
              <Maydon nom="Qo'lda belgilangan narx" izoh="Bo'sh qoldirilsa — smetadagi narx ishlatiladi">
                <Kiritma tur="money" qiymat={narxKiritma} ozgardi={setNarxKiritma} placeholder="masalan 24 517" />
              </Maydon>
              {narxKiritma !== '' && (
                <Tugma onBos={() => setNarxKiritma('')} ikonka={<RotateCcw size={14} />}>
                  Belgilanganni olib tashlash
                </Tugma>
              )}

              <Maydon nom="Kategoriya" izoh={QULF.includes(tanlangan.kat) ? 'ЧЕЛ/МАШ birlikdan avtomat — o‘zgartirib bo‘lmaydi' : undefined}>
                {QULF.includes(tanlangan.kat)
                  ? <div className="input h-9 px-3 text-sm flex items-center opacity-60">{tanlangan.kat} 🔒</div>
                  : <Tanlov qiymat={tanlangan.kat} ozgardi={katOzgartir} variantlar={KATEGORIYALAR} />}
              </Maydon>
            </section>

            {/* Obyektlar bo'yicha narxlar */}
            {Object.keys(tanlangan.smeta || {}).length > 0 && (
              <section>
                <h4 className="text-xs uppercase tracking-[0.04em] text-text-dim mb-2">Obyektlar bo'yicha</h4>
                <div className="karta divide-y divide-border max-h-56 overflow-y-auto">
                  {Object.entries(tanlangan.smeta).map(([ob, n]) => (
                    <div key={ob} className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                      <span className="text-text-dim truncate" title={ob}>{ob}</span>
                      <span className="tabular-nums text-text flex-shrink-0"><FmtN val={n} /></span>
                      <span className="col-span-2" title={t('Obyekt narxi ishlatiladigan narxga nisbatan')}><OgishMeter og={narxOgish(Number(n), Number(tanlangan.natija) || null)} /></span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Sanalar bo'yicha */}
            {Object.keys(tanlangan.sanaLar || {}).length > 0 && (
              <section>
                <h4 className="text-xs uppercase tracking-[0.04em] text-text-dim mb-2">Sanalar bo'yicha</h4>
                <div className="karta divide-y divide-border max-h-56 overflow-y-auto">
                  {Object.entries(tanlangan.sanaLar).map(([s, n]) => (
                    <div key={s} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-text-dim tabular-nums">{s}</span>
                      <span className="tabular-nums text-text"><FmtN val={n} /></span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </Yon>
    </Sahifa>
  );
}

export default Narxlar;
