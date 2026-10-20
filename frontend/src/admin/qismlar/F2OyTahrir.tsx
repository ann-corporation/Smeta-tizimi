import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { reportMoneyValidity } from '../../lib/money-input';
/**
 * F2OyTahrir.tsx — KIRITILGAN F2 NI QATOR DARAJASIDA BOSHQARISH
 *
 * Foydalanuvchi: «kiritilgan f2 ni tahrirlash mumkin bo'lishi kerak, qaysi
 * f2 bilan bog'langani va tahrirlash bosilgan aynan o'sha f2 ni smeta tarafi
 * bilan bog'lanishi ochilishi kerak, agar xato bog'langan yoki boshqacha
 * bo'lsa o'sha joyni o'zidagi o'zgarish lrv plusda ham shu o'zgarishni
 * bera olishi kerak».
 *
 * BU OYNA: oyga yozilgan HAR BIR qatorni ko'rsatadi —
 *   chapda SMETA tarafi (kod/nom/birlik/smeta hajmi va narxi)
 *   o'ngda  F2 tarafi (hajm/narx/summa) — TAHRIRLANADI
 * Saqlash → `apiF2QatorTahrir` → LRV_PLUS darhol yangilanadi.
 * Butun oy qayta yozilmaydi — faqat siz tekkan qatorlar.
 */
import { useState, useMemo, useRef } from 'react';
import { X, Save, Trash2, AlertTriangle, Search, MoveRight, Check, Lock, Unlock, Undo2 } from 'lucide-react';
import { useF2OyTafsilot, useF2QatorTahrir, useF2PriamoyZatrat,
         useF2Undo, useF2Muhr, useF2MuhrHolat, useF2Bosliqlar, type F2OyQator } from '../../api/hooks';
import { rangFon, rangChiziq, turNomi, belgiRamka, turBelgi } from '../../umumiy/turRang';

const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Ozg = { hajm?: number; narx?: number; summa?: number; ochir?: boolean };

export default function F2OyTahrir({
  obyekt, oyNom, onYopish, toast,
}: {
  obyekt: string; oyNom: string; onYopish: () => void;
  toast: (m: string, t?: string, x?: unknown, ms?: number) => void;
}) {
  const tafsilot = useF2OyTafsilot(obyekt, oyNom);
  const moneyScope = useRef<HTMLDivElement>(null);
  const tahrir = useF2QatorTahrir();
  /* ПРЯМЫЕ ЗАТРАТЫ — F2 hujjatidagi raqam bilan to'g'ridan-to'g'ri solishtiriladi */
  const pz = useF2PriamoyZatrat(obyekt, oyNom);
  const undo = useF2Undo();
  const muhr = useF2Muhr();
  const muhrHolat = useF2MuhrHolat(obyekt, oyNom);
  const qulf = !!muhrHolat.data?.muhrlangan;
  /* Hujjat jamini kiritsangiz — tizim yo'qolgan pulni O'ZI qidiradi */
  const [hujJami, setHujJami] = useState('');
  const [hujQidir, setHujQidir] = useState<number | null>(null);
  const bosliq = useF2Bosliqlar(obyekt, oyNom, hujQidir);

  /* Faqat o'zgargan qatorlar saqlanadi — kalit: sub||varaq||row */
  const [ozgarishlar, setOzgarishlar] = useState<Record<string, Ozg>>({});
  const [qidiruv, setQidiruv] = useState('');
  const [faqatMuammo, setFaqatMuammo] = useState(false);

  const kalit = (q: F2OyQator) => `${q.sub}||${q.varaq}||${q.row}`;

  const qatorlar = tafsilot.data?.qatorlar ?? [];

  const korinadigan = useMemo(() => {
    const s = qidiruv.trim().toLowerCase();
    return qatorlar.filter((q) => {
      if (faqatMuammo && !q.nomuvofiq) return false;
      if (!s) return true;
      return (q.nom || '').toLowerCase().includes(s) ||
             (q.kod || '').toLowerCase().includes(s) ||
             (q.varaq || '').toLowerCase().includes(s);
    });
  }, [qatorlar, qidiruv, faqatMuammo]);

  /* Jonli jami — tahrirlar hisobga olinadi, saqlashdan oldin ko'rinadi */
  const jonliJami = useMemo(() => {
    let s = 0;
    qatorlar.forEach((q) => {
      const o = ozgarishlar[kalit(q)];
      if (o?.ochir) return;
      if (o && o.summa !== undefined) { s += o.summa; return; }
      if (o && (o.hajm !== undefined || o.narx !== undefined)) {
        s += (o.hajm ?? q.hajm) * (o.narx ?? q.narx);
        return;
      }
      s += q.summa;
    });
    return s;
  }, [qatorlar, ozgarishlar]);

  /* ⚡ KO'CHIRISH holati — `ozgarganSoni` shuni ham hisoblagani uchun
   * BU YERDA e'lon qilinadi (pastda bo'lsa TDZ xatosi beradi). */
  const [kochirId, setKochirId] = useState<string | null>(null);
  const [kochirQator, setKochirQator] = useState('');
  const [kochirishlar, setKochirishlar] = useState<Record<string, number>>({});

  const ozgarganSoni = new Set([...Object.keys(ozgarishlar), ...Object.keys(kochirishlar)]).size;

  /* Bu oyga qaysi F2 lar tushgan — har biri alohida bekor qilinadi */
  const uidRoyxat = useMemo(() => {
    const m = new Map<string, number>();
    qatorlar.forEach((q) => { if (q.uid) m.set(q.uid, (m.get(q.uid) || 0) + 1); });
    return [...m.entries()].map(([uid, soni]) => ({ uid, soni }));
  }, [qatorlar]);

  const yangila = (q: F2OyQator, maydon: keyof Ozg, qiymat: number | boolean) => {
    setOzgarishlar((p) => {
      const k = kalit(q);
      const yangi = { ...(p[k] || {}), [maydon]: qiymat } as Ozg;
      /* ⚡⚡⚡ 2026-08-16 TUZATILDI (Antigravity auditi C3 — TASDIQLANDI).
       * Sharti `yangi.summa === undefined` edi. Ketma-ketlik:
       *   1) foydalanuvchi HAJM ni o'zgartiradi → summa hisoblanadi
       *   2) keyin NARX ni o'zgartiradi → `yangi.summa` endi undefined EMAS
       *      (1-qadamda yozilgan) → shart bajarilmaydi → SUMMA ESKI QOLADI
       * Natijada narx o'zgargan, summa esa eski — smetaga NOTO'G'RI pul
       * yoziladi va buni ko'z bilan payqash qiyin.
       * ENDI: hajm yoki narx tegilsa summa DOIM qayta hisoblanadi.
       * (Summani qo'lda kiritish alohida maydon orqali — u bu yerga tushmaydi.) */
      if (maydon === 'hajm' || maydon === 'narx') {
        const h = yangi.hajm ?? q.hajm;
        const n = yangi.narx ?? q.narx;
        yangi.summa = Math.round(h * n * 10000) / 10000;
      }
      return { ...p, [k]: yangi };
    });
  };

  /* KO'CHIRISH: qiymat noto'g'ri qatorga tushgan bo'lsa — eskisini
   * tozalab, yangisiga yozadi. Ikkalasi BIR chaqiruvda ketadi, ya'ni
   * oraliq holatda ma'lumot yo'qolmaydi. */
  const kochirTasdiq = (q: F2OyQator) => {
    const yangiRow = Number(kochirQator);
    if (!isFinite(yangiRow) || yangiRow < 2) { toast('Qator raqamini to\'g\'ri kiriting', 'warn'); return; }
    if (yangiRow === q.row) { setKochirId(null); return; }
    setKochirishlar((p) => ({ ...p, [kalit(q)]: yangiRow }));
    setKochirId(null);
  };

  const saqla = () => {
    if (!reportMoneyValidity(moneyScope.current)) return;
    const roy = Object.entries(ozgarishlar).map(([k, v]) => {
      const [sub, varaq, row] = k.split('||');
      return { sub, varaq, row: Number(row), ...v };
    });

    /* Ko'chirilganlar: eski qator tozalanadi + yangi qatorga yoziladi */
    Object.entries(kochirishlar).forEach(([k, yangiRow]) => {
      const [sub, varaq, row] = k.split('||');
      const q = qatorlar.find((x) => kalit(x) === k);
      if (!q) return;
      const o = ozgarishlar[k] || {};
      const h = o.hajm ?? q.hajm, n = o.narx ?? q.narx;
      const s = o.summa ?? Math.round(h * n * 10000) / 10000;
      /* eskisini ro'yxatdan olib tashlaymiz — o'rniga tozalash qo'yamiz */
      const idx = roy.findIndex((r) => r.sub === sub && r.varaq === varaq && r.row === Number(row));
      if (idx >= 0) roy.splice(idx, 1);
      roy.push({ sub, varaq, row: Number(row), ochir: true });
      roy.push({ sub, varaq, row: yangiRow, hajm: h, narx: n, summa: s });
    });

    if (!roy.length) return;
    tahrir.mutate({ obyekt, oyNom, ozgarishlar: roy }, {
      onSuccess: (r) => {
        if (r.ok) {
          toast(r.xabar || `${r.yozildi} qator yangilandi`, 'ok', undefined, 6000);
          setOzgarishlar({}); setKochirishlar({});
        } else {
          toast(r.xabar || 'Saqlashda xato', 'danger', undefined, 8000);
        }
        if (r.xatolar?.length) toast(r.xatolar.slice(0, 3).join(' · '), 'warn', undefined, 9000);
      },
      onError: (e: Error) => toast(e.message, 'danger'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div ref={moneyScope} className="bg-[var(--surface)] border border-border rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Sarlavha */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h3 className="font-medium text-text">«{oyNom}» — yozilgan qatorlar</h3>
            <p className="text-[11px] text-text-mute mt-0.5">
              {tafsilot.isLoading ? 'O\'qilmoqda…' : (
                <>
                  {tafsilot.data?.soni ?? 0} qator · {tafsilot.data?.uidSoni ?? 0} ta F2 dan
                  {(tafsilot.data?.nomuvofiqSoni ?? 0) > 0 && (
                    <span className="text-amber-400"> · {tafsilot.data?.nomuvofiqSoni} nomuvofiq</span>
                  )}
                  {tafsilot.data?.vaqt && <span className="opacity-60"> · {tafsilot.data.vaqt}</span>}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* ⚡ MUHR — tekshirilgan oyni tasodifan qayta yozishdan saqlaydi.
                Muhrlangan bo'lsa GAS ham yozishdan bosh tortadi (37/38 da tekshiruv). */}
            <button
              onClick={() => {
                const och = qulf;
                if (!och && !window.confirm(
                  `«${oyNom}» muhrlanadi.\n\nBundan keyin bu oyga F2 yozib bo'lmaydi va ` +
                  `qatorlari tahrirlanmaydi — tasodifan buzilmasligi uchun.\n\nDavom etamizmi?`)) return;
                muhr.mutate({ obyekt, oyNom, och }, {
                  onSuccess: (r) => toast(r.xabar || 'Bajarildi', r.ok ? 'ok' : 'danger', undefined, 6000),
                  onError: (e: Error) => toast(e.message, 'danger'),
                });
              }}
              disabled={muhr.isPending}
              title={qulf ? 'Muhrni ochish' : 'Bu oyni muhrlash'}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors
                          disabled:opacity-40 ${qulf
                            ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                            : 'bg-white/5 text-text-mute hover:bg-white/10'}`}>
              {qulf ? <Lock size={12} /> : <Unlock size={12} />}
              {qulf ? 'Muhrlangan' : 'Muhrlash'}
            </button>
            <button onClick={onYopish} className="p-1.5 rounded hover:bg-white/10 text-text-mute">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Muhrlangan bo'lsa — nima uchun tahrirlab bo'lmasligini aytamiz */}
        {qulf && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-200">
            🔒 Bu oy muhrlangan — tahrirlash va qayta yozish taqiqlangan.
            {muhrHolat.data?.malumot?.kim && <span className="opacity-80"> ({muhrHolat.data.malumot.kim})</span>}
            {' '}O'zgartirish uchun avval muhrni oching.
          </div>
        )}

        {/* ⚡⚡⚡ ПРЯМЫЕ ЗАТРАТЫ — foydalanuvchi javobi bo'yicha (2026-08-15):
            «rs mat ob qatorlarini chel-chas, mash-chas, resurs, oborudovaniya
            kabi yonda ajratiladigan ustunlaridan yig'ilishi kerak».
            Bitta «Всего» katagi qidirilmaydi — QATORLAB yig'iladi va ИШ (bl)
            qatorlari qo'shilmaydi (ular resurslarning yig'indisi). Shu raqam
            F2 hujjatidagi «прямые затраты» bilan to'g'ridan-to'g'ri solishtiriladi. */}
        {pz.data?.ok && (
          <div className="px-4 py-2 border-b border-border bg-accent/5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-text-mute">ПРЯМЫЕ ЗАТРАТЫ (hujjat bilan solishtiring):</span>
              <span className="text-[14px] font-medium text-text">{fmt(pz.data.priamoyZatrat)} so'm</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Object.entries(pz.data.kategoriyalar)
                .filter(([, v]) => Number(v) !== 0)
                .map(([k, v]) => (
                  <span key={k} className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-text-mute">
                    {k}: <span className="text-text">{fmt(Number(v))}</span>
                  </span>
                ))}
            </div>
            {pz.data.blOtkazildi > 0 && (
              <p className="text-[10px] text-text-mute mt-1">
                {pz.data.blOtkazildi} ta ИШ (bl) qatori qo'shilmadi — ular resurslarning
                yig'indisi, qo'shilsa ikki baravar sanalardi.
              </p>
            )}
          </div>
        )}

        {/* ⚡⚡⚡ 2026-08-15 BO'SHLIQ TOPUVCHI (apiF2Bosliqlar).
            Jonli holat: Sentyabr-2025 da hujjatda 8 151 662 266.27,
            smetada 7 931 314 902.06 — 220 347 364.21 yetishmayapti.
            Foydalanuvchidan «raqamlarni solishtiring» deb SO'RAMAYMIZ —
            hujjat jamini kiriting, tizim yo'qolgan pulni O'ZI qidiradi. */}
        <div className="px-4 py-2 border-b border-border bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-mute whitespace-nowrap">
              Hujjat jami (итог):
            </span>
            <MoneyInput
              value={hujJami}
              onValueChange={(moneyValue) => setHujJami(moneyValue)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const v = Number(hujJami.replace(/\s/g, '').replace(',', '.'));
                if (isFinite(v) && v > 0) setHujQidir(v);
              }}
              placeholder="8151662266.27"
              className="w-44 px-2 py-1 rounded bg-white/5 border border-white/10
                         text-[12px] text-text outline-none focus:border-accent/50" />
            <button
              onClick={() => {
                const v = Number(hujJami.replace(/\s/g, '').replace(',', '.'));
                if (!isFinite(v) || v <= 0) { toast('Summani kiriting', 'warn'); return; }
                setHujQidir(v);
              }}
              className="px-2.5 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25
                         text-[11px] font-medium transition-colors">
              🔍 Yo'qolgan pulni top
            </button>
          </div>

          {bosliq.data?.ok && bosliq.data.yetishmayotgan !== null && (
            <div className={`mt-2 p-2 rounded border text-[11px] ${
              Math.abs(bosliq.data.yetishmayotgan) < 1
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'}`}>
              <div className="flex justify-between font-medium text-text">
                <span>Yetishmayotgan:</span>
                <span className={Math.abs(bosliq.data.yetishmayotgan) < 1
                                   ? 'text-emerald-400' : 'text-amber-300'}>
                  {fmt(bosliq.data.yetishmayotgan)} so'm
                </span>
              </div>
              <p className="mt-1 text-text-mute leading-snug">{bosliq.data.xulosa}</p>

              {/* ⚠ NARXSIZ QATORLAR — AYB EMAS, MA'LUMOT.
                  Foydalanuvchi: «bazi resurslar o'zi narxlanmagan bo'ladi,
                  ularga ham narx qo'yib mani qamatib yubormasin».
                  Shuning uchun bu blok qizil OGOHLANTIRISH emas, xolis
                  ma'lumot. «agar narxlansa» summasi hech qayerga
                  yozilmaydi — u faqat kattaligini tasavvur qilish uchun. */}
              {bosliq.data.hajmBorPulYoq.soni > 0 && (
                <div className="mt-1.5 px-2 py-1 rounded bg-white/5">
                  <span className="text-text font-medium">
                    ℹ {bosliq.data.hajmBorPulYoq.soni} qator NARXSIZ
                  </span>
                  <span className="text-text-mute"> — F2 da ularga narx berilmagan.
                    Bu odatda <b>normal</b> holat va tizim o'zidan narx <b>qo'ymaydi</b>.
                    Agar narx bo'lishi kerak bo'lsa — F2 hujjatining o'zini tekshiring.</span>
                  <div className="text-[10px] text-text-mute/70 mt-0.5">
                    Ma'lumot uchun: smeta narxida bo'lganda ≈ {fmt(bosliq.data.hajmBorPulYoq.agarNarxlansaPul)} so'm
                    bo'lardi (hech qayerga yozilmaydi).
                  </div>
                </div>
              )}
              {bosliq.data.summaNomuvofiq.soni > 0 && (
                <p className="mt-1 text-amber-300">
                  ⚠ {bosliq.data.summaNomuvofiq.soni} qatorda summa ≠ hajm×narx
                  ({fmt(bosliq.data.summaNomuvofiq.farqPul)} so'm) — «faqat nomuvofiqlar» filtrini yoqing
                </p>
              )}
              {bosliq.data.hajmYoqPulBor.soni > 0 && (
                <p className="mt-1 text-amber-300">
                  ⚠ {bosliq.data.hajmYoqPulBor.soni} qatorda hajm yo'q lekin pul bor
                  ({fmt(bosliq.data.hajmYoqPulBor.pul)} so'm)
                </p>
              )}
            </div>
          )}
        </div>

        {/* Asboblar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-white/[0.02]">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-mute" />
            <input
              value={qidiruv} onChange={(e) => setQidiruv(e.target.value)}
              placeholder="Nom, kod yoki varaq…"
              className="w-full pl-7 pr-2 py-1.5 rounded bg-white/5 border border-white/10
                         text-[12px] text-text placeholder:text-text-mute outline-none
                         focus:border-accent/50"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-text-mute cursor-pointer">
            <input type="checkbox" checked={faqatMuammo}
                   onChange={(e) => setFaqatMuammo(e.target.checked)} />
            Faqat nomuvofiqlar
          </label>
          <div className="flex-1" />
          {/* ⚡ UNDO — bu oyga tushgan har bir F2 alohida bekor qilinadi.
              Hozirgi «Tozalash» butun oyni o'chiradi; bir oyga ikki F2
              tushgan bo'lsa ikkalasi ham yo'qolardi. */}
          {uidRoyxat.map((u) => (
            <button key={u.uid}
              onClick={() => {
                if (!window.confirm(
                  `«${u.uid.slice(0, 12)}…» F2 dan kelgan ${u.soni} qator BEKOR QILINADI.\n\n` +
                  `Bu oydagi boshqa F2 larga tegilmaydi.\n\nDavom etamizmi?`)) return;
                undo.mutate({ obyekt, oyNom, uid: u.uid }, {
                  onSuccess: (r) => toast(r.xabar || 'Bajarildi', r.ok ? 'ok' : 'warn', undefined, 8000),
                  onError: (e: Error) => toast(e.message, 'danger'),
                });
              }}
              disabled={qulf || undo.isPending}
              title={`Bu F2 ni bekor qilish (${u.soni} qator)`}
              className="flex items-center gap-1 px-1.5 py-1 rounded bg-red-500/10 text-red-400
                         hover:bg-red-500/20 text-[10px] transition-colors disabled:opacity-30">
              <Undo2 size={11} /> {u.uid.slice(0, 6)} ({u.soni})
            </button>
          ))}
          <div className="text-[12px] text-text-mute">
            Jami: <span className="font-medium text-text">{fmt(jonliJami)}</span> so'm
            {ozgarganSoni > 0 && (
              <span className="ml-2 text-amber-300">({ozgarganSoni} o'zgardi)</span>
            )}
          </div>
        </div>

        {/* Jadval */}
        <div className="flex-1 overflow-auto">
          {tafsilot.isLoading ? (
            <div className="p-6 space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skel h-9 rounded" />)}
            </div>
          ) : !korinadigan.length ? (
            <p className="text-center text-sm text-text-mute py-10">
              {qatorlar.length ? 'Filtrga mos qator yo\'q' : 'Bu oyga hech narsa yozilmagan'}
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[var(--surface-2)] text-text-mute">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium">Tur</th>
                  <th className="px-2 py-1.5 font-medium">Smeta tarafi</th>
                  <th className="px-2 py-1.5 font-medium text-right">Smeta hajmi</th>
                  <th className="px-2 py-1.5 font-medium text-right">F2 hajm</th>
                  <th className="px-2 py-1.5 font-medium text-right">Narx</th>
                  <th className="px-2 py-1.5 font-medium text-right">Summa</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {korinadigan.map((q) => {
                  const k = kalit(q);
                  const o = ozgarishlar[k];
                  const ochirilgan = !!o?.ochir;
                  const belgi = turBelgi(q.marker);
                  return (
                    <tr key={k}
                        className={`border-b border-white/5 border-l-2 ${rangChiziq(q.marker)}
                                    ${ochirilgan ? 'opacity-40 line-through' : ''}
                                    ${o && !ochirilgan ? 'bg-amber-500/5' : ''}
                                    hover:bg-white/[0.03]`}>
                      <td className="px-2 py-1.5 align-top">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium
                                          ${rangFon(q.marker)} ${belgiRamka(q.marker)}`}>
                          {turNomi(q.marker)}
                        </span>
                        {belgi && (
                          <span className={`ml-1 text-[9px] ${belgi === 'zamena' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {belgi === 'zamena' ? '~' : '+'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-top max-w-[280px]">
                        <div className="text-text truncate" title={q.nom}>{q.nom || '—'}</div>
                        <div className="text-[10px] text-text-mute truncate">
                          {q.kod && <span className="mr-1">{q.kod}</span>}
                          <span className="opacity-70">{q.varaq}:{q.row}</span>
                          {q.uid && <span className="ml-1 opacity-50" title={`F2 uid: ${q.uid}`}>· {q.uid.slice(0, 8)}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right align-top text-text-mute whitespace-nowrap">
                        {fmt(q.smetaHajm)} <span className="opacity-60">{q.birlik}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right align-top">
                        <input type="number" step="any" disabled={ochirilgan}
                          defaultValue={q.hajm}
                          onChange={(e) => yangila(q, 'hajm', Number(e.target.value) || 0)}
                          className="w-24 px-1.5 py-1 rounded bg-white/5 border border-white/10
                                     text-right text-text outline-none focus:border-accent/50
                                     disabled:opacity-40" />
                      </td>
                      <td className="px-2 py-1.5 text-right align-top">
                        <MoneyInput numericValue  step="any" disabled={ochirilgan}
                          defaultValue={q.narx}
                          onValueChange={(moneyValue) => yangila(q, 'narx', Number(moneyValue) || 0)}
                          className="w-28 px-1.5 py-1 rounded bg-white/5 border border-white/10
                                     text-right text-text outline-none focus:border-accent/50
                                     disabled:opacity-40" />
                      </td>
                      <td className="px-2 py-1.5 text-right align-top whitespace-nowrap">
                        <span className={q.nomuvofiq ? 'text-amber-300' : 'text-text'}>
                          {fmt(o?.summa ?? q.summa)}
                        </span>
                        {q.nomuvofiq && (
                          <AlertTriangle size={11} className="inline ml-1 text-amber-400"
                            aria-label="summa ≠ hajm × narx" />
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-top whitespace-nowrap">
                        {kochirId === k ? (
                          <span className="inline-flex items-center gap-1">
                            <input autoFocus value={kochirQator} onChange={(e) => setKochirQator(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') kochirTasdiq(q); if (e.key === 'Escape') setKochirId(null); }}
                              placeholder="qator" className="w-16 px-1 py-0.5 rounded bg-white/10 border border-accent/50 text-[11px] text-text outline-none" />
                            <button onClick={() => kochirTasdiq(q)} className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10"><Check size={12} /></button>
                          </span>
                        ) : (
                          <button
                            onClick={() => { setKochirId(k); setKochirQator(String(kochirishlar[k] ?? q.row)); }}
                            title="Boshqa qatorga ko'chirish"
                            className={`p-1 rounded transition-colors mr-0.5 ${kochirishlar[k] ? 'text-accent bg-accent/10' : 'text-text-mute hover:text-accent hover:bg-accent/10'}`}>
                            <MoveRight size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => yangila(q, 'ochir', !ochirilgan)}
                          title={ochirilgan ? 'Bekor qilish' : 'Bu qatorni tozalash'}
                          className={`p-1 rounded transition-colors ${
                            ochirilgan ? 'text-emerald-400 hover:bg-emerald-500/10'
                                       : 'text-text-mute hover:text-red-400 hover:bg-red-500/10'}`}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pastki panel */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-[11px] text-text-mute">
            {ozgarganSoni
              ? `${ozgarganSoni} qator o'zgardi — saqlansa LRV_PLUS darhol yangilanadi`
              : 'O\'zgarish yo\'q'}
          </p>
          <div className="flex gap-2">
            <button onClick={onYopish}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10
                         text-[12px] text-text hover:bg-white/10 transition-colors">
              Yopish
            </button>
            <button onClick={saqla} disabled={!ozgarganSoni || tahrir.isPending || qulf}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-[12px] font-medium
                         hover:bg-accent/90 transition-colors disabled:opacity-40
                         flex items-center gap-1.5">
              <Save size={13} />
              {tahrir.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
