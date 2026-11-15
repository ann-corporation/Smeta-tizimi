/** Global oflayn banner (DOM; React'dan mustaqil, `role=status`). Faqat native ko'prik bor bo'lganda o'rnatiladi. */
import { oflaynKorinish, oflaynObuna, type OflaynKorinish } from './holat';
import type { FaktNavbat } from './navbat';
import { t, tilLocale } from '../../i18n/til';

export function vaqtMatni(ms: number, hozir: number = Date.now()): string {
  const d = new Date(ms);
  const bugun = new Date(hozir);
  const bir = d.getFullYear() === bugun.getFullYear() && d.getMonth() === bugun.getMonth() && d.getDate() === bugun.getDate();
  const loc = tilLocale();
  const soat = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  return bir ? soat : `${d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' })} ${soat}`;
}

/** Banner matni (sof funksiya — testlanadi). */
export function bannerMatni(k: OflaynKorinish, hozir: number = Date.now()): { asosiy: string | null; navbat: string | null; sessiya: string | null } {
  const asosiy = k.oflayn
    ? (k.eskiMs != null
      ? t('Oflayn — ma’lumot {vaqt} holatiga. Fakt navbatga olinadi; F-2, imzo, to‘lov va import oflayn ishlamaydi.', { vaqt: vaqtMatni(k.eskiMs, hozir) })
      : t('Oflayn. Fakt navbatga olinadi; F-2, imzo, to‘lov va import oflayn ishlamaydi.'))
    : null;
  const navbat = k.navbat > 0 ? t('Navbatda (yuborilmagan): {n}', { n: k.navbat }) : null;
  const sessiya = k.toxtadi === 'sessiya' ? t('Navbatni yuborish uchun qayta kiring.') : null;
  return { asosiy, navbat, sessiya };
}

const USLUB = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:max-content;max-width:min(720px,calc(100vw - 24px));z-index:2147483000;padding:8px 14px;font:13px/1.4 system-ui,sans-serif;background:#fff3cc;color:#503b00;border:1px solid #bd922c;border-radius:6px;';

export function bannerQoy(doc: Document, navbat: FaktNavbat): () => void {
  const el = doc.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('data-oflayn-banner', '');
  el.style.cssText = USLUB;
  el.hidden = true;
  doc.body.append(el);

  const chiz = () => {
    const k = oflaynKorinish();
    const m = bannerMatni(k);
    const qismlar = [m.asosiy, m.navbat, m.sessiya].filter((x): x is string => !!x);
    el.replaceChildren();
    el.hidden = qismlar.length === 0 && k.nizolar.length === 0;
    if (qismlar.length) {
      const p = doc.createElement('div');
      p.textContent = qismlar.join(' · ');
      el.append(p);
    }
    for (const n of k.nizolar) {
      const q = doc.createElement('div');
      q.setAttribute('data-nizo', n.id);
      q.style.cssText = 'margin-top:4px;padding:4px 8px;background:#ffe1dd;color:#6b1a10;border:1px solid #c0584a;border-radius:4px';
      const matn = doc.createElement('span');
      matn.textContent = t('Server qabul qilmadi: {xato}. Yozuv o‘zgartirilmadi va jim ustidan yozilmaydi.', { xato: n.xato || n.kod || '—' }) + ' ';
      const qayta = doc.createElement('button');
      qayta.type = 'button';
      qayta.textContent = t('Qayta yuborish');
      qayta.onclick = () => { void navbat.qayta(n.id).then(() => navbat.yubor()); };
      const bekor = doc.createElement('button');
      bekor.type = 'button';
      bekor.textContent = t('Bekor qilish');
      bekor.style.marginLeft = '6px';
      bekor.onclick = () => { void navbat.bekor(n.id); };
      q.append(matn, qayta, bekor);
      el.append(q);
    }
  };
  const off = oflaynObuna(chiz);
  chiz();
  return () => { off(); el.remove(); };
}
