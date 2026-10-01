/**
 * KompaniyaPage.tsx — canonical /admin/kompaniya, the Company Control
 * Center hub (T2-COMPANY-CONTROL-CLOSEOUT Phase A P0 #4).
 *
 * Top section (global, no company needed): identity + memberships + open a
 * new company. Below it, 7 tabs operating on the ACTIVE company (header
 * selector, `useKompaniya().joriy`) — Profil / A'zolar / Rollar va
 * Ruxsatlar / Modullar / Loyiha-Obyekt ruxsatlari / Integratsiyalar /
 * Audit. No fake billing/subscription UI, no simulated (setTimeout) saves —
 * every tab is either wired to a real canonical command/read model, or (for
 * pieces whose write RPC does not exist yet) an HONEST "hali yaratilmagan"
 * empty state, never a fake button.
 * EGALIK: Claude (integration lane).
 */
import { useMemo, useState } from 'react';
import {
  Building2, Crown, ShieldCheck, Loader2, AlertTriangle, Trash2, Users, LogOut,
  User, KeyRound, Layers, FolderKanban, Plug, History, Save, RefreshCw,
  Send, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { useMen, useOnboardingCommands, useKompaniyaAzolari, useKompaniyaProfil, useProfilYangila, useKompaniyaRoyxatlar, useAzolikRuxsatlari, QOSHIMCHA_RUXSATLAR, type Azolik, type KompaniyaProfil, type KompaniyaRoyxat } from '../../api/t2-men';
import { useSystemControl } from '../../api/t2-control';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { tizimdanChiq } from '../../umumiy/kontekst/chiqish';
import { KompaniyaLogoYuklash } from '../../umumiy/hujjat/KompaniyaLogo';
import { PERMISSIONS, ROLE_PERMISSIONS, MEMBERSHIP_ROLES } from '../../lib/company-authorization/effective-authorization';

const AZO_ROLLAR = ['boss', 'rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'] as const;
const MAVQE_VARIANTLAR = ['zakazchik', 'pudratchi', 'loyihachi'] as const;

function xatoMatn(code?: string): string {
  switch (code) {
    case 'LAST_DIRECTOR': return 'Kompaniyaning oxirgi direktorini o‘chirib/tushirib bo‘lmaydi.';
    case 'ALREADY_MEMBER': return 'Bu foydalanuvchi allaqachon a‘zo.';
    case 'ROLE_INVALID': return 'Bu rolni bu yerdan berib bo‘lmaydi (superadmin — platforma darajasida).';
    case 'INN_INVALID': return 'STIR 9 ta raqamdan iborat bo‘lishi kerak.';
    case 'MAVQE_INVALID': return 'Mavqe noto‘g‘ri.';
    case 'COMPANY_NAME_REQUIRED': return 'Kompaniya nomini kiriting.';
    case 'AUTH_REQUIRED': return 'Sessiya muddati tugagan. Chiqib, qaytadan kiring.';
    case 'AUTHORIZATION_DENIED': return 'Bu amal uchun ruxsatingiz yo‘q.';
    case 'STALE_VERSION': return 'Ma’lumot boshqa joyda yangilangan. Sahifani qayta yuklang.';
    case 'PAROL_QISQA': return 'Parol kamida 8 belgi bo‘lishi kerak.';
    case 'AZOLIK_TOPILMADI': return 'Bu foydalanuvchi shu kompaniyaning a‘zosi emas.';
    case 'SUPERADMIN_REQUIRED': return 'Yangi kompaniyani to‘g‘ridan-to‘g‘ri faqat superadmin ochadi. Iltimos, so‘rov yuboring.';
    case 'REQUEST_NOT_PENDING': return 'Bu so‘rov allaqachon ko‘rib chiqilgan.';
    case 'REQUEST_NOT_FOUND': return 'So‘rov topilmadi.';
    case 'MANAGE_ROLE_REQUIRED': return 'Bu amal uchun direktor (boss) yoki admin roli kerak.';
    case 'RUXSAT_NOTOGRI': return 'Bu ruxsat kodi noto‘g‘ri yoki berilishi mumkin emas.';
    default: return 'Amalni bajarib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.';
  }
}

/** T2-AUTH-PASSWORD-MIGRATION-001: 12 ta belgidan iborat, o‘qish oson
 *  (chalkash 0/O, 1/l/I chiqarib tashlangan) tasodifiy vaqtinchalik parol. */
function vaqtinchalikParolYarat(): string {
  const belgilar = 'abcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 12; i++) p += belgilar[Math.floor(Math.random() * belgilar.length)];
  return p;
}

function AzolarBoshqaruv({ kompaniyaId, kompaniyaNom, isDirector }: { kompaniyaId: number; kompaniyaNom: string; isDirector: boolean }) {
  const q = useKompaniyaAzolari(kompaniyaId);
  const cmd = useOnboardingCommands();
  const [tahrirId, setTahrirId] = useState<number | null>(null);
  const [yangiRol, setYangiRol] = useState<string>('prorab');
  const [azoLogin, setAzoLogin] = useState('');
  const [azoRol, setAzoRol] = useState<string>('prorab');
  /* Faqat XOTIRADA — bazaga yozilmagan, sahifa yopilsa yo'qoladi. Bu ATAYLAB:
     vaqtinchalik parol faqat SHU EKRANDA, BIR MARTA ko'rsatiladi, boshqa
     hech qayerda saqlanmaydi (t2_foydalanuvchi.parol_hash allaqachon
     xeshlangan — ochiq matnli qiymat bundan tashqari qayerda ham yo'q). */
  const [korsatilganParol, setKorsatilganParol] = useState<{ login: string; parol: string } | null>(null);

  return (
    <div className="karta p-4">
      <div className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-accent" /> {kompaniyaNom} — a‘zolar</div>
      {q.isLoading && <div className="mt-2 text-[12px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={13} /> yuklanmoqda…</div>}
      {q.isError && <div className="mt-2 text-[12px] text-rose-300">A‘zolar ro‘yxatini o‘qib bo‘lmadi.</div>}
      {q.data && (
        <div className="mt-2 divide-y divide-border/60">
          {q.data.filter((a) => a.holat === 'faol').map((a) => (
            <div key={a.azolik_id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">{a.ism || a.login} <span className="text-[11px] text-text-mute">@{a.login}</span></div>
                <div className="text-[11px] text-text-dim">{a.email || '—'}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {tahrirId === a.azolik_id ? (
                  <>
                    <select className="input py-0.5 text-[12px]" value={yangiRol} onChange={(e) => setYangiRol(e.target.value)}>
                      {AZO_ROLLAR.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button className="text-[12px] text-accent" disabled={cmd.azoRol.isPending}
                      onClick={() => cmd.azoRol.mutate({ azolik_id: a.azolik_id, rol: yangiRol }, { onSuccess: () => setTahrirId(null) })}>saqlash</button>
                    <button className="text-[12px] text-text-dim" onClick={() => setTahrirId(null)}>bekor</button>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-2 border border-border">{a.rol}</span>
                    {isDirector && <>
                      <button className="text-[12px] text-text-dim hover:text-text" onClick={() => { setTahrirId(a.azolik_id); setYangiRol(a.rol); }}>rol</button>
                      <button className="text-[12px] text-text-dim hover:text-text flex items-center gap-0.5" title="Vaqtinchalik parol o‘rnatish"
                        disabled={cmd.azoParolBelgila.isPending}
                        onClick={() => {
                          if (!confirm(`«${a.ism || a.login}» uchun YANGI vaqtinchalik parol o‘rnatilsinmi? Eski parol (agar bo‘lsa) ishlamay qoladi.`)) return;
                          const parol = vaqtinchalikParolYarat();
                          setKorsatilganParol(null);
                          cmd.azoParolBelgila.mutate(
                            { kompaniya_id: kompaniyaId, foydalanuvchi_id: a.foydalanuvchi_id, yangi_parol: parol },
                            { onSuccess: () => setKorsatilganParol({ login: a.login, parol }) });
                        }}>
                        <KeyRound size={12} /> parol
                      </button>
                      <button className="text-rose-400 hover:text-rose-300" title="A‘zolikni bekor qilish"
                        disabled={cmd.azoOchir.isPending}
                        onClick={() => { if (confirm(`«${a.ism || a.login}» a‘zoligi bekor qilinsinmi? Qilgan ishlari saqlanadi.`)) cmd.azoOchir.mutate({ azolik_id: a.azolik_id }); }}>
                        <Trash2 size={14} />
                      </button>
                    </>}
                  </>
                )}
              </div>
            </div>
          ))}
          {!q.data.some((a) => a.holat === 'faol') && <div className="py-2 text-[12px] text-text-dim">— faol a‘zo yo‘q —</div>}
        </div>
      )}
      {(cmd.azoRol.isError || cmd.azoOchir.isError || cmd.azoParolBelgila.isError) && (
        <p className="mt-2 text-[12px] text-rose-300">{xatoMatn(((cmd.azoRol.error || cmd.azoOchir.error || cmd.azoParolBelgila.error) as any)?.code)}</p>
      )}
      {korsatilganParol && (
        <div className="mt-2 karta p-3 border-accent/40 bg-accent/5 flex items-start gap-2">
          <KeyRound size={14} className="text-accent mt-0.5 shrink-0" />
          <div className="min-w-0 text-[12px]">
            <div><b>@{korsatilganParol.login}</b> uchun vaqtinchalik parol: <code className="px-1 py-0.5 rounded bg-surface-2 select-all">{korsatilganParol.parol}</code></div>
            <div className="text-text-mute mt-0.5">Buni foydalanuvchiga xavfsiz tarzda (telefon/shaxsan) yetkazing — bu yerda qayta ko‘rsatilmaydi.</div>
          </div>
          <button className="ml-auto text-text-dim hover:text-text text-[12px] shrink-0" onClick={() => setKorsatilganParol(null)}>yopish</button>
        </div>
      )}

      {isDirector && (
        <div className="mt-4 pt-3 border-t border-border/60 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="login" value={azoLogin} onChange={(e) => setAzoLogin(e.target.value)} />
          <select className="input" value={azoRol} onChange={(e) => setAzoRol(e.target.value)}>
            {AZO_ROLLAR.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="tugma-asosiy" disabled={cmd.azoQosh.isPending || !azoLogin.trim()}
            onClick={() => cmd.azoQosh.mutate({ kompaniya_id: kompaniyaId, login: azoLogin.trim(), rol: azoRol }, { onSuccess: () => setAzoLogin('') })}>
            {cmd.azoQosh.isPending ? <Loader2 className="animate-spin" size={15} /> : 'A‘zo qo‘shish'}
          </button>
          {cmd.azoQosh.isError && <p className="col-span-3 text-[12px] text-rose-300">{xatoMatn((cmd.azoQosh.error as any)?.code)}</p>}
          <p className="col-span-3 text-[11px] text-text-mute flex items-center gap-1"><ShieldCheck size={12} /> superadmin roli bu yerdan berilmaydi — platforma darajasida.</p>
        </div>
      )}
    </div>
  );
}

function ProfilTab({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const q = useKompaniyaProfil(kompaniyaId);
  const mut = useProfilYangila(kompaniyaId);
  const [draft, setDraft] = useState<Partial<KompaniyaProfil> | null>(null);

  const p = draft ?? q.data ?? null;
  const set = (k: keyof KompaniyaProfil) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...(draft ?? q.data ?? {}), [k]: e.target.value });

  if (q.isLoading) return <div className="p-4 text-[13px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> yuklanmoqda…</div>;
  if (q.isError) return <div className="p-4 text-[13px] text-rose-300">{xatoMatn((q.error as any)?.code)}</div>;
  if (!q.data || !p) return null;

  const ozgardi = draft != null;

  return (
    <div className="karta p-4 max-w-2xl">
      {!isDirector && (
        <div className="mb-3 text-[12px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
          Profilni faqat direktor tahrirlaydi. Quyidagi ma’lumot faqat ko‘rish uchun.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] text-text-dim">To‘liq nom
          <input className="input mt-1 w-full" disabled={!isDirector} value={p.toliq_nom ?? ''} onChange={set('toliq_nom')} />
        </label>
        <label className="text-[12px] text-text-dim">STIR (INN)
          <input className="input mt-1 w-full" disabled={!isDirector} value={p.inn ?? ''} onChange={set('inn')} />
        </label>
        <label className="text-[12px] text-text-dim sm:col-span-2">Manzil
          <input className="input mt-1 w-full" disabled={!isDirector} value={p.manzil ?? ''} onChange={set('manzil')} />
        </label>
        <label className="text-[12px] text-text-dim">Rahbar
          <input className="input mt-1 w-full" disabled={!isDirector} value={p.rahbar ?? ''} onChange={set('rahbar')} />
        </label>
        <label className="text-[12px] text-text-dim">Telefon
          <input className="input mt-1 w-full" disabled={!isDirector} value={p.telefon ?? ''} onChange={set('telefon')} />
        </label>
        <label className="text-[12px] text-text-dim">Bank
          <input className="input mt-1 w-full" disabled={!isDirector} value={p.bank ?? ''} onChange={set('bank')} />
        </label>
        <label className="text-[12px] text-text-dim">Hisob raqam
          <input className="input mt-1 w-full" disabled={!isDirector} value={p.hisob_raqam ?? ''} onChange={set('hisob_raqam')} />
        </label>
        <label className="text-[12px] text-text-dim">MFO
          <input className="input mt-1 w-full" disabled={!isDirector} value={p.mfo ?? ''} onChange={set('mfo')} />
        </label>
        <label className="text-[12px] text-text-dim">Mavqe
          <select className="input mt-1 w-full" disabled={!isDirector} value={p.mavqe ?? ''} onChange={set('mavqe')}>
            <option value="">—</option>
            {MAVQE_VARIANTLAR.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      {isDirector && (
        <div className="mt-4 flex items-center gap-2">
          <button className="tugma-asosiy" disabled={!ozgardi || mut.isPending}
            onClick={() => mut.mutate({
              kompaniya_id: kompaniyaId, expected_version: q.data!.versiya,
              toliq_nom: p.toliq_nom ?? undefined, inn: p.inn ?? undefined, manzil: p.manzil ?? undefined,
              rahbar: p.rahbar ?? undefined, telefon: p.telefon ?? undefined, bank: p.bank ?? undefined,
              hisob_raqam: p.hisob_raqam ?? undefined, mfo: p.mfo ?? undefined, mavqe: p.mavqe ?? undefined,
            }, { onSuccess: () => setDraft(null) })}>
            {mut.isPending ? <Loader2 className="animate-spin" size={14} /> : <><Save size={14} className="inline mr-1" /> Saqlash</>}
          </button>
          {ozgardi && <button className="text-[12px] text-text-dim" onClick={() => setDraft(null)}>bekor qilish</button>}
          <span className="text-[11px] text-text-mute">versiya: {q.data.versiya}</span>
        </div>
      )}
      {mut.isError && (
        <div className="mt-2 text-[12px] text-rose-300 flex items-center gap-2">
          {xatoMatn((mut.error as any)?.code)}
          {(mut.error as any)?.code === 'STALE_VERSION' && (
            <button className="underline" onClick={() => q.refetch()}><RefreshCw size={11} className="inline" /> qayta yuklash</button>
          )}
        </div>
      )}
    </div>
  );
}

function RollarTab({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  return (
    <div className="space-y-4">
      <div className="karta p-4 overflow-x-auto">
        <p className="text-[12px] text-text-dim mb-3">
          Bu — tizimning haqiqiy ruxsat qonuni (<code>t2_effective_authorization_v1</code> /
          <code> effective-authorization.ts</code> bilan bir xil manba). Rolning o‘zi shu yerdan
          o‘zgartirilmaydi — rol kompaniya a‘zoligida beriladi (A‘zolar tabi). Pastda esa bitta
          a‘zoga, rolini o‘zgartirmasdan, QO‘SHIMCHA ruxsat berish mumkin.
        </p>
        <table className="text-[12px] w-full min-w-[720px]">
          <thead>
            <tr className="text-left text-text-dim border-b border-border">
              <th className="py-1.5 pr-3">Rol</th>
              {PERMISSIONS.filter((p) => !p.startsWith('control.global')).map((p) => (
                <th key={p} className="py-1.5 px-1.5 font-normal whitespace-nowrap">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEMBERSHIP_ROLES.filter((r) => r !== 'superadmin' && r !== 'admin').map((rol) => (
              <tr key={rol} className="border-b border-border/40">
                <td className="py-1.5 pr-3 font-medium">{rol}</td>
                {PERMISSIONS.filter((p) => !p.startsWith('control.global')).map((p) => (
                  <td key={p} className="py-1.5 px-1.5 text-center">
                    {ROLE_PERMISSIONS[rol].includes(p) ? <span className="text-emerald-400">✓</span> : <span className="text-text-mute/40">·</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <QoshimchaRuxsatlarBoshqaruv kompaniyaId={kompaniyaId} isDirector={isDirector} />
    </div>
  );
}

/**
 * T2-RUXSAT-QOSHIMCHA-001: har bir a‘zoga, rolini o‘zgartirmasdan,
 * qo‘shimcha ruxsat berish/olib tashlash.
 *
 * ⚠️ OCHIQ CHEGARA: bu qo‘shimcha ruxsat FAQAT `t2_effective_authorization_v1`
 * orqali o‘tadigan tekshiruvlarga ta‘sir qiladi (hozircha asosan
 * `/api/company?authorize=1`). Ko‘pgina yozish amallari (smeta tahrirlash,
 * narx belgilash, fakt yozish va h.k.) o‘zining alohida rol-tekshiruviga
 * ega va bu yerdagi qo‘shimcha ruxsatni HISOBGA OLMAYDI.
 */
function QoshimchaRuxsatlarBoshqaruv({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const q = useAzolikRuxsatlari(kompaniyaId);
  const cmd = useOnboardingCommands();
  const [ochiqAzolikId, setOchiqAzolikId] = useState<number | null>(null);

  if (!isDirector) {
    return (
      <div className="karta p-4 text-[12px] text-text-dim">
        Qo‘shimcha ruxsatlarni faqat direktor (boss) yoki admin boshqara oladi.
      </div>
    );
  }
  return (
    <div className="karta p-4">
      <div className="text-[13px] font-semibold mb-1">A‘zolarga qo‘shimcha ruxsat</div>
      <p className="text-[11px] text-text-mute mb-3">
        Masalan: bir prorabga rolini o‘zgartirmasdan <code>financial.read</code> ko‘rish huquqini
        qo‘shish. Bu — rol tayinlash emas, faqat qo‘shimcha huquq.
      </p>
      {q.isLoading && <div className="text-[12px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={13} /> yuklanmoqda…</div>}
      {q.isError && <div className="text-[12px] text-rose-300">A‘zolar ro‘yxati o‘qilmadi.</div>}
      {q.data && (
        <div className="divide-y divide-border/60">
          {q.data.azolar.filter((a) => a.rol !== 'boss' && a.rol !== 'admin' && a.rol !== 'superadmin').map((a) => (
            <div key={a.azolik_id} className="py-2">
              <button type="button" className="w-full flex items-center justify-between gap-3 text-left"
                onClick={() => setOchiqAzolikId(ochiqAzolikId === a.azolik_id ? null : a.azolik_id)}>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{a.ism || a.login} <span className="text-[11px] text-text-mute">@{a.login} · {a.rol}</span></div>
                  {a.qoshimcha_ruxsatlar.length > 0 && (
                    <div className="text-[11px] text-emerald-400 truncate">+ {a.qoshimcha_ruxsatlar.join(', ')}</div>
                  )}
                </div>
                <span className="text-[11px] text-text-mute shrink-0">{ochiqAzolikId === a.azolik_id ? 'yopish ▴' : 'boshqarish ▾'}</span>
              </button>
              {ochiqAzolikId === a.azolik_id && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {QOSHIMCHA_RUXSATLAR.filter((r) => !ROLE_PERMISSIONS[a.rol as keyof typeof ROLE_PERMISSIONS]?.includes(r)).map((r) => {
                    const bor = a.qoshimcha_ruxsatlar.includes(r);
                    return (
                      <label key={r} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                        <input type="checkbox" checked={bor} disabled={cmd.azolikRuxsatBer.isPending || cmd.azolikRuxsatOlibTashla.isPending}
                          onChange={() => {
                            if (bor) cmd.azolikRuxsatOlibTashla.mutate({ kompaniya_id: kompaniyaId, azolik_id: a.azolik_id, ruxsat: r });
                            else cmd.azolikRuxsatBer.mutate({ kompaniya_id: kompaniyaId, azolik_id: a.azolik_id, ruxsat: r });
                          }} />
                        {r}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {q.data.azolar.filter((a) => a.rol !== 'boss' && a.rol !== 'admin' && a.rol !== 'superadmin').length === 0 && (
            <p className="py-2 text-[12px] text-text-dim">Qo‘shimcha ruxsat berish mumkin bo‘lgan a‘zo yo‘q (boss/admin/superadmin allaqachon to‘liq huquqqa ega).</p>
          )}
        </div>
      )}
      {(cmd.azolikRuxsatBer.isError || cmd.azolikRuxsatOlibTashla.isError) && (
        <p className="mt-2 text-[12px] text-rose-300">{xatoMatn(((cmd.azolikRuxsatBer.error || cmd.azolikRuxsatOlibTashla.error) as any)?.code)}</p>
      )}
    </div>
  );
}

function ModullarTab({ kompaniyaId }: { kompaniyaId: number }) {
  const q = useSystemControl(kompaniyaId);
  if (q.isLoading) return <div className="p-4 text-[13px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> yuklanmoqda…</div>;
  if (q.isError) return <div className="p-4 text-[13px] text-rose-300">Modullar ma’lumotini o‘qib bo‘lmadi.</div>;
  const caps = q.data?.capabilities ?? [];
  if (!caps.length) return <div className="p-4 text-[13px] text-text-dim">— modul ma’lumoti yo‘q —</div>;
  return (
    <div className="karta p-4 divide-y divide-border/60">
      {caps.map((c: any) => (
        <div key={c.id} className="py-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{c.capability} <span className="text-[11px] text-text-mute">({c.module})</span></div>
            <div className="text-[11px] text-text-dim">scope: {c.scope} · versiya {c.version}</div>
          </div>
          <span className={`text-[11px] px-1.5 py-0.5 rounded border ${c.status === 'healthy' ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'}`}>{c.status}</span>
        </div>
      ))}
      <p className="pt-2 text-[11px] text-text-mute">Boshqarish (yoqish/o‘chirish, kill-switch): Tizim boshqaruv markazi.</p>
    </div>
  );
}

function IntegratsiyalarTab({ kompaniyaId }: { kompaniyaId: number }) {
  const q = useSystemControl(kompaniyaId);
  if (q.isLoading) return <div className="p-4 text-[13px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> yuklanmoqda…</div>;
  if (q.isError) return <div className="p-4 text-[13px] text-rose-300">Integratsiyalar ma’lumotini o‘qib bo‘lmadi.</div>;
  const ints = q.data?.integrations ?? [];
  if (!ints.length) return <div className="p-4 text-[13px] text-text-dim">— integratsiya sozlanmagan —</div>;
  return (
    <div className="karta p-4 divide-y divide-border/60">
      {ints.map((i: any) => (
        <div key={i.id} className="py-2 flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium">{i.name}</div>
          <span className={`text-[11px] px-1.5 py-0.5 rounded border ${i.status === 'ok' || i.status === 'healthy' ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/40 text-amber-300'}`}>{i.status}</span>
        </div>
      ))}
    </div>
  );
}

function AuditTab({ kompaniyaId }: { kompaniyaId: number }) {
  const q = useSystemControl(kompaniyaId);
  if (q.isLoading) return <div className="p-4 text-[13px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> yuklanmoqda…</div>;
  if (q.isError) return <div className="p-4 text-[13px] text-rose-300">Audit ma’lumotini o‘qib bo‘lmadi.</div>;
  const events = q.data?.auditEvents ?? [];
  if (!events.length) return <div className="p-4 text-[13px] text-text-dim">— audit yozuvi yo‘q —</div>;
  return (
    <div className="karta p-4 divide-y divide-border/60 max-h-[420px] overflow-y-auto">
      {events.map((e: any) => (
        <div key={e.id} className="py-2 text-[12px]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{e.action}</span>
            <span className="text-text-mute">{new Date(e.timestamp).toLocaleString('uz-UZ')}</span>
          </div>
          <div className="text-text-dim">{e.actor} — {e.entity}{e.newValue ? `: ${e.newValue}` : ''}</div>
        </div>
      ))}
    </div>
  );
}

const ROYXAT_HOLAT_BELGI: Record<KompaniyaRoyxat['holat'], { Ikonka: typeof Clock; matn: string; rang: string }> = {
  kutilmoqda: { Ikonka: Clock, matn: 'Kutilmoqda', rang: 'text-amber-300' },
  tasdiqlandi: { Ikonka: CheckCircle2, matn: 'Tasdiqlandi', rang: 'text-emerald-400' },
  rad_etildi: { Ikonka: XCircle, matn: 'Rad etildi', rang: 'text-rose-400' },
};

/**
 * T2-COMPANY-CREATE-GATE-001: kompaniya ochish so'rovlari.
 *
 * `superadmin=true` bo'lsa — BARCHA so'rovlar, tasdiqlash/rad etish
 * tugmalari bilan. `superadmin=false` bo'lsa — server FAQAT so'rovchining
 * o'z so'rovlarini qaytaradi (RPC ichida ajratilgan), shuning uchun bu
 * yerda faqat holat ko'rsatiladi — boshqa hech kim ko'rinmaydi.
 */
function KompaniyaRoyxatlari() {
  const q = useKompaniyaRoyxatlar();
  const cmd = useOnboardingCommands();
  const [radSababId, setRadSababId] = useState<number | null>(null);
  const [sabab, setSabab] = useState('');

  if (q.isLoading) return <div className="p-3 text-[12px] text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={13} /> yuklanmoqda…</div>;
  if (q.isError || !q.data) return <div className="p-3 text-[12px] text-rose-300">So‘rovlar ro‘yxatini o‘qib bo‘lmadi.</div>;

  const { superadmin, royxatlar } = q.data;
  if (!royxatlar.length) return <div className="p-3 text-[12px] text-text-dim">— so‘rov yo‘q —</div>;

  return (
    <div className="mt-2 divide-y divide-border/60">
      {royxatlar.map((ro) => {
        const belgi = ROYXAT_HOLAT_BELGI[ro.holat];
        return (
          <div key={ro.id} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">{ro.nom}</div>
                <div className="text-[11px] text-text-dim">
                  @{ro.login}{ro.inn ? ` · STIR ${ro.inn}` : ''}{ro.telefon ? ` · ${ro.telefon}` : ''}
                  {' · '}{new Date(ro.created_at).toLocaleString('uz-UZ')}
                </div>
                {ro.holat === 'rad_etildi' && ro.sabab && (
                  <div className="text-[11px] text-rose-300 mt-0.5">Sabab: {ro.sabab}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] flex items-center gap-1 ${belgi.rang}`}><belgi.Ikonka size={13} /> {belgi.matn}</span>
                {superadmin && ro.holat === 'kutilmoqda' && (
                  <>
                    <button className="text-[12px] text-emerald-400 hover:text-emerald-300" disabled={cmd.royxatTasdiqla.isPending}
                      onClick={() => cmd.royxatTasdiqla.mutate({ royxat_id: ro.id })}>
                      Tasdiqlash
                    </button>
                    <button className="text-[12px] text-rose-400 hover:text-rose-300"
                      onClick={() => { setRadSababId(ro.id); setSabab(''); }}>
                      Rad etish
                    </button>
                  </>
                )}
              </div>
            </div>
            {radSababId === ro.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="input flex-1 min-w-[160px] text-[12px]" placeholder="Rad etish sababi (ixtiyoriy)"
                  value={sabab} onChange={(e) => setSabab(e.target.value)} />
                <button className="text-[12px] text-rose-400" disabled={cmd.royxatRadEt.isPending}
                  onClick={() => cmd.royxatRadEt.mutate({ royxat_id: ro.id, sabab: sabab.trim() || undefined }, { onSuccess: () => setRadSababId(null) })}>
                  {cmd.royxatRadEt.isPending ? <Loader2 className="animate-spin" size={13} /> : 'Tasdiqlash (rad etish)'}
                </button>
                <button className="text-[12px] text-text-dim" onClick={() => setRadSababId(null)}>bekor</button>
              </div>
            )}
          </div>
        );
      })}
      {(cmd.royxatTasdiqla.isError || cmd.royxatRadEt.isError) && (
        <p className="pt-2 text-[12px] text-rose-300">{xatoMatn(((cmd.royxatTasdiqla.error || cmd.royxatRadEt.error) as any)?.code)}</p>
      )}
    </div>
  );
}

function LoyihaObyektTab() {
  return (
    <div className="karta p-4 max-w-lg text-[13px] text-text-dim">
      <div className="flex items-start gap-2">
        <FolderKanban size={16} className="mt-0.5 shrink-0 text-text-mute" />
        <div>
          Loyiha/obyekt darajasidagi shaxsiy ruxsatlar jadvali (
          <code>t2_loyiha_foydalanuvchi_ruxsat</code>, <code>t2_obyekt_foydalanuvchi_ruxsat</code>)
          bazada bor, lekin ularni BOSHQARADIGAN buyruq (write RPC) hali yaratilmagan —
          bu tab hozircha faqat holatni halol aytadi, soxta tugma ko‘rsatmaydi.
          Kompaniya a’zoligi darajasidagi ruxsatlar «A‘zolar» tabida ishlaydi.
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'profil', nom: 'Profil', Ikonka: User },
  { key: 'azolar', nom: 'A‘zolar', Ikonka: Users },
  { key: 'rollar', nom: 'Rollar va Ruxsatlar', Ikonka: KeyRound },
  { key: 'modullar', nom: 'Modullar', Ikonka: Layers },
  { key: 'loyiha', nom: 'Loyiha/Obyekt', Ikonka: FolderKanban },
  { key: 'integratsiya', nom: 'Integratsiyalar', Ikonka: Plug },
  { key: 'audit', nom: 'Audit', Ikonka: History },
] as const;
type TabKey = typeof TABS[number]['key'];

function ControlCenterTabs({ kompaniyaId, kompaniyaNom, isDirector }: { kompaniyaId: number; kompaniyaNom: string; isDirector: boolean }) {
  const [tab, setTab] = useState<TabKey>('profil');
  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'
            }`}>
            <t.Ikonka size={13} /> {t.nom}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {tab === 'profil' && <><ProfilTab kompaniyaId={kompaniyaId} isDirector={isDirector} /><KompaniyaLogoYuklash kompaniyaId={kompaniyaId} isDirector={isDirector} /></>}
        {tab === 'azolar' && <AzolarBoshqaruv kompaniyaId={kompaniyaId} kompaniyaNom={kompaniyaNom} isDirector={isDirector} />}
        {tab === 'rollar' && <RollarTab kompaniyaId={kompaniyaId} isDirector={isDirector} />}
        {tab === 'modullar' && <ModullarTab kompaniyaId={kompaniyaId} />}
        {tab === 'loyiha' && <LoyihaObyektTab />}
        {tab === 'integratsiya' && <IntegratsiyalarTab kompaniyaId={kompaniyaId} />}
        {tab === 'audit' && <AuditTab kompaniyaId={kompaniyaId} />}
      </div>
    </div>
  );
}

export default function KompaniyaPage() {
  const q = useMen();
  const cmd = useOnboardingCommands();
  const k = useKompaniya();
  const [nom, setNom] = useState('');
  const [inn, setInn] = useState('');
  const [telefon, setTelefon] = useState('');

  const direktorKompaniyalar = useMemo(
    () => (q.data?.azoliklar ?? []).filter((a) => a.is_director),
    [q.data],
  );
  /* T2-COMPANY-CREATE-GATE-001: "direktor" (boss+superadmin) bilan
     PLATFORMA superadmini bir xil narsa emas — boss faqat o'z
     kompaniyasining direktori, superadmin esa yangi kompaniyani
     to'g'ridan-to'g'ri ochishga (va boshqa so'rovlarni ko'rib chiqishga)
     haqli. Server ham aynan shu farqni tekshiradi (`t2_platforma_
     superadmin`) — bu yerdagi tekshiruv faqat UI uchun, xavfsizlik
     RPC darajasida. */
  const menSuperadmin = useMemo(
    () => (q.data?.azoliklar ?? []).some((a) => a.rol === 'superadmin'),
    [q.data],
  );

  if (q.isLoading) return <div className="p-6 text-sm text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Yuklanmoqda…</div>;
  if (q.isError) {
    const c = (q.error as any)?.code;
    const auth = c === 'AUTH_REQUIRED' || c === 'ACTOR_NOT_FOUND' || c === 'ACTOR_RESOLVE_FAILED';
    const matn = auth ? 'Sessiyani yangilash kerak. Chiqing va qaytadan kiring.'
      : c === 'CONFIG' || c === 'ME_FAILED' ? 'Kompaniya ma‘lumoti serveri sozlamasida nosozlik. Administrator bilan bog‘laning.'
      : 'Kompaniya ma‘lumotini o‘qib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.';
    return (
      <div className="p-6 text-sm">
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-100">
          <div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{matn}</span></div>
          <div className="mt-3">
            {auth
              ? <button onClick={tizimdanChiq} className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1.5 font-medium"><LogOut size={13} /> Chiqib, qayta kirish</button>
              : <button onClick={() => q.refetch()} className="underline">Qayta urinish</button>}
          </div>
        </div>
      </div>
    );
  }

  /* ⚠️ 2026-09-07 (Claude): `isLoading`/`isError` ikkalasi ham false
   * bo'lib, `data` hali ham `undefined` bo'lishi mumkin (masalan
   * fon-refetch orasidagi qisqa holat) — `q.data!` shu holatda
   * "Cannot read properties of undefined" bilan butun sahifani
   * qulatardi (ErrorBoundary tomonidan tutilgan, lekin foydalanuvchi
   * uchun "Sahifani ko'rsatib bo'lmadi" degan foydasiz umumiy xato
   * ko'rinardi). */
  if (!q.data) return <div className="p-6 text-sm text-text-dim flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Yuklanmoqda…</div>;
  const men = q.data;

  return (
    <div className="p-6 bg-bg min-h-screen text-text max-w-4xl">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="text-accent" /> Kompaniya va a‘zolik</h1>
      <p className="text-sm text-text-dim mt-1">
        {men.foydalanuvchi.login} — {men.jami} ta kompaniyada a‘zo.
      </p>

      {men.onboarding_kerak && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Siz hali hech qaysi kompaniyaga a‘zo emassiz. Yangi kompaniya oching yoki direktordan sizni qo‘shishini so‘rang.
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide">A‘zoliklarim</h2>
        <div className="mt-2 grid gap-2">
          {men.azoliklar.map((a: Azolik) => (
            <div key={a.azolik_id} className="karta p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  {a.is_director && <Crown size={14} className="text-amber-400" />} {a.nom}
                  <span className="text-[11px] text-text-mute">({a.kod})</span>
                </div>
                <div className="text-[11px] text-text-dim">Rol: {a.rol}{a.is_director ? ' — direktor' : ''}</div>
              </div>
            </div>
          ))}
          {!men.azoliklar.length && <div className="text-[13px] text-text-dim">— a‘zolik yo‘q —</div>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide flex items-center gap-2">
          <Building2 size={14} /> {menSuperadmin ? 'Yangi kompaniya ochish' : 'Yangi kompaniya — so‘rov yuborish'}
        </h2>
        {!menSuperadmin && (
          <p className="mt-1 text-[12px] text-text-dim">
            Yangi kompaniyani to‘g‘ridan-to‘g‘ri ochib bo‘lmaydi — so‘rovingiz platforma administratoriga
            yuboriladi va tasdiqlangandan keyin siz o‘sha kompaniyaning direktori bo‘lasiz.
          </p>
        )}
        <div className="mt-2 karta p-4 grid gap-3 sm:grid-cols-3">
          <input className="input col-span-3 sm:col-span-1" placeholder="Kompaniya nomi *" value={nom} onChange={(e) => setNom(e.target.value)} />
          <input className="input" placeholder="STIR (9 raqam)" value={inn} onChange={(e) => setInn(e.target.value)} />
          <input className="input" placeholder="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
          {menSuperadmin ? (
            <button
              className="tugma-asosiy col-span-3 sm:col-auto"
              disabled={cmd.yarat.isPending || nom.trim().length < 2}
              onClick={() => cmd.yarat.mutate({ nom: nom.trim(), inn: inn.trim() || undefined, telefon: telefon.trim() || undefined },
                { onSuccess: () => { setNom(''); setInn(''); setTelefon(''); } })}
            >
              {cmd.yarat.isPending ? <Loader2 className="animate-spin" size={15} /> : 'Ochish — men direktor bo‘laman'}
            </button>
          ) : (
            <button
              className="tugma-asosiy col-span-3 sm:col-auto inline-flex items-center justify-center gap-1.5"
              disabled={cmd.royxatSoraw.isPending || nom.trim().length < 2}
              onClick={() => cmd.royxatSoraw.mutate({ nom: nom.trim(), inn: inn.trim() || undefined, telefon: telefon.trim() || undefined },
                { onSuccess: () => { setNom(''); setInn(''); setTelefon(''); } })}
            >
              {cmd.royxatSoraw.isPending ? <Loader2 className="animate-spin" size={15} /> : <><Send size={14} /> So‘rov yuborish</>}
            </button>
          )}
        </div>
        {cmd.yarat.isError && <p className="mt-1 text-[12px] text-rose-300">{xatoMatn((cmd.yarat.error as any)?.code)}</p>}
        {cmd.royxatSoraw.isError && <p className="mt-1 text-[12px] text-rose-300">{xatoMatn((cmd.royxatSoraw.error as any)?.code)}</p>}
        {cmd.royxatSoraw.isSuccess && <p className="mt-1 text-[12px] text-emerald-400">So‘rov yuborildi — administrator ko‘rib chiqadi.</p>}

        {/* Superadmin uchun — barcha so'rovlarni ko'rish/tasdiqlash/rad
            etish. Oddiy foydalanuvchi uchun — faqat o'z so'rovi holati. */}
        <div className="mt-3">
          <h3 className="text-[12px] font-semibold text-text-dim uppercase tracking-wide">
            {menSuperadmin ? 'Kompaniya so‘rovlari' : 'Mening so‘rovlarim'}
          </h3>
          <KompaniyaRoyxatlari />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide flex items-center gap-2"><ShieldCheck size={14} /> Company Control Center</h2>
        <p className="text-[12px] text-text-dim mt-1 mb-3">
          Yuqoridagi <b className="text-text">«Kontekst»</b> tanlovidagi FAOL kompaniya uchun. Boshqa kompaniyani
          boshqarish uchun avval uni yuqoridan tanlang.
        </p>
        {k.globalRejim || !k.joriyId ? (
          <KompaniyaKerak nima="Company Control Center" />
        ) : (
          <ControlCenterTabs
            kompaniyaId={k.joriyId}
            kompaniyaNom={k.joriy?.nom ?? ''}
            isDirector={direktorKompaniyalar.some((d) => d.kompaniya_id === k.joriyId)}
          />
        )}
      </section>

      <p className="mt-10 text-[11px] text-text-mute">
        Ma‘lumot manbai: <code>t2_men_v1</code> / <code>t2_kompaniya_yangila_v1</code> / <code>t2_azolik_*_v1</code> /
        <code> t2_system_control_v1</code> (kanonik). Obuna/to‘lov modeli bu relizda YO‘Q.
      </p>
    </div>
  );
}
