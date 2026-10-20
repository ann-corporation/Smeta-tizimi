import { MoneyInput } from '../../umumiy/ui/MoneyInput';
/**
 * F2Kafolat.tsx — «171 MLRD KIRDI = 171 MLRD TUSHDI» ISBOTI
 *
 * Foydalanuvchi: «manga kerak natija — man shu paytgacha o'tkazgan f2
 * 171 122 545 454 so'm bo'lsa, 171 122 545 454 so'm smeta nakopitelnimizda
 * ham to'g'ri va aniq kirita olishimiz kerak!»
 *
 * Bu oyna shu tenglikni ISBOTLAYDI yoki QAYERDA BUZILGANINI ko'rsatadi.
 *
 * Ikki tomon yonma-yon, har F2 uchun alohida qator:
 *     HUJJATDA qancha  ↔  SMETAGA qancha tushdi  ↔  FARQ
 *
 * MUHIM: eski yozuvlarda hujjat jami saqlanmagan (reestr yo'q paytda
 * kiritilgan). Uni shu yerda QO'LDA kiritish mumkin — F2 faylidagi
 * «Всего прямых затрат» raqamini ko'chirasiz va farq shu zahoti
 * hisoblanadi. Kiritilmagunicha panel ochiq aytadi: «bu farq ishonchli
 * emas» — son o'ylab topilmaydi.
 */
import { useState } from 'react';
import { X, Check, AlertTriangle, ShieldCheck, Pencil } from 'lucide-react';
import { useF2Reestr, useF2ReestrHujjatJami, useF2ReestrTikla, useF2QatlamTahlil,
         /* ⚡⚡⚡ 2026-08-17 (audit): `apiF2Nazorat` MUSTAQIL UCHINCHI MANBA.
            Reestr — «biz nima yozgan deb O'YLAYMIZ» (daftardagi yozuv).
            Nazorat — LRV_PLUS varaqlarini BEVOSITA o'qib, «jadvalda
            HAQIQATAN nima turgani» ni aytadi.
            Ikkisi bir xil bo'lsa — kafolat qattiq. Farq qilsa, aynan
            «pul yo'qolishi» holati: daftarda yozilgan, jadvalda yo'q
            (yoki teskarisi). Bu hook YOZILGAN edi, lekin hech qayerda
            chaqirilmasdi — ya'ni eng ishonchli tekshiruv ishlamay
            turgan edi. */
         useF2Nazorat } from '../../api/hooks';

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const HOLAT_RANG: Record<string, string> = {
  'ТЎЛИҚ':         'bg-emerald-500/15 text-emerald-300',
  'ҚИСМАН':        'bg-amber-500/15 text-amber-300',
  'ЁЗИЛМАГАН':     'bg-red-500/15 text-red-300',
  'ТЕКШИРИЛМАГАН': 'bg-white/10 text-text-mute',
};

export default function F2Kafolat({
  obyekt, onYopish, onQatorlar, toast,
}: {
  obyekt: string;
  onYopish: () => void;
  onQatorlar: (oy: string) => void;
  toast: (m: string, t?: string, x?: unknown, ms?: number) => void;
}) {
  /* Bo'sh obyekt = BARCHA obyektlar (171 mlrd tekshiruvi aynan shu rejim) */
  const [barchasi, setBarchasi] = useState(false);
  const reestr = useF2Reestr(barchasi ? '' : obyekt, true);
  const hujjatJami = useF2ReestrHujjatJami();
  const tikla = useF2ReestrTikla();
  /* «bl mi rs mi» — foydalanuvchidan so'ralmaydi, ma'lumotdan aniqlanadi */
  const qatlam = useF2QatlamTahlil(obyekt, !barchasi);
  /* Mustaqil uchinchi manba — jadvalda haqiqatan turgan summa.
     «Barcha obyektlar» rejimida so'ralmaydi: har obyekt uchun LRV_PLUS
     ochiladi, bu og'ir so'rov (Cloudflare 100s limitiga urilib «Failed to
     fetch» beradi — [[failed-to-fetch-gas-navbati]]). */
  const nazorat = useF2Nazorat(obyekt, !barchasi && !!obyekt);

  const [tahrirId, setTahrirId] = useState<string | null>(null);
  const [qiymat, setQiymat] = useState('');

  const d = reestr.data;
  const farqBor = !!d && Math.abs(d.farq) > 0.01;
  const isbotlangan = !!d && d.ishonchli && !farqBor && d.soni > 0;

  const saqlaJami = (f2Id: string) => {
    const s = Number(qiymat.replace(/\s/g, '').replace(',', '.'));
    /* ⚡⚡⚡ 2026-08-16 (audit H12 — TASDIQLANDI): `s <= 0` sharti MANFIY
     * summani rad etardi. ПЕРЕРАСЧЁТ (korrektirovka) hujjatlarining jamisi
     * QONUNIY ravishda manfiy bo'ladi — ular kafolat daftariga umuman
     * kiritilmasdi va farq hisobi buzilardi.
     * Endi faqat SON EMASLIGI rad etiladi. */
    if (!isFinite(s)) { toast('Summani to\'g\'ri kiriting', 'warn'); return; }
    hujjatJami.mutate({ f2Id, summa: s }, {
      onSuccess: (r) => {
        if (r.ok) { toast(`Saqlandi · farq: ${fmt(r.farq)} · ${r.holat}`, 'ok', undefined, 6000); setTahrirId(null); }
        else toast(r.xabar || 'Xato', 'danger');
      },
      onError: (e: Error) => toast(e.message, 'danger'),
    });
  };

  return (
    <div className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] border border-border rounded-xl w-full max-w-5xl
                      max-h-[88vh] flex flex-col shadow-2xl">

        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className={isbotlangan ? 'text-emerald-400' : 'text-amber-400'} />
            <div>
              <h3 className="font-medium text-text">F2 Kafolat — kirdi / tushdi solishtiruvi</h3>
              <p className="text-[11px] text-text-mute">
                {barchasi ? 'Barcha obyektlar' : obyekt} · {d?.soni ?? 0} yozuv
              </p>
            </div>
          </div>
          <button onClick={onYopish} className="p-1.5 rounded hover:bg-white/10 text-text-mute">
            <X size={18} />
          </button>
        </div>

        {/* Rejim */}
        <div className="px-4 py-2 border-b border-border bg-white/[0.02] flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-text-mute cursor-pointer">
            <input type="checkbox" checked={barchasi} onChange={(e) => setBarchasi(e.target.checked)} />
            Barcha obyektlar bo'yicha (umumiy 171 mlrd tekshiruvi)
          </label>
          <div className="flex-1" />
          <button
            onClick={() => tikla.mutate({ obyekt }, {
              onSuccess: (r: { ok: boolean; qoshildi?: number; eslatma?: string; xabar?: string }) =>
                toast(r.ok ? `${r.qoshildi} oy daftarga tushdi. ${r.eslatma || ''}` : (r.xabar || 'Xato'),
                      r.ok ? 'ok' : 'danger', undefined, 9000),
              onError: (e: Error) => toast(e.message, 'danger'),
            })}
            disabled={tikla.isPending || barchasi}
            className="text-[11px] px-2 py-1 rounded bg-white/5 border border-white/10
                       text-text hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            {tikla.isPending ? 'Tiklanmoqda…' : '↺ Eski oylarni daftarga tushirish'}
          </button>
        </div>

        {/* Yakuniy tenglik */}
        {d?.ok && (
          <div className={`mx-4 mt-3 p-3 rounded-lg border ${
            isbotlangan ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-amber-500/10 border-amber-500/30'}`}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[10px] text-text-mute uppercase tracking-wide">Hujjatlarda</div>
                <div className="text-[15px] font-medium text-text mt-0.5">{fmt(d.jamiHujjat)}</div>
              </div>
              <div>
                <div className="text-[10px] text-text-mute uppercase tracking-wide">Smetaga tushgan</div>
                <div className="text-[15px] font-medium text-text mt-0.5">{fmt(d.jamiYozilgan)}</div>
              </div>
              <div>
                <div className="text-[10px] text-text-mute uppercase tracking-wide">Farq</div>
                <div className={`text-[15px] font-medium mt-0.5 ${
                  farqBor ? 'text-amber-300' : 'text-emerald-400'}`}>{fmt(d.farq)}</div>
              </div>
            </div>
            <p className={`text-[11px] mt-2 text-center ${
              isbotlangan ? 'text-emerald-300' : 'text-amber-200'}`}>
              {isbotlangan
                ? '✓ Kirgan summa smetadagi summaga TENG — kafolat isbotlandi.'
                : !d.ishonchli
                  ? `⚠ ${d.hujjatJamiKiritilmagan} ta yozuvda hujjat jami kiritilmagan — quyida to'ldiring, shundan keyin bu farq ishonchli bo'ladi.`
                  : '⚠ Farq bor — quyidagi ro\'yxatdan qaysi F2 da ekanini toping.'}
            </p>
          </div>
        )}

        {/* ⚡⚡⚡ 2026-08-17 (audit): MUSTAQIL QARSHI-TEKSHIRUV (apiF2Nazorat).
            Yuqoridagi tenglik REESTR (daftar) bo'yicha hisoblanadi — ya'ni
            «biz nima yozgan deb o'ylayapmiz». Bu blok esa LRV_PLUS
            varaqlarini BEVOSITA o'qiydi: «jadvalda HAQIQATAN nima turgan».
            Ikkisi teng bo'lsa kafolat ikki tomonlama isbotlangan bo'ladi.
            Farq qilsa — aynan pul yo'qolishi holati va uni SHU YERDA
            ko'rish kerak, keyinroq emas. */}
        {!barchasi && nazorat.data?.ok && (
          <div className="mx-4 mt-2 p-3 rounded-lg border bg-white/[0.03] border-white/10">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="text-[11px] font-medium text-text">
                Jadvalda haqiqatan turgan summa
                <span className="text-text-mute font-normal">
                  {' '}· {nazorat.data.oylar.length} oy · {nazorat.data.varaqSoni} varaq
                </span>
              </div>
              <div className="text-[14px] font-medium text-text tabular-nums flex-shrink-0">
                {fmt(nazorat.data.jamiSumma)}
              </div>
            </div>

            {/* Daftar bilan solishtirish — asosiy xulosa */}
            {d?.ok && (() => {
              const nazFarq = (nazorat.data!.jamiSumma || 0) - (d.jamiYozilgan || 0);
              const teng = Math.abs(nazFarq) < 1;
              return (
                <p className={`text-[11px] leading-snug ${teng ? 'text-emerald-300' : 'text-amber-200'}`}>
                  {teng
                    ? '✓ Daftardagi «smetaga tushgan» summa jadvaldagi haqiqiy summaga TENG — ikki mustaqil manba bir xil.'
                    : `⚠ Daftar ${fmt(d.jamiYozilgan)} deydi, jadvalda esa ${fmt(nazorat.data!.jamiSumma)} — `
                      + `farq ${fmt(nazFarq)}. Ya'ni daftar bilan jadval mos kelmayapti; quyidagi oylar ro'yxatidan qaysi oyda ekanini toping.`}
                </p>
              );
            })()}

            {/* Oy kesimida — qaysi oyda qancha */}
            {nazorat.data.oylar.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {nazorat.data.oylar.map((o) => (
                  <span key={o.nom}
                    title={`${o.qatorlar} qator · ${o.varaqlar.length} varaq`
                      + (o.pulliQatlamlar.length ? ` · qatlam: ${o.pulliQatlamlar.join(', ')}` : '')}
                    className={`text-[10px] px-1.5 py-0.5 rounded border tabular-nums ${
                      o.ikkiBaravarXavfi
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                        : 'bg-white/5 border-white/10 text-text-mute'}`}>
                    {o.nom}: {fmt(o.summa)}
                    {o.ikkiBaravarXavfi && ' ⚠'}
                  </span>
                ))}
              </div>
            )}

            {/* GAS o'zi topgan ogohlantirishlar — jim qoldirilmaydi */}
            {nazorat.data.ogohlantirish.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {nazorat.data.ogohlantirish.map((x, i) => (
                  <li key={i} className="text-[11px] text-amber-200 leading-snug">⚠ {x}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!barchasi && nazorat.isLoading && (
          <div className="mx-4 mt-2 skel h-16 rounded-lg" />
        )}

        {/* ⚡⚡⚡ IKKI BARAVAR SANASH TEKSHIRUVI (apiF2QatlamTahlil).
            «bl mi rs mi» degan savol foydalanuvchidan SO'RALMAYDI — tizim
            LRV_PLUS ni ketma-ket o'qib, har ИШ qatorining o'z summasini
            uning RESURSlari yig'indisi bilan solishtiradi va o'zi aniqlaydi. */}
        {!barchasi && qatlam.data?.ok && (
          <div className={`mx-4 mt-2 p-2.5 rounded-lg border text-[11px] ${
            !qatlam.data.ishonchli ? 'bg-amber-500/10 border-amber-500/30'
            : qatlam.data.takrorBor ? 'bg-blue-500/10 border-blue-500/30'
            : 'bg-emerald-500/10 border-emerald-500/30'}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className={`flex-shrink-0 mt-0.5 ${
                !qatlam.data.ishonchli ? 'text-amber-400'
                : qatlam.data.takrorBor ? 'text-blue-400' : 'text-emerald-400'}`} />
              <div className="flex-1">
                <div className="font-medium text-text mb-0.5">
                  Ikki baravar sanash tekshiruvi
                </div>
                <p className="text-text-mute leading-snug">{qatlam.data.xulosa}</p>
                {qatlam.data.jamiTogri !== null && (
                  <p className="mt-1 text-text">
                    To'g'ri jami (takrorsiz):{' '}
                    <span className="font-medium">{fmt(qatlam.data.jamiTogri)}</span> so'm
                  </p>
                )}
                {/* Oy kesimida asos qaysi qatlam ekani */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {qatlam.data.oylar.filter((o) => o.asos !== 'yoq').map((o) => (
                    <span key={o.nom} title={o.izoh}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        o.asos === 'aralash' ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-white/10 text-text-mute'}`}>
                      {o.nom}: {o.asos === 'aralash' ? '⚠ aralash'
                                : o.asos === 'bl' ? 'ИШ' : 'РЕСУРС'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Yozuvlar ro'yxati */}
        <div className="flex-1 overflow-auto p-4 pt-3">
          {reestr.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skel h-10 rounded" />)}</div>
          ) : !d?.yozuvlar?.length ? (
            <p className="text-center text-sm text-text-mute py-8">
              Daftar bo'sh. Yuqoridagi «Eski oylarni daftarga tushirish» tugmasini bosing.
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="text-text-mute text-left">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Oy / fayl</th>
                  <th className="px-2 py-1.5 font-medium text-right">Hujjatda</th>
                  <th className="px-2 py-1.5 font-medium text-right">Smetada</th>
                  <th className="px-2 py-1.5 font-medium text-right">Farq</th>
                  <th className="px-2 py-1.5 font-medium">Holat</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {d.yozuvlar.map((y) => {
                  const yFarq = y.farq;
                  const yFarqBor = yFarq !== null && Math.abs(yFarq) > 0.01;
                  return (
                    <tr key={y.f2Id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-2 py-2 align-top">
                        <div className="text-text font-medium">{y.oy}</div>
                        <div className="text-[10px] text-text-mute truncate max-w-[220px]">
                          {y.faylNom || y.obyekt}
                          {y.qatorYozildi > 0 && <span className="ml-1 opacity-70">· {y.qatorYozildi} qator</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right align-top whitespace-nowrap">
                        {tahrirId === y.f2Id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <MoneyInput autoFocus value={qiymat} onValueChange={(moneyValue) => setQiymat(moneyValue)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saqlaJami(y.f2Id);
                                                  if (e.key === 'Escape') setTahrirId(null); }}
                              placeholder="8277622548.30602"
                              className="w-36 px-1.5 py-1 rounded bg-white/10 border border-accent/50
                                         text-right text-text outline-none" />
                            <button onClick={() => saqlaJami(y.f2Id)} disabled={hujjatJami.isPending}
                              className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10">
                              <Check size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setTahrirId(y.f2Id); setQiymat(y.hujjatJami ? String(y.hujjatJami) : ''); }}
                            title="F2 hujjatidagi «Всего прямых затрат» summasini kiriting"
                            className={`group inline-flex items-center gap-1 hover:text-accent transition-colors
                                        ${y.hujjatJami === null ? 'text-amber-400' : 'text-text'}`}>
                            {y.hujjatJami === null ? 'kiritilmagan' : fmt(y.hujjatJami)}
                            <Pencil size={10} className="opacity-0 group-hover:opacity-70" />
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right align-top text-text whitespace-nowrap">
                        {fmt(y.yozilganJami)}
                      </td>
                      <td className={`px-2 py-2 text-right align-top whitespace-nowrap ${
                        yFarq === null ? 'text-text-mute' : yFarqBor ? 'text-amber-300' : 'text-emerald-400'}`}>
                        {yFarqBor && <AlertTriangle size={10} className="inline mr-1" />}
                        {fmt(yFarq)}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium
                                          ${HOLAT_RANG[y.holat] || 'bg-white/10 text-text-mute'}`}>
                          {y.holat}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top text-right">
                        <button onClick={() => { onQatorlar(y.oy); onYopish(); }}
                          className="text-[11px] px-2 py-1 rounded bg-accent/15 text-accent
                                     hover:bg-accent/25 transition-colors">
                          Qatorlar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <p className="text-[10px] text-text-mute leading-snug max-w-md">
            «Hujjatda» ustunini bosib F2 faylidagi jami summani kiriting — farq
            shu zahoti hisoblanadi. Kiritilmagan yozuvlar umumiy farqni ishonchsiz qiladi.
          </p>
          <button onClick={onYopish}
            className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10
                       text-[12px] text-text hover:bg-white/10 transition-colors">
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
