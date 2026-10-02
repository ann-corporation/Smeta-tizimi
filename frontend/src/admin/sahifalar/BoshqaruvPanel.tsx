/**
 * Platforma boshqaruv paneli (egasi, 2026-10-02): "tizimni boshqarish uchun hammasini nazorat qila olishim kerak —
 * foydalanuvchilar, obunalar, hisob, audit, sozlamalar, funksiyalar". Faqat platforma superadmini; server
 * (/api/boshqaruv → bazadagi _t2_boshqaruv_tekshir) yakuniy qo'riqchi. Har o'zgarish sabab bilan auditga yoziladi.
 */
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Building2, Coins, Crown, FileSearch, Settings, ToggleLeft, Users } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { demoManbaBelgila, obunaBelgila, tokenHolatOl, tokenToldir, tokenXato, type TokenNarx, type TokenTarif } from '../../api/t2-token';
import { boshqaruvOqi, boshqaruvYoz, type BAudit, type BFoydalanuvchi, type BKompaniya, type BTokenDaftar, type BUmumiy } from '../../api/t2-boshqaruv';

const SystemControlPage = lazy(() => import('../pages/SystemControlPage'));

const son = (x: number | null | undefined) => (x == null ? '—' : Number(x).toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
const vaqt = (s: string) => new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const ROLLAR = ['superadmin', 'admin', 'boss', 'rahbar', 'bugalter', 'pto', 'prorab', 'kuzatuvchi'];
const AMAL_NOMI: Record<string, string> = { smeta_import: 'Smeta import', f2_import: 'F2 import', katalog_import: 'Katalog import', f2_qoralama: 'F2 qoralama', hujjat: 'Hujjat', ai_kirish: 'AI kiruvchi', ai_chiqish: 'AI chiquvchi' };
const TUR_NOMI: Record<string, string> = { oylik: 'Oylik', toldirish: 'To‘lov', bonus: 'Bonus', sarf: 'Sarf', qaytarish: 'Qaytarish', tuzatish: 'Tuzatish' };

type Bolim = 'umumiy' | 'foydalanuvchilar' | 'kompaniyalar' | 'token' | 'audit' | 'sozlamalar' | 'funksiyalar';
const BOLIMLAR: { id: Bolim; nom: string; Ikonka: typeof Users }[] = [
  { id: 'umumiy', nom: 'Umumiy', Ikonka: Activity },
  { id: 'foydalanuvchilar', nom: 'Foydalanuvchilar', Ikonka: Users },
  { id: 'kompaniyalar', nom: 'Kompaniyalar va obunalar', Ikonka: Building2 },
  { id: 'token', nom: 'Token hisobi', Ikonka: Coins },
  { id: 'audit', nom: 'Audit', Ikonka: FileSearch },
  { id: 'sozlamalar', nom: 'Sozlamalar', Ikonka: Settings },
  { id: 'funksiyalar', nom: 'Funksiyalar va tizim', Ikonka: ToggleLeft },
];

/** Sabab so'rash (audit uchun majburiy). */
function sababSora(savol: string): string | null {
  const s = window.prompt(savol + '\n\nSabab (auditga yoziladi):');
  return s && s.trim() ? s.trim() : null;
}

function Karta({ sarlavha, qiymat, izoh }: { sarlavha: string; qiymat: ReactNode; izoh?: ReactNode }) {
  return (
    <div className="karta p-4">
      <div className="text-[11px] uppercase tracking-wide text-text-mute">{sarlavha}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-text">{qiymat}</div>
      {izoh && <div className="text-[12px] text-text-dim">{izoh}</div>}
    </div>
  );
}

function useOqi<T>(bolim: Parameters<typeof boshqaruvOqi>[0], p: Record<string, string | number | null | undefined>, kalit: string) {
  const [d, setD] = useState<T | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const yukla = useCallback(async () => {
    setYuk(true);
    const r = await boshqaruvOqi<T>(bolim, p);
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
    setYuk(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolim, kalit]);
  useEffect(() => { void yukla(); }, [yukla]);
  return { d, xato, yuk, yukla };
}

// ─── Umumiy ───
function Umumiy() {
  const { d, xato } = useOqi<BUmumiy>('umumiy', {}, '');
  if (xato) return <Xato x={xato} />;
  if (!d) return <Yuklanmoqda />;
  return (
    <div className="space-y-3">
      <section className="grid gap-3 md:grid-cols-4">
        <Karta sarlavha="Foydalanuvchilar" qiymat={son(d.foydalanuvchi.jami)} izoh={`7 kunda +${d.foydalanuvchi.yangi_7} · 30 kunda +${d.foydalanuvchi.yangi_30} · Google: ${d.foydalanuvchi.google}`} />
        <Karta sarlavha="Kompaniyalar" qiymat={son(d.kompaniya.jami)} izoh={`30 kunda +${d.kompaniya.yangi_30} · obyektlar: ${son(d.obyekt)}`} />
        <Karta sarlavha="Oylik tushum (faol obunalar)" qiymat={`${son(d.oylik_tushum_som)} so‘m`} izoh={`sotilgan token: ${son(d.token.sotilgan)}`} />
        <Karta sarlavha="Tokenlar" qiymat={son(d.token.qoldiq)} izoh={`berilgan ${son(d.token.berilgan)} · sarf ${son(d.token.sarflangan)} · 30 kunda ${son(d.token.sarf_30)}`} />
      </section>
      <section className="grid gap-3 md:grid-cols-3">
        <div className="karta p-4">
          <h2 className="mb-2 text-[14px] font-semibold text-text">Obunalar</h2>
          <table className="w-full text-[13px]"><tbody>
            {d.obunalar.map((o) => <tr key={o.kod} className="border-t border-border/60"><td className="py-1 text-text">{o.nom}</td><td className="py-1 text-right text-text-dim">{son(o.narx_som)} so‘m</td><td className="py-1 text-right font-semibold tabular-nums text-text">{o.soni}</td></tr>)}
          </tbody></table>
        </div>
        <div className="karta p-4">
          <h2 className="mb-2 text-[14px] font-semibold text-text">Token nimaga sarflanmoqda</h2>
          {d.token_amal.length === 0 ? <p className="text-[12px] text-text-mute">Hali sarf yo‘q.</p> : (
            <table className="w-full text-[13px]"><tbody>
              {d.token_amal.map((a) => <tr key={a.amal} className="border-t border-border/60"><td className="py-1 text-text">{AMAL_NOMI[a.amal] ?? a.amal}</td><td className="py-1 text-right text-text-dim">{a.soni} marta</td><td className="py-1 text-right font-semibold tabular-nums text-text">{son(a.token)}</td></tr>)}
            </tbody></table>
          )}
        </div>
        <div className="karta p-4">
          <h2 className="mb-2 text-[14px] font-semibold text-text">Oxirgi ro‘yxatdan o‘tganlar</h2>
          {d.royxat_oxirgi.length === 0 ? <p className="text-[12px] text-text-mute">Hali yo‘q.</p> : (
            <ul className="space-y-1 text-[12px]">
              {d.royxat_oxirgi.map((r) => <li key={r.id} className="flex justify-between gap-2 border-t border-border/60 pt-1"><span className="truncate text-text">{r.ism || r.login} <span className="text-text-mute">· {r.kompaniya}</span></span><span className="shrink-0 text-text-mute">{r.google ? 'Google · ' : ''}{vaqt(r.vaqt)}</span></li>)}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-text-mute">Demo obyekt: {d.demo_obyekt?.nom ?? 'tanlanmagan'}</p>
        </div>
      </section>
    </div>
  );
}

// ─── Foydalanuvchilar ───
function Foydalanuvchilar({ kompaniyalar }: { kompaniyalar: BKompaniya[] }) {
  const [q, setQ] = useState('');
  const [qidir, setQidir] = useState('');
  const { d, xato, yuk, yukla } = useOqi<BFoydalanuvchi[]>('foydalanuvchilar', { qidiruv: qidir }, qidir);
  const [rolUchun, setRolUchun] = useState<{ fid: number; kid: string; rol: string } | null>(null);

  const holat = async (f: BFoydalanuvchi) => {
    const yangi = f.holat === 'faol' ? 'bekor' : 'faol';
    const sabab = sababSora(`${f.login} — ${yangi === 'bekor' ? 'BLOKLASH (tizimga kira olmaydi)' : 'qayta faollashtirish'}`);
    if (!sabab) return;
    const r = await boshqaruvYoz('foydalanuvchi_holat', { foydalanuvchi_id: f.id, holat: yangi, sabab });
    toast(r.xabar, r.ok ? 'ok' : 'danger'); if (r.ok) void yukla();
  };
  const azolik = async (fid: number, kid: number, rol: string | null, savol: string) => {
    const sabab = sababSora(savol); if (!sabab) return;
    const r = await boshqaruvYoz('azolik', { foydalanuvchi_id: fid, kompaniya_id: kid, rol, sabab });
    toast(r.xabar, r.ok ? 'ok' : 'danger'); if (r.ok) { setRolUchun(null); void yukla(); }
  };

  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQidir(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Login, ism yoki email" className="input px-2 py-1.5 text-[13px] max-w-sm" aria-label="Qidirish" />
        <button className="tugma" disabled={yuk}>Qidirish</button>
      </form>
      {xato && <Xato x={xato} />}
      {d && (
        <div className="karta overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className="p-2">Foydalanuvchi</th><th className="p-2">Kirish</th><th className="p-2">A‘zoliklar</th><th className="p-2">Holat</th><th className="p-2" /></tr></thead>
            <tbody>
              {d.map((f) => (
                <tr key={f.id} className="border-t border-border/60 align-top">
                  <td className="p-2"><div className="font-medium text-text">{f.ism || f.login}</div><div className="text-[11px] text-text-mute">{f.login}{f.email && f.email !== f.login ? ` · ${f.email}` : ''} · #{f.id} · {vaqt(f.yaratildi)}</div></td>
                  <td className="p-2 text-[12px] text-text-dim">{[f.google && 'Google', f.parol && 'Parol', f.ozi_royxat && 'o‘zi ro‘yxat'].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {f.azoliklar.map((a) => (
                        <span key={a.azolik_id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${a.rol === 'superadmin' ? 'border-accent text-accent' : 'border-border text-text-dim'}`}>
                          {a.kompaniya}: <b>{a.rol}</b>
                          <button type="button" aria-label={`${a.kompaniya} a'zoligini olib tashlash`} className="text-text-mute hover:text-danger" onClick={() => void azolik(f.id, a.kompaniya_id, null, `${f.login} — ${a.kompaniya} a'zoligini olib tashlash`)}>×</button>
                        </span>
                      ))}
                    </div>
                    {rolUchun?.fid === f.id ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <select className="input h-7 px-2 text-[12px]" value={rolUchun.kid} onChange={(e) => setRolUchun({ ...rolUchun, kid: e.target.value })} aria-label="Kompaniya">
                          <option value="">Kompaniya…</option>
                          {kompaniyalar.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
                        </select>
                        <select className="input h-7 px-2 text-[12px]" value={rolUchun.rol} onChange={(e) => setRolUchun({ ...rolUchun, rol: e.target.value })} aria-label="Rol">
                          {ROLLAR.map((r) => <option key={r}>{r}</option>)}
                        </select>
                        <button type="button" className="tugma-asosiy h-7 px-2 text-[12px]" disabled={!rolUchun.kid} onClick={() => void azolik(f.id, Number(rolUchun.kid), rolUchun.rol, `${f.login} — ${kompaniyalar.find((k) => k.id === Number(rolUchun.kid))?.nom}: ${rolUchun.rol}`)}>Saqlash</button>
                        <button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => setRolUchun(null)}>Bekor</button>
                      </div>
                    ) : <button type="button" className="mt-1 text-[11px] text-accent hover:underline" onClick={() => setRolUchun({ fid: f.id, kid: '', rol: 'pto' })}>+ rol berish</button>}
                  </td>
                  <td className="p-2"><span className={f.holat === 'faol' ? 'text-ok' : 'text-danger'}>{f.holat === 'faol' ? 'Faol' : 'Bloklangan'}</span></td>
                  <td className="p-2 text-right"><button type="button" className={f.holat === 'faol' ? 'tugma h-7 px-2 text-[12px] text-danger' : 'tugma h-7 px-2 text-[12px]'} onClick={() => void holat(f)}>{f.holat === 'faol' ? 'Bloklash' : 'Faollashtirish'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-2 text-[11px] text-text-mute">Bloklangan foydalanuvchi qayta kira olmaydi (parol va Google). Ochiq sessiyasi muddati tugaguncha qoladi.</p>
        </div>
      )}
    </div>
  );
}

// ─── Kompaniyalar va obunalar ───
function Kompaniyalar({ d, xato, yukla, tariflar }: { d: BKompaniya[] | null; xato: string | null; yukla: () => void; tariflar: TokenTarif[] }) {
  const toldir = async (k: BKompaniya) => {
    const m = window.prompt(`${k.nom} — nechta token qo'shilsin? (manfiy — tuzatish)`);
    if (!m) return; const miqdor = Number(m.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(miqdor) || miqdor === 0) { toast('Miqdor noto‘g‘ri', 'danger'); return; }
    const izoh = sababSora(`${k.nom}: ${miqdor > 0 ? '+' : ''}${miqdor} token (to'lov raqami yoki sabab)`); if (!izoh) return;
    const tur = miqdor < 0 ? 'tuzatish' : /bonus|sovg/i.test(izoh) ? 'bonus' : 'toldirish';
    const r = await tokenToldir({ maqsadKompaniyaId: k.id, miqdor, tur, izoh });
    toast(r.ok ? 'Token yozildi' : tokenXato(r), r.ok ? 'ok' : 'danger'); if (r.ok) yukla();
  };
  const tarif = async (k: BKompaniya, kod: string) => {
    const oy = Number(window.prompt(`${k.nom} — "${tariflar.find((t) => t.kod === kod)?.nom}" necha oyga?`, '1'));
    if (!Number.isInteger(oy) || oy < 1 || oy > 24) return;
    const r = await obunaBelgila({ maqsadKompaniyaId: k.id, tarif: kod, oylar: oy });
    toast(r.ok ? 'Obuna belgilandi, oylik tokenlar yozildi' : tokenXato(r), r.ok ? 'ok' : 'danger'); if (r.ok) yukla();
  };
  if (xato) return <Xato x={xato} />;
  if (!d) return <Yuklanmoqda />;
  return (
    <div className="karta overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className="p-2">Kompaniya</th><th className="p-2">Boss</th><th className="p-2 text-right">A‘zo / obyekt</th><th className="p-2">Tarif</th><th className="p-2 text-right">Balans</th><th className="p-2 text-right">Sarf 30 kun</th><th className="p-2" /></tr></thead>
        <tbody>
          {d.map((k) => (
            <tr key={k.id} className="border-t border-border/60">
              <td className="p-2"><div className="font-medium text-text">{k.nom}</div><div className="text-[11px] text-text-mute">#{k.id} · {k.kod}{k.telefon ? ` · ${k.telefon}` : ''} · {vaqt(k.yaratildi)}</div></td>
              <td className="p-2 text-text-dim">{k.boss ?? '—'}</td>
              <td className="p-2 text-right tabular-nums text-text-dim">{k.azolar} / {k.obyektlar}</td>
              <td className="p-2">
                <select className="input h-7 px-2 text-[12px]" value={k.tarif?.kod ?? ''} onChange={(e) => { if (e.target.value) void tarif(k, e.target.value); }} aria-label={`${k.nom} tarifi`}>
                  <option value="">{k.tarif ? '' : 'Obunasiz'}</option>
                  {tariflar.map((t) => <option key={t.kod} value={t.kod}>{t.nom}</option>)}
                </select>
                {k.tarif?.tugaydi && <div className="text-[11px] text-text-mute">{k.tarif.tugaydi} gacha</div>}
              </td>
              <td className="p-2 text-right font-semibold tabular-nums text-text">{son(k.balans)}</td>
              <td className="p-2 text-right tabular-nums text-text-dim">{son(k.sarf_30)}</td>
              <td className="p-2 text-right"><button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => void toldir(k)}>+ Token</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-2 text-[11px] text-text-mute">To‘lov qo‘lda tasdiqlanadi: mijoz to‘lagach, «+ Token» (izohga to‘lov raqami) yoki tarif tanlang — oylik tokenlar avtomatik yoziladi.</p>
    </div>
  );
}

// ─── Token hisobi ───
function TokenHisobi({ kompaniyalar }: { kompaniyalar: BKompaniya[] }) {
  const [kid, setKid] = useState('');
  const { d, xato } = useOqi<BTokenDaftar>('token', { kompaniya_id: kid }, kid);
  return (
    <div className="space-y-3">
      <select className="input px-2 py-1.5 text-[13px] max-w-xs" value={kid} onChange={(e) => setKid(e.target.value)} aria-label="Kompaniya filtri">
        <option value="">Barcha kompaniyalar</option>
        {kompaniyalar.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
      </select>
      {xato && <Xato x={xato} />}
      {d && (
        <>
          <section className="karta p-4">
            <h2 className="mb-2 text-[14px] font-semibold text-text">Oylar bo‘yicha</h2>
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th>Oy</th><th className="text-right">Berilgan (oylik+bonus)</th><th className="text-right">Sotilgan</th><th className="text-right">Sarflangan</th></tr></thead>
              <tbody>{d.oylar.map((o) => <tr key={o.oy} className="border-t border-border/60"><td className="py-1 text-text">{o.oy}</td><td className="py-1 text-right tabular-nums">{son(o.berilgan)}</td><td className="py-1 text-right tabular-nums">{son(o.sotilgan)}</td><td className="py-1 text-right tabular-nums">{son(o.sarflangan)}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="karta overflow-x-auto p-4">
            <h2 className="mb-2 text-[14px] font-semibold text-text">Daftar (oxirgi 300, o‘zgarmas)</h2>
            <table className="w-full text-[12px]"><tbody>
              {d.harakatlar.map((h) => (
                <tr key={h.id} className="border-t border-border/60">
                  <td className="py-1 text-text-mute">{vaqt(h.vaqt)}</td>
                  <td className="py-1 text-text">{h.kompaniya}</td>
                  <td className="py-1 text-text-dim">{TUR_NOMI[h.tur] ?? h.tur}{h.amal ? ` · ${AMAL_NOMI[h.amal] ?? h.amal}` : ''}{h.birlik_soni ? ` (${son(h.birlik_soni)} yach.)` : ''}{h.izoh ? ` — ${h.izoh}` : ''}</td>
                  <td className="py-1 text-text-mute">{h.kim ?? ''}</td>
                  <td className={`py-1 text-right font-semibold tabular-nums ${h.miqdor < 0 ? 'text-danger' : 'text-ok'}`}>{h.miqdor > 0 ? '+' : ''}{son(h.miqdor)}</td>
                </tr>
              ))}
            </tbody></table>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Audit ───
function Audit({ kompaniyalar }: { kompaniyalar: BKompaniya[] }) {
  const [q, setQ] = useState(''); const [qidir, setQidir] = useState(''); const [kid, setKid] = useState('');
  const [qator, setQator] = useState<BAudit[]>([]); const [xato, setXato] = useState<string | null>(null); const [yana, setYana] = useState(false);
  const yukla = useCallback(async (oldin?: number) => {
    const r = await boshqaruvOqi<BAudit[]>('audit', { qidiruv: qidir, kompaniya_id: kid, oldin_id: oldin });
    if (!r.ok) { setXato(r.error); return; }
    setXato(null); setQator((p) => (oldin ? [...p, ...r.natija] : r.natija)); setYana(r.natija.length === 200);
  }, [qidir, kid]);
  useEffect(() => { void yukla(); }, [yukla]);
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setQidir(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Amal, modul, kim yoki tafsilot" className="input px-2 py-1.5 text-[13px] max-w-sm" aria-label="Auditdan qidirish" />
        <select className="input px-2 py-1.5 text-[13px] max-w-xs" value={kid} onChange={(e) => setKid(e.target.value)} aria-label="Kompaniya filtri">
          <option value="">Barcha kompaniyalar</option>
          {kompaniyalar.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
        </select>
        <button className="tugma">Qidirish</button>
      </form>
      {xato && <Xato x={xato} />}
      <div className="karta overflow-x-auto">
        <table className="w-full text-[12px]"><tbody>
          {qator.map((a) => (
            <tr key={a.id} className="border-t border-border/60 align-top">
              <td className="whitespace-nowrap p-2 text-text-mute">{vaqt(a.vaqt)}</td>
              <td className="p-2 text-text">{a.amal}<div className="text-[11px] text-text-mute">{a.modul}</div></td>
              <td className="p-2 text-text-dim">{a.kompaniya}{a.obyekt_id ? ` · obyekt #${a.obyekt_id}` : ''}</td>
              <td className="p-2 text-text-dim">{a.kim}</td>
              <td className="p-2 text-text-dim break-all">{a.tafsilot}</td>
            </tr>
          ))}
        </tbody></table>
        {yana && <button type="button" className="m-2 tugma" onClick={() => void yukla(qator[qator.length - 1]?.id)}>Ko‘proq</button>}
      </div>
    </div>
  );
}

// ─── Sozlamalar ───
function Sozlamalar({ kompaniyaId }: { kompaniyaId: number | null }) {
  const [narxlar, setNarxlar] = useState<TokenNarx[]>([]);
  const [tariflar, setTariflar] = useState<TokenTarif[]>([]);
  const [demo, setDemo] = useState<number | null>(null);
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const yukla = useCallback(async () => {
    if (!kompaniyaId) return;
    const h = await tokenHolatOl(kompaniyaId);
    if (h.ok) { setNarxlar(h.natija.narxlar); setTariflar(h.natija.tariflar); setDemo(h.natija.demo_obyekt_id); }
    const o = await sbT2ObyektlarOlKomp(kompaniyaId);
    if (o.ok) setObyektlar(o.qatorlar ?? []);
  }, [kompaniyaId]);
  useEffect(() => { void yukla(); }, [yukla]);

  const narxSaqla = async (n: TokenNarx) => {
    const r = await boshqaruvYoz('narx', { amal_kod: n.amal, narx: n.narx, birlik: n.birlik, minimum: n.minimum, faol: true });
    toast(r.xabar, r.ok ? 'ok' : 'danger'); if (r.ok) void yukla();
  };
  const tarifSaqla = async (t: TokenTarif & { faol?: boolean }) => {
    const r = await boshqaruvYoz('tarif', { kod: t.kod, nom: t.nom, oylik_token: t.oylik_token, narx_som: t.narx_som, faol: t.faol !== false });
    toast(r.xabar, r.ok ? 'ok' : 'danger'); if (r.ok) void yukla();
  };
  const yangiTarif = () => {
    const kod = window.prompt('Yangi tarif kodi (lotin, masalan: pto_korporativ)'); if (!kod) return;
    setTariflar((p) => [...p, { kod: kod.trim().toLowerCase(), nom: 'Yangi tarif', oylik_token: 0, narx_som: 0 }]);
  };
  const ozgar = <T,>(set: (f: (p: T[]) => T[]) => void, i: number, qism: Partial<T>) => set((p) => p.map((x, j) => (j === i ? { ...x, ...qism } : x)));

  if (!kompaniyaId) return <p className="karta p-4 text-text-dim">Sozlamalarni ko‘rish uchun yuqorida istalgan kompaniyani tanlang (sozlamalar butun platforma uchun umumiy).</p>;
  return (
    <div className="space-y-3">
      <section className="karta p-4">
        <h2 className="mb-1 text-[14px] font-semibold text-text">Token narxlari</h2>
        <p className="mb-2 text-[12px] text-text-mute">Fayl va hujjatlar — ishlangan yacheykalar soniga ko‘ra: «narx» token har «birlik» yacheykaga, kamida «minimum». AI — 1000 LLM token uchun.</p>
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th>Amal</th><th>Narx</th><th>Birlik</th><th>Minimum</th><th /></tr></thead>
          <tbody>{narxlar.map((n, i) => (
            <tr key={n.amal} className="border-t border-border/60">
              <td className="py-1 text-text">{n.nom}</td>
              <td className="py-1"><input type="number" step="0.01" className="input h-7 px-2 w-24 py-0" value={n.narx} onChange={(e) => ozgar(setNarxlar, i, { narx: Number(e.target.value) })} aria-label={`${n.nom} narxi`} /></td>
              <td className="py-1"><input type="number" className="input h-7 px-2 w-24 py-0" value={n.birlik} onChange={(e) => ozgar(setNarxlar, i, { birlik: Number(e.target.value) })} aria-label={`${n.nom} birligi`} /></td>
              <td className="py-1"><input type="number" step="0.01" className="input h-7 px-2 w-20 py-0" value={n.minimum} onChange={(e) => ozgar(setNarxlar, i, { minimum: Number(e.target.value) })} aria-label={`${n.nom} minimumi`} /></td>
              <td className="py-1 text-right"><button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => void narxSaqla(n)}>Saqlash</button></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className="karta p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-[14px] font-semibold text-text">Tariflar</h2><button type="button" className="tugma h-7 px-2 text-[12px]" onClick={yangiTarif}>+ Yangi tarif</button></div>
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th>Kod</th><th>Nomi</th><th>Token/oy</th><th>Narx (so‘m/oy)</th><th /></tr></thead>
          <tbody>{tariflar.map((t, i) => (
            <tr key={t.kod} className="border-t border-border/60">
              <td className="py-1 text-text-mute">{t.kod}</td>
              <td className="py-1"><input className="input h-7 px-2" value={t.nom} onChange={(e) => ozgar(setTariflar, i, { nom: e.target.value })} aria-label={`${t.kod} nomi`} /></td>
              <td className="py-1"><input type="number" className="input h-7 px-2 w-28 py-0" value={t.oylik_token} onChange={(e) => ozgar(setTariflar, i, { oylik_token: Number(e.target.value) })} aria-label={`${t.kod} tokeni`} /></td>
              <td className="py-1"><input type="number" className="input h-7 px-2 w-32 py-0" value={t.narx_som} onChange={(e) => ozgar(setTariflar, i, { narx_som: Number(e.target.value) })} aria-label={`${t.kod} narxi`} /></td>
              <td className="py-1 text-right whitespace-nowrap">
                <button type="button" className="tugma h-7 px-2 text-[12px]" onClick={() => void tarifSaqla(t)}>Saqlash</button>
                {t.kod !== 'free' && <button type="button" className="ml-1 tugma h-7 px-2 text-[12px] text-danger" onClick={() => void tarifSaqla({ ...t, faol: false })}>Yashirish</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className="karta p-4">
        <h2 className="mb-1 text-[14px] font-semibold text-text">Demo obyekt (yangi foydalanuvchilarga nusxalanadi)</h2>
        <p className="mb-2 text-[12px] text-warn">Diqqat: tanlangan obyekt smetasi (narxlari bilan) har yangi foydalanuvchiga ko‘rinadi. Kichik namuna obyekt tavsiya etiladi — katta obyekt ro‘yxatni sekinlashtiradi.</p>
        <select className="input px-2 py-1.5 text-[13px] max-w-md" value={demo ?? ''} aria-label="Demo obyekt"
          onChange={async (e) => { const v = e.target.value ? Number(e.target.value) : null; const r = await demoManbaBelgila(v); toast(r.ok ? 'Demo manba saqlandi' : tokenXato(r), r.ok ? 'ok' : 'danger'); if (r.ok) setDemo(v); }}>
          <option value="">Demo yo‘q</option>
          {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          {demo != null && !obyektlar.some((o) => o.id === demo) && <option value={demo}>#{demo} (boshqa kompaniyada)</option>}
        </select>
      </section>
    </div>
  );
}

// ─── Funksiyalar va tizim ───
function Funksiyalar() {
  const havolalar = [
    { yol: '/admin/sayt-xaritasi', nom: 'Sayt xaritasi', izoh: 'Barcha sahifalar, ular nimani o‘qiydi/yozadi' },
    { yol: '/admin/ai-agentlar', nom: 'AI ishchilar', izoh: 'Sifat, narx auditori, ombor agentlari' },
    { yol: '/admin/hujjat-dizayn', nom: 'Hujjatlar dizayni', izoh: 'Har hujjat turining rang mavzusi' },
    { yol: '/admin/storage', nom: 'Fayl saqlash (R2)', izoh: 'Fayllar holati' },
    { yol: '/admin/korzinka', nom: 'Korzinka', izoh: 'O‘chirilganlarni tiklash' },
  ];
  return (
    <div className="space-y-3">
      <section className="grid gap-2 md:grid-cols-5">
        {havolalar.map((h) => <Link key={h.yol} to={h.yol} className="karta block p-3 hover:border-accent"><div className="text-[13px] font-semibold text-text">{h.nom}</div><div className="text-[11px] text-text-mute">{h.izoh}</div></Link>)}
      </section>
      <p className="text-[12px] text-text-mute">Quyida — funksiyalarni yoqish/o‘chirish (kompaniya yoki butun platforma), kill-switch, tizim salomatligi, fon ishlari va hodisalar.</p>
      <Suspense fallback={<Yuklanmoqda />}><SystemControlPage /></Suspense>
    </div>
  );
}

function Xato({ x }: { x: string }) { return <section role="alert" className="karta border-danger/40 p-4 text-danger">{x}</section>; }
function Yuklanmoqda() { return <div className="p-4 text-text-dim">Yuklanmoqda…</div>; }

export default function BoshqaruvPanel() {
  const { joriy, superadmin } = useKompaniya() as ReturnType<typeof useKompaniya> & { superadmin?: boolean };
  const [bolim, setBolim] = useState<Bolim>('umumiy');
  const komp = useOqi<BKompaniya[]>('kompaniyalar', {}, '');
  const [tariflar, setTariflar] = useState<TokenTarif[]>([]);
  useEffect(() => { if (joriy?.id) void tokenHolatOl(joriy.id).then((h) => { if (h.ok) setTariflar(h.natija.tariflar); }); }, [joriy?.id]);

  if (komp.xato && /superadmin/i.test(komp.xato)) {
    return <Sahifa sarlavha="Boshqaruv paneli" tavsif="Platforma boshqaruvi"><Xato x="Bu panel faqat platforma superadmini uchun." /></Sahifa>;
  }
  return (
    <Sahifa sarlavha="Boshqaruv paneli" tavsif="Butun platforma: foydalanuvchilar, obunalar, hisob, audit, sozlamalar va funksiyalar" onYangila={() => void komp.yukla()} yangilanmoqda={komp.yuk}>
      <div className="mb-3 flex items-center gap-2 text-[12px] text-text-mute"><Crown size={14} className="text-accent" />Faqat siz ko‘rasiz{superadmin === false ? ' (superadmin emas)' : ''} · har o‘zgarish sabab bilan auditga yoziladi</div>
      <nav className="mb-3 flex flex-wrap gap-1" aria-label="Boshqaruv bo‘limlari">
        {BOLIMLAR.map(({ id, nom, Ikonka }) => (
          <button key={id} type="button" onClick={() => setBolim(id)} aria-pressed={bolim === id}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] ${bolim === id ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-dim hover:text-text'}`}>
            <Ikonka size={14} />{nom}
          </button>
        ))}
      </nav>
      {bolim === 'umumiy' && <Umumiy />}
      {bolim === 'foydalanuvchilar' && <Foydalanuvchilar kompaniyalar={komp.d ?? []} />}
      {bolim === 'kompaniyalar' && <Kompaniyalar d={komp.d} xato={komp.xato} yukla={() => void komp.yukla()} tariflar={tariflar} />}
      {bolim === 'token' && <TokenHisobi kompaniyalar={komp.d ?? []} />}
      {bolim === 'audit' && <Audit kompaniyalar={komp.d ?? []} />}
      {bolim === 'sozlamalar' && <Sozlamalar kompaniyaId={joriy?.id ?? null} />}
      {bolim === 'funksiyalar' && <Funksiyalar />}
    </Sahifa>
  );
}
