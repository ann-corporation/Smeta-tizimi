import { MoneyInput } from './MoneyInput';
/**
 * QatorTahrirModal.tsx — TIZIM_02: kanonik qatorni to'g'ridan-to'g'ri
 * saytning o'zida tahrirlash (ziddiyat nazorati bilan)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Foydalanuvchi ko'rsatmasi: "saytni o'zida maksimal ideal va kuchli
 * boshqaruv bo'lishi kerak... har bir hujjatda edit imkoniyati bo'lishi
 * kerak" — Drive orqali yuklab-tahrirlab-qayta yuklash EMAS, balki
 * saytning o'zida to'g'ridan-to'g'ri.
 *
 * Bitta panelda BARCHA tahrirlanadigan maydonlar (nom/hajm/narx/
 * birlik/kat) ko'rsatiladi, lekin har biri ALOHIDA saqlanadi — chunki
 * backend (`t2_qator_tahrir`) bitta chaqiruvda bitta maydonni yozadi
 * (optimistik qulf shu bilan ishlaydi). Saqlangan har bir maydondan
 * keyin mahalliy versiya yangilanadi, shuning uchun bitta seansda bir
 * nechta maydonni ketma-ket saqlash ziddiyatga olib kelmaydi.
 *
 * ⚠️ ZIDDIYAT — «xato» EMAS, normal holat: boshqa foydalanuvchi
 * o'sha qatorni tezroq o'zgartirgan bo'lishi mumkin.
 */
import { useState } from 'react';
import { X, Save, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { toast } from './Toast';
import { sbT2QatorTahrir, type T2TahrirNatija } from '../../api/supabase';

export type QatorTahrirMaydon = 'nom' | 'hajm' | 'narx' | 'birlik' | 'kat';

export type QatorTahrirNishon = {
  qatorId: number;
  versiya: number;
  nom: string;
  maydonlar: Partial<Record<QatorTahrirMaydon, string | number | null | undefined>>;
};

const MAYDON_TARTIB: QatorTahrirMaydon[] = ['nom', 'hajm', 'narx', 'birlik', 'kat'];
const MAYDON_NOMI: Record<QatorTahrirMaydon, string> = {
  nom: 'Nomi', hajm: 'Hajm', narx: 'Narx', birlik: 'Birlik', kat: 'Kategoriya',
};

function boshQiymat(v: string | number | null | undefined): string {
  return v == null ? '' : String(v);
}

export function QatorTahrirModal({
  nishon, yop, saqlandi,
}: {
  nishon: QatorTahrirNishon;
  yop: () => void;
  /** Har bir muvaffaqiyatli saqlashdan keyin chaqiriladi — chaqiruvchi
   *  daraxtni yangilashi mumkin (masalan `yuklash()`). */
  saqlandi: () => void;
}) {
  const [versiya, setVersiya] = useState(nishon.versiya);
  const [qiymatlar, setQiymatlar] = useState<Record<QatorTahrirMaydon, string>>(() => {
    const boshlangich = {} as Record<QatorTahrirMaydon, string>;
    for (const m of MAYDON_TARTIB) boshlangich[m] = boshQiymat(nishon.maydonlar[m]);
    return boshlangich;
  });
  const [saqlangan] = useState<Record<QatorTahrirMaydon, string>>(qiymatlar);
  const [ketyapti, setKetyapti] = useState<QatorTahrirMaydon | null>(null);
  const [saqlandiBelgi, setSaqlandiBelgi] = useState<Partial<Record<QatorTahrirMaydon, boolean>>>({});
  const [ziddiyat, setZiddiyat] = useState<Partial<Record<QatorTahrirMaydon, T2TahrirNatija>>>({});

  const ozgartir = (maydon: QatorTahrirMaydon, val: string) => {
    setQiymatlar((prev) => ({ ...prev, [maydon]: val }));
    setSaqlandiBelgi((prev) => ({ ...prev, [maydon]: false }));
  };

  const saqla = async (maydon: QatorTahrirMaydon, kutilganVersiya: number) => {
    setKetyapti(maydon);
    setZiddiyat((prev) => ({ ...prev, [maydon]: undefined }));
    const r = await sbT2QatorTahrir(nishon.qatorId, maydon, qiymatlar[maydon], kutilganVersiya);
    setKetyapti(null);

    if (r.ok && r.versiya != null) {
      setVersiya(r.versiya);
      setSaqlandiBelgi((prev) => ({ ...prev, [maydon]: true }));
      toast(`${MAYDON_NOMI[maydon]} saqlandi`, 'ok');
      saqlandi();
      return;
    }
    if (r.sabab === 'ziddiyat') {
      /* Bu XATO EMAS — boshqa klient tezroq yozgan. Ko'rsatamiz. */
      setZiddiyat((prev) => ({ ...prev, [maydon]: r }));
      return;
    }
    toast(r.xabar || r.error || 'Saqlanmadi', 'danger', undefined, 9000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
         onClick={yop}>
      <div className="karta w-full max-w-lg p-4 bg-[var(--surface-1)]"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-text">Qatorni tahrirlash</h3>
            <p className="text-[11px] text-text-mute truncate">{nishon.nom}</p>
          </div>
          <button onClick={yop} aria-label="Yopish" title="Yopish"
            className="text-text-mute hover:text-text p-1 rounded hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {MAYDON_TARTIB.map((maydon) => {
            const konflikt = ziddiyat[maydon];
            const ozgargan = qiymatlar[maydon] !== saqlangan[maydon];
            return (
              <div key={maydon}>
                <label className="block text-[11px] font-medium text-text-mute mb-1">{MAYDON_NOMI[maydon]}</label>
                {!konflikt && (
                  <div className="flex items-center gap-2">
                    {maydon === 'narx' ? <MoneyInput value={qiymatlar[maydon]} onValueChange={(v) => ozgartir(maydon, v)} onKeyDown={(e) => { if (e.key === 'Enter' && ozgargan) void saqla(maydon, versiya); }} className="flex-1 bg-[var(--surface-2)] border border-border rounded-lg px-3 py-1.5 text-[13px] text-text outline-none focus:border-accent/50" /> : (
                    <input
                      value={qiymatlar[maydon]}
                      onChange={(e) => ozgartir(maydon, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && ozgargan) void saqla(maydon, versiya); }}
                      type={maydon === 'hajm' ? 'number' : 'text'}
                      step="any"
                      className="flex-1 bg-[var(--surface-2)] border border-border rounded-lg
                                 px-3 py-1.5 text-[13px] text-text outline-none focus:border-accent/50"
                    />
                    )}
                    <button
                      onClick={() => void saqla(maydon, versiya)}
                      disabled={!ozgargan || ketyapti === maydon}
                      title="Shu maydonni saqlash"
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-accent text-white text-[12px]
                                 font-medium hover:bg-accent/90 disabled:opacity-40
                                 inline-flex items-center gap-1">
                      {ketyapti === maydon
                        ? <RefreshCw size={13} className="animate-spin" />
                        : saqlandiBelgi[maydon] && !ozgargan ? <Check size={13} /> : <Save size={13} />}
                    </button>
                  </div>
                )}

                {konflikt && (
                  <div className="rounded-lg border border-warn/40 bg-warn/5 p-3">
                    <p className="text-[12px] font-medium text-warn flex items-center gap-2 mb-2">
                      <AlertTriangle size={14} />
                      Bu maydonni boshqa foydalanuvchi o‘zgartirdi
                    </p>
                    <p className="text-[11px] text-text-dim mb-2">
                      Siz {konflikt.sizning_versiya}-versiyani ko‘rgansiz, bazada esa
                      allaqachon {konflikt.bazadagi_versiya}-versiya.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                      <div className="rounded border border-border p-2">
                        <p className="text-text-mute mb-0.5">Hozir bazada</p>
                        <p className="text-text font-mono">{String((konflikt.joriy as any)?.[maydon] ?? '—')}</p>
                      </div>
                      <div className="rounded border border-accent/40 p-2">
                        <p className="text-text-mute mb-0.5">Siz yozmoqchisiz</p>
                        <p className="text-accent font-mono">{qiymatlar[maydon] || '—'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        onClick={() => {
                          const j = (konflikt.joriy as any)?.[maydon];
                          ozgartir(maydon, j == null ? '' : String(j));
                          if (konflikt.bazadagi_versiya != null) setVersiya(konflikt.bazadagi_versiya);
                          setZiddiyat((prev) => ({ ...prev, [maydon]: undefined }));
                        }}
                        className="px-3 py-1.5 rounded-lg text-[12px] text-text
                                   border border-border hover:bg-white/5 inline-flex items-center gap-1.5">
                        <RefreshCw size={12} /> Bazadagini olish
                      </button>
                      <button
                        onClick={() => void saqla(maydon, konflikt.bazadagi_versiya!)}
                        disabled={ketyapti === maydon}
                        className="px-3 py-1.5 rounded-lg bg-warn/20 text-warn text-[12px]
                                   font-medium hover:bg-warn/30 disabled:opacity-40">
                        Baribir o‘zimniki bilan yozish
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Halollik qoidasi (t2_kompaniya.test.cjs shuni tekshiradi):
            bo'sh maydon — bu 0 EMAS. Moliyaviy ma'lumotda "kiritilmagan"
            va "nol" butunlay boshqa narsa, shuning uchun aytib turiladi. */}
        <p className="mt-3 text-[10px] text-text-mute">
          Bo‘sh qoldirilsa qiymat <b>yo‘q</b> bo‘ladi (0 emas). 0 va «kiritilmagan» — boshqa-boshqa narsa.
        </p>

        <div className="flex justify-end mt-4">
          <button onClick={yop}
            className="px-4 py-1.5 rounded-lg text-[12px] font-medium text-text-dim hover:bg-white/5 border border-border">
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
