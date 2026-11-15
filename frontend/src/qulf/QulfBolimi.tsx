/** Akkaunt markazi -> «PIN va biometrik»: PIN o‘rnatish/almashtirish, biometrik (passkey) qurilmalar, qulf vaqti, kompaniya siyosati. */
import { cloneElement, useCallback, useEffect, useState, type ReactElement } from 'react';
import { Fingerprint, KeyRound, Smartphone, Trash2 } from 'lucide-react';
import { Karta, INPUT_SINF, INPUT_STIL, Maydon, Nota, Qator, Skelet } from '../components/akkaunt/AkkauntUi';
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { t } from '../i18n/til';
import { passkeyQosh, platformBiometrikBormi, qulfSoz, type QulfHolatJavob, type QulfJavob } from './api';
import { BOSH_MAX_DAQ, BOSH_MIN_DAQ, PIN_MAX, PIN_MIN } from './mantiq';
import { useQulf } from './QulfProvider';

const XATO: Record<string, string> = {
  PIN_FORMAT: 'PIN 4–6 raqamdan iborat bo‘lishi kerak.',
  PIN_ZAIF: 'PIN juda oson (0000, 1234 kabi). Boshqasini tanlang.',
  PIN_NOTOGRI: 'PIN noto‘g‘ri',
  ESKI_PIN_KERAK: 'Eski PIN kerak (yoki qayta kirib, 10 daqiqa ichida almashtiring).',
  BLOKLANGAN: 'Juda ko‘p urinish. 15 daqiqadan keyin urinib ko‘ring.',
  QAYTA_KIRISH_KERAK: 'Xavfsizlik uchun tizimga qayta kiring.',
  STEP_UP_KERAK: 'Avval PIN yoki biometrik bilan tasdiqlang.',
  QULF_YOQ: 'Xavfsizlik moduli hali yoqilmagan.',
  BEKOR: 'Bekor qilindi',
};
const xabarOl = (r: QulfJavob) => (r.code && XATO[r.code] ? t(XATO[r.code]) : r.error ? t(r.error) : t('Amalni bajarib bo‘lmadi. Qayta urinib ko‘ring.'));
const VAQTLAR = [1, 2, 5, 10, 15, 30, 60];
const pinMaydon = (v: string) => v.replace(/\D/g, '').slice(0, PIN_MAX);

export function QulfBolimi() {
  const { yangila: tashqiYangila } = useQulf();
  const k = useKompaniya();
  const [h, setH] = useState<QulfHolatJavob | null>(null);
  const [yuk, setYuk] = useState(true);
  const [eski, setEski] = useState(''); const [yangi, setYangi] = useState(''); const [takror, setTakror] = useState('');
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ tur: 'info' | 'danger'; matn: string } | null>(null);
  const [bio, setBio] = useState(false);
  const [rejim, setRejim] = useState<string>('pin');

  const yukla = useCallback(async () => {
    const r = await qulfSoz<QulfHolatJavob>('holat');
    setH(r.ok ? r : null); setYuk(false);
    if (r.ok) void tashqiYangila();
  }, [tashqiYangila]);
  useEffect(() => { void yukla(); void platformBiometrikBormi().then(setBio); }, [yukla]);

  const kid = k.globalRejim ? null : (k.joriy?.id ?? null);
  const rahbar = !!kid && (k.superadmin || (k.joriy?.permissions ?? []).includes('control.company.write'));
  useEffect(() => { if (kid && rahbar) void qulfSoz<QulfJavob & { rejim?: string }>('siyosat_ol', { kompaniya_id: kid }).then((r) => { if (r.ok && r.rejim) setRejim(r.rejim); }); }, [kid, rahbar]);

  const ish = async (amal: string, body: Record<string, unknown>, ok: string) => {
    setBand(true); setXabar(null);
    const r = await qulfSoz(amal, body);
    setBand(false);
    if (r.ok) { setXabar({ tur: 'info', matn: t(ok) }); await yukla(); return true; }
    setXabar({ tur: 'danger', matn: xabarOl(r) });
    return false;
  };

  const pinSaqla = async () => {
    if (yangi !== takror) { setXabar({ tur: 'danger', matn: t('PIN lar bir xil emas.') }); return; }
    if (await ish('pin_saqla', { yangi, ...(h?.pin_bor && eski ? { eski } : {}) }, 'PIN saqlandi.')) { setEski(''); setYangi(''); setTakror(''); }
  };
  const pinOchir = async () => { if (await ish('pin_ochir', { pin: eski }, 'PIN o‘chirildi.')) setEski(''); };
  const qurilmaQosh = async () => {
    setBand(true); setXabar(null);
    const r = await passkeyQosh(navigator.userAgent.includes('Windows') ? 'Windows Hello' : navigator.userAgent.includes('Android') ? 'Android' : 'Brauzer');
    setBand(false);
    if (r.ok) { setXabar({ tur: 'info', matn: t('Biometrik qurilma qo‘shildi.') }); await yukla(); } else setXabar({ tur: 'danger', matn: xabarOl(r) });
  };
  const sozlash = pinTayyorForma(yangi, takror);

  if (yuk) return <Skelet qatorlar={4} />;
  if (!h) return <Nota tur="warn">{t('Xavfsizlik moduli hozircha mavjud emas.')}</Nota>;

  return (
    <div className="flex flex-col gap-4">
      {xabar && <Nota tur={xabar.tur}>{xabar.matn}</Nota>}
      <Karta sarlavha="PIN kod" tavsif="Pul va imzoga tegishli amallar hamda qulflangan ilovani ochish uchun 4–6 raqamli PIN.">
        <Qator yorliq="Holat" qiymat={h.pin_bor ? t('O‘rnatilgan') : t('O‘rnatilmagan')} />
        {h.pin_bor && <Maydon2 yorliq="Eski PIN (almashtirish/o‘chirish uchun)">
          <input className={INPUT_SINF} style={INPUT_STIL} type="password" inputMode="numeric" autoComplete="off" value={eski} maxLength={PIN_MAX} onChange={(e) => setEski(pinMaydon(e.target.value))} />
        </Maydon2>}
        <Maydon2 yorliq="Yangi PIN">
          <input className={INPUT_SINF} style={INPUT_STIL} type="password" inputMode="numeric" autoComplete="new-password" value={yangi} maxLength={PIN_MAX} onChange={(e) => setYangi(pinMaydon(e.target.value))} />
        </Maydon2>
        <Maydon2 yorliq="PIN ni takrorlang">
          <input className={INPUT_SINF} style={INPUT_STIL} type="password" inputMode="numeric" autoComplete="new-password" value={takror} maxLength={PIN_MAX} onChange={(e) => setTakror(pinMaydon(e.target.value))} />
        </Maydon2>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="fz-btn fz-btn--primary" disabled={band || !sozlash} onClick={() => void pinSaqla()}><KeyRound size={14} aria-hidden="true" /> {h.pin_bor ? t('PIN ni almashtirish') : t('PIN o‘rnatish')}</button>
          {h.pin_bor && <button type="button" className="fz-btn" disabled={band || eski.length < PIN_MIN} onClick={() => void pinOchir()}>{t('PIN ni o‘chirish')}</button>}
        </div>
        {h.pin_holat === 'BLOKLANGAN' && <Nota tur="warn">{t('Juda ko‘p urinish. 15 daqiqadan keyin urinib ko‘ring.')}</Nota>}
        {h.pin_holat === 'QAYTA_KIRISH_KERAK' && <Nota tur="warn">{t('Xavfsizlik uchun tizimga qayta kiring.')}</Nota>}
      </Karta>

      <Karta sarlavha="Biometrik (Windows Hello, barmoq izi, Face ID)" tavsif="Qurilmangizning biometrik tasdig‘i bilan ochish va imzolash. Biometrik ma’lumot qurilmadan chiqmaydi.">
        {(h.kalitlar ?? []).length === 0 && <Qator yorliq="Qurilmalar" qiymat={t('Hali qo‘shilmagan')} />}
        {(h.kalitlar ?? []).map((q) => (
          <div key={q.id} className="flex items-center gap-3 border-b border-[var(--border)] last:border-0 py-2">
            {q.tur === 'android' ? <Smartphone size={16} aria-hidden="true" /> : <Fingerprint size={16} aria-hidden="true" />}
            <span className="flex-1 min-w-0 text-[13px] break-words">{q.nom || (q.tur === 'android' ? t('Android ilova') : t('Brauzer'))}
              <span className="block text-[11px] text-text-dim">{t('Qo‘shilgan')}: {new Date(q.yaratildi).toLocaleDateString()}{q.oxirgi ? ` · ${t('Oxirgi')}: ${new Date(q.oxirgi).toLocaleDateString()}` : ''}</span></span>
            <button type="button" className="fz-btn fz-btn--sm" aria-label={t('Qurilmani o‘chirish')} disabled={band} onClick={() => void ish('kalit_ochir', { id: q.id }, 'Qurilma o‘chirildi.')}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
        ))}
        {bio ? <div><button type="button" className="fz-btn" disabled={band} onClick={() => void qurilmaQosh()}><Fingerprint size={14} aria-hidden="true" /> {t('Shu qurilmani qo‘shish')}</button></div>
          : <Nota tur="info">{t('Bu qurilma/brauzerda biometrik qo‘llab-quvvatlanmaydi. PIN dan foydalaning.')}</Nota>}
      </Karta>

      <Karta sarlavha="Avtomatik qulf" tavsif="Belgilangan vaqt harakatsiz qolsa yoki oyna yashirin tursa, ilova PIN/biometrik so‘raydi.">
        <Maydon2 yorliq="Daqiqa (1–60)">
          <select className={INPUT_SINF} style={INPUT_STIL} value={h.bosh_vaqt_daq ?? 10} disabled={band || !(h.pin_bor || (h.kalitlar ?? []).length > 0)}
            onChange={(e) => void ish('vaqt_saqla', { daq: Number(e.target.value) }, 'Saqlandi.')}>
            {[...new Set([...VAQTLAR, h.bosh_vaqt_daq ?? 10])].filter((x) => x >= BOSH_MIN_DAQ && x <= BOSH_MAX_DAQ).sort((a, b) => a - b).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Maydon2>
        {!(h.pin_bor || (h.kalitlar ?? []).length > 0) && <Nota tur="info">{t('Avtomatik qulf PIN yoki biometrik sozlangandan keyin ishlaydi.')}</Nota>}
      </Karta>

      {rahbar && kid && (
        <Karta sarlavha="Kompaniya siyosati: pul va imzo tasdig‘i" tavsif="Pul, to‘lov, imzo va hujjat tasdig‘i amallarida qaysi usul talab qilinadi. Standart — PIN o‘rnatgan har kim uchun PIN.">
          <Maydon2 yorliq="Talab">
            <select className={INPUT_SINF} style={INPUT_STIL} value={rejim} disabled={band}
              onChange={(e) => { const v = e.target.value; void ish('siyosat_saqla', { kompaniya_id: kid, rejim: v }, 'Saqlandi.').then((ok) => { if (ok) setRejim(v); }); }}>
              <option value="off">{t('O‘chirilgan')}</option>
              <option value="pin">{t('Faqat PIN')}</option>
              <option value="biometric_or_pin">{t('Biometrik yoki PIN')}</option>
            </select>
          </Maydon2>
        </Karta>
      )}
    </div>
  );
}

/** Maydon render-prop (id, aria-*) ni bitta input/select elementiga ulaydi. */
function Maydon2({ yorliq, children }: { yorliq: string; children: ReactElement }) {
  return <Maydon yorliq={yorliq}>{(p) => cloneElement(children, p)}</Maydon>;
}

function pinTayyorForma(yangi: string, takror: string) { return yangi.length >= PIN_MIN && yangi.length <= PIN_MAX && takror.length >= PIN_MIN; }
