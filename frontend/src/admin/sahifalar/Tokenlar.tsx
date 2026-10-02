import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Gift, ShieldCheck, Sparkles } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import {
  demoManbaBelgila, obunaBelgila, tokenHolatOl, tokenTaxmin, tokenToldir, tokenXato, type TokenHarakat, type TokenHolat,
} from '../../api/t2-token';

const TUR_NOMI: Record<TokenHarakat['tur'], string> = { oylik: 'Obuna (oylik)', toldirish: 'Sotib olindi', bonus: 'Bonus', sarf: 'Sarf', qaytarish: 'Qaytarildi', tuzatish: 'Tuzatish' };
const son = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const kirit = 'rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent';

/**
 * Tokenlar va obuna (egasi, 2026-10-02: "pulga foydalanuvchi token oladi; fayllar va AI shu token bilan").
 * Foydalanuvchi: balans, tarif, narxlar, tarix. Superadmin: to'lovni tasdiqlab token yozish, tarif, demo manbasi.
 */
export function Tokenlar() {
  const { joriy, kompaniyalar } = useKompaniya();
  const kid = joriy?.id ?? null;
  const [h, setH] = useState<TokenHolat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const yukla = useCallback(async () => {
    if (!kid) return;
    setYuk(true);
    const r = await tokenHolatOl(kid);
    setYuk(false);
    if (r.ok) { setH(r.natija); setXato(null); } else setXato(r.error);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);

  // Superadmin paneli
  const [maqsad, setMaqsad] = useState('');
  const [miqdor, setMiqdor] = useState('');
  const [tur, setTur] = useState<'toldirish' | 'bonus' | 'tuzatish'>('toldirish');
  const [izoh, setIzoh] = useState('');
  const [tarif, setTarif] = useState('pto_start');
  const [oylar, setOylar] = useState('1');
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [band, setBand] = useState(false);
  useEffect(() => { if (kid) setMaqsad(String(kid)); }, [kid]);
  useEffect(() => {
    if (h?.superadmin && kid) void sbT2ObyektlarOlKomp(kid).then((r) => setObyektlar((r.ok ? r.qatorlar : []) as T2Obyekt[]));
  }, [h?.superadmin, kid]);

  const sarfJami = useMemo(() => (h?.harakatlar ?? []).filter((x) => x.tur === 'sarf').reduce((s, x) => s - x.miqdor, 0), [h]);

  async function bajar(f: () => Promise<{ ok: boolean }>, xabar: string) {
    if (band) return;
    setBand(true);
    const r = await f();
    setBand(false);
    if (!r.ok) { toast(tokenXato(r as never), 'danger'); return; }
    toast(xabar, 'ok');
    await yukla();
  }

  return (
    <Sahifa sarlavha="Tokenlar va obuna" tavsif="Fayllarni qayta ishlash, hujjatlar va AI — tokenlar bilan" onYangila={() => void yukla()} yangilanmoqda={yuk}>
      {!kid && <section className="karta p-4 text-text-dim">Avval kompaniyani tanlang.</section>}
      {xato && <section role="alert" className="karta border-danger/40 p-4 text-danger">{xato}</section>}
      {h && (
        <div className="space-y-3">
          <section className="grid gap-3 md:grid-cols-3">
            <div className="karta p-4">
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-text-mute"><Coins size={14} className="text-accent" />Balans</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-text" aria-label="Token balansi">{son(h.balans)}</div>
              <div className="text-[12px] text-text-dim">token · oxirgi 100 harakatda sarf: {son(sarfJami)}</div>
            </div>
            <div className="karta p-4">
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-text-mute"><ShieldCheck size={14} className="text-accent" />Obuna</div>
              <div className="mt-1 text-xl font-semibold text-text">{h.obuna ? h.obuna.nom : 'Obuna yo‘q'}</div>
              <div className="text-[12px] text-text-dim">{h.obuna ? `${son(h.obuna.oylik_token)} token/oy · ${h.obuna.tugaydi ? `${h.obuna.tugaydi} gacha` : 'muddatsiz'}` : 'Tarif tanlang — pastda'}</div>
            </div>
            <div className="karta p-4 text-[12px] text-text-dim">
              <div className="mb-1 flex items-center gap-2 text-[12px] uppercase tracking-wide text-text-mute"><Sparkles size={14} className="text-accent" />Qanday ishlaydi</div>
              Har amal oldidan narx ko‘rsatiladi; token yetmasa amal bajarilmaydi. Amal xato bilan tugasa token avtomatik qaytadi. AI — haqiqiy sarf bo‘yicha (kiruvchi va chiquvchi matn hajmi).
            </div>
          </section>

          <section className="karta p-4" aria-label="Tariflar">
            <h2 className="mb-2 text-[14px] font-semibold text-text">Tariflar</h2>
            <div className="grid gap-2 md:grid-cols-4">
              {h.tariflar.map((t) => (
                <div key={t.kod} className={`rounded-lg border p-3 ${h.obuna?.tarif === t.kod ? 'border-accent bg-accent/5' : 'border-border'}`}>
                  <div className="text-[13px] font-semibold text-text">{t.nom}</div>
                  <div className="text-lg font-bold tabular-nums text-text">{t.narx_som ? `${son(t.narx_som)} so‘m` : 'Bepul'}<span className="text-[11px] font-normal text-text-mute"> /oy</span></div>
                  <div className="text-[12px] text-text-dim">{son(t.oylik_token)} token har oy</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-text-mute">To‘lov: hozircha administrator orqali (o‘tkazma). To‘lovdan keyin tokenlar hisobingizga yoziladi.</p>
          </section>

          <section className="karta p-4" aria-label="Narxlar">
            <h2 className="mb-2 text-[14px] font-semibold text-text">Amallar narxi</h2>
            <table className="w-full text-[13px]"><tbody>
              {h.narxlar.map((n) => (
                <tr key={n.amal} className="border-t border-border/60">
                  <td className="py-1.5 text-text">{n.nom}</td>
                  <td className="py-1.5 text-right tabular-nums text-text-dim">
                    {n.tur === 'qatiy' ? `${son(n.narx)} token` : n.tur === 'yacheyka' ? `${son(n.narx)} token / ${son(n.birlik)} yacheyka (min ${son(n.minimum)})` : `${son(n.narx)} token / 1000 AI token`}
                  </td>
                  <td className="py-1.5 pl-3 text-right text-[11px] text-text-mute">{n.tur === 'yacheyka' ? `masalan 10 000 yacheyka → ${son(tokenTaxmin(n, 10000) ?? 0)}` : ''}</td>
                </tr>
              ))}
            </tbody></table>
          </section>

          <section className="karta p-4" aria-label="Harakatlar">
            <h2 className="mb-2 text-[14px] font-semibold text-text">Harakatlar tarixi (o‘zgarmas daftar)</h2>
            {h.harakatlar.length === 0 ? <p className="text-[12px] text-text-mute">Hali harakat yo‘q.</p> : (
              <table className="w-full text-[12px]"><tbody>
                {h.harakatlar.map((x) => (
                  <tr key={x.id} className="border-t border-border/60">
                    <td className="py-1 text-text-mute">{new Date(x.yaratildi).toLocaleString('ru-RU')}</td>
                    <td className="py-1 text-text">{TUR_NOMI[x.tur]}{x.amal ? ` · ${h.narxlar.find((n) => n.amal === x.amal)?.nom ?? x.amal}` : ''}{x.izoh ? ` — ${x.izoh}` : ''}</td>
                    <td className={`py-1 text-right font-semibold tabular-nums ${x.miqdor < 0 ? 'text-danger' : 'text-ok'}`}>{x.miqdor > 0 ? '+' : ''}{son(x.miqdor)}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>

          {h.superadmin && (
            <section className="karta space-y-3 border-accent/40 p-4" aria-label="Superadmin">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text"><Gift size={15} className="text-accent" />Superadmin: to‘lov, tarif, demo</h2>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[12px] text-text-dim">Kompaniya ID
                  <input aria-label="Maqsad kompaniya" list="tk-komp" value={maqsad} onChange={(e) => setMaqsad(e.target.value)} className={`${kirit} ml-1 w-24`} />
                  <datalist id="tk-komp">{kompaniyalar.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}</datalist>
                </label>
                <label className="text-[12px] text-text-dim">Miqdor<input aria-label="Token miqdori" inputMode="decimal" value={miqdor} onChange={(e) => setMiqdor(e.target.value)} className={`${kirit} ml-1 w-28`} /></label>
                <select aria-label="Harakat turi" value={tur} onChange={(e) => setTur(e.target.value as typeof tur)} className={kirit}>
                  <option value="toldirish">To‘lov (sotib oldi)</option><option value="bonus">Bonus</option><option value="tuzatish">Tuzatish (±)</option>
                </select>
                <input aria-label="Izoh" value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder="To‘lov raqami / sabab (majburiy)" className={`${kirit} min-w-[220px] flex-1`} />
                <button type="button" disabled={band} onClick={() => void bajar(() => tokenToldir({ maqsadKompaniyaId: Number(maqsad), miqdor: Number(miqdor.replace(',', '.')), tur, izoh }), 'Tokenlar yozildi')}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">Yozish</button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <select aria-label="Tarif" value={tarif} onChange={(e) => setTarif(e.target.value)} className={kirit}>{h.tariflar.map((t) => <option key={t.kod} value={t.kod}>{t.nom}</option>)}</select>
                <label className="text-[12px] text-text-dim">Oylar<input aria-label="Oylar" value={oylar} onChange={(e) => setOylar(e.target.value)} className={`${kirit} ml-1 w-16`} /></label>
                <button type="button" disabled={band} onClick={() => void bajar(() => obunaBelgila({ maqsadKompaniyaId: Number(maqsad), tarif, oylar: Number(oylar) }), 'Obuna belgilandi, 1-oy tokenlari yozildi')}
                  className="rounded-lg border border-accent/40 px-3 py-1.5 text-[13px] font-semibold text-text hover:bg-accent/10 disabled:opacity-50">Obunani belgilash</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-dim">
                Demo manbasi (yangi ro‘yxatdan o‘tganlarga nusxalanadi):
                <select aria-label="Demo manbasi" value={h.demo_obyekt_id ?? ''} disabled={band}
                  onChange={(e) => void bajar(() => demoManbaBelgila(e.target.value ? Number(e.target.value) : null), 'Demo manbasi saqlandi')} className={kirit}>
                  <option value="">— demo yo‘q —</option>
                  {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
                </select>
                <span className="text-warn">Diqqat: tanlangan obyekt smetasi (narxlari bilan) har bir yangi foydalanuvchiga ko‘rinadi.</span>
              </div>
            </section>
          )}
        </div>
      )}
    </Sahifa>
  );
}

export default Tokenlar;
