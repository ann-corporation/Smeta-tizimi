/**
 * Odam taklifi (emailsiz kirish, 2026-11-13): admin/boss ism + telefon + lavozim kiritadi — server bir martalik kod (8 xona) va
 * qisqa havola beradi. Kod/havola FAQAT yaratilganda bir marta ko'rsatiladi (bazada faqat xesh). Odam havolani ochadi yoki
 * telefon + kod kiritadi, o'z parolini o'rnatadi; lavozim aynan taklifdagidek. Jarvis: «a'zo taklif qil», «usta qo'sh».
 */
import { useEffect, useState } from 'react';
import { Copy, Loader2, Send, UserPlus, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { telefonE164, telefonNiqob } from '../../lib/telefon-niqob';
import { taklifBekorQil, taklifYarat, takliflarRoyxati, type TaklifHolat, type TaklifQator } from '../../api/kirish-taklif';
import { useYordamchiSahifaAmallari } from '../../lib/yordamchi/sahifa-amal-store';

/** Dala rollari birinchi (kadrlar xodimi ham faqat shularni beradi); qolganlari — direktor uchun. */
export const ODAM_TAKLIF_ROLLARI = ['usta', 'brigadir', 'haydovchi', 'omborchi', 'mexanik', 'inspektor', 'kadr', 'taminotchi', 'pto', 'prorab', 'bugalter', 'rahbar', 'loyihachi', 'sotuvchi', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'] as const;

const HOLAT_NOMI: Record<TaklifHolat, string> = {
  kutmoqda: 'Kutmoqda', ishlatildi: 'Qabul qilingan', bekor: 'Bekor qilingan', bloklangan: 'Bloklangan (ko‘p xato kod)', muddati_otgan: 'Muddati tugagan',
};
const XATO_MATN: Record<string, string> = {
  YOQILMAGAN: 'Taklif orqali kirish hali yoqilmagan (server sozlamasi).', TELEFON_NOTOGRI: 'Telefon raqamini +998 XX XXX XX XX ko‘rinishida kiriting.',
  ISM_NOTOGRI: 'Ismni kiriting (2–120 belgi).', ROL_NOTOGRI: 'Bu lavozimni taklif orqali berib bo‘lmaydi.', RUXSAT_YOQ: 'Odam taklif qilish uchun ruxsatingiz yo‘q.',
  LIMIT: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.', KOP_TAKLIF: 'Kutayotgan takliflar juda ko‘p. Avval keraksizlarini bekor qiling.',
  ALLAQACHON_AZO: 'Bu odam allaqachon shu kompaniya a‘zosi.', ORIGIN_INVALID: 'So‘rov rad etildi. Sahifani yangilang.',
};

export function OdamTakliflari({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const [royxat, setRoyxat] = useState<TaklifQator[] | null>(null);
  const [xato, setXato] = useState('');
  const [ochiq, setOchiq] = useState(false);
  const [ism, setIsm] = useState('');
  const [tel, setTel] = useState('');
  const [rol, setRol] = useState<string>('usta');
  const [band, setBand] = useState(false);
  const [yangi, setYangi] = useState<{ kod: string; havola: string; telefon: string } | null>(null);
  const [nusxa, setNusxa] = useState('');

  async function yukla() {
    const r = await takliflarRoyxati(kompaniyaId);
    if (r.ok && r.takliflar) { setRoyxat(r.takliflar); setXato(''); }
    else if (r.code !== 'YOQILMAGAN') setXato(t(XATO_MATN[r.code || ''] ?? 'Takliflar o‘qilmadi'));
    else setXato(t(XATO_MATN.YOQILMAGAN));
  }
  useEffect(() => { if (isDirector) void yukla(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kompaniyaId, isDirector]);

  const ochish = (r: string) => { setRol(r); setOchiq(true); setYangi(null); setXato(''); };
  useYordamchiSahifaAmallari(isDirector ? [
    { id: 'azo_taklif', nom: 'A‘zo taklif qilish (telefon va kod bilan)', kalitlar: ['azo taklif qil', 'odam taklif qil', 'xodim taklif qil', 'taklif qil', 'пригласить участника', 'пригласить сотрудника', 'invite member', 'invite employee'], run: () => ochish('usta') },
    { id: 'usta_qosh', nom: 'Usta qo‘shish (telefon bilan taklif)', kalitlar: ['usta qosh', 'usta qoshish', 'yangi usta', 'brigadir qosh', 'добавить мастера', 'пригласить мастера', 'add foreman', 'invite foreman'], run: () => ochish('usta') },
  ] : []);

  if (!isDirector) return null;
  const telOk = telefonE164(tel) != null;

  async function yarat() {
    setBand(true); setXato(''); setYangi(null); setNusxa('');
    const r = await taklifYarat({ kompaniyaId, ism: ism.trim(), telefon: tel, rol });
    setBand(false);
    if (!r.ok || !r.kod || !r.havola) { setXato(t(XATO_MATN[r.code || ''] ?? r.xabar ?? 'Taklif yaratib bo‘lmadi.')); return; }
    setYangi({ kod: r.kod, havola: r.havola, telefon: r.telefon || '' });
    setIsm(''); setTel('');
    void yukla();
  }
  async function bekor(id: number) {
    if (!window.confirm(t('Taklif bekor qilinsinmi? Kod va havola ishlamay qoladi.'))) return;
    const r = await taklifBekorQil(kompaniyaId, id);
    if (!r.ok) { setXato(t(XATO_MATN[r.code || ''] ?? 'Bekor qilib bo‘lmadi.')); return; }
    void yukla();
  }
  async function nusxala(nom: string, matn: string) {
    try { await navigator.clipboard.writeText(matn); setNusxa(nom); } catch { setNusxa(''); }
  }
  const xabarMatni = yangi ? t('Smeta tizimiga taklif. Havola: {h} — yoki telefon raqamingiz + kod: {k}. Kod cheklangan muddat amal qiladi, hech kimga bermang.', { h: yangi.havola, k: yangi.kod }) : '';

  return (
    <div className="karta mt-3 space-y-3 p-4" aria-label={t('Odam taklifi')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus size={14} /> {t('Odam taklif qilish (emailsiz)')}</h3>
          <p className="text-xs text-text-dim">{t('Ism, telefon va lavozimni kiriting — bir martalik kod va havola beriladi. Odam email yoki Gmailsiz, faqat telefon va o‘zi tanlagan parol bilan kiradi.')}</p>
        </div>
        {!ochiq && <button type="button" className="tugma tugma-asosiy h-9" onClick={() => ochish('usta')}><UserPlus size={13} /> {t('Taklif yaratish')}</button>}
      </div>

      {ochiq && <form className="grid gap-2 text-[12px] sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void yarat(); }}>
        <label className="grid gap-0.5">{t('Ism va familiya')}
          <input className="input h-9" value={ism} maxLength={120} autoComplete="off" onChange={(e) => setIsm(e.target.value)} placeholder={t('F.I.Sh.')} /></label>
        <label className="grid gap-0.5">{t('Telefon')}
          <input className="input h-9" inputMode="tel" autoComplete="off" value={tel} onChange={(e) => setTel(telefonNiqob(e.target.value))} placeholder="+998 90 123 45 67" aria-invalid={tel !== '' && !telOk} /></label>
        <label className="grid gap-0.5 sm:col-span-2">{t('Lavozim')}
          <select className="input h-9" value={rol} onChange={(e) => setRol(e.target.value)}>
            {ODAM_TAKLIF_ROLLARI.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
          </select></label>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="tugma tugma-asosiy h-9" disabled={band || ism.trim().length < 2 || !telOk}>
            {band ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {t('Kod va havola olish')}</button>
          <button type="button" className="tugma h-9" onClick={() => { setOchiq(false); setYangi(null); }}>{t('Yopish')}</button>
        </div>
      </form>}

      {yangi && <div role="status" className="space-y-2 rounded border border-accent/40 bg-accent/10 p-3 text-[12px]">
        <p className="font-semibold">{t('Tayyor — hozir nusxalang, keyin qayta ko‘rsatilmaydi:')}</p>
        <div className="flex flex-wrap items-center gap-2"><span className="text-text-dim">{t('Kod')}:</span>
          <code className="text-base font-bold tracking-widest" data-testid="taklif-kod">{yangi.kod}</code>
          <button type="button" className="tugma h-7" onClick={() => void nusxala('kod', yangi.kod)}><Copy size={12} /> {nusxa === 'kod' ? t('Nusxalandi') : t('Nusxalash')}</button></div>
        <div className="flex flex-wrap items-center gap-2"><span className="text-text-dim">{t('Havola')}:</span>
          <code className="min-w-0 flex-1 break-all">{yangi.havola}</code>
          <button type="button" className="tugma h-7" onClick={() => void nusxala('havola', yangi.havola)}><Copy size={12} /> {nusxa === 'havola' ? t('Nusxalandi') : t('Nusxalash')}</button></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="tugma h-7" onClick={() => void nusxala('xabar', xabarMatni)}><Copy size={12} /> {nusxa === 'xabar' ? t('Nusxalandi') : t('Tayyor xabarni nusxalash')}</button>
          <a className="tugma h-7" target="_blank" rel="noreferrer noopener" href={`https://t.me/share/url?url=${encodeURIComponent(yangi.havola)}&text=${encodeURIComponent(t('Smeta tizimiga taklif. Telefon raqamingiz + kod: {k}', { k: yangi.kod }))}`}>{t('Telegram orqali yuborish')}</a>
        </div>
        <p className="text-text-dim">{t('Odamga telefon raqami: {t}. Havola yoki kodni faqat o‘sha odamga bering.', { t: yangi.telefon })}</p>
      </div>}

      {xato && <p role="alert" className="text-[12px] text-rose-300">{xato}</p>}
      {royxat && royxat.length > 0 && <ul className="divide-y divide-border/60 text-[12px]">
        {royxat.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5">
          <span className="font-medium">{x.ism}</span>
          <span className="text-text-dim">{x.telefon}</span>
          <span>{ROLE_LABELS[x.rol] ?? x.rol}</span>
          <span className="text-text-mute">{t('muddat')}: {new Date(x.tugaydi).toLocaleString('ru-RU')}</span>
          <span className={x.holat === 'kutmoqda' || x.holat === 'ishlatildi' ? 'text-emerald-400' : 'text-text-mute'}>{t(HOLAT_NOMI[x.holat])}</span>
          {x.holat === 'kutmoqda' && <button type="button" className="ml-auto text-text-mute hover:text-danger" aria-label={`${t('Bekor qilish')}: ${x.ism}`} onClick={() => void bekor(x.id)}><X size={13} /></button>}
        </li>)}
      </ul>}
    </div>
  );
}
