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
 * Firuza (2026-10-25): Sahifa sarlavhasi, fz-table, so'z bilan muhrlar (fz-stamp), o'qiladigan ruxsat matritsasi
 * (soha bo'yicha guruhlangan qatorlar × lavozim ustunlari), window.confirm → tasdiqSora.
 * EGALIK: Claude (integration lane).
 */
import { Fragment, useMemo, useState } from 'react';
import {
  Building2, Crown, ShieldCheck, Loader2, AlertTriangle, Trash2, Users, LogOut,
  User, KeyRound, Layers, FolderKanban, Plug, History, Save, RefreshCw,
  Send, Clock, CheckCircle2, XCircle, Check, Info,
} from 'lucide-react';
import { useMen, useOnboardingCommands, useKompaniyaAzolari, useKompaniyaProfil, useProfilYangila, useKompaniyaRoyxatlar, useAzolikRuxsatlari, type Azolik, type KompaniyaProfil, type KompaniyaRoyxat } from '../../api/t2-men';
import { useSystemControl } from '../../api/t2-control';
import { useModullar, useModulOzgartir } from '../../api/t2-modul';
import { t } from '../../i18n/til';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { tizimdanChiq } from '../../umumiy/kontekst/chiqish';
import { KompaniyaLogoYuklash } from '../../umumiy/hujjat/KompaniyaLogo';
import { PERMISSION_LABELS, ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { MATRITSA_ROLLAR, RUXSAT_GURUH_NOMI, rolBor, rolSanoq, ruxsatMatritsa, ruxsatTuri } from '../../lib/kompaniya-korinish';
import { MemberPermissionEditor } from '../components/MemberPermissionEditor';
import { TaklifHavolalari } from '../components/TaklifHavolalari';
import { XizmatTakliflari } from '../components/XizmatTakliflari';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';

const AZO_ROLLAR = ['boss', 'admin', 'rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'] as const;
const MAVQE_VARIANTLAR = ['zakazchik', 'pudratchi', 'loyihachi'] as const;
const MAVQE_NOMI: Record<string, string> = { zakazchik: 'Buyurtmachi (zakazchik)', pudratchi: 'Pudratchi', loyihachi: 'Loyihachi' };
const rolNomi = (r: string) => t(ROLE_LABELS[r] || r);
const Yuklanmoqda = () => <div className="flex items-center gap-2 p-4 text-[13px] text-text-dim"><Loader2 className="animate-spin" size={14} /> {t('yuklanmoqda…')}</div>;
const Xato = ({ matn }: { matn: string }) => <p role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" />{matn}</p>;
const Bosh = ({ matn }: { matn: string }) => <div className="fz-card p-6 text-center text-[13px] text-text-mute">{matn}</div>;
const holatMuhr = (ok: boolean, matn: string) => <span className={`fz-stamp ${ok ? 'fz-stamp--ok' : 'fz-stamp--warn'}`}>{matn}</span>;

function xatoMatn(code?: string): string {
  switch (code) {
    case 'LAST_DIRECTOR': return t('Kompaniyaning oxirgi direktorini o‘chirib/tushirib bo‘lmaydi.');
    case 'ALREADY_MEMBER': return t('Bu foydalanuvchi allaqachon a‘zo.');
    case 'ROLE_INVALID': return t('Bu rolni bu yerdan berib bo‘lmaydi (superadmin — platforma darajasida).');
    case 'INN_INVALID': return t('STIR 9 ta raqamdan iborat bo‘lishi kerak.');
    case 'MAVQE_INVALID': return t('Mavqe noto‘g‘ri.');
    case 'COMPANY_NAME_REQUIRED': return t('Kompaniya nomini kiriting.');
    case 'AUTH_REQUIRED': return t('Sessiya muddati tugagan. Chiqib, qaytadan kiring.');
    case 'AUTHORIZATION_DENIED': return t('Bu amal uchun ruxsatingiz yo‘q.');
    case 'STALE_VERSION': return t('Ma’lumot boshqa joyda yangilangan. Sahifani qayta yuklang.');
    case 'LAST_SUPERADMIN': return t('Platformadagi oxirgi superadmin vakolatini olib tashlab bo‘lmaydi.');
    case 'ACCOUNT_OWNER_REQUIRED': return t('Bu global yoki bir necha kompaniyaga tegishli hisob. Parolni hisob egasi yoki platforma administratori boshqaradi.');
    case 'PAROL_QISQA': return t('Parol kamida 8 belgi bo‘lishi kerak.');
    case 'AZOLIK_TOPILMADI': return t('Bu foydalanuvchi shu kompaniyaning a‘zosi emas.');
    case 'SUPERADMIN_REQUIRED': return t('Yangi kompaniyani to‘g‘ridan-to‘g‘ri faqat superadmin ochadi. Iltimos, so‘rov yuboring.');
    case 'REQUEST_NOT_PENDING': return t('Bu so‘rov allaqachon ko‘rib chiqilgan.');
    case 'REQUEST_NOT_FOUND': return t('So‘rov topilmadi.');
    case 'MANAGE_ROLE_REQUIRED': return t('Bu amal uchun direktor (boss) yoki admin roli kerak.');
    case 'RUXSAT_NOTOGRI': return t('Ruxsatlar to‘plami noto‘g‘ri. Sahifani yangilang.');
    case 'PROTECTED_AUTHORITY': return t('Superadmin va kompaniya rahbarining asosiy boshqaruv vakolati himoyalangan.');
    case 'MANAGEMENT_ROLE_REQUIRED': return t('A’zolar va tizim sozlamalarini boshqarish uchun rahbar yoki administrator lavozimi kerak.');
    case 'OPERATION_CONFLICT': return t('Saqlash so‘rovi oldingi amaldan farq qildi. Joriy ruxsatlarni qayta yuklang.');
    default: return t('Amalni bajarib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.');
  }
}

/** T2-AUTH-PASSWORD-MIGRATION-001: 12 ta belgidan iborat, o‘qish oson
 *  (chalkash 0/O, 1/l/I chiqarib tashlangan) tasodifiy vaqtinchalik parol. */
function vaqtinchalikParolYarat(): string {
  const belgilar = 'abcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  const ceiling=Math.floor(256/belgilar.length)*belgilar.length;
  while(p.length<12) for(const n of crypto.getRandomValues(new Uint8Array(32))) {
    if(n<ceiling) p+=belgilar[n%belgilar.length];
    if(p.length===12) break;
  }
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
  const faollar = (q.data ?? []).filter((a) => a.holat === 'faol');

  const parolBelgila = async (a: { ism?: string | null; login: string; foydalanuvchi_id: number }) => {
    if (!(await tasdiqSora({ sarlavha: t('Vaqtinchalik parol'), matn: t('«{n}» uchun YANGI vaqtinchalik parol o‘rnatilsinmi? Eski parol (agar bo‘lsa) ishlamay qoladi.', { n: a.ism || a.login }) }))) return;
    const parol = vaqtinchalikParolYarat();
    setKorsatilganParol(null);
    cmd.azoParolBelgila.mutate(
      { kompaniya_id: kompaniyaId, foydalanuvchi_id: a.foydalanuvchi_id, yangi_parol: parol },
      { onSuccess: () => setKorsatilganParol({ login: a.login, parol }) });
  };
  const azolikBekor = async (a: { ism?: string | null; login: string; azolik_id: number }) => {
    if (await tasdiqSora({ sarlavha: t('A‘zolikni bekor qilish'), matn: t('«{n}» a‘zoligi bekor qilinsinmi? Qilgan ishlari saqlanadi.', { n: a.ism || a.login }), xavfli: true })) cmd.azoOchir.mutate({ azolik_id: a.azolik_id });
  };

  return (
    <section className="fz-card" aria-label={t('A‘zolar')}>
      <div className="fz-card__head">
        <div><h3 className="fz-card__title flex items-center gap-2"><Users size={15} className="text-accent" />{t('{k} — a‘zolar', { k: kompaniyaNom })}</h3>
          <p className="fz-card__sub">{t('Lavozim boshlang‘ich ruxsatlarni beradi; individual o‘zgarishlar — «Rollar va ruxsatlar» bo‘limida.')}</p></div>
        {q.data && <span className="fz-chip">{t('{n} ta faol', { n: faollar.length })}</span>}
      </div>
      {q.isLoading && <Yuklanmoqda />}
      {q.isError && <div className="p-4"><Xato matn={t('A‘zolar ro‘yxatini o‘qib bo‘lmadi.')} /></div>}
      {q.data && (faollar.length ? (
        <div className="overflow-x-auto">
          <table className="fz-table">
            <thead><tr><th>{t('Xodim')}</th><th>{t('Email')}</th><th>{t('Lavozim')}</th>{isDirector && <th className="fz-c-num">{t('Amallar')}</th>}</tr></thead>
            <tbody>
              {faollar.map((a) => (
                <tr key={a.azolik_id}>
                  <td><div className="font-medium text-text">{a.ism || a.login}</div><div className="fz-c-shifr">@{a.login}</div></td>
                  <td className="text-text-dim">{a.email || '—'}</td>
                  <td>{tahrirId === a.azolik_id ? (
                    <span className="flex items-center gap-1.5">
                      <select className="input py-0.5 text-[12px]" aria-label={t('Yangi lavozim')} value={yangiRol} onChange={(e) => setYangiRol(e.target.value)}>
                        {AZO_ROLLAR.map((r) => <option key={r} value={r}>{rolNomi(r)}</option>)}
                      </select>
                      <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={cmd.azoRol.isPending}
                        onClick={() => cmd.azoRol.mutate({ azolik_id: a.azolik_id, rol: yangiRol }, { onSuccess: () => setTahrirId(null) })}>{t('saqlash')}</button>
                      <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setTahrirId(null)}>{t('bekor')}</button>
                    </span>
                  ) : <span className="fz-stamp" title={a.rol}>{rolNomi(a.rol)}</span>}</td>
                  {isDirector && <td className="fz-c-num">
                    {tahrirId !== a.azolik_id && <span className="inline-flex items-center gap-1">
                      <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => { setTahrirId(a.azolik_id); setYangiRol(a.rol); }}>{t('Lavozim')}</button>
                      <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" title={t('Vaqtinchalik parol o‘rnatish')} disabled={cmd.azoParolBelgila.isPending} onClick={() => void parolBelgila(a)}>
                        <KeyRound size={12} /> {t('Parol')}
                      </button>
                      <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm fz-btn--icon text-danger" title={t('A‘zolikni bekor qilish')} aria-label={t('A‘zolikni bekor qilish')}
                        disabled={cmd.azoOchir.isPending} onClick={() => void azolikBekor(a)}>
                        <Trash2 size={14} />
                      </button>
                    </span>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="p-4 text-[13px] text-text-mute">{t('Faol a‘zo yo‘q')}</div>)}
      <div className="flex flex-col gap-3 p-4">
        {(cmd.azoRol.isError || cmd.azoOchir.isError || cmd.azoParolBelgila.isError) && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Xato matn={xatoMatn(((cmd.azoRol.error || cmd.azoOchir.error || cmd.azoParolBelgila.error) as any)?.code)} />
        )}
        {korsatilganParol && (
          <div className="fz-note fz-note--info">
            <KeyRound aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div><b>@{korsatilganParol.login}</b> {t('uchun vaqtinchalik parol')}: <code className="select-all rounded bg-surface-2 px-1 py-0.5 font-mono">{korsatilganParol.parol}</code></div>
              <div className="mt-0.5 text-text-mute">{t('Buni foydalanuvchiga xavfsiz tarzda (telefon/shaxsan) yetkazing — bu yerda qayta ko‘rsatilmaydi.')}</div>
            </div>
            <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setKorsatilganParol(null)}>{t('yopish')}</button>
          </div>
        )}
        {isDirector && (
          <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto]">
            <input className="input" aria-label={t('Login')} placeholder={t('login')} value={azoLogin} onChange={(e) => setAzoLogin(e.target.value)} />
            <select className="input" aria-label={t('Lavozim')} value={azoRol} onChange={(e) => setAzoRol(e.target.value)}>
              {AZO_ROLLAR.map((r) => <option key={r} value={r}>{rolNomi(r)}</option>)}
            </select>
            <button type="button" className="fz-btn fz-btn--primary" disabled={cmd.azoQosh.isPending || !azoLogin.trim()}
              onClick={() => cmd.azoQosh.mutate({ kompaniya_id: kompaniyaId, login: azoLogin.trim(), rol: azoRol }, { onSuccess: () => setAzoLogin('') })}>
              {cmd.azoQosh.isPending ? <Loader2 className="animate-spin" size={15} /> : t('A‘zo qo‘shish')}
            </button>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {cmd.azoQosh.isError && <div className="sm:col-span-3"><Xato matn={xatoMatn((cmd.azoQosh.error as any)?.code)} /></div>}
            <p className="flex items-center gap-1 text-[12px] text-text-mute sm:col-span-3"><ShieldCheck size={12} /> {t('superadmin roli bu yerdan berilmaydi — platforma darajasida.')}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ProfilTab({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const q = useKompaniyaProfil(kompaniyaId);
  const mut = useProfilYangila(kompaniyaId);
  const [draft, setDraft] = useState<Partial<KompaniyaProfil> | null>(null);

  const p = draft ?? q.data ?? null;
  const set = (k: keyof KompaniyaProfil) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...(draft ?? q.data ?? {}), [k]: e.target.value });

  if (q.isLoading) return <Yuklanmoqda />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (q.isError) return <Xato matn={xatoMatn((q.error as any)?.code)} />;
  if (!q.data || !p) return null;

  const ozgardi = draft != null;
  const maydon = (k: keyof KompaniyaProfil, nom: string, keng = false) => (
    <label className={`text-[12px] font-medium text-text-dim ${keng ? 'sm:col-span-2' : ''}`}>{nom}
      <input className="input mt-1 w-full" disabled={!isDirector} value={(p[k] as string | null | undefined) ?? ''} onChange={set(k)} />
    </label>
  );

  return (
    <section className="fz-card max-w-3xl" aria-label={t('Profil')}>
      <div className="fz-card__head">
        <div><h3 className="fz-card__title">{t('Kompaniya rekvizitlari')}</h3><p className="fz-card__sub">{t('Hujjatlar (F2, F3, akt-sverka) sarlavhasi va imzolarida ishlatiladi.')}</p></div>
        <span className="fz-chip">{t('versiya {v}', { v: q.data.versiya })}</span>
      </div>
      <div className="fz-card__body flex flex-col gap-4">
        {!isDirector && <p className="fz-note fz-note--info"><Info aria-hidden="true" />{t('Profilni faqat direktor tahrirlaydi. Quyidagi ma’lumot faqat ko‘rish uchun.')}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {maydon('toliq_nom', t('To‘liq nom'))}
          {maydon('inn', t('STIR (INN)'))}
          {maydon('manzil', t('Manzil'), true)}
          {maydon('rahbar', t('Rahbar'))}
          {maydon('telefon', t('Telefon'))}
          {maydon('bank', t('Bank'))}
          {maydon('hisob_raqam', t('Hisob raqam'))}
          {maydon('mfo', t('MFO'))}
          <label className="text-[12px] font-medium text-text-dim">{t('Mavqe')}
            <select className="input mt-1 w-full" disabled={!isDirector} value={p.mavqe ?? ''} onChange={set('mavqe')}>
              <option value="">—</option>
              {MAVQE_VARIANTLAR.map((m) => <option key={m} value={m}>{t(MAVQE_NOMI[m])}</option>)}
            </select>
          </label>
        </div>
        {isDirector && (
          <div className="flex items-center gap-2">
            <button type="button" className="fz-btn fz-btn--primary" disabled={!ozgardi || mut.isPending}
              onClick={() => mut.mutate({
                kompaniya_id: kompaniyaId, expected_version: q.data!.versiya,
                toliq_nom: p.toliq_nom ?? undefined, inn: p.inn ?? undefined, manzil: p.manzil ?? undefined,
                rahbar: p.rahbar ?? undefined, telefon: p.telefon ?? undefined, bank: p.bank ?? undefined,
                hisob_raqam: p.hisob_raqam ?? undefined, mfo: p.mfo ?? undefined, mavqe: p.mavqe ?? undefined,
              }, { onSuccess: () => setDraft(null) })}>
              {mut.isPending ? <Loader2 className="animate-spin" size={14} /> : <><Save size={14} /> {t('Saqlash')}</>}
            </button>
            {ozgardi && <button type="button" className="fz-btn fz-btn--ghost" onClick={() => setDraft(null)}>{t('bekor qilish')}</button>}
            {ozgardi && <span className="fz-chip fz-chip--warn">{t('saqlanmagan o‘zgarish')}</span>}
          </div>
        )}
        {mut.isError && (
          <div className="flex flex-wrap items-center gap-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Xato matn={xatoMatn((mut.error as any)?.code)} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(mut.error as any)?.code === 'STALE_VERSION' && (
              <button type="button" className="fz-btn fz-btn--sm" onClick={() => q.refetch()}><RefreshCw size={11} /> {t('qayta yuklash')}</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Lavozim × ruxsat matritsasi: qatorlar soha bo'yicha guruhlangan, ustunlar — lavozimlar; har ustunda nechta ruxsat borligi. */
export function RuxsatMatritsa() {
  const guruhlar = useMemo(() => ruxsatMatritsa(), []);
  return (
    <section className="fz-card" aria-label={t('Standart lavozimlar va ularning ruxsatlari')}>
      <div className="fz-card__head">
        <div><h3 className="fz-card__title">{t('Standart lavozimlar va ularning ruxsatlari')}</h3>
          <p className="fz-card__sub">{t('Lavozim — boshlang‘ich shablon. Lavozim A’zolar bo‘limida tayinlanadi; pastdagi konstruktor orqali xodimning huquqini individual yoqish yoki o‘chirish mumkin.')}</p></div>
        <span className="flex flex-wrap items-center gap-2 text-[12px] text-text-mute">
          <span className="inline-flex items-center gap-1"><span className="fz-chip fz-chip--accent"><Check size={11} /></span>{t('amal (yozish)')}</span>
          <span className="inline-flex items-center gap-1"><span className="fz-chip"><Check size={11} /></span>{t('ko‘rish')}</span>
          <span className="inline-flex items-center gap-1"><span className="text-text-mute">—</span>{t('yo‘q')}</span>
        </span>
      </div>
      <div className="fz-table-wrap max-h-[70vh] rounded-none border-0 border-t">
        <table className="fz-table" style={{ minWidth: 860 }}>
          <thead><tr>
            <th style={{ position: 'sticky', left: 0, zIndex: 2, minWidth: 260 }}>{t('Ruxsat')}</th>
            {MATRITSA_ROLLAR.map((r) => { const s = rolSanoq(r); return (
              <th key={r} style={{ whiteSpace: 'normal', minWidth: 92, textAlign: 'center' }} title={t('{k} ko‘rish · {a} amal / {j}', { k: s.korish, a: s.amal, j: s.jami })}>
                <span className="block normal-case tracking-normal text-text">{rolNomi(r)}</span>
                <span className="block font-normal normal-case tracking-normal text-text-mute">{s.korish + s.amal}/{s.jami}</span>
              </th>); })}
          </tr></thead>
          <tbody>
            {guruhlar.map((g) => (
              <Fragment key={g.kod}>
                <tr className="fz-row-rz"><td colSpan={MATRITSA_ROLLAR.length + 1} style={{ position: 'sticky', left: 0 }}>{t(RUXSAT_GURUH_NOMI[g.kod])}</td></tr>
                {g.ruxsatlar.map((p) => (
                  <tr key={p}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                      <span className="text-text">{t(PERMISSION_LABELS[p])}</span> <span className="fz-c-shifr">{p}</span>
                    </td>
                    {MATRITSA_ROLLAR.map((r) => (
                      <td key={r} className="text-center">
                        {rolBor(r, p)
                          ? <span className={`fz-chip ${ruxsatTuri(p) === 'amal' ? 'fz-chip--accent' : ''}`} aria-label={t('bor')}><Check size={11} /></span>
                          : <span className="text-text-mute" aria-label={t('yo‘q')}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RollarTab({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  return (
    <div className="space-y-4">
      <RuxsatMatritsa />
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
  const q = useAzolikRuxsatlari(isDirector ? kompaniyaId : null);
  const cmd = useOnboardingCommands();
  const [selected, setSelected] = useState<number | null>(null);
  if (!isDirector) return <p className="fz-note fz-note--info"><Info aria-hidden="true" />{t('Individual ruxsatlarni kompaniya rahbari yoki superadmin boshqaradi.')}</p>;
  return <section className="fz-card" aria-label={t('Individual ruxsatlar konstruktori')}>
    <div className="fz-card__head"><div><h3 className="fz-card__title">{t('Individual ruxsatlar konstruktori')}</h3>
      <p className="fz-card__sub">{t('Lavozim — boshlang‘ich shablon. Har bir xodimning amaliy huquqini alohida sozlang. Server har so‘rovda joriy ruxsatni tekshiradi.')}</p></div></div>
    <div className="fz-card__body flex flex-col gap-2">
      {q.isLoading && <Yuklanmoqda />}
      {q.isError && <Xato matn={t('Ruxsatlarni yuklab bo‘lmadi.')} />}
      {q.data?.azolar.map((a) => <div key={a.azolik_id} className="rounded-md border border-border">
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2" aria-expanded={selected === a.azolik_id} onClick={() => { setSelected(selected === a.azolik_id ? null : a.azolik_id); cmd.azolikRuxsatSet.reset(); }}>
          <span className="font-medium text-text">{a.ism || a.login}</span><span className="fz-stamp">{rolNomi(a.rol)}</span>{a.protected && <span className="fz-stamp fz-stamp--info">{t('himoyalangan')}</span>}
          <span className="ml-auto text-[12px] text-text-mute">{selected === a.azolik_id ? t('yopish') : t('sozlash')}</span>
        </button>
        {selected === a.azolik_id && <div className="border-t border-border px-3 pb-3"><MemberPermissionEditor key={kompaniyaId + ':' + a.azolik_id} member={a} companyId={kompaniyaId} pending={cmd.azolikRuxsatSet.isPending} onSave={(input) => cmd.azolikRuxsatSet.mutate(input, { onSuccess: () => setSelected(null) })} /></div>}
      </div>)}
      {cmd.azolikRuxsatSet.isSuccess && <p role="status" className="fz-note fz-note--info"><CheckCircle2 aria-hidden="true" />{t('Ruxsatlar saqlandi. Keyingi so‘rovlarda yangi qoidalar qo‘llanadi.')}</p>}
      {cmd.azolikRuxsatSet.isError && <div role="alert" className="flex flex-col gap-2">
        <Xato matn={xatoMatn((cmd.azolikRuxsatSet.error as { code?: string })?.code)} />
        <button type="button" className="fz-btn fz-btn--sm self-start" onClick={() => { void q.refetch(); cmd.azolikRuxsatSet.reset(); }}>{t('Joriy ruxsatlarni qayta yuklash')}</button></div>}
    </div>
  </section>;
}

/** «Telegram modeli» (egasi 2026-10-21): kompaniya o'ziga kerak modullarni yoqadi, o'chirilgani menyuda ko'rinmaydi.
 *  PTO yadrosi (obyekt, smeta, Fakt, F2, Nakopitelniy, M-29) — doim yoqilgan, modul emas. O'zgartirish — boss/superadmin. */
function ModullarTab({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const q = useModullar(kompaniyaId);
  const ozgartir = useModulOzgartir(kompaniyaId);
  const yoqilgan = (q.data ?? []).filter((m) => m.holat === 'on').length;
  return (
    <div className="space-y-3">
      <section className="fz-card" aria-label={t('Kompaniya modullari')}>
        <div className="fz-card__head">
          <div><h3 className="fz-card__title">{t('Kompaniya modullari')}</h3>
            <p className="fz-card__sub">{t('Faqat kerakli modullarni yoqing — o‘chirilgan modul menyuda ko‘rinmaydi. Ish (PTO) yadrosi: obyekt, smeta, Fakt, F2, Nakopitelniy, M-29 — doim yoqilgan.')}</p></div>
          {q.data && <span className="fz-chip fz-chip--accent">{t('{n}/{m} yoqilgan', { n: yoqilgan, m: q.data.length })}</span>}
        </div>
        {q.isLoading && <Yuklanmoqda />}
        {q.isError && <div className="p-4"><Xato matn={t('Modullar holatini o‘qib bo‘lmadi.')} /></div>}
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {(q.data ?? []).map((m) => (
            <div key={m.kod} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 ${m.holat === 'on' ? 'border-accent/40 bg-accent/5' : 'border-border'}`}>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text">{m.nom}</div>
                {m.izoh && <div className="text-[12px] text-text-dim">{m.izoh}</div>}
              </div>
              <button type="button" role="switch" aria-checked={m.holat === 'on'} aria-label={`${m.nom}: ${m.holat === 'on' ? t('yoqilgan') : t('o‘chirilgan')}`}
                disabled={!isDirector || ozgartir.isPending} onClick={() => ozgartir.mutate({ m, yoq: m.holat !== 'on' })}
                title={isDirector ? undefined : t('Modullarni kompaniya rahbari yoki superadmin boshqaradi')}
                className={`fz-btn fz-btn--sm ${m.holat === 'on' ? 'fz-btn--primary' : ''}`}>
                {m.holat === 'on' ? t('Yoqilgan') : t('O‘chirilgan')}
              </button>
            </div>
          ))}
        </div>
        {ozgartir.isError && <div className="px-4 pb-4"><Xato matn={`${t('O‘zgartirilmadi')}: ${(ozgartir.error as Error)?.message}`} /></div>}
      </section>
      <TexnikImkoniyatlar kompaniyaId={kompaniyaId} />
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function TexnikImkoniyatlar({ kompaniyaId }: { kompaniyaId: number }) {
  const q = useSystemControl(kompaniyaId);
  if (q.isLoading) return <Yuklanmoqda />;
  if (q.isError) return null;
  const caps = (q.data?.capabilities ?? []).filter((c: any) => c.turi !== 'module');
  if (!caps.length) return null;
  return (
    <section className="fz-card" aria-label={t('Texnik imkoniyatlar')}>
      <div className="fz-card__head"><h4 className="fz-card__title">{t('Texnik imkoniyatlar')}</h4><span className="text-[12px] text-text-mute">{t('Boshqarish (yoqish/o‘chirish, kill-switch): Tizim boshqaruv markazi.')}</span></div>
      <div className="overflow-x-auto"><table className="fz-table">
        <thead><tr><th>{t('Imkoniyat')}</th><th>{t('Modul')}</th><th>{t('Qamrov')}</th><th className="fz-c-num">{t('Versiya')}</th><th>{t('Holat')}</th></tr></thead>
        <tbody>{caps.map((c: any) => (
          <tr key={c.id}><td className="font-medium text-text">{c.capability}</td><td className="text-text-dim">{c.module}</td><td className="text-text-dim">{c.scope}</td><td className="fz-c-num">{c.version}</td>
            <td>{holatMuhr(c.status === 'healthy', c.status === 'healthy' ? t('soz') : String(c.status ?? '—'))}</td></tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

function IntegratsiyalarTab({ kompaniyaId }: { kompaniyaId: number }) {
  const q = useSystemControl(kompaniyaId);
  if (q.isLoading) return <Yuklanmoqda />;
  if (q.isError) return <Xato matn={t('Integratsiyalar ma’lumotini o‘qib bo‘lmadi.')} />;
  const ints = q.data?.integrations ?? [];
  if (!ints.length) return <Bosh matn={t('Integratsiya sozlanmagan')} />;
  return (
    <section className="fz-card" aria-label={t('Integratsiyalar')}>
      <table className="fz-table">
        <thead><tr><th>{t('Integratsiya')}</th><th>{t('Holat')}</th></tr></thead>
        <tbody>{ints.map((i: any) => {
          const ok = i.status === 'ok' || i.status === 'healthy';
          return <tr key={i.id}><td className="font-medium text-text">{i.name}</td><td>{holatMuhr(ok, ok ? t('ishlayapti') : String(i.status ?? '—'))}</td></tr>;
        })}</tbody>
      </table>
    </section>
  );
}

function AuditTab({ kompaniyaId }: { kompaniyaId: number }) {
  const q = useSystemControl(kompaniyaId);
  if (q.isLoading) return <Yuklanmoqda />;
  if (q.isError) return <Xato matn={t('Audit ma’lumotini o‘qib bo‘lmadi.')} />;
  const events = q.data?.auditEvents ?? [];
  if (!events.length) return <Bosh matn={t('Audit yozuvi yo‘q')} />;
  return (
    <div className="fz-table-wrap max-h-[480px]">
      <table className="fz-table">
        <thead><tr><th>{t('Vaqt')}</th><th>{t('Amal')}</th><th>{t('Kim')}</th><th>{t('Obyekt / qiymat')}</th></tr></thead>
        <tbody>{events.map((e: any) => (
          <tr key={e.id}>
            <td className="whitespace-nowrap text-text-mute">{new Date(e.timestamp).toLocaleString('uz-UZ')}</td>
            <td className="font-medium text-text">{e.action}</td>
            <td className="text-text-dim">{e.actor}</td>
            <td className="text-text-dim">{e.entity}{e.newValue ? `: ${e.newValue}` : ''}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ROYXAT_HOLAT_BELGI: Record<KompaniyaRoyxat['holat'], { Ikonka: typeof Clock; matn: string; muhr: string }> = {
  kutilmoqda: { Ikonka: Clock, matn: 'Kutilmoqda', muhr: 'fz-stamp--warn' },
  tasdiqlandi: { Ikonka: CheckCircle2, matn: 'Tasdiqlandi', muhr: 'fz-stamp--ok' },
  rad_etildi: { Ikonka: XCircle, matn: 'Rad etildi', muhr: 'fz-stamp--danger' },
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

  if (q.isLoading) return <Yuklanmoqda />;
  if (q.isError || !q.data) return <Xato matn={t('So‘rovlar ro‘yxatini o‘qib bo‘lmadi.')} />;

  const { superadmin, royxatlar } = q.data;
  if (!royxatlar.length) return <div className="p-3 text-[13px] text-text-mute">{t('So‘rov yo‘q')}</div>;

  return (
    <div className="flex flex-col gap-2">
      {royxatlar.map((ro) => {
        const belgi = ROYXAT_HOLAT_BELGI[ro.holat];
        const qoshimcha = [ro.inn ? `${t('STIR')} ${ro.inn}` : null, ro.telefon, new Date(ro.created_at).toLocaleString('uz-UZ')].filter(Boolean).join(' · ');
        return (
          <div key={ro.id} className="rounded-md border border-border px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-text">{ro.nom}</div>
                <div className="text-[12px] text-text-dim">@{ro.login} · {qoshimcha}</div>
                {ro.holat === 'rad_etildi' && ro.sabab && <div className="mt-0.5 text-[12px] text-danger">{t('Sabab')}: {ro.sabab}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`fz-stamp ${belgi.muhr}`}>{t(belgi.matn)}</span>
                {superadmin && ro.holat === 'kutilmoqda' && (
                  <>
                    <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={cmd.royxatTasdiqla.isPending}
                      onClick={() => cmd.royxatTasdiqla.mutate({ royxat_id: ro.id })}>{t('Tasdiqlash')}</button>
                    <button type="button" className="fz-btn fz-btn--danger fz-btn--sm" onClick={() => { setRadSababId(ro.id); setSabab(''); }}>{t('Rad etish')}</button>
                  </>
                )}
              </div>
            </div>
            {radSababId === ro.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="input min-w-[160px] flex-1 text-[12px]" placeholder={t('Rad etish sababi (ixtiyoriy)')} value={sabab} onChange={(e) => setSabab(e.target.value)} />
                <button type="button" className="fz-btn fz-btn--danger fz-btn--sm" disabled={cmd.royxatRadEt.isPending}
                  onClick={() => cmd.royxatRadEt.mutate({ royxat_id: ro.id, sabab: sabab.trim() || undefined }, { onSuccess: () => setRadSababId(null) })}>
                  {cmd.royxatRadEt.isPending ? <Loader2 className="animate-spin" size={13} /> : t('Tasdiqlash (rad etish)')}
                </button>
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setRadSababId(null)}>{t('bekor')}</button>
              </div>
            )}
          </div>
        );
      })}
      {(cmd.royxatTasdiqla.isError || cmd.royxatRadEt.isError) && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Xato matn={xatoMatn(((cmd.royxatTasdiqla.error || cmd.royxatRadEt.error) as any)?.code)} />
      )}
    </div>
  );
}

function LoyihaObyektTab() {
  return (
    <div className="fz-note fz-note--info max-w-2xl">
      <FolderKanban aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <b>{t('Loyiha/obyekt darajasidagi shaxsiy ruxsatlar hali boshqarilmaydi')}</b>
        <span>{t('Jadval bazada bor, lekin ularni boshqaradigan buyruq hali yaratilmagan — bu bo‘lim faqat holatni halol aytadi, soxta tugma ko‘rsatmaydi. Kompaniya a’zoligi darajasidagi ruxsatlar «A‘zolar» va «Rollar va ruxsatlar» bo‘limlarida ishlaydi.')}</span>
        <span className="fz-c-shifr font-mono text-[11.5px] text-text-mute">{'t2_loyiha_foydalanuvchi_ruxsat · t2_obyekt_foydalanuvchi_ruxsat'}</span>
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
      <div role="tablist" aria-label={t('Kompaniya boshqaruvi')} className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {TABS.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${tab === x.key ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}>
            <x.Ikonka size={14} className={tab === x.key ? 'text-accent' : ''} /> {t(x.nom)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-3 flex flex-col gap-3">
        {tab === 'profil' && <><ProfilTab kompaniyaId={kompaniyaId} isDirector={isDirector} /><KompaniyaLogoYuklash kompaniyaId={kompaniyaId} isDirector={isDirector} /></>}
        {tab === 'azolar' && <><AzolarBoshqaruv kompaniyaId={kompaniyaId} kompaniyaNom={kompaniyaNom} isDirector={isDirector} /><TaklifHavolalari kompaniyaId={kompaniyaId} isDirector={isDirector} /><XizmatTakliflari kompaniyaId={kompaniyaId} isDirector={isDirector} /></>}
        {tab === 'rollar' && <RollarTab kompaniyaId={kompaniyaId} isDirector={isDirector} />}
        {tab === 'modullar' && <ModullarTab kompaniyaId={kompaniyaId} isDirector={isDirector} />}
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
  const menSuperadmin = k.superadmin;

  if (q.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-text-dim"><Loader2 className="animate-spin" size={16} /> {t('Yuklanmoqda…')}</div>;
  if (q.isError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (q.error as any)?.code;
    const auth = c === 'AUTH_REQUIRED' || c === 'ACTOR_NOT_FOUND' || c === 'ACTOR_RESOLVE_FAILED';
    const matn = auth ? t('Sessiyani yangilash kerak. Chiqing va qaytadan kiring.')
      : c === 'CONFIG' || c === 'ME_FAILED' ? t('Kompaniya ma‘lumoti serveri sozlamasida nosozlik. Administrator bilan bog‘laning.')
      : t('Kompaniya ma‘lumotini o‘qib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.');
    return (
      <div className="p-6">
        <div className="fz-note fz-note--danger max-w-2xl" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div className="flex flex-col gap-3"><span>{matn}</span>
            {auth
              ? <button type="button" onClick={tizimdanChiq} className="fz-btn fz-btn--danger fz-btn--sm self-start"><LogOut size={13} /> {t('Chiqib, qayta kirish')}</button>
              : <button type="button" onClick={() => q.refetch()} className="fz-btn fz-btn--sm self-start">{t('Qayta urinish')}</button>}
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
  if (!q.data) return <div className="flex items-center gap-2 p-6 text-sm text-text-dim"><Loader2 className="animate-spin" size={16} /> {t('Yuklanmoqda…')}</div>;
  const men = q.data;
  const joriyDirektor = k.superadmin || direktorKompaniyalar.some((d) => d.kompaniya_id === k.joriyId);

  return (
    <Sahifa sarlavha="Kompaniya va a‘zolik" tavsif="Kim qaysi kompaniyada, qaysi lavozimda va qanday huquq bilan ishlaydi — hammasi shu yerda.">
      <div className="flex max-w-6xl flex-col gap-4">
        <section className="fz-card p-4" aria-label={t('Men haqimda')}>
          <div className="fz-kpis">
            <div className="fz-kpi"><span className="fz-kpi__label">{t('Foydalanuvchi')}</span><span className="fz-kpi__value">@{men.foydalanuvchi.login}</span><span className="fz-kpi__sub">{menSuperadmin ? t('platforma superadmini') : t('kompaniya a’zosi')}</span></div>
            <div className="fz-kpi"><span className="fz-kpi__label">{t('A‘zoliklar')}</span><span className="fz-kpi__value">{men.jami}</span><span className="fz-kpi__sub">{t('{n} tasida direktor', { n: direktorKompaniyalar.length })}</span></div>
            <div className="fz-kpi"><span className="fz-kpi__label">{t('Faol kompaniya')}</span><span className="fz-kpi__value truncate">{k.joriy?.nom ?? '—'}</span><span className="fz-kpi__sub">{k.joriyId ? (joriyDirektor ? t('siz boshqarasiz') : t('faqat ko‘rish va ish')) : t('yuqoridan tanlang')}</span></div>
          </div>
        </section>

        {men.onboarding_kerak && (
          <p className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" />{t('Siz hali hech qaysi kompaniyaga a‘zo emassiz. Yangi kompaniya oching yoki direktordan sizni qo‘shishini so‘rang.')}</p>
        )}

        <section className="fz-card" aria-label={t('A‘zoliklarim')}>
          <div className="fz-card__head"><h2 className="fz-card__title">{t('A‘zoliklarim')}</h2></div>
          {men.azoliklar.length ? (
            <table className="fz-table">
              <thead><tr><th>{t('Kompaniya')}</th><th>{t('Kod')}</th><th>{t('Lavozim')}</th></tr></thead>
              <tbody>{men.azoliklar.map((a: Azolik) => (
                <tr key={a.azolik_id}>
                  <td className="font-medium text-text"><span className="inline-flex items-center gap-2">{a.is_director && <Crown size={14} className="text-warn" aria-label={t('direktor')} />}{a.nom}</span>{a.kompaniya_id === k.joriyId && <span className="fz-chip fz-chip--accent ml-2">{t('faol')}</span>}</td>
                  <td className="fz-c-shifr">{a.kod}</td>
                  <td><span className={`fz-stamp ${a.is_director ? 'fz-stamp--ok' : ''}`}>{a.is_director ? t('{r} — direktor', { r: rolNomi(a.rol) }) : rolNomi(a.rol)}</span></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="p-4 text-[13px] text-text-mute">{t('A‘zolik yo‘q')}</div>}
        </section>

        <section className="fz-card" aria-label={t('Yangi kompaniya')}>
          <div className="fz-card__head">
            <div><h2 className="fz-card__title flex items-center gap-2"><Building2 size={15} /> {menSuperadmin ? t('Yangi kompaniya ochish') : t('Yangi kompaniya — so‘rov yuborish')}</h2>
              {!menSuperadmin && <p className="fz-card__sub">{t('Yangi kompaniyani to‘g‘ridan-to‘g‘ri ochib bo‘lmaydi — so‘rovingiz platforma administratoriga yuboriladi va tasdiqlangandan keyin siz o‘sha kompaniyaning direktori bo‘lasiz.')}</p>}</div>
          </div>
          <div className="fz-card__body flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input className="input" aria-label={t('Kompaniya nomi')} placeholder={t('Kompaniya nomi *')} value={nom} onChange={(e) => setNom(e.target.value)} />
              <input className="input" aria-label={t('STIR')} placeholder={t('STIR (9 raqam)')} value={inn} onChange={(e) => setInn(e.target.value)} />
              <input className="input" aria-label={t('Telefon')} placeholder={t('Telefon')} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
              {menSuperadmin ? (
                <button type="button" className="fz-btn fz-btn--primary"
                  disabled={cmd.yarat.isPending || nom.trim().length < 2}
                  onClick={() => cmd.yarat.mutate({ nom: nom.trim(), inn: inn.trim() || undefined, telefon: telefon.trim() || undefined },
                    { onSuccess: () => { setNom(''); setInn(''); setTelefon(''); } })}>
                  {cmd.yarat.isPending ? <Loader2 className="animate-spin" size={15} /> : t('Ochish — men direktor bo‘laman')}
                </button>
              ) : (
                <button type="button" className="fz-btn fz-btn--primary"
                  disabled={cmd.royxatSoraw.isPending || nom.trim().length < 2}
                  onClick={() => cmd.royxatSoraw.mutate({ nom: nom.trim(), inn: inn.trim() || undefined, telefon: telefon.trim() || undefined },
                    { onSuccess: () => { setNom(''); setInn(''); setTelefon(''); } })}>
                  {cmd.royxatSoraw.isPending ? <Loader2 className="animate-spin" size={15} /> : <><Send size={14} /> {t('So‘rov yuborish')}</>}
                </button>
              )}
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {cmd.yarat.isError && <Xato matn={xatoMatn((cmd.yarat.error as any)?.code)} />}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {cmd.royxatSoraw.isError && <Xato matn={xatoMatn((cmd.royxatSoraw.error as any)?.code)} />}
            {cmd.royxatSoraw.isSuccess && <p role="status" className="fz-note fz-note--info"><CheckCircle2 aria-hidden="true" />{t('So‘rov yuborildi — administrator ko‘rib chiqadi.')}</p>}

            {/* Superadmin uchun — barcha so'rovlarni ko'rish/tasdiqlash/rad
                etish. Oddiy foydalanuvchi uchun — faqat o'z so'rovi holati. */}
            <div className="flex flex-col gap-2">
              <h3 className="fz-panel__h">{menSuperadmin ? t('Kompaniya so‘rovlari') : t('Mening so‘rovlarim')}</h3>
              <KompaniyaRoyxatlari />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-label={t('Kompaniya boshqaruvi')}>
          <div>
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-text" style={{ fontFamily: 'var(--font-display)' }}><ShieldCheck size={16} className="text-accent" /> {t('Kompaniya boshqaruvi')}{k.joriy?.nom && <span className="fz-chip fz-chip--accent">{k.joriy.nom}</span>}</h2>
            <p className="text-[12.5px] text-text-dim">{t('Yuqoridagi «Kontekst» tanlovidagi FAOL kompaniya uchun. Boshqa kompaniyani boshqarish uchun avval uni yuqoridan tanlang.')}</p>
          </div>
          {k.globalRejim || !k.joriyId ? (
            <KompaniyaKerak nima="Company Control Center" />
          ) : (
            <ControlCenterTabs
              kompaniyaId={k.joriyId}
              kompaniyaNom={k.joriy?.nom ?? ''}
              isDirector={joriyDirektor}
            />
          )}
        </section>

        <p className="text-[11.5px] text-text-mute">
          {t('Ma‘lumot manbai')}: <code>{'t2_men_v1 / t2_kompaniya_yangila_v1 / t2_azolik_*_v1 / t2_system_control_v1'}</code>. {t('Obuna/to‘lov modeli bu relizda yo‘q.')}
        </p>
      </div>
    </Sahifa>
  );
}
