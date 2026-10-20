import { MoneyInput } from '../../umumiy/ui/MoneyInput';
/**
 * ShaxsiySmeta.tsx — SHAXSIY SMETA (eski GAS paneldagi «📝 Шахсий смета»)
 *
 * NIMA UCHUN KERAK: rasmiy loyiha smetasiga bog'liq bo'lmagan kichik ish
 * uchun tez smeta tuzish. Ish turlari kutubxonasidan qidirib topiladi,
 * hajm kiritiladi, natija yangi Google jadval sifatida chiqadi.
 *
 * ══════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-17 — BU SAHIFA BUTUNLAY ISHLAMASDI (qayta yozildi)
 * ══════════════════════════════════════════════════════════════════
 * Foydalanuvchi: «шахсий смета бўлими умуман ишламайди ва жуда ноқулай».
 * Tekshirildi — ikki tomonlama uzilish bor edi:
 *
 * 1) O'QISHDA. `apiIshTurQidir` HAQIQATDA quyidagini qaytaradi:
 *        { key, blKod, blNom, blBirlik, fmt, manba, rs[], score }
 *    Sahifa esa `x.nom`, `x.kod`, `x.birlik`, `x.narx` ni o'qirdi —
 *    bu maydonlar javobda YO'Q. Ya'ni qidiruv ishlagan, natija kelgan,
 *    lekin ekranda BO'SH QATORLAR turardi. Qo'shilganda ham `kod`
 *    `undefined` bo'lgani uchun `some(i => i.kod === x.kod)` darhol
 *    `true` beradi — birinchi ishdan keyin BOSHQA HECH NARSA
 *    qo'shilmasdi.
 *
 * 2) YOZISHDA. `apiShaxsiySmetaYarat` har ish uchun `ishlar[i].rs`
 *    (resurs normalari) ni kutadi — smetaning PULI shu ro'yxatdan
 *    hisoblanadi. Sahifa esa `rs` ni UMUMAN yubormasdi. Demak hatto
 *    ishlagan taqdirda ham natija NOL summali hujjat bo'lardi.
 *
 * ══════════════════════════════════════════════════════════════════
 * NARX HAQIDA QAT'IY QOIDA
 * ══════════════════════════════════════════════════════════════════
 * Bu ekran narxni O'ZIDAN TO'QIMAYDI. Resurs narxlari markazlashgan
 * narx bazasida (GAS `_shSmetaNarxMap`) va faqat server biladi.
 * Shuning uchun ro'yxatda «taxminiy summa» ko'rsatilmaydi — soxta raqam
 * ko'rsatgandan ko'ra ko'rsatmaslik to'g'ri. Haqiqiy pul yaratilgan
 * jadvalda chiqadi.
 * Istisno: ishchi-soat stavkasini foydalanuvchi O'ZI kiritishi mumkin
 * (`chelStavka`) — u kiritilsa ЧЕЛ resurslari shu stavkada narxlanadi.
 */
import { useState, useMemo } from 'react';
import { NotebookPen, Search, Plus, Trash2, ExternalLink, FileSpreadsheet, Info } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { useShaxsiySmetalar, useIshTurQidir, useShaxsiySmetaYarat,
         type IshTuriTopilma } from '../../api/hooks';

/* WARN 2026-08-17 (2-tuzatish): natijani IKKALA SHAKLGA ham chidamli o’qiymiz.
 *
 * Foydalanuvchi: "bu yerda birortayam ishni tanlashni imkoni yo’q" — ekranda
 * BO’SH QUTILAR turardi. Sabab: GAS javobi `blNom/blKod/blBirlik` bilan
 * keladi, sahifa esa `nom/kod/birlik` o’qirdi.
 *
 * Endi ikkalasi ham qabul qilinadi. Bu "hamma narsani yutish" emas: agar
 * NOM UMUMAN topilmasa, qator BO’SH CHIZILMAYDI — kod yoki aniq
 * "nomsiz yozuv" ogohlantirishi ko’rsatiladi. Jim bo’shliq eng yomon
 * holat: foydalanuvchi nima bo’layotganini bilmaydi. */
type XomTopilma = IshTuriTopilma & {
  nom?: string; kod?: string; birlik?: string;
};

function moslash(x: XomTopilma) {
  const nom    = (x.blNom    || x.nom    || "").trim();
  const kod    = (x.blKod    || x.kod    || "").trim();
  const birlik = (x.blBirlik || x.birlik || "").trim();
  const key    = (x.key || kod || nom || "").trim();
  return { key, nom, kod, birlik, rs: x.rs || [], manba: x.manba || "" };
}

/** Tanlangan ish — GAS `apiShaxsiySmetaYarat` kutgan shaklga yaqin saqlanadi. */
type Tanlangan = {
  key: string;
  kod: string;
  nom: string;
  birlik: string;
  hajm: number;
  rs: NonNullable<IshTuriTopilma['rs']>;
};

export default function ShaxsiySmeta() {
  const royxat = useShaxsiySmetalar();
  const qidir = useIshTurQidir();
  const yarat = useShaxsiySmetaYarat();

  const [nom, setNom] = useState('');
  const [chelStavka, setChelStavka] = useState('');
  const [soz, setSoz] = useState('');
  const [topilgan, setTopilgan] = useState<IshTuriTopilma[]>([]);
  const [ishlar, setIshlar] = useState<Tanlangan[]>([]);

  /* Faqat sanoq — PUL EMAS (yuqoridagi narx qoidasiga qara) */
  const resursSoni = useMemo(
    () => ishlar.reduce((a, i) => a + (i.rs?.length || 0), 0),
    [ishlar]);

  const qidirish = () => {
    if (!soz.trim()) return;
    qidir.mutate({ soz: soz.trim() }, {
      onSuccess: (r) => {
        setTopilgan(Array.isArray(r) ? r : []);
        if (!r?.length) toast('Hech narsa topilmadi', 'warn');
      },
      onError: (e: Error) => toast(e.message, 'danger', undefined, 9000),
    });
  };

  const qoshish = (x: XomTopilma) => {
    const m = moslash(x);
    if (!m.key) { toast('Bu yozuvni tanib bo’lmadi (kalit yo’q)', 'danger'); return; }
    /* Dedup KEY bo'yicha — kutubxonadagi yagona identifikator.
       (Avval `kod` bo'yicha edi va u `undefined` bo'lib hammani bloklardi.) */
    if (ishlar.some((i) => i.key === m.key)) {
      toast("Bu ish allaqachon qo'shilgan", 'warn'); return;
    }
    setIshlar((p) => [...p, {
      key: m.key, kod: m.kod, nom: m.nom, birlik: m.birlik, hajm: 1, rs: m.rs,
    }]);
  };

  const yaratish = () => {
    if (!nom.trim()) { toast('Smeta nomini kiriting', 'warn'); return; }
    if (!ishlar.length) { toast('Kamida bitta ish qo\'shing', 'warn'); return; }
    const hajmsiz = ishlar.filter((i) => !(Number(i.hajm) > 0));
    if (hajmsiz.length) {
      toast(`${hajmsiz.length} ta ishda hajm kiritilmagan — ular hujjatga tushmaydi`,
            'warn', undefined, 8000);
      return;
    }

    yarat.mutate({
      config: {
        nom: nom.trim(),
        /* bo'sh bo'lsa yubormaymiz — GAS narx bazasidan oladi */
        ...(Number(chelStavka) > 0 ? { chelStavka: Number(chelStavka) } : {}),
      },
      /* ⚠️ `rs` MAJBURIY — summani GAS shundan hisoblaydi */
      ishlar: ishlar.map((i) => ({
        nom: i.nom, birlik: i.birlik, kod: i.kod, hajm: Number(i.hajm) || 0, rs: i.rs,
      })),
    }, {
      onSuccess: (r) => {
        if (r.ok && r.url) {
          /* `window.open` async javobdan keyin chaqirilgani uchun brauzer
             uni bloklashi mumkin — o'shanda havola pastdagi ro'yxatda qoladi. */
          const w = window.open(r.url, '_blank');
          toast(w ? 'Smeta yaratildi — yangi oynada ochildi'
                  : 'Smeta yaratildi. Brauzer yangi oynani bloklab qo’ydi — pastdagi ro’yxatdan oching.',
                'ok', undefined, 9000);
          setIshlar([]); setNom('');
        } else {
          toast(r.xabar || 'Yaratilmadi', 'danger', undefined, 9000);
        }
      },
      onError: (e: Error) => toast(e.message, 'danger', undefined, 9000),
    });
  };

  return (
    <Sahifa
      sarlavha="Shaxsiy smeta"
      tavsif="Loyihaga bog'liq bo'lmagan kichik ish uchun tez smeta tuzish"
    >
      <div className="flex gap-4 h-full min-h-0">
        {/* ── CHAP: ish turi qidirish ─────────────────────────────── */}
        <div className="w-[360px] flex-shrink-0 flex flex-col gap-2 min-h-0">
          <div className="karta p-3">
            <label className="text-[12px] font-medium text-text block mb-1.5">
              Ish turini qidirish
            </label>
            <div className="flex gap-2">
              <input value={soz} onChange={(e) => setSoz(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') qidirish(); }}
                placeholder="masalan: бетон, кирпич…"
                className="flex-1 bg-[var(--surface-2)] border border-border rounded
                           px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50" />
              <button onClick={qidirish} disabled={qidir.isPending}
                aria-label="Qidirish" title="Qidirish"
                className="px-2.5 rounded bg-accent/15 text-accent hover:bg-accent/25
                           transition-colors disabled:opacity-50">
                <Search size={14} />
              </button>
            </div>
            {!!topilgan.length && (
              <p className="text-[10px] text-text-mute mt-1.5">
                {topilgan.length} ta ish turi topildi — qo'shish uchun bosing
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1 min-h-0">
            {qidir.isPending && <div className="skel h-12 rounded" />}
            {topilgan.map((x, idx) => {
              const m = moslash(x);
              const qoshilgan = ishlar.some((i) => i.key === m.key);
              /* Nom ham, kod ham bo’lmasa BO’SH QUTI chizmaymiz — aniq
                 ogohlantirish ko’rsatamiz. Jim bo’shliq eng yomon holat:
                 foydalanuvchi nima bo’layotganini bilmaydi. */
              const korinadiganNom = m.nom || m.kod;
              return (
                <button key={m.key || idx} onClick={() => qoshish(x)}
                  disabled={qoshilgan || !m.key}
                  className={`w-full text-left p-2 rounded-lg border transition-colors group
                    ${qoshilgan
                      ? 'border-ok/30 bg-ok/5 cursor-default'
                      : !korinadiganNom
                        ? 'border-warn/40 bg-warn/5'
                        : 'border-border bg-[var(--surface-2)]/40 hover:bg-white/5 hover:border-accent/40'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`flex-1 text-[12px] leading-tight ${korinadiganNom ? 'text-text' : 'text-warn italic'}`}>
                      {korinadiganNom || 'Nomsiz yozuv — kutubxonada nom yo’q'}
                    </span>
                    {qoshilgan
                      ? <span className="text-[9px] text-ok flex-shrink-0 mt-0.5">qo’shilgan</span>
                      : <Plus size={13} className="text-accent flex-shrink-0 opacity-0
                                                   group-hover:opacity-100 transition-opacity mt-0.5" />}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-text-mute">
                    {m.kod && <span className="font-mono">{m.kod}</span>}
                    {m.birlik && <span>· {m.birlik}</span>}
                    {/* Resurs soni — narx O’RNIGA emas, narx bu yerda MA’LUM EMAS */}
                    <span>· {m.rs.length} resurs</span>
                    {m.manba && <span className="truncate">· {m.manba}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── O'NG: tuzilayotgan smeta + mavjudlar ────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 space-y-4 pr-1">
          <div className="karta p-4">
            <h3 className="text-[15px] font-semibold text-text mb-3 flex items-center gap-2">
              <NotebookPen size={17} className="text-accent" />
              Yangi smeta
            </h3>

            <div className="flex flex-wrap gap-2 mb-3">
              <input value={nom} onChange={(e) => setNom(e.target.value)}
                placeholder="Smeta nomi (masalan: Ofis ta'mirlash)"
                className="flex-1 min-w-[220px] bg-[var(--surface-2)] border border-border rounded
                           px-3 py-2 text-[13px] text-text outline-none focus:border-accent/50" />
              <MoneyInput value={chelStavka} onValueChange={(moneyValue) => setChelStavka(moneyValue)}
                 step="any" min="0"
                placeholder="Ishchi-soat stavkasi (ixtiyoriy)"
                title="Kiritilsa ЧЕЛ resurslari shu stavkada narxlanadi. Bo'sh bo'lsa narx bazasidan olinadi."
                className="w-[230px] bg-[var(--surface-2)] border border-border rounded
                           px-3 py-2 text-[13px] text-text outline-none focus:border-accent/50" />
            </div>

            {!ishlar.length ? (
              <p className="text-[12px] text-text-mute italic py-6 text-center">
                Chapdan ish turlarini qidirib qo'shing
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] text-text-dim
                                bg-[var(--surface-2)]/40 border border-border rounded-lg px-2.5 py-2">
                  <Info size={13} className="text-accent flex-shrink-0" />
                  <span>
                    Summa <b>serverda</b> — markazlashgan narx bazasi bo'yicha hisoblanadi va
                    yaratilgan jadvalda chiqadi. Bu ekranda taxminiy raqam ko'rsatilmaydi.
                  </span>
                </div>

                {ishlar.map((i, idx) => (
                  <div key={i.key}
                    className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface-2)]/40
                               border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-text leading-tight">{i.nom}</p>
                      <p className="text-[10px] text-text-mute font-mono">
                        {i.kod || '—'}{i.birlik ? ` · ${i.birlik}` : ''} · {i.rs.length} resurs
                      </p>
                      {!i.rs.length && (
                        <p className="text-[10px] text-warn mt-0.5">
                          Resurs normasi yo'q — bu ish summasiz tushadi
                        </p>
                      )}
                    </div>
                    <input type="number" step="any" min="0" value={i.hajm}
                      aria-label={`${i.nom} hajmi`}
                      onChange={(e) => setIshlar((p) => p.map((x, j) =>
                        j === idx ? { ...x, hajm: Number(e.target.value) || 0 } : x))}
                      className={`w-24 bg-[var(--surface-3)] border rounded px-2 py-1 text-[12px]
                                  text-text text-right outline-none focus:border-accent/50
                                  ${Number(i.hajm) > 0 ? 'border-border' : 'border-warn/60'}`} />
                    <span className="text-[10px] text-text-mute w-10">{i.birlik || ''}</span>
                    <button onClick={() => setIshlar((p) => p.filter((_, j) => j !== idx))}
                      aria-label="O'chirish" title="O'chirish"
                      className="text-text-mute hover:text-danger p-1 rounded hover:bg-white/10
                                 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-2 mt-2 border-t border-border">
                  <span className="text-[13px] font-medium text-text">
                    {ishlar.length} ta ish · {resursSoni} ta resurs normasi
                  </span>
                </div>

                <button onClick={yaratish} disabled={yarat.isPending}
                  className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5
                             rounded-lg bg-accent text-white text-[13px] font-medium
                             hover:bg-accent/90 transition-colors disabled:opacity-40">
                  <FileSpreadsheet size={15} />
                  {yarat.isPending ? 'Yaratilmoqda…' : 'Google jadval sifatida yaratish'}
                </button>
              </div>
            )}
          </div>

          {/* Avval yaratilganlar */}
          <div className="karta p-4">
            <h3 className="text-[14px] font-semibold text-text mb-2">Yaratilgan smetalar</h3>
            {royxat.isLoading && <div className="skel h-12 rounded" />}
            {royxat.isError && (
              <p className="text-[12px] text-danger">Ro'yxat o'qilmadi</p>
            )}
            {!royxat.isLoading && !royxat.isError && !royxat.data?.length && (
              <p className="text-[12px] text-text-mute italic">Hali yaratilmagan</p>
            )}
            <div className="space-y-1">
              {(royxat.data ?? []).map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg border border-border
                             bg-[var(--surface-2)]/40 hover:bg-white/5 transition-colors">
                  <FileSpreadsheet size={14} className="text-accent flex-shrink-0" />
                  <span className="flex-1 text-[12px] text-text truncate">{s.nom}</span>
                  {/* WARN 2026-08-17: avval `new Date(s.sana)` edi va ekranda
                      "Invalid Date" turardi. GAS `sana` ni ALLAQACHON
                      formatlab beradi: 'dd.MM.yyyy HH:mm' (Asia/Tashkent).
                      Uni qayta parse qilish shart emas va mumkin ham emas. */}
                  <span className="text-[10px] text-text-mute whitespace-nowrap">
                    {s.sana || ''}
                  </span>
                  <ExternalLink size={12} className="text-text-mute flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Sahifa>
  );
}
