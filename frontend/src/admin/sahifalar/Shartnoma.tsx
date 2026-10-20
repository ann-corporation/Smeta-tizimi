import { useMemo, useState, useEffect } from 'react';
import {
  useShartnomalar, useTolovlar, useShartnomaBog, useShartnomaSaqla, useTolovSaqla,
  /* ⚡⚡⚡ 2026-08-17 (audit): bu ikki hook YOZILGAN, GAS API si ham BOR edi,
     lekin sahifa ularni CHAQIRMASDI — ya'ni saytdan shartnomani ham,
     to'lovni ham O'CHIRIB BO'LMASDI. Xato kiritilgan to'lov «To'langan»
     summani abadiy shishirib turardi va qoldiq noto'g'ri chiqardi;
     tuzatishning yagona yo'li Google Sheets ni qo'lda ochish edi. */
  useShartnomaOchir, useTolovOchir,
  /* ⚡⚡⚡ 2026-08-17 (audit) — IKKI BUTUN FUNKSIYA SAYTDA YO'Q EDI:
     1) QO'SHIMCHA ISHLAR: `apiQoshIshOl/Saqla/Ochir` GAS da bor, lekin
        o'quvchi hook YOZILMAGAN edi — ya'ni shartnomadan tashqari bajarilgan
        ishlarni saytda ko'rish ham, kiritish ham imkonsiz edi. Bu summalar
        `apiShartnomaDashboard` da alohida hisoblanadi (asl smetaga qo'shilib
        ketmaydi), demak ular kiritilmasa buxgalteriya to'liq bo'lmaydi.
     2) OBYEKT BOG'LASH: bog'langan obyektlar KO'RINARDI, lekin
        `useShartnomaBogSaqla` ulanmagani uchun bog'lash/uzish imkoni yo'q
        edi. Bog'lanmagan obyekt «—» guruhida qolib, shartnoma bo'yicha
        fakt/F2 hisobiga TUSHMAYDI. */
  useQoshIshlar, useQoshIshSaqla, useQoshIshOchir,
  useShartnomaBogSaqla, useObyektlar,
} from '../../api/hooks';
import {
  Sahifa, Holatlar, Jadval, Nishon, KpiKarta, Qidiruv, Yon, Juft,
  Maydon, Kiritma, Tanlov, Tugma, type Ustun,
} from '../../umumiy/ui/Sahifa';
import { FmtN } from '../../lib/format';
import { toast } from '../../umumiy/ui/Toast';
import { Plus, Save, Building2, Trash2, Unlink } from 'lucide-react';
import type { Shartnoma as ShTur, Tolov } from '../../api/types';

const HOLATLAR = ['Фаол', 'Якунланган', 'Тўхтатилган'];

export function Shartnoma() {
  const soragan = useShartnomalar();
  const tolovlar = useTolovlar();
  const bog = useShartnomaBog();
  const saqla = useShartnomaSaqla();
  const tolovYoz = useTolovSaqla();
  const shOchir = useShartnomaOchir();
  const tolovOchir = useTolovOchir();
  const qoshIshlar = useQoshIshlar();
  const qoshIshSaqla = useQoshIshSaqla();
  const qoshIshOchir = useQoshIshOchir();
  const bogSaqla = useShartnomaBogSaqla();
  const obyektlar = useObyektlar();

  const [q, setQ] = useState('');
  const [tanlangan, setTanlangan] = useState<ShTur | null>(null);
  const [shakl, setShakl] = useState<ShTur | null>(null);
  const [yangiTolov, setYangiTolov] = useState({ sana: '', summa: '', izoh: '', obyekt: '' });
  const [yangiQosh, setYangiQosh] = useState({ nomi: '', smeta: '', izoh: '' });
  const [bogObyekt, setBogObyekt] = useState('');

  useEffect(() => { setShakl(tanlangan ? { ...tanlangan } : null); }, [tanlangan]);

  const satrlar = useMemo(() => {
    const h = soragan.data ?? [];
    const s = q.trim().toUpperCase();
    if (!s) return h;
    return h.filter((x) =>
      x.no.toUpperCase().includes(s) || x.nomi.toUpperCase().includes(s) || x.taraf.toUpperCase().includes(s));
  }, [soragan.data, q]);

  /** Har shartnoma bo'yicha to'langan summa */
  const tolanganMap = useMemo(() => {
    const m: Record<string, number> = {};
    (tolovlar.data ?? []).forEach((t) => { m[t.shNo] = (m[t.shNo] || 0) + (t.summa || 0); });
    return m;
  }, [tolovlar.data]);

  /** Shartnomaga bog'langan obyektlar */
  const obyektMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    Object.entries(bog.data ?? {}).forEach(([ob, no]) => { (m[no] ||= []).push(ob); });
    return m;
  }, [bog.data]);

  const jami = useMemo(() => {
    const h = soragan.data ?? [];
    const summa = h.reduce((a, x) => a + (x.jami || 0), 0);
    const tolangan = Object.values(tolanganMap).reduce((a, b) => a + b, 0);
    return { soni: h.length, summa, tolangan, qoldiq: summa - tolangan };
  }, [soragan.data, tolanganMap]);

  const shTolovlari: Tolov[] = useMemo(
    () => (tolovlar.data ?? []).filter((t) => t.shNo === tanlangan?.no),
    [tolovlar.data, tanlangan],
  );

  async function shartnomaSaqla() {
    if (!shakl) return;
    try {
      await saqla.mutateAsync(shakl);
      toast(`${shakl.no} saqlandi`);
      soragan.refetch();
      setTanlangan(null);
    } catch (e: any) { toast(`Saqlanmadi: ${e.message}`); }
  }

  async function tolovQosh() {
    if (!tanlangan) return;
    const summa = Number(String(yangiTolov.summa).replace(/[^\d.-]/g, ''));
    if (!summa) { toast('Summa kiriting'); return; }
    try {
      await tolovYoz.mutateAsync({
        shNo: tanlangan.no,
        /* ⚡ 2026-08-16 (audit M): avval DOIM birinchi obyekt olinardi —
           shartnoma bir necha obyektga tegishli bo'lsa to'lov NOTO'G'RI
           obyektga yozilardi va obyekt bo'yicha hisob buzilardi.
           Endi foydalanuvchi tanlaydi (bitta bo'lsa o'zi qo'yiladi). */
        obyekt: yangiTolov.obyekt || (obyektMap[tanlangan.no] || [])[0] || '',
        summa,
        sana: yangiTolov.sana || undefined,
        tur: 'Тўлов',
        izoh: yangiTolov.izoh,
      });
      setYangiTolov({ sana: '', summa: '', izoh: '', obyekt: '' });
      toast("To'lov qo'shildi");
      tolovlar.refetch();
    } catch (e: any) { toast(`Qo'shilmadi: ${e.message}`); }
  }

  /* ⚡⚡⚡ 2026-08-17 (audit) — O'CHIRISH AMALLARI
     Bular PUL hujjatiga tegadi, shuning uchun:
       • har biri ATAYLAB tasdiqlanadi (tasodifiy bosishdan himoya);
       • tasdiq matnida ANIQ nima o'chirilayotgani va summasi ko'rsatiladi —
         foydalanuvchi «nimani o'chiryapman?» deb taxmin qilmasin;
       • shartnomani o'chirishda unga bog'langan to'lovlar borligi
         ogohlantiriladi (jim yo'qotish bo'lmasin). */
  async function shartnomaOchirish() {
    if (!tanlangan) return;
    const tolovSoni = shTolovlari.length;
    const tolangan = tolanganMap[tanlangan.no] || 0;
    const ogoh = tolovSoni
      ? `\n\nDIQQAT: bu shartnomada ${tolovSoni} ta to'lov qayd etilgan `
        + `(jami ${tolangan.toLocaleString('ru-RU')} so'm). Ular avtomat o'chmaydi — `
        + `kerak bo'lsa avval to'lovlarni o'chiring.`
      : '';
    if (!window.confirm(`«${tanlangan.no}» shartnomasi o'chirilsinmi?\n`
      + `${tanlangan.nomi || ''}\nSummasi: ${(tanlangan.jami || 0).toLocaleString('ru-RU')} so'm${ogoh}`)) return;
    try {
      await shOchir.mutateAsync(tanlangan.no);
      toast(`${tanlangan.no} o'chirildi`, 'ok');
      setTanlangan(null);
    } catch (e: any) { toast(`O'chirilmadi: ${e.message}`, 'danger', undefined, 9000); }
  }

  /** Shu shartnomaga tegishli qo'shimcha ishlar */
  const shQoshIshlari = useMemo(
    /* `qi` — tashqi `q` (qidiruv matni) bilan chalkashmasligi uchun */
    () => (qoshIshlar.data ?? []).filter((qi) => qi.shNo === tanlangan?.no),
    [qoshIshlar.data, tanlangan],
  );

  async function qoshIshQoshish() {
    if (!tanlangan) return;
    if (!yangiQosh.nomi.trim()) { toast('Ish nomini kiriting', 'warn'); return; }
    try {
      await qoshIshSaqla.mutateAsync({
        shNo: tanlangan.no,
        nomi: yangiQosh.nomi.trim(),
        smeta: Number(String(yangiQosh.smeta).replace(/[^\d.-]/g, '')) || 0,
        izoh: yangiQosh.izoh,
      });
      setYangiQosh({ nomi: '', smeta: '', izoh: '' });
      toast("Qo'shimcha ish saqlandi", 'ok');
    } catch (e: any) { toast(`Saqlanmadi: ${e.message}`, 'danger', undefined, 9000); }
  }

  async function qoshIshOchirish(qi: { row: number; nomi: string; smeta: number }) {
    if (!window.confirm(`Qo'shimcha ish o'chirilsinmi?\n${qi.nomi}\n`
      + `${(qi.smeta || 0).toLocaleString('ru-RU')} so'm`)) return;
    try {
      await qoshIshOchir.mutateAsync(qi.row);
      toast("O'chirildi", 'ok');
    } catch (e: any) { toast(`O'chirilmadi: ${e.message}`, 'danger', undefined, 9000); }
  }

  async function obyektBoglash() {
    if (!tanlangan || !bogObyekt) return;
    try {
      /* `soni` — shartnoma necha obyektga bo'linishi. Bitta obyekt
         bog'lanayotgani uchun 1. */
      await bogSaqla.mutateAsync({ obyekt: bogObyekt, tanlov: tanlangan.no, soni: 1 });
      toast(`${bogObyekt} → ${tanlangan.no}`, 'ok');
      setBogObyekt('');
    } catch (e: any) { toast(`Bog'lanmadi: ${e.message}`, 'danger', undefined, 9000); }
  }

  async function obyektUzish(ob: string) {
    if (!window.confirm(`«${ob}» shu shartnomadan uzilsinmi?\n\n`
      + `Uzilgandan keyin bu obyektning fakt/F2 summasi shartnoma hisobiga `
      + `TUSHMAYDI («—» guruhiga o'tadi).`)) return;
    try {
      /* Bo'sh tanlov = bog'lanish olib tashlanadi */
      await bogSaqla.mutateAsync({ obyekt: ob, tanlov: '', soni: 1 });
      toast(`${ob} uzildi`, 'ok');
    } catch (e: any) { toast(`Uzilmadi: ${e.message}`, 'danger', undefined, 9000); }
  }

  async function tolovOchirish(t: Tolov) {
    if (!window.confirm(`To'lov o'chirilsinmi?\n${t.sana || ''} — `
      + `${(t.summa || 0).toLocaleString('ru-RU')} so'm${t.izoh ? '\n' + t.izoh : ''}`)) return;
    try {
      await tolovOchir.mutateAsync(t.row);
      toast("To'lov o'chirildi", 'ok');
    } catch (e: any) { toast(`O'chirilmadi: ${e.message}`, 'danger', undefined, 9000); }
  }

  const ustunlar: Ustun<ShTur>[] = [
    { kalit: 'no', nom: '№', en: '110px', chiz: (r) => <span className="font-medium text-text">{r.no}</span> },
    {
      kalit: 'nomi', nom: 'Nomi',
      chiz: (r) => (
        <div className="min-w-0">
          <div className="text-text truncate" title={r.nomi}>{r.nomi || '—'}</div>
          <div className="text-[11px] text-text-mute truncate" title={r.taraf}>{r.taraf || '—'}</div>
        </div>
      ),
    },
    { kalit: 'jami', nom: 'Shartnoma summasi', raqam: true, en: '170px', chiz: (r) => <FmtN val={r.jami} /> },
    {
      kalit: 'tolangan', nom: "To'langan", raqam: true, en: '160px',
      chiz: (r) => <span className="text-ok"><FmtN val={tolanganMap[r.no] || 0} /></span>,
    },
    {
      kalit: 'qoldiq', nom: 'Qoldiq', raqam: true, en: '160px',
      chiz: (r) => {
        const qd = (r.jami || 0) - (tolanganMap[r.no] || 0);
        return <span className={qd > 0 ? 'text-warn' : 'text-text-dim'}><FmtN val={qd} /></span>;
      },
    },
    {
      kalit: 'ob', nom: 'Obyektlar', en: '110px',
      chiz: (r) => {
        const n = (obyektMap[r.no] || []).length;
        return <span className="text-text-dim tabular-nums">{n ? `${n} ta` : '—'}</span>;
      },
    },
    {
      kalit: 'holat', nom: 'Holat', en: '120px',
      chiz: (r) => {
        const h = (r.holat || '').toUpperCase();
        return <Nishon matn={r.holat || '—'} tur={h.startsWith('ФАОЛ') ? 'ok' : h.startsWith('ЯКУН') ? 'neytral' : 'warn'} />;
      },
    },
  ];

  return (
    <Sahifa
      sarlavha="Shartnomalar"
      tavsif="Qatorga bosing — batafsil, to'lovlar va tahrirlash ochiladi"
      yangilangan={soragan.dataUpdatedAt}
      onYangila={() => { soragan.refetch(); tolovlar.refetch(); }}
      yangilanmoqda={soragan.isFetching || tolovlar.isFetching}
      amallar={<Qidiruv qiymat={q} ozgardi={setQ} placeholder="№, nomi yoki taraf…" />}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiKarta nom="Shartnomalar" qiymat={jami.soni} />
        <KpiKarta nom="Umumiy summa" qiymat={<FmtN val={jami.summa} />} ost="so'm (NDS bilan)" />
        <KpiKarta nom="To'langan" qiymat={<FmtN val={jami.tolangan} />} ost={jami.summa ? `${Math.round((jami.tolangan / jami.summa) * 100)}%` : undefined} />
        <KpiKarta nom="Qoldiq" qiymat={<FmtN val={jami.qoldiq} />} />
      </div>

      <Holatlar soragan={soragan} bosh={{ matn: 'Shartnoma topilmadi', izoh: 'Google Sheets’dagi «Шартномалар» varag‘i bo‘sh.' }}>
        {() =>
          satrlar.length === 0
            ? <div className="karta py-12 text-center text-text-dim text-sm">«{q}» bo'yicha topilmadi</div>
            : <Jadval ustunlar={ustunlar} satrlar={satrlar} kalit={(r, i) => r.no || String(i)} onSatrBos={setTanlangan} />
        }
      </Holatlar>

      {/* ---------- Batafsil panel ---------- */}
      <Yon
        ochiq={!!tanlangan}
        yop={() => setTanlangan(null)}
        sarlavha={tanlangan?.no ?? ''}
        tavsif={tanlangan?.nomi}
        past={
          <div className="flex gap-3 justify-between items-center">
            {/* O'chirish CHAP tomonda — «Saqlash» yonida turib tasodifan
                bosilmasligi uchun ataylab ajratilgan */}
            <button
              onClick={shartnomaOchirish}
              disabled={shOchir.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px]
                         text-danger hover:bg-danger/10 border border-danger/30
                         transition-colors disabled:opacity-40">
              <Trash2 size={15} />
              {shOchir.isPending ? "O'chirilmoqda…" : "Shartnomani o'chirish"}
            </button>
            <div className="flex gap-3">
              <Tugma onBos={() => setTanlangan(null)}>Yopish</Tugma>
              <Tugma tur="primary" onBos={shartnomaSaqla} band={saqla.isPending} ikonka={<Save size={16} />}>
                Saqlash
              </Tugma>
            </div>
          </div>
        }
      >
        {shakl && (
          <>
            {/* Moliyaviy xulosa */}
            <section className="karta p-4">
              <Juft nom="Shartnoma summasi" qiymat={<FmtN val={shakl.jami} />} />
              <Juft nom="To'langan" qiymat={<span className="text-ok"><FmtN val={tolanganMap[shakl.no] || 0} /></span>} />
              <Juft nom="Qoldiq" qiymat={<span className="text-warn"><FmtN val={(shakl.jami || 0) - (tolanganMap[shakl.no] || 0)} /></span>} />
            </section>

            {/* Bog'langan obyektlar — ⚡ 2026-08-17 (audit): avval faqat
                KO'RSATILARDI. Endi bog'lash/uzish ham mumkin: bog'lanmagan
                obyektning fakt/F2 summasi shartnoma hisobiga tushmaydi, ya'ni
                bu ro'yxat to'g'ri bo'lishi moliyaviy ahamiyatga ega. */}
            <section>
              <h4 className="text-[11px] uppercase tracking-[0.04em] text-text-dim mb-2">
                Bog'langan obyektlar ({(obyektMap[shakl.no] || []).length})
              </h4>
              {(obyektMap[shakl.no] || []).length === 0 ? (
                <p className="text-sm text-text-mute mb-2">Bu shartnomaga obyekt bog'lanmagan.</p>
              ) : (
                <ul className="space-y-1 mb-2">
                  {(obyektMap[shakl.no] || []).map((ob) => (
                    <li key={ob} className="flex items-center gap-2 text-sm text-text group">
                      <Building2 size={14} className="text-accent flex-shrink-0" />
                      <span className="truncate flex-1" title={ob}>{ob}</span>
                      <button
                        onClick={() => obyektUzish(ob)}
                        disabled={bogSaqla.isPending}
                        aria-label="Bog'lanishni uzish"
                        title="Bog'lanishni uzish"
                        className="p-1 rounded text-text-mute hover:text-danger hover:bg-danger/10
                                   opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                                   transition-all disabled:opacity-40">
                        <Unlink size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Tanlov
                  qiymat={bogObyekt}
                  ozgardi={setBogObyekt}
                  variantlar={['', ...(obyektlar.data ?? [])
                    .map((o: any) => o.obyekt)
                    /* Allaqachon SHU shartnomaga bog'langanlarini ko'rsatmaymiz */
                    .filter((o: string) => !(obyektMap[shakl.no] || []).includes(o))]} />
                <Tugma onBos={obyektBoglash} band={bogSaqla.isPending}>Bog'lash</Tugma>
              </div>
              {/* Obyekt boshqa shartnomaga bog'langan bo'lsa — ogohlantiramiz:
                  GAS bitta obyektni faqat BITTA shartnomaga bog'laydi
                  (nom bo'yicha qator almashtiriladi), ya'ni jim ko'chib ketadi */}
              {bogObyekt && (bog.data ?? {})[bogObyekt] && (bog.data ?? {})[bogObyekt] !== shakl.no && (
                <p className="text-[11px] text-warn mt-1.5">
                  Diqqat: «{bogObyekt}» hozir «{(bog.data ?? {})[bogObyekt]}» shartnomasiga
                  bog'langan. Bog'lasangiz u yerdan UZILADI (bir obyekt — bir shartnoma).
                </p>
              )}
            </section>

            {/* ⚡⚡⚡ 2026-08-17 (audit): QO'SHIMCHA ISHLAR — bu bo'lim saytda
                BUTUNLAY yo'q edi (GAS API si bor, o'quvchi hook yozilmagan).
                Bular shartnoma summasidan TASHQARI bajarilgan ishlar; ular
                asl smetaga qo'shilmaydi, alohida hisoblanadi. */}
            <section>
              <h4 className="text-[11px] uppercase tracking-[0.04em] text-text-dim mb-2">
                Qo'shimcha ishlar ({shQoshIshlari.length})
              </h4>
              {qoshIshlar.isLoading ? (
                <div className="skel h-12 rounded mb-3" />
              ) : shQoshIshlari.length === 0 ? (
                <p className="text-sm text-text-mute mb-3">
                  Shartnomadan tashqari ish qayd etilmagan.
                </p>
              ) : (
                <div className="karta divide-y divide-border mb-3">
                  {shQoshIshlari.map((qi) => (
                    <div key={qi.row} className="px-3 py-2 flex items-center justify-between gap-3 text-sm group">
                      <div className="min-w-0">
                        <div className="text-text truncate" title={qi.nomi}>{qi.nomi}</div>
                        {qi.izoh && <div className="text-[11px] text-text-mute truncate">{qi.izoh}</div>}
                        {(qi.fakt || qi.f2ol) ? (
                          <div className="text-[11px] text-text-mute tabular-nums">
                            fakt <FmtN val={qi.fakt} /> · F2 <FmtN val={qi.f2ol} />
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-accent tabular-nums"><FmtN val={qi.smeta} /></span>
                        <button
                          onClick={() => qoshIshOchirish(qi)}
                          disabled={qoshIshOchir.isPending}
                          aria-label="Qo'shimcha ishni o'chirish"
                          title="O'chirish"
                          className="p-1 rounded text-text-mute hover:text-danger hover:bg-danger/10
                                     opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                                     transition-all disabled:opacity-40">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="karta p-3 space-y-3">
                <p className="text-[11px] uppercase tracking-[0.04em] text-text-dim">Yangi qo'shimcha ish</p>
                <Maydon nom="Ish nomi">
                  <Kiritma qiymat={yangiQosh.nomi}
                    ozgardi={(v) => setYangiQosh({ ...yangiQosh, nomi: v })}
                    placeholder="masalan: Qo'shimcha drenaj" />
                </Maydon>
                <Maydon nom="Smeta summasi">
                  <Kiritma tur="money" qiymat={yangiQosh.smeta}
                    ozgardi={(v) => setYangiQosh({ ...yangiQosh, smeta: v })} />
                </Maydon>
                <Maydon nom="Izoh">
                  <Kiritma qiymat={yangiQosh.izoh}
                    ozgardi={(v) => setYangiQosh({ ...yangiQosh, izoh: v })}
                    placeholder="ixtiyoriy" />
                </Maydon>
                <Tugma onBos={qoshIshQoshish} band={qoshIshSaqla.isPending} ikonka={<Plus size={16} />}>
                  Qo'shimcha ish qo'shish
                </Tugma>
              </div>
            </section>

            {/* Tahrirlash */}
            <section className="space-y-3">
              <h4 className="text-[11px] uppercase tracking-[0.04em] text-text-dim">Ma'lumotlar</h4>
              <Maydon nom="№"><Kiritma qiymat={shakl.no} ozgardi={() => {}} ozgarmas /></Maydon>
              <Maydon nom="Nomi"><Kiritma qiymat={shakl.nomi} ozgardi={(v) => setShakl({ ...shakl, nomi: v })} /></Maydon>
              <Maydon nom="Taraf"><Kiritma qiymat={shakl.taraf} ozgardi={(v) => setShakl({ ...shakl, taraf: v })} /></Maydon>
              <div className="grid grid-cols-2 gap-3">
                <Maydon nom="Summa"><Kiritma tur="money" qiymat={shakl.summa} ozgardi={(v) => { const sm = Number(v) || 0; setShakl({ ...shakl, summa: sm, jami: sm + (Number(shakl.nds) || 0) }); }} /></Maydon>
                <Maydon nom="NDS"><Kiritma tur="money" qiymat={shakl.nds} ozgardi={(v) => { const nd = Number(v) || 0; setShakl({ ...shakl, nds: nd, jami: (Number(shakl.summa) || 0) + nd }); }} /></Maydon>
              </div>
              {/* ⚡⚡⚡ 2026-08-16 (audit H15 — TASDIQLANDI): Summa yoki NDS
                  o'zgarganda JAMI qayta hisoblanmasdi — shartnoma ESKI jami
                  bilan saqlanardi va buxgalteriyaga NOTO'G'RI summa tushardi.
                  Endi ikkalasi ham Jami ni yangilaydi. Jami qo'lda ham
                  tuzatilishi mumkin (yaxlitlash farqi uchun). */}
              <Maydon nom="Jami" izoh="Summa + NDS (avtomatik, qo'lda ham tuzatsa bo'ladi)">
                <Kiritma tur="money" qiymat={shakl.jami} ozgardi={(v) => setShakl({ ...shakl, jami: Number(v) || 0 })} />
              </Maydon>
              <Maydon nom="Holat"><Tanlov qiymat={shakl.holat || HOLATLAR[0]} ozgardi={(v) => setShakl({ ...shakl, holat: v })} variantlar={HOLATLAR} /></Maydon>
              <Maydon nom="Izoh"><Kiritma qiymat={shakl.izoh} ozgardi={(v) => setShakl({ ...shakl, izoh: v })} /></Maydon>
            </section>

            {/* To'lovlar */}
            <section>
              <h4 className="text-[11px] uppercase tracking-[0.04em] text-text-dim mb-2">
                To'lovlar ({shTolovlari.length})
              </h4>
              {shTolovlari.length === 0 ? (
                <p className="text-sm text-text-mute mb-3">Hali to'lov qayd etilmagan.</p>
              ) : (
                <div className="karta divide-y divide-border mb-3">
                  {shTolovlari.map((t) => (
                    <div key={t.row} className="px-3 py-2 flex items-center justify-between gap-3 text-sm group">
                      <div className="min-w-0">
                        <div className="text-text tabular-nums">{t.sana}</div>
                        {t.izoh && <div className="text-[11px] text-text-mute truncate">{t.izoh}</div>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-ok tabular-nums"><FmtN val={t.summa} /></span>
                        {/* Har to'lovni alohida o'chirish — xato summa «To'langan»
                            ni shishirib turmasin */}
                        <button
                          onClick={() => tolovOchirish(t)}
                          disabled={tolovOchir.isPending}
                          aria-label="To'lovni o'chirish"
                          title="To'lovni o'chirish"
                          className="p-1 rounded text-text-mute hover:text-danger hover:bg-danger/10
                                     opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                                     transition-all disabled:opacity-40">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="karta p-3 space-y-3">
                <p className="text-[11px] uppercase tracking-[0.04em] text-text-dim">Yangi to'lov</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* ⚡ 2026-08-16: shartnoma bir necha obyektga tegishli bo'lsa
                      to'lov qaysi biriga yozilishini TANLASH kerak */}
                  {((obyektMap[tanlangan?.no ?? ''] || []).length > 1) && (
                    <Maydon nom="Qaysi obyektga" izoh="Bu shartnoma bir necha obyektga tegishli">
                      <Tanlov
                        qiymat={yangiTolov.obyekt || (obyektMap[tanlangan?.no ?? ''] || [])[0] || ''}
                        ozgardi={(v) => setYangiTolov({ ...yangiTolov, obyekt: v })}
                        variantlar={obyektMap[tanlangan?.no ?? ''] || []} />
                    </Maydon>
                  )}
                  <Maydon nom="Sana"><Kiritma tur="date" qiymat={yangiTolov.sana} ozgardi={(v) => setYangiTolov({ ...yangiTolov, sana: v })} /></Maydon>
                  <Maydon nom="Summa"><Kiritma tur="money" qiymat={yangiTolov.summa} ozgardi={(v) => setYangiTolov({ ...yangiTolov, summa: v })} /></Maydon>
                </div>
                <Maydon nom="Izoh"><Kiritma qiymat={yangiTolov.izoh} ozgardi={(v) => setYangiTolov({ ...yangiTolov, izoh: v })} placeholder="ixtiyoriy" /></Maydon>
                <Tugma onBos={tolovQosh} band={tolovYoz.isPending} ikonka={<Plus size={16} />}>To'lov qo'shish</Tugma>
              </div>
            </section>
          </>
        )}
      </Yon>
    </Sahifa>
  );
}

export default Shartnoma;
