/** Akkaunt markazi bo‘limlari. Soxta ma‘lumot yo‘q: API bo‘lmasa — halol «tez orada» holati; noma‘lum son — «—». */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase, Building2, Calculator, Crown, FileStack, FileText, FlaskConical, Gauge, HardHat, LayoutDashboard,
  Link2, Map as MapIkon, Search, Settings, ShieldAlert, ShieldCheck, Tags, Trash2, Users, Info,
} from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { useMen, useKompaniyaRoyxatlar } from '../../api/t2-men';
import { useSessiya } from '../../api/hooks';
import { useModullar } from '../../api/t2-modul';
import { ishJoylarim, takliflar } from '../../api/t2-ish-joyi';
import { tokenHolatOl } from '../../api/t2-token';
import { companyStorageOl } from '../../api/t2-storage';
import { menyuModulYoqilgan } from '../../lib/modullar';
import { TilTanlagich } from '../../i18n/TilTanlagich';
import { MavzuTanlagich } from '../../umumiy/ui/Mavzu';
import { t } from '../../i18n/til';
import { PERMISSION_LABELS } from '../../lib/company-authorization/permission-labels';
import { topshiriqlarOl } from '../../api/t2-topshiriq';
import { SERVER_YANGILANMAGAN, ProfilXatosi, useProfil, xatoMatn } from '../../api/profil';
import { ProfilForma } from './ProfilForma';
import { BirlashtirKarta } from './BirlashtirKarta';
import { GoogleKarta, ParolForma, SessiyaKarta } from './XavfsizlikKartalar';
import { Karta, Nota, Qator, Skelet, Tezorada, XatoQayta } from './AkkauntUi';
import { Avatar } from './AkkauntTugmasi';
import {
  HUB_BANDLAR, HUB_GURUH_NOMI, hubFiltr, hubGuruhla, initsiallar, kompaniyaRollari, rolNomi, sessiyaTugashi, sonYoki,
} from './akkaunt-lib';
import { sidebarMahkamOqi, sidebarMahkamSaqla, zichlikOqi, zichlikSaqla, type Zichlik } from './korinish-sozlama';

const RUXSAT_NOMLARI: Readonly<Record<string, string>> = PERMISSION_LABELS;
function ruxsatNomi(kod: string): string {
  const nom = RUXSAT_NOMLARI[kod];
  return nom ? t(nom) : kod;
}

/* ───────── umumiy bo‘laklar ───────── */
function Kpi({ yorliq, qiymat, izoh }: { yorliq: string; qiymat: string; izoh?: string }) {
  return (
    <div className="fz-kpi fz-card p-3">
      <span className="fz-kpi__label">{t(yorliq)}</span>
      <span className="fz-kpi__value">{qiymat}</span>
      {izoh && <span className="fz-kpi__sub">{t(izoh)}</span>}
    </div>
  );
}

function useAkkaunt() {
  const k = useKompaniya();
  const men = useMen();
  const sess = useSessiya();
  const email = k.foydalanuvchi?.email ?? sess.data?.email ?? null;
  return { k, men, sess, email, bosh: initsiallar(k.foydalanuvchi?.ism, k.foydalanuvchi?.login, email) };
}

/* ───────── Profil ───────── */
/** Profil so‘rovi holatlari: yuklanmoqda (skelet) / xato (qayta urinish) / 404 (server yangilanmagan) / tayyor. */
function ProfilKutish({ q, children }: { q: ReturnType<typeof useProfil>; children: (p: NonNullable<typeof q.data>) => ReactNode }) {
  if (q.isLoading) return <Skelet qatorlar={4} />;
  if (q.data) return <>{children(q.data)}</>;
  return null;
}
function yangilanmagan(q: ReturnType<typeof useProfil>): boolean {
  return q.error instanceof ProfilXatosi && q.error.code === SERVER_YANGILANMAGAN;
}
function ProfilXatoNota({ q }: { q: ReturnType<typeof useProfil> }) {
  if (!q.isError) return null;
  if (yangilanmagan(q)) return <Nota tur="warn"><b>{t('Server yangilanmagan')}</b> — {t('profil API hali yoqilmagan, shuning uchun tahrirlash vaqtincha o‘chirilgan. Quyida mavjud ma‘lumotlar faqat o‘qiladi.')}</Nota>;
  const kod = q.error instanceof ProfilXatosi ? q.error.code : 'NOMA_LUM';
  return <XatoQayta matn={xatoMatn(kod)} onQayta={() => { void q.refetch(); }} />;
}

export function ProfilBolimi() {
  const { k, email, bosh } = useAkkaunt();
  const q = useProfil();
  const f = k.foydalanuvchi;
  return (
    <div className="flex flex-col gap-4">
      {q.isError && <ProfilXatoNota q={q} />}
      <ProfilKutish q={q}>{(d) => <ProfilForma key={d.profil.id} profil={d.profil} />}</ProfilKutish>
      {q.isError && (
        <Karta sarlavha="Profil" tavsif="Hozirgi ma‘lumotlar (faqat o‘qiladi).">
          <div className="flex items-center gap-3">
            <Avatar ism={bosh} olcham={56} />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-text truncate">{f?.ism || f?.login || '—'}</div>
              <div className="text-[12px] text-text-dim truncate">{email ?? '—'}</div>
            </div>
          </div>
          <div>
            <Qator yorliq="Ism" qiymat={f?.ism || '—'} />
            <Qator yorliq="Login" qiymat={f?.login || '—'} />
            <Qator yorliq="Elektron pochta" qiymat={email ?? '—'} />
            <Qator yorliq="Telefon" qiymat="—" />
            <Qator yorliq="Holat" qiymat={f?.holat || '—'} />
          </div>
        </Karta>
      )}
      <Karta sarlavha="Til" tavsif="Interfeys tili brauzerda saqlanadi; profildagi til saqlanganda u ham almashadi.">
        <TilTanlagich />
      </Karta>
    </div>
  );
}

/* ───────── Kirish usullari (bitta hisob) ───────── */
export function KirishBolimi() {
  const q = useProfil();
  return (
    <div className="flex flex-col gap-4">
      <ProfilXatoNota q={q} />
      <ProfilKutish q={q}>{(d) => <BirlashtirKarta profil={d.profil} />}</ProfilKutish>
    </div>
  );
}

/* ───────── Kompaniyalar va rollar ───────── */
export function KompaniyalarBolimi() {
  const { k, men } = useAkkaunt();
  const roy = useKompaniyaRoyxatlar();
  const m = men.data;
  const rollar = useMemo(() => kompaniyaRollari(
    (m?.azoliklar ?? []).map((a) => ({ kompaniya_id: a.kompaniya_id, nom: a.nom, rol: a.rol, faol: a.faol })),
    (m?.context_kompaniyalar ?? []).filter((c) => c.faol).flatMap((c) => [
      { kompaniyaId: c.kompaniya_id, nom: c.nom, rol: c.membership_role },
      { kompaniyaId: c.kompaniya_id, nom: c.nom, rol: c.effective_role },
    ]),
  ), [m]);
  const ruxsatlar = useMemo(() => new Map((m?.context_kompaniyalar ?? []).map((c) => [c.kompaniya_id, c.permissions])), [m]);
  const joriyRahbar = !!k.joriy?.is_director;
  const takl = useQuery({
    queryKey: ['akkaunt-takliflar', k.joriyId],
    queryFn: () => takliflar(k.joriyId as number),
    enabled: !!k.joriyId && joriyRahbar,
    staleTime: 30_000,
  });
  const mening = (roy.data?.royxatlar ?? []).filter((r) => r.holat === 'kutilmoqda');

  if (men.isLoading) return <Skelet qatorlar={4} />;
  if (men.isError) return <XatoQayta matn={t('Kompaniya ma‘lumotini o‘qib bo‘lmadi.')} onQayta={() => { void men.refetch(); }} />;

  return (
    <div className="flex flex-col gap-4">
      <Karta sarlavha="Kompaniyalar va rollar" tavsif="Bir odam bir kompaniyada bir nechta rol tutishi mumkin. Ruxsatlar serverdagi samarali ruxsatlardan olinadi.">
        {rollar.length === 0 && <p className="text-[13px] text-text-dim m-0">{t('Hali ish joyingiz yo‘q')}</p>}
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {rollar.map((r) => {
            const p = ruxsatlar.get(r.kompaniyaId);
            const yozish = p ? p.filter((x) => x.endsWith('.write')).length : null;
            const joriy = !k.globalRejim && k.joriyId === r.kompaniyaId;
            return (
              <li key={r.kompaniyaId} className="rounded-lg border border-[var(--border)] p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Building2 size={14} aria-hidden="true" className="text-text-dim" />
                  <span className="text-[13px] font-semibold text-text flex-1 min-w-0 truncate">{r.nom}</span>
                  {joriy ? <span className="fz-chip fz-chip--accent">{t('Joriy')}</span>
                    : <button type="button" className="fz-btn fz-btn--sm" onClick={() => k.tanla(r.kompaniyaId)}>{t('Tanlash')}</button>}
                </div>
                <div className="flex flex-wrap gap-1">{r.rollar.map((x) => <span key={x} className="fz-chip">{t(rolNomi(x))}</span>)}</div>
                <div className="text-[12px] text-text-dim">
                  {t('Ruxsatlar')}: {sonYoki(p ? p.length : null)} · {t('yozish ruxsatlari')}: {sonYoki(yozish)}
                </div>
                {p && p.length > 0 && (
                  <details className="text-[12px] text-text-dim">
                    <summary className="cursor-pointer">{t('Ruxsatlar ro‘yxati')}</summary>
                    <ul className="mt-1 mb-0 pl-4">
                      {p.map((x) => <li key={x}>{ruxsatNomi(x)}</li>)}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        <Link to="/admin/kompaniya" className="fz-btn fz-btn--sm self-start">{t('Kompaniya markazini ochish')}</Link>
      </Karta>

      <Karta sarlavha="Takliflar va so‘rovlar">
        <Qator yorliq="Kutilayotgan kompaniya ro‘yxatdan o‘tish so‘rovlari" qiymat={roy.isLoading ? '…' : roy.isError ? '—' : sonYoki(mening.length)} />
        {joriyRahbar ? (
          <Qator yorliq="Joriy kompaniyadagi faol taklif havolalari"
            qiymat={takl.isLoading ? '…' : takl.isError ? '—' : sonYoki((takl.data ?? []).filter((x) => x.holat === 'faol').length)} />
        ) : (
          <p className="text-[12px] text-text-mute m-0">{t('Taklif havolalarini faqat kompaniya rahbari yaratadi va ko‘radi.')}</p>
        )}
        <Link to="/admin/kompaniya" className="text-[12px] text-[var(--accent-text)] underline">{t('A‘zolar va taklif havolalarini boshqarish')}</Link>
      </Karta>
    </div>
  );
}

/* ───────── Xavfsizlik ───────── */
export function XavfsizlikBolimi() {
  const { sess, email } = useAkkaunt();
  const q = useProfil();
  if (q.isError) {
    // Server yangilanmagan yoki xato: mavjud faqat-o‘qish ma‘lumotlar bilan.
    const tugash = sessiyaTugashi(sess.data?.tugaydi);
    return (
      <div className="flex flex-col gap-4">
        <ProfilXatoNota q={q} />
        <Karta sarlavha="Joriy sessiya" tavsif="Sessiya serverda HttpOnly cookie sifatida saqlanadi.">
          <Qator yorliq="Hisob" qiymat={email ?? '—'} />
          <Qator yorliq="Sessiya tugashi" qiymat={tugash ? tugash.toLocaleString() : '—'} />
        </Karta>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ProfilKutish q={q}>
        {(d) => (
          <>
            <ParolForma key={String(d.profil.parol_bor)} parolBor={d.profil.parol_bor} parolYangilandi={d.profil.parol_yangilandi} />
            <SessiyaKarta sessiya={d.sessiya} />
            <GoogleKarta profil={d.profil} />
          </>
        )}
      </ProfilKutish>
    </div>
  );
}

/* ───────── Bildirishnomalar ───────── */
const TOPSHIRIQ_TUR_NOMI: Readonly<Record<string, string>> = { ish: 'Ish', tasdiq: 'Tasdiq', hujjat: 'Hujjat', tekshiruv: 'Tekshiruv' };
const YOPIQ_HOLATLAR = ['tasdiqlandi', 'bekor', 'rad'];

export function BildirishnomaBolimi() {
  const { k } = useAkkaunt();
  const id = k.joriyId;
  const q = useQuery({
    queryKey: ['akkaunt-topshiriq-menga', id],
    queryFn: async () => { const r = await topshiriqlarOl(id as number, 'menga'); if (!r.ok) throw new Error(r.error); return r.qatorlar; },
    enabled: !!id, staleTime: 30_000,
  });
  const qatorlar = q.data ?? null;
  const ochiq = qatorlar ? qatorlar.filter((x) => !YOPIQ_HOLATLAR.includes(x.holat)) : null;
  const yangi = qatorlar ? qatorlar.filter((x) => x.holat === 'berildi').length : null;
  const jarayonda = qatorlar ? qatorlar.filter((x) => x.holat === 'bajarilmoqda').length : null;
  const turlar = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of ochiq ?? []) m.set(x.tur, (m.get(x.tur) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ochiq]);

  return (
    <div className="flex flex-col gap-4">
      <Karta sarlavha="Sizdan kutilmoqda" tavsif="Ilova ichidagi kirish qutingiz: sizga berilgan topshiriqlar (joriy kompaniya).">
        {!id && <p className="text-[13px] text-text-dim m-0">{t('Avval kompaniyani tanlang.')}</p>}
        {!!id && q.isLoading && <Skelet qatorlar={2} />}
        {!!id && q.isError && <XatoQayta matn={t('Topshiriqlarni o‘qib bo‘lmadi.')} onQayta={() => { void q.refetch(); }} />}
        {!!id && q.data && (
          <>
            <div className="fz-kpis">
              <Kpi yorliq="Faol topshiriqlar" qiymat={sonYoki(ochiq ? ochiq.length : null)} />
              <Kpi yorliq="Yangi (qabul kutilmoqda)" qiymat={sonYoki(yangi)} />
              <Kpi yorliq="Bajarilmoqda" qiymat={sonYoki(jarayonda)} />
            </div>
            {ochiq && ochiq.length === 0 && <p className="text-[13px] text-text-dim m-0">{t('Hozir sizdan hech narsa kutilmayapti.')}</p>}
            {turlar.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label={t('Turlar bo‘yicha')}>
                {turlar.map(([tur, n]) => <span key={tur} className="fz-chip">{TOPSHIRIQ_TUR_NOMI[tur] ? t(TOPSHIRIQ_TUR_NOMI[tur]) : tur}: {sonYoki(n)}</span>)}
              </div>
            )}
          </>
        )}
        <Link to="/admin/topshiriqlar" className="fz-btn fz-btn--sm self-start">{t('Barcha topshiriqlarni ochish')}</Link>
      </Karta>
      <Karta sarlavha="Kanallar" tavsif="Xabarlar qaysi kanal orqali keladi.">
        <Qator yorliq="Ilova ichida" qiymat={<span className="fz-chip fz-chip--accent">{t('Faol')}</span>} />
        <Qator yorliq="Telegram" qiymat={<span className="fz-chip">{t('Ulanmagan')}</span>} />
        <Qator yorliq="Elektron pochta" qiymat={<span className="fz-chip">{t('Ulanmagan')}</span>} />
        <Nota tur="info">{t('Telegram va elektron pochta orqali xabar yuborish hali ulanmagan, shuning uchun sozlama tugmalari ko‘rsatilmaydi.')}</Nota>
      </Karta>
    </div>
  );
}

/* ───────── Ko‘rinish ───────── */
export function KorinishBolimi() {
  const [zichlik, setZichlik] = useState<Zichlik>(() => zichlikOqi());
  const [mahkam, setMahkam] = useState<boolean>(() => sidebarMahkamOqi());
  const zichlikTanla = (z: Zichlik) => { setZichlik(z); zichlikSaqla(z); };
  const mahkamTanla = (v: boolean) => { setMahkam(v); sidebarMahkamSaqla(v); };
  return (
    <div className="flex flex-col gap-4">
      <Karta sarlavha="Mavzu"><MavzuTanlagich /></Karta>
      <Karta sarlavha="Zichlik" tavsif="Tugma va maydonlar balandligi.">
        <div role="radiogroup" aria-label={t('Zichlik')} className="inline-flex gap-1">
          {(['qulay', 'ixcham'] as Zichlik[]).map((z) => (
            <button key={z} type="button" role="radio" aria-checked={zichlik === z} onClick={() => zichlikTanla(z)}
              className={`fz-btn fz-btn--sm ${zichlik === z ? 'fz-btn--primary' : ''}`}>{t(z === 'qulay' ? 'Qulay' : 'Ixcham')}</button>
          ))}
        </div>
      </Karta>
      <Karta sarlavha="Yon panel">
        <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer">
          <input type="checkbox" checked={mahkam} onChange={(e) => mahkamTanla(e.target.checked)} />
          {t('Yon panelni doim ochiq (mahkam) ushlash')}
        </label>
      </Karta>
    </div>
  );
}

/* ───────── Tarif va hisob ───────── */
export function TarifBolimi() {
  const { k } = useAkkaunt();
  const id = k.joriyId;
  const joylar = useQuery({ queryKey: ['akkaunt-ish-joylari'], queryFn: ishJoylarim, staleTime: 60_000 });
  const token = useQuery({
    queryKey: ['akkaunt-token', id],
    queryFn: async () => { const r = await tokenHolatOl(id as number); if (!r.ok) throw new Error(r.error); return r.natija; },
    enabled: !!id, staleTime: 60_000,
  });
  const saqlash = useQuery({
    queryKey: ['akkaunt-storage', id],
    queryFn: async () => { const r = await companyStorageOl(id as number); if (!r.ok) throw new Error('storage'); return r.data; },
    enabled: !!id, staleTime: 60_000,
  });
  const karta = (joylar.data?.ishJoylari ?? []).find((x) => x.kompaniya_id === id);
  const jami = joylar.data ? joylar.data.ishJoylari.length : null;
  const obuna = token.data?.obuna;
  const holat = saqlash.data?.status;
  return (
    <div className="flex flex-col gap-4">
      <div className="fz-kpis">
        <Kpi yorliq="Kompaniyalar" qiymat={sonYoki(jami ?? (k.yuklanmoqda ? null : k.kompaniyalar.length))} izoh="sizning ish joylaringiz" />
        <Kpi yorliq="Obyektlar" qiymat={sonYoki(karta?.obyektlar)} izoh="joriy kompaniya" />
        <Kpi yorliq="Foydalanuvchilar" qiymat={sonYoki(karta?.azolar)} izoh="joriy kompaniya a‘zolari" />
        <Kpi yorliq="Token balansi" qiymat={sonYoki(token.data?.balans)} />
      </div>
      <Karta sarlavha="Tarif" tavsif="Joriy kompaniya uchun.">
        {!id ? <p className="text-[13px] text-text-dim m-0">{t('Avval kompaniyani tanlang.')}</p> : (
          <>
            <Qator yorliq="Tarif" qiymat={token.isLoading ? '…' : obuna ? obuna.nom : '—'} />
            <Qator yorliq="Oylik token" qiymat={sonYoki(obuna?.oylik_token)} />
            <Qator yorliq="Obuna tugashi" qiymat={obuna?.tugaydi ?? '—'} />
            <Qator yorliq="Fayl saqlash holati" qiymat={saqlash.isLoading ? '…' : (holat ?? '—')} />
            <Qator yorliq="Saqlash hajmi (GB)" qiymat="—" />
          </>
        )}
        <Link to="/admin/tokenlar" className="fz-btn fz-btn--sm self-start">{t('Tokenlar va obunani ochish')}</Link>
      </Karta>
      <Karta sarlavha="To‘lov va hisob-kitob">
        <Tezorada matn="Onlayn to‘lov va hisob-faktura ulanmagan. To‘lov so‘rovlari hozircha Tokenlar sahifasida qo‘lda ko‘rib chiqiladi." />
      </Karta>
    </div>
  );
}

/* ───────── Tizim sozlamalari hub ───────── */
const IKONKALAR: Record<string, typeof Settings> = {
  layout: LayoutDashboard, briefcase: Briefcase, gauge: Gauge, building: Building2, users: Users, settings: Settings,
  calc: Calculator, tags: Tags, file: FileText, shield: ShieldCheck, stack: FileStack, hdd: HardHat, link: Link2,
  alert: ShieldAlert, flask: FlaskConical, map: MapIkon, trash: Trash2, crown: Crown,
};
export function HubBolimi() {
  const { k } = useAkkaunt();
  const modul = useModullar(k.globalRejim ? null : k.joriy?.id);
  const [q, setQ] = useState('');
  const kont = useMemo(() => ({
    superadmin: k.superadmin, permissions: k.joriy?.permissions, rol: k.joriy?.rol,
    modulYoqilgan: (yol: string) => menyuModulYoqilgan(yol, modul.data),
  }), [k.superadmin, k.joriy, modul.data]);
  const guruhlar = hubGuruhla(hubFiltr(HUB_BANDLAR, kont, q, t));
  const kamaytir = useReducedMotion();
  return (
    <div className="flex flex-col gap-4">
      <label className="relative block max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mute" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Sozlamalarni qidirish…')} aria-label={t('Sozlamalarni qidirish…')}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] pl-8 pr-3 text-[13px] text-text outline-none focus:border-[var(--accent)]" style={{ height: 'var(--control-md)' }} />
      </label>
      {guruhlar.length === 0 && <p className="text-[13px] text-text-dim m-0">{t('Hech narsa topilmadi.')}</p>}
      {guruhlar.map((g) => (
        <section key={g.id} aria-label={t(HUB_GURUH_NOMI[g.id])}>
          <h3 className="fz-panel__h mb-2"><span>{t(HUB_GURUH_NOMI[g.id])}</span></h3>
          <motion.div layout={!kamaytir} className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {g.bandlar.map((b) => {
              const Ikon = IKONKALAR[b.ikonka] ?? Settings;
              return (
                <motion.div key={b.yol} layout={!kamaytir} initial={kamaytir ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }}>
                  <Link to={b.yol} className="fz-card flex gap-3 p-3 h-full hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
                    <span className="shrink-0 rounded-md inline-flex items-center justify-center" style={{ width: 32, height: 32, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><Ikon size={16} aria-hidden="true" /></span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-text">{t(b.nom)}</span>
                      <span className="block text-[12px] text-text-dim">{t(b.izoh)}</span>
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </section>
      ))}
      <p className="text-[11px] text-text-mute flex items-center gap-1 m-0"><Info size={12} aria-hidden="true" />{t('Ko‘rinadigan sahifalar rolingiz ruxsatlariga bog‘liq; yakuniy tekshiruv serverda.')}</p>
    </div>
  );
}
