import { NavLink } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { useModullar } from '../../api/t2-modul';
import { useTizimRuxsat } from '../../api/t2-tizim-xaritasi';
import { ishJoyiMenyu } from '../../lib/nav/ishJoyiMenyu';
import { menyuQur, menyuYollari, type NavKontekst } from '../../lib/nav/navFiltr';
import { SAHIFALAR } from '../../lib/reestr/sahifa';
import { ISH_JOYI_META } from '../../lib/reestr/ishJoyi';
import { rolTugmalari } from '../../lib/reestr/tomonProfil';
import { t } from '../../i18n/til';

/** «Bugun» tugmalari soni: rol profilidan 4–6 ta (profil kamroq bersa — ko'rinadigan sahifalardan to'ldiriladi). */
const MIN_TUGMA = 4;
const MAX_TUGMA = 6;

/**
 * «BUGUN» — rol bosh sahifasi (ekotizim V2, 2-qadam). Katta tugmalar rol profilidan (lib/reestr/tomonProfil.ts ROL_PROFILLARI),
 * faqat foydalanuvchiga ko'rinadigan sahifalar (navFiltr bilan bir xil filtr). Pastda — 7 ish joyiga tezkor o'tish va qidiruv.
 */
export default function Bugun() {
  const k = useKompaniya();
  const modullar = useModullar(k.globalRejim ? null : k.joriy?.id).data;
  const tizimRuxsat = useTizimRuxsat(true);
  const rol = k.superadmin ? 'superadmin' : (k.joriy?.rol ?? '');
  const navK: NavKontekst = { superadmin: !!k.superadmin, rol, permissions: k.joriy?.permissions, modullar, tizimXaritasi: tizimRuxsat.data?.ruxsat === true, ilova: 'hammasi' };
  const korinadi = new Set(menyuYollari(menyuQur(navK)));
  const tanlangan = rolTugmalari(rol === 'superadmin' ? 'admin' : rol)
    .map((kalit) => SAHIFALAR.find((s) => s.kalit === kalit))
    .filter((s): s is NonNullable<typeof s> => !!s && korinadi.has(s.yol) && s.yol !== '/admin/bugun');
  const tugmalar = tanlangan.slice(0, MAX_TUGMA);
  if (tugmalar.length < MIN_TUGMA) {
    for (const s of SAHIFALAR.slice().sort((a, b) => a.tartib - b.tartib)) {
      if (tugmalar.length >= MIN_TUGMA) break;
      if (s.yol !== '/admin/bugun' && s.holat === 'tayyor' && !s.qoshimcha && korinadi.has(s.yol) && !tugmalar.includes(s)) tugmalar.push(s);
    }
  }
  const ishJoylari = ishJoyiMenyu(navK).filter((b) => b.id !== 'bugun');

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6" data-testid="bugun">
      <h1 className="text-[20px] font-semibold text-text">{t('Bugun')}</h1>
      <p className="mt-1 text-sm text-text-dim">{t('Kunlik ishlaringiz — bir bosishda.')}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label={t('Asosiy ishlar')}>
        {tugmalar.map((s) => (
          <NavLink key={s.kalit} to={s.yol} role="listitem" className="karta flex min-h-[88px] flex-col justify-between p-4 transition-colors hover:border-accent">
            <span className="text-[16px] font-semibold text-text">{t(s.nom)}</span>
            <span className="text-[12px] text-text-dim">{t(ISH_JOYI_META[s.ishJoyi].nom)}</span>
          </NavLink>
        ))}
        {tugmalar.length === 0 && <p className="text-sm text-text-dim">{t('Hozircha sizga ochiq sahifa yo‘q.')}</p>}
      </div>

      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('palitra:och'))}
        className="mt-5 flex w-full items-center gap-2 rounded-md border border-border px-3 py-3 text-left text-sm text-text-dim hover:text-text">
        <Search size={16} aria-hidden="true" />
        <span>{t('Sahifa, amal, obyekt, shartnoma yoki hujjat izlash…')}</span>
      </button>

      {ishJoylari.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-text-mute">{t('Ish joylari')}</div>
          <div className="flex flex-wrap gap-2">
            {ishJoylari.map((b) => (
              <NavLink key={b.id} to={(b.bandlar[0] ?? b.yana[0]).yol} title={t(b.tavsif)} className="rounded-md border border-border px-3 py-2 text-sm text-text hover:border-accent">{t(b.nom)}</NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}