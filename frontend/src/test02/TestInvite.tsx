import { useState, useEffect } from 'react';
import { Mail, Building2, UserPlus, Send, Search, Users, ExternalLink } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';
import { sbKontragentlarOl, type Kontragent } from '../api/t2-kontragent';

/* ⚠️ 2026-08-28 (Claude) — Q1 QOIDASI BUZILISHI TOPILDI VA TUZATILDI.
 *
 * Bu sahifa avval 100% o'ylab topilgan ma'lumot ko'rsatardi:
 *   - "Faol Hamkorlar" jadvali soxta kompaniyalar bilan to'la edi
 *     ("GOLDEN BRIDGE MCHJ", soxta INN, soxta "3 ta faol loyiha")
 *   - "Taklifnomalar Tarixi" soxta email/sana/holat bilan to'la edi
 *   - "Taklifnomani yuborish" tugmasi HECH QANDAY backend chaqirmasdan
 *     shunchaki "yuborildi" degan soxta muvaffaqiyat xabarini ko'rsatardi
 *     (`sbTaklifYubor`/`sbTaklifQabul` funksiyalari `t2-invite.ts`da bor
 *     edi, lekin bu sahifa ularni UMUMAN chaqirmasdi).
 *
 * Tuzatildi:
 *   - "Faol Hamkorlar" endi HAQIQIY `t2_kontragent` reestridan o'qiydi
 *     (backend allaqachon bor, 2026-08-27 qurilgan).
 *   - "Taklif Yuborish" / "Taklifnomalar Tarixi" — haqiqiy email orqali
 *     taklif yuborish tizimi (token yaratish, email jo'natish) HALI
 *     QURILMAGAN (yangi katta feature, MASTER_REJA'da alohida band) —
 *     shuning uchun soxta muvaffaqiyat o'rniga halol "hali qurilmagan"
 *     xabari ko'rsatiladi.
 */
export default function TestInvite() {
  const { joriy } = useKompaniya();
  const [activeTab, setActiveTab] = useState<'yuborilgan' | 'tarmoq' | 'yangi'>('tarmoq');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('subpudratchi');

  const [hamkorlar, setHamkorlar] = useState<Kontragent[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');

  useEffect(() => {
    if (!joriy?.id || activeTab !== 'tarmoq') return;
    setYuklanmoqda(true);
    setXato('');
    sbKontragentlarOl(joriy.id).then((r) => {
      setYuklanmoqda(false);
      if (r.ok) setHamkorlar(r.qatorlar || []);
      else setXato(r.error || 'O\'qilmadi');
    });
  }, [joriy, activeTab]);

  const handleYuborish = () => {
    if (!email) {
      toast('Email manzilni kiriting', 'danger');
      return;
    }
    toast('Email orqali taklif yuborish tizimi hali qurilmagan — hozircha hamkorni "Kontragentlar" bo\'limidan STIR bilan qo\'lda qo\'shing', 'danger');
  };

  return (
    <div className="p-6 bg-bg min-h-screen text-text">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <Users className="text-[var(--accent-text)]" />
            B2B Kontragentlar Tarmog'i va Takliflar
          </h1>
          <p className="text-sm text-text-dim max-w-2xl">
            Loyiha qatnashchilarini (Subpudratchilar, Yetkazib beruvchilar, Loyihachilar) tizimga taklif qilish va ro'yxatdan o'tgan hamkorlar bilan ishlash muhiti.
          </p>
        </div>
      </div>

      <div className="flex gap-1 bg-surface border border-border p-1 rounded-lg w-max mb-6">
        {[
          { id: 'tarmoq', label: 'Faol Hamkorlar', icon: Building2 },
          { id: 'yangi', label: 'Taklif Yuborish', icon: UserPlus },
          { id: 'yuborilgan', label: 'Taklifnomalar Tarixi', icon: Mail }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-bg text-[var(--text)] shadow-sm border border-border' : 'text-text-dim hover:text-[var(--text)] hover:bg-surface-2'}`}
          >
            <tab.icon size={16} className={activeTab === tab.id ? 'text-[var(--accent-text)]' : ''} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tarmoq' && (
        <div className="bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-border bg-bg/50">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
              <input
                type="text"
                placeholder="Hamkor nomi yoki STIR orqali izlash..."
                className="w-full bg-surface border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-[var(--text)] focus:border-accent outline-none"
              />
            </div>
          </div>
          {xato && <div className="m-4 p-3 bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] rounded-lg text-sm">{xato}</div>}
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-text-dim font-medium">
                <th className="px-6 py-4">Kompaniya Nomi</th>
                <th className="px-6 py-4">STIR (INN)</th>
                <th className="px-6 py-4">Roli</th>
                <th className="px-6 py-4">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {yuklanmoqda && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-text-dim animate-pulse">Yuklanmoqda...</td></tr>
              )}
              {!yuklanmoqda && hamkorlar.length === 0 && !xato && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-text-dim">
                  Hali hamkor qo'shilmagan — "Kontragentlar" bo'limidan qo'shing.
                </td></tr>
              )}
              {hamkorlar.map(t => (
                <tr key={t.id} className="hover:bg-bg/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-[var(--text)] flex items-center gap-2">
                    <Building2 size={16} className="text-[var(--accent-text)]" />
                    {t.nom}
                  </td>
                  <td className="px-6 py-4 font-mono text-text-dim">{t.inn || '-'}</td>
                  <td className="px-6 py-4">
                    <span className="bg-surface-2 text-text px-2.5 py-1 rounded-md text-xs font-medium border border-border">
                      {t.mavqe || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <a href="/admin/test/kontragent" className="text-[var(--info)] hover:text-[var(--info)] flex items-center gap-1 text-xs font-medium">
                      Batafsil <ExternalLink size={14} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'yangi' && (
        <div className="max-w-2xl">
          <div className="bg-surface border border-border rounded-xl p-8 shadow-xl">
            <h2 className="text-lg font-bold text-[var(--text)] mb-6 flex items-center gap-2">
              <Send size={20} className="text-[var(--accent-text)]" />
              Yangi hamkorni platformaga taklif qilish
            </h2>

            <div className="mb-5 p-3 bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] border border-[color-mix(in_srgb,var(--warn)_30%,transparent)] rounded-lg text-sm text-[var(--warn)]">
              Email orqali taklif yuborish tizimi (token, xat jo'natish) hali qurilmagan.
              Hozircha hamkorni "Kontragentlar" bo'limidan STIR bilan to'g'ridan-to'g'ri qo'shing.
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-text-dim mb-2">Hamkorning e-mail manzili</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="masalan: info@kompaniya.uz"
                  className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-[var(--text)] focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-dim mb-2">Loyihadagi Roli (Polimorfik)</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Subpudratchi', 'Yetkazib beruvchi', 'Loyihachi', 'Texnik Nazoratchi'].map(r => (
                    <label key={r} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${rol === r.toLowerCase() ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)]' : 'bg-bg border-border hover:border-text-dim'}`}>
                      <input
                        type="radio"
                        name="rol"
                        value={r.toLowerCase()}
                        checked={rol === r.toLowerCase()}
                        onChange={e => setRol(e.target.value)}
                        className="accent-[var(--accent)]"
                      />
                      <span className={rol === r.toLowerCase() ? 'text-[var(--accent-text)] font-medium' : 'text-text-dim'}>{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={handleYuborish}
                className="w-full mt-2 bg-[var(--accent)] hover:brightness-110 text-[var(--on-accent)] px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Mail size={18} />
                Taklifnomani yuborish
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'yuborilgan' && (
        <div className="bg-surface border border-border rounded-xl shadow-xl p-12 text-center text-text-dim">
          Taklifnomalar tarixi hali qurilmagan (email orqali taklif tizimi bilan birga keladi).
        </div>
      )}
    </div>
  );
}
