/**
 * FaylBoglash.tsx — OBYEKT SOZLAMASI (eski GAS paneldagi «Файл боғлаш»)
 *
 * Foydalanuvchi (2026-08-16): «hali ham eski paneldagi ko'plab funksiyalar
 * yo'qda... butun tizim haqida aytdim».
 *
 * AUDIT NATIJASI: GAS da 252 ta `api*` funksiya bor, sayt 83 tasini
 * ishlatadi. Eski panelda 12 bo'lim bor edi, saytda 4 tasi yo'q:
 *   1. Файл боғлаш  ← BU SAHIFA (eng muhimi)
 *   2. Ҳужжатлар
 *   3. Шахсий смета
 *   4. Supabase
 *
 * NIMA UCHUN BU ENG MUHIMI: usiz YANGI OBYEKTNI umuman sozlab bo'lmaydi.
 * Dvigatel qaysi fayl SMETA, qaysi fayl SVODKA ekanini, qaysi varaqlarni
 * o'qishni va svodkada narx qaysi ustunda turishini shu yerdan biladi.
 * Sozlanmasa — «svodka yo'q» va narxlash umuman ishlamaydi.
 * GAS API lari BOR edi (apiBoglashSaqla, apiSheetlarOl, apiSvodUstunSaqla),
 * faqat sayt ularni chaqirmasdi va eski GAS panelga qaytish kerak bo'lardi.
 */
import { useState, useMemo, useEffect } from 'react';
import { Save, FileSpreadsheet, AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { t as tr } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import {
  useObyektlar, useSheetlar, useBoglashSaqla, useSvodUstunSaqla,
  type BoglashYozuv,
} from '../../api/hooks';
import type { PapkaObyekt } from '../../api/types';

/** Svodka ustunlari — nomi va izohi */
const SVOD_USTUN: Array<{ kalit: keyof NonNullable<PapkaObyekt['svodCols']>; nom: string; izoh: string }> = [
  { kalit: 'nom',   nom: 'НОМ',    izoh: 'Resurs nomi turgan ustun' },
  { kalit: 'bir',   nom: 'БИРЛИК', izoh: 'O\'lchov birligi' },
  { kalit: 'narx',  nom: 'НАРХ',   izoh: 'Birlik narxi — ENG MUHIMI' },
  { kalit: 'blok',  nom: 'БЛОК',   izoh: 'Blok/bo\'lim ustuni (ixtiyoriy)' },
  { kalit: 'qty',   nom: 'МИҚДОР', izoh: 'Miqdor (ixtiyoriy)' },
  { kalit: 'summa', nom: 'СУММА',  izoh: 'Jami summa (ixtiyoriy)' },
];

export default function FaylBoglash() {
  const obyektlar = useObyektlar();
  const saqla = useBoglashSaqla();
  const svodSaqla = useSvodUstunSaqla();

  const [tanlangan, setTanlangan] = useState<string>('');
  const [qidiruv, setQidiruv] = useState('');
  /** Tahrirlanayotgan nusxa — saqlanmaguncha serverga tegilmaydi */
  const [ozgarish, setOzgarish] = useState<Record<string, Partial<BoglashYozuv>>>({});

  const royxat = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    const b = obyektlar.data ?? [];
    return q ? b.filter((o) => o.obyekt.toLowerCase().includes(q)) : b;
  }, [obyektlar.data, qidiruv]);

  /* Birinchi obyektni avtomatik tanlaymiz */
  useEffect(() => {
    if (!tanlangan && royxat.length) setTanlangan(royxat[0].obyekt);
  }, [royxat, tanlangan]);

  const joriy = useMemo(
    () => (obyektlar.data ?? []).find((o) => o.obyekt === tanlangan),
    [obyektlar.data, tanlangan]);

  /** Joriy qiymat: tahrirlangan bo'lsa o'sha, aks holda serverdagi */
  const q = <K extends keyof BoglashYozuv>(kalit: K): BoglashYozuv[K] => {
    const oz = ozgarish[tanlangan];
    if (oz && oz[kalit] !== undefined) return oz[kalit] as BoglashYozuv[K];
    return (joriy as unknown as BoglashYozuv)?.[kalit];
  };
  const yoz = <K extends keyof BoglashYozuv>(kalit: K, qiymat: BoglashYozuv[K]) =>
    setOzgarish((p) => ({ ...p, [tanlangan]: { ...(p[tanlangan] || {}), [kalit]: qiymat } }));

  const lokVaraqlar = useSheetlar(String(q('lokId') || joriy?.lokId || ''));
  const svodVaraqlar = useSheetlar(String(q('svodId') || joriy?.svodId || ''));

  const ozgarganSoni = Object.keys(ozgarish).length;

  /** Saqlash: server BUTUN varaqni qayta yozadi — barcha obyekt yuboriladi */
  const saqlash = () => {
    if (!obyektlar.data?.length) return;
    const pairs: BoglashYozuv[] = obyektlar.data.map((o) => {
      const oz = ozgarish[o.obyekt] || {};
      return {
        obyekt: o.obyekt,
        lokId: oz.lokId ?? o.lokId,
        lokName: oz.lokName ?? o.lokName,
        svodId: oz.svodId ?? o.svodId,
        svodName: oz.svodName ?? o.svodName,
        format: oz.format ?? o.format,
        lokSheets: oz.lokSheets ?? o.lokSheets,
        svodSheets: oz.svodSheets ?? o.svodSheets,
        svodCols: oz.svodCols ?? o.svodCols,
        narxTayyor: oz.narxTayyor ?? o.narxTayyor,
      };
    });
    saqla.mutate(pairs, {
      onSuccess: () => {
        toast(tr('{n} ta obyekt sozlamasi saqlandi', { n: ozgarganSoni }), 'ok', undefined, 7000);
        setOzgarish({});
      },
      onError: (e: Error) => toast(e.message, 'danger', undefined, 9000),
    });
  };

  /** Obyekt sozlamasi holati: smeta, svodka (yoki «narx tayyor») — hisoblashga tayyormi. */
  const yoqmi = (v?: string | null) => !v || v === "(yo'q)";
  const tayyorlik = useMemo(() => {
    const b = obyektlar.data ?? [];
    const toliq = b.filter((o) => !yoqmi(o.lokName) && (!yoqmi(o.svodName) || o.narxTayyor)).length;
    return { jami: b.length, toliq, smetasiz: b.filter((o) => yoqmi(o.lokName)).length, svodkasiz: b.filter((o) => yoqmi(o.svodName) && !o.narxTayyor).length };
  }, [obyektlar.data]);

  const varaqTanlov = (
    barchasi: string[] | undefined, tanlanganlar: string[] | undefined,
    ozgart: (v: string[]) => void, bosh: string,
  ) => {
    const tl = tanlanganlar ?? [];
    if (!barchasi?.length) {
      return <p className="text-[12px] italic text-text-mute">{bosh}</p>;
    }
    return (
      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded border border-border bg-surface-2 p-1.5">
        {barchasi.map((v) => {
          const bor = tl.includes(v);
          return (
            <label key={v} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] transition-colors ${bor ? 'bg-accent/15 text-text' : 'text-text-dim hover:bg-surface-3'}`}>
              <input type="checkbox" checked={bor} className="cursor-pointer" onChange={() => ozgart(bor ? tl.filter((x) => x !== v) : [...tl, v])} />
              <span className="truncate" title={v}>{v}</span>
            </label>
          );
        })}
        <p className="px-2 pt-1 text-[11px] text-text-mute">{tr('Hech biri belgilanmasa — barcha varaqlar o‘qiladi.')}</p>
      </div>
    );
  };
  const faylTanlov = (kalit: 'lokId' | 'svodId', nomKalit: 'lokName' | 'svodName', varaqKalit: 'lokSheets' | 'svodSheets', joriyId?: string | null, joriyNom?: string | null) => (
    <select value={String(q(kalit) || '')} aria-label={kalit === 'lokId' ? tr('Smeta fayli') : tr('Svodka fayli')}
      onChange={(e) => {
        const c = joriy?.candidates?.find((x) => x.id === e.target.value);
        yoz(kalit, e.target.value);
        yoz(nomKalit, c?.name || '');
        yoz(varaqKalit, []);
      }}
      className="input w-full px-2 py-1.5 text-[12.5px]">
      <option value="">{tr('— tanlanmagan —')}</option>
      {(joriy?.candidates ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      {joriyId && !joriy?.candidates?.some((c) => c.id === joriyId) && <option value={joriyId}>{tr('{n} (joriy)', { n: joriyNom ?? '' })}</option>}
    </select>
  );

  return (
    <Sahifa
      sarlavha="Fayl bog'lash"
      tavsif="Obyekt sozlamasi — qaysi fayl smeta, qaysi fayl svodka, qaysi varaqlar va ustunlar"
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        {tayyorlik.jami > 0 && <section className="fz-card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3" aria-label={tr('Sozlama holati')}>
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="fz-panel__h">{tr('Hisoblashga tayyor obyektlar')}</span>
            <span className={`fz-meter ${tayyorlik.toliq < tayyorlik.jami ? 'fz-meter--over' : ''}`}>
              <span className="fz-meter__t"><i style={{ width: `${(tayyorlik.toliq / tayyorlik.jami) * 100}%`, background: 'var(--ok)' }} /></span>
              <span className="fz-meter__f">{tayyorlik.toliq}/{tayyorlik.jami}</span>
            </span>
          </div>
          {tayyorlik.smetasiz > 0 && <span className="fz-chip fz-chip--danger">{tr('{n} tasida smeta fayli yo‘q', { n: tayyorlik.smetasiz })}</span>}
          {tayyorlik.svodkasiz > 0 && <span className="fz-chip fz-chip--warn">{tr('{n} tasida narx manbai yo‘q', { n: tayyorlik.svodkasiz })}</span>}
          {ozgarganSoni > 0 && <span className="fz-chip fz-chip--accent">{tr('{n} ta saqlanmagan o‘zgarish', { n: ozgarganSoni })}</span>}
        </section>}
      <div className="flex h-full min-h-0 gap-4">
        {/* ── CHAP: obyektlar ro'yxati ────────────────────────────── */}
        <div className="flex min-h-0 w-[300px] flex-shrink-0 flex-col gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
            <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} aria-label={tr('Obyekt qidirish')}
              placeholder={tr('Obyekt qidirish…')} className="input w-full py-2 pl-8 pr-2 text-[13px]" />
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {obyektlar.isLoading && <div className="skel h-10 rounded" />}
            {royxat.map((o) => {
              const svodYoq = yoqmi(o.svodName) && !o.narxTayyor;
              const lokYoq = yoqmi(o.lokName);
              const ozgargan = !!ozgarish[o.obyekt];
              return (
                <button key={o.obyekt} type="button" onClick={() => setTanlangan(o.obyekt)} aria-current={tanlangan === o.obyekt ? 'true' : undefined}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${tanlangan === o.obyekt ? 'border-accent/40 bg-accent/10' : 'border-border bg-surface hover:bg-surface-2'}`}>
                  <div className="flex items-start gap-1.5">
                    <span className="flex-1 break-words text-[12.5px] leading-tight text-text">{o.obyekt}</span>
                    {ozgargan && <span className="fz-chip fz-chip--accent">{tr('o‘zgargan')}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className={`fz-chip ${lokYoq ? 'fz-chip--danger' : 'fz-chip--accent'}`}>{lokYoq ? tr('smeta yo‘q') : tr('smeta bor')}</span>
                    <span className={`fz-chip ${svodYoq ? 'fz-chip--warn' : 'fz-chip--accent'}`}>{svodYoq ? tr('narx manbai yo‘q') : o.narxTayyor && yoqmi(o.svodName) ? tr('narx smetada') : tr('svodka bor')}</span>
                    <span className="fz-chip">{o.format || 'TN'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {ozgarganSoni > 0 && (
            <button type="button" onClick={saqlash} disabled={saqla.isPending} className="fz-btn fz-btn--primary">
              <Save size={15} />
              {saqla.isPending ? tr('Saqlanmoqda…') : tr('{n} ta o‘zgarishni saqlash', { n: ozgarganSoni })}
            </button>
          )}
        </div>

        {/* ── O'NG: sozlama ──────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {!joriy ? (
            <div className="fz-card p-6 text-center text-[13px] text-text-mute">{tr('Chapdan obyekt tanlang')}</div>
          ) : (
            <div className="space-y-4">
              <section className="fz-card p-4">
                <h3 className="fz-card__title mb-3 flex items-center gap-2"><FileSpreadsheet size={17} className="text-accent" />{joriy.obyekt}</h3>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <span className="mb-1.5 block text-[12px] font-medium text-text">{tr('1. Smeta fayli (лок)')}</span>
                    {faylTanlov('lokId', 'lokName', 'lokSheets', joriy.lokId, joriy.lokName)}
                    <div className="mt-2">
                      <p className="mb-1 text-[12px] text-text-mute">{tr('O‘qiladigan varaqlar')}:</p>
                      {varaqTanlov(lokVaraqlar.data, q('lokSheets') as string[], (v) => yoz('lokSheets', v), lokVaraqlar.isLoading ? tr('Varaqlar o‘qilmoqda…') : tr('Avval faylni tanlang'))}
                    </div>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-[12px] font-medium text-text">{tr('2. Svodka fayli (нарх манбаи)')}</span>
                    {faylTanlov('svodId', 'svodName', 'svodSheets', joriy.svodId, joriy.svodName)}
                    <div className="mt-2">
                      <p className="mb-1 text-[12px] text-text-mute">{tr('O‘qiladigan varaqlar')}:</p>
                      {varaqTanlov(svodVaraqlar.data, q('svodSheets') as string[], (v) => yoz('svodSheets', v), svodVaraqlar.isLoading ? tr('Varaqlar o‘qilmoqda…') : tr('Avval faylni tanlang'))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="fz-card space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="block text-[12px] font-medium text-text">{tr('3. Format')}
                    <select value={String(q('format') || 'TN')} onChange={(e) => yoz('format', e.target.value)} className="input mt-1.5 block px-3 py-1.5 text-[12.5px]">
                      <option value="TN">TN</option>
                      <option value="ABC">ABC</option>
                    </select>
                  </label>
                  {/* ⚡ narxTayyor — smeta ichida narx allaqachon bor bo'lsa, svodka TALAB QILINMAYDI (dvigatel uni o'tkazib yuboradi) */}
                  <label className="mt-5 flex cursor-pointer items-start gap-2">
                    <input type="checkbox" checked={!!q('narxTayyor')} onChange={(e) => yoz('narxTayyor', e.target.checked)} className="mt-0.5 cursor-pointer" />
                    <span className="text-[12.5px] leading-snug text-text">{tr('Narx tayyor')}
                      <span className="block text-[11.5px] text-text-mute">{tr('Smetada narx allaqachon bor — svodka talab qilinmaydi')}</span>
                    </span>
                  </label>
                </div>
                {!q('svodId') && !q('narxTayyor') && (
                  <p className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" />{tr('Svodka tanlanmagan va «Narx tayyor» ham belgilanmagan — narxlash ishlamaydi va obyekt hisoblanmaydi.')}</p>
                )}
              </section>

              <section className="fz-card p-4">
                <h4 className="fz-card__title text-[14px]">{tr('4. Svodka ustunlari')}</h4>
                <p className="mb-3 mt-1 text-[12px] text-text-mute">{tr('Svodka faylida qaysi ma’lumot qaysi ustunda turishi (raqam bilan: A=1, B=2…). Bo‘sh qoldirilsa tizim o‘zi topishga urinadi. Papkadagi barcha lokalkaga tarqaladi.')}</p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {SVOD_USTUN.map((u) => (
                    <div key={u.kalit}>
                      <label className="mb-1 block text-[12px] font-medium text-text" htmlFor={`svod-${u.kalit}`}>
                        {u.nom}{u.kalit === 'narx' && <span className="text-danger"> *</span>}
                      </label>
                      <input id={`svod-${u.kalit}`} type="number" min={1}
                        value={String((q('svodCols') as Record<string, number>)?.[u.kalit] ?? '')}
                        onChange={(e) => yoz('svodCols', {
                          ...((q('svodCols') as Record<string, number>) || {}),
                          [u.kalit]: e.target.value ? Number(e.target.value) : undefined,
                        } as BoglashYozuv['svodCols'])}
                        placeholder="—" className="input w-full px-2 py-1.5 text-[12.5px]" />
                      <p className="mt-0.5 text-[11px] leading-tight text-text-mute">{tr(u.izoh)}</p>
                    </div>
                  ))}
                </div>
                <button type="button"
                  onClick={() => {
                    const sc = (q('svodCols') as Record<string, number>) || {};
                    svodSaqla.mutate({ obyekt: tanlangan, svodCols: sc }, {
                      onSuccess: () => toast(tr('Svodka ustunlari saqlandi (papkadagi barcha lokalkaga)'), 'ok', undefined, 7000),
                      onError: (e: Error) => toast(e.message, 'danger'),
                    });
                  }}
                  disabled={svodSaqla.isPending} className="fz-btn fz-btn--sm mt-3">
                  {svodSaqla.isPending ? tr('Saqlanmoqda…') : tr('Faqat ustunlarni saqlash')}
                </button>
              </section>

              {ozgarish[tanlangan] && (
                <div className="fz-note fz-note--warn" style={{ alignItems: 'center' }}>
                  <RefreshCw aria-hidden="true" />
                  <span className="flex-1">{tr('Bu obyektda saqlanmagan o‘zgarish bor. Chapdagi tugma bilan saqlang.')}</span>
                  <button type="button" onClick={() => setOzgarish((p) => { const n = { ...p }; delete n[tanlangan]; return n; })} className="fz-btn fz-btn--ghost fz-btn--sm">{tr('Bekor qilish')}</button>
                </div>
              )}

              {!ozgarish[tanlangan] && joriy.svodId && (
                <p className="fz-note fz-note--info"><CheckCircle2 aria-hidden="true" />{tr('Sozlama to‘liq — bu obyekt hisoblanishga tayyor.')}</p>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </Sahifa>
  );
}
