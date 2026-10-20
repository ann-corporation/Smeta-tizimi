import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, HardHat, CalendarCheck, HandCoins, Search, Filter, Plus, Pencil, Trash2 } from 'lucide-react';
import { AuroraBackground, GlassCard } from '../../boss/sahifalar/Umumiy';
import { FmtN } from '../../lib/format';
import {
  useKadrlarData, useIshchiQosh, useTabelBelgila,
  /* ⚡⚡⚡ 2026-08-17 (audit): bu ikki hook YOZILGAN va GAS API si ham BOR edi
     (`apiIshchiTahrir`, `apiIshchiOchir`) — lekin sahifa ularni CHAQIRMASDI.
     Ya'ni xodim bir marta kiritilsa, uning stavkasini/kasbini saytdan
     O'ZGARTIRIB BO'LMASDI va ishdan bo'shaganini ham olib tashlab
     bo'lmasdi. Stavka xato kiritilgan bo'lsa — tabel bo'yicha hisoblangan
     OYLIK ham doim xato chiqardi va tuzatishning yagona yo'li Google
     Sheets ni qo'lda ochish edi. */
  useIshchiTahrir, useIshchiOchir,
} from '../../api/hooks';
import { Skelet } from '../../umumiy/ui/Sahifa';
import { ErpQoshModal, type ErpField } from '../ErpQoshModal';
import { toast } from '../../umumiy/ui/Toast';
import type { TabelKuni } from '../../api/types';

const TABEL_AYLANISH: TabelKuni[] = [null, 'keldi', 'kelmadi', 'kasal'];

export default function ErpKadrlar() {
  const { data, isLoading } = useKadrlarData();
  const [qidiruv, setQidiruv] = useState('');
  const [filtir, setFiltir] = useState('barchasi');
  const [qoshOchiq, setQoshOchiq] = useState(false);
  const [tahrirIshchi, setTahrirIshchi] = useState<any | null>(null);
  const ishchiQosh = useIshchiQosh();
  const ishchiTahrir = useIshchiTahrir();
  const ishchiOchir = useIshchiOchir();
  const tabelBelgila = useTabelBelgila();

  async function ishchiOchirish(ishchi: any) {
    /* Tabel/oylik bilan bog'liq bo'lgani uchun ATAYLAB tasdiqlanadi va
       nima o'chirilayotgani aniq ko'rsatiladi. */
    if (!window.confirm(`«${ishchi.ism}» ishchi ro'yxatdan o'chirilsinmi?\n`
      + `${ishchi.kasb || ''}${ishchi.brigada ? ' · ' + ishchi.brigada : ''}\n\n`
      + `Diqqat: bu ishchining oldingi tabel yozuvlari saqlanib qolishi mumkin.`)) return;
    try {
      await ishchiOchir.mutateAsync(ishchi.id);
      toast(`${ishchi.ism} o'chirildi`, 'ok');
    } catch (e: any) { toast('Xato: ' + e.message, 'danger', undefined, 9000); }
  }

  const bugun = new Date().toISOString().split('T')[0];
  const kunBos = (ishchiId: string, kun: number) => {
    const oy = bugun.slice(0, 7);
    const sana = `${oy}-${String(kun).padStart(2, '0')}`;
    const tabel = data?.tabellar.find((t: any) => t.ishchiId === ishchiId);
    const joriy = tabel?.kunlar.find((k: any) => k.sana === kun)?.holat ?? null;
    const keyingi = TABEL_AYLANISH[(TABEL_AYLANISH.indexOf(joriy) + 1) % TABEL_AYLANISH.length];
    tabelBelgila.mutate({ ishchiId, sana, holat: keyingi });
  };

  if (isLoading || !data) {
    return (
      <AuroraBackground>
        <div className="p-8"><Skelet qatorlar={5} /></div>
      </AuroraBackground>
    );
  }

  /* ⚡⚡⚡ 2026-08-16 (audit H13 — TASDIQLANDI): «Kelganlar / Kelmaganlar /
   * Bemor» tugmalari `filtir` holatini o'zgartirardi, LEKIN filtrlashda
   * u UMUMAN ISHLATILMASDI — tugma bosilardi, ro'yxat o'zgarmasdi.
   * Endi BUGUNGI kun davomati bo'yicha filtrlanadi. */
  const bugungiKun = new Date().getDate();   /* oy ichidagi kun raqami */
  /* ⚡ 2026-08-16 (audit M): tabelda 31 kun QOTIRIB yozilgandi —
   * fevralda 29-31 kataklari ham chiziladi va ularni bosib MAVJUD
   * BO'LMAGAN sanaga davomat yozib qo'yish mumkin edi (28 kunlik oyda
   * «31-fevral»). Endi oyning haqiqiy kun soni hisoblanadi. */
  const _bugun = new Date();
  const oyKunlari = new Date(_bugun.getFullYear(), _bugun.getMonth() + 1, 0).getDate();
  const filtrlanganIshchilar = data.ishchilar.filter((ishchi: any) => {
    const mosKeladi = String(ishchi.ism ?? '').toLowerCase().includes(qidiruv.toLowerCase()) || 
                      String(ishchi.kasb ?? '').toLowerCase().includes(qidiruv.toLowerCase());
    if (!mosKeladi) return false;
    if (filtir === 'barchasi') return true;
    const tb = (data.tabellar ?? []).find((t: any) => t.ishchiId === ishchi.id);
    const holat = tb?.kunlar?.find((k: any) => k.sana === bugungiKun)?.holat ?? null;
    return holat === filtir;
  });

  return (
    <AuroraBackground>
      <div className="max-w-[1600px] mx-auto p-6 flex flex-col h-full overflow-hidden relative z-10">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 tracking-tight flex items-center gap-3">
              <Users className="text-blue-400" size={32} />
              Kadrlar va Davomat (HR)
            </h1>
            <p className="text-slate-400 mt-2 text-sm">Obyektlardagi ishchilar, davomat va maoshlar monitoringi</p>
          </div>
          <button
            onClick={() => setQoshOchiq(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors shadow-lg"
          >
            <Plus size={18} /> Ishchi qo'shish
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <GlassCard className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <HardHat size={24} />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Faol Ishchilar</div>
              <div className="text-2xl font-bold font-mono text-white">{data.jamiFaolIshchilar} kishi</div>
            </div>
          </GlassCard>
          
          <GlassCard className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CalendarCheck size={24} />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Bugungi Davomat</div>
              <div className="text-2xl font-bold font-mono text-white">{data.bugungiDavomat}%</div>
            </div>
          </GlassCard>

          <GlassCard className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <HandCoins size={24} />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Oylik Fond (Kutilma)</div>
              <div className="text-2xl font-bold font-mono text-white"><FmtN val={data.oylikFond} qisqa /></div>
            </div>
          </GlassCard>

          <GlassCard className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400">
              <HandCoins size={24} />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Berilgan Avanslar</div>
              <div className="text-2xl font-bold font-mono text-white"><FmtN val={data.berilganAvanslar} qisqa /></div>
            </div>
          </GlassCard>
        </div>

        <div className="flex-1 bg-[#0B0E14]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-white/5">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="F.I.O yoki kasb bo'yicha qidiruv..."
                value={qidiruv}
                onChange={e => setQidiruv(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
            
            <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/10">
              <Filter size={16} className="text-slate-400 ml-2 mr-1" />
              {[
                { id: 'barchasi', nom: 'Barchasi' },
                { id: 'keldi', nom: 'Kelganlar' },
                { id: 'kelmadi', nom: 'Kelmaganlar' },
                { id: 'kasal', nom: 'Bemor/Otgul' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFiltir(f.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${filtir === f.id ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  {f.nom}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto scrollbar-thin pb-4">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-black/60 sticky top-0 z-20 backdrop-blur-md">
                <tr>
                  <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider sticky left-0 bg-[#121620] z-30 shadow-[4px_0_12px_rgba(0,0,0,0.5)]">F.I.O va Kasbi</th>
                  <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider text-center">Ishlagan</th>
                  <th className="py-4 px-6 text-xs text-slate-400 font-bold uppercase tracking-wider text-right border-r border-white/10">Xisoblangan</th>
                  {Array.from({length: oyKunlari}, (_, i) => (
                    <th key={i} className="py-4 px-2 text-[10px] text-slate-500 font-bold uppercase text-center w-8 min-w-[32px]">{i+1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrlanganIshchilar.map((ishchi: any, idx: number) => {
                  const tabel = data.tabellar.find((t: any) => t.ishchiId === ishchi.id) || { kunlar: [], ishlaganKunlar: 0, xisoblanganOylik: 0 };
                  
                  return (
                    <motion.tr 
                      key={ishchi.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="py-3 px-6 sticky left-0 bg-[#121620] group-hover:bg-[#181d2a] z-10 shadow-[4px_0_12px_rgba(0,0,0,0.5)] transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-white/90 text-sm truncate">{ishchi.ism}</div>
                            <div className="text-xs text-blue-400 mt-0.5 truncate">
                              {ishchi.kasb}
                              {/* Stavka ko'rinib turishi kerak — «oylik nega bunchalik?»
                                  degan savol jadvalning o'zida javob topsin */}
                              {ishchi.stavka ? <span className="text-slate-500"> · <FmtN val={ishchi.stavka} />/kun</span> : null}
                            </div>
                          </div>
                          {/* ⚡ 2026-08-17 (audit): tahrir/o'chirish — avval saytda YO'Q edi */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100
                                          focus-within:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => setTahrirIshchi(ishchi)}
                              aria-label="Ishchini tahrirlash" title="Tahrirlash"
                              className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => ishchiOchirish(ishchi)}
                              disabled={ishchiOchir.isPending}
                              aria-label="Ishchini o'chirish" title="O'chirish"
                              className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10
                                         transition-colors disabled:opacity-40">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-6 text-center font-bold text-slate-300">
                        {tabel.ishlaganKunlar} <span className="text-[10px] text-slate-500 font-normal">kun</span>
                      </td>
                      <td className="py-3 px-6 text-right font-mono font-bold text-emerald-400/90 text-sm border-r border-white/10">
                        <FmtN val={tabel.xisoblanganOylik} />
                      </td>
                      {Array.from({length: oyKunlari}, (_, i) => {
                         const kunHolati = tabel.kunlar.find((k: any) => k.sana === i + 1)?.holat;
                         let bg = 'bg-white/5 border-white/10 text-slate-600';
                         let txt = '-';
                         if (kunHolati === 'keldi') { bg = 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 font-bold'; txt = '8'; } // 8 soat
                         else if (kunHolati === 'kelmadi') { bg = 'bg-rose-500/20 border-rose-500/30 text-rose-400 font-bold'; txt = 'N'; }
                         else if (kunHolati === 'kasal') { bg = 'bg-amber-500/20 border-amber-500/30 text-amber-400 font-bold'; txt = 'B'; }
                         
                         return (
                           <td key={i} className="py-3 px-1 text-center">
                             <div
                               onClick={() => kunBos(ishchi.id, i + 1)}
                               title="Bosib davomatni belgilang (bo'sh → keldi → kelmadi → kasal)"
                               className={`w-7 h-7 mx-auto rounded border ${bg} flex items-center justify-center text-xs cursor-pointer hover:scale-110 transition-transform`}
                             >
                               {txt}
                             </div>
                           </td>
                         )
                      })}
                    </motion.tr>
                  )
                })}
                
                {filtrlanganIshchilar.length === 0 && (
                  <tr>
                    <td colSpan={34} className="py-12 text-center text-slate-500">
                      {data.ishchilar.length === 0
                        ? "Hali birorta ishchi kiritilmagan — «Ishchi qo'shish» tugmasini bosing."
                        : 'Qidiruvga mos ishchi topilmadi.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      <ErpQoshModal
        isOpen={qoshOchiq}
        title="Yangi ishchi qo'shish"
        isSaving={ishchiQosh.isPending}
        onClose={() => setQoshOchiq(false)}
        fields={ISHCHI_MAYDONLAR}
        onSubmit={async (v) => {
          try {
            await ishchiQosh.mutateAsync(v as any);
            toast('Ishchi qo\'shildi', 'ok');
            setQoshOchiq(false);
          } catch (e: any) {
            toast('Xato: ' + e.message, 'danger');
          }
        }}
      />

      {/* ⚡ 2026-08-17 (audit): TAHRIR modali. Maydonlar ro'yxati qo'shish
          bilan AYNI BIR manbadan (`ISHCHI_MAYDONLAR`) olinadi — ikki joyda
          alohida yozilsa, biri yangilanib ikkinchisi eskirib qolardi. */}
      <ErpQoshModal
        isOpen={!!tahrirIshchi}
        title={`Tahrirlash: ${tahrirIshchi?.ism ?? ''}`}
        isSaving={ishchiTahrir.isPending}
        onClose={() => setTahrirIshchi(null)}
        fields={ISHCHI_MAYDONLAR}
        initial={tahrirIshchi ?? undefined}
        onSubmit={async (v) => {
          if (!tahrirIshchi) return;
          try {
            await ishchiTahrir.mutateAsync({ ...(v as any), id: tahrirIshchi.id });
            toast('Saqlandi', 'ok');
            setTahrirIshchi(null);
          } catch (e: any) {
            toast('Xato: ' + e.message, 'danger', undefined, 9000);
          }
        }}
      />
    </AuroraBackground>
  );
}

/* Qo'shish va tahrirlash uchun YAGONA maydonlar ro'yxati */
const ISHCHI_MAYDONLAR: ErpField[] = [
  { key: 'ism', label: 'F.I.O', type: 'text', required: true, placeholder: 'Azizov Bahrom' },
  { key: 'kasb', label: 'Kasbi', type: 'text', placeholder: 'Prorab' },
  { key: 'stavka', label: 'Kunlik stavka (so\'m)', type: 'money', placeholder: '250000' },
  { key: 'brigada', label: 'Brigada', type: 'text', placeholder: 'Brigada-1' },
  { key: 'obyekt', label: 'Obyekt', type: 'text' },
  { key: 'telefon', label: 'Telefon', type: 'text', placeholder: '+998 90 123 45 67' },
];
