import { describe, expect, it } from 'vitest';
import { SAHIFALAR } from '../../reestr/sahifa';
import { NIYAT_OQIMLARI, QAMROV, QAMROV_BOSHLIQLARI, jarvisQamrovi } from './qamrov';
import { VOSITALAR } from './reestr';

describe('VOSITA QAMROVI — reestrdagi har sahifa uchun «Jarvis bu yerda nima qila oladi»', () => {
  it('har sahifa qamrov jadvalida bor (yangi sahifa qo‘shilsa — qamrov.ts ga qator qo‘shing)', () => {
    const yoq = SAHIFALAR.map((s) => s.kalit).filter((k) => !QAMROV[k]);
    expect(yoq, `Qamrov yo‘q sahifalar: ${yoq.join(', ')} — vosita/qamrov.ts ga qila (vosita id) va sahifada (hali qo‘lda qoladigan yozuv amallari) ni yozing`).toEqual([]);
  });
  it('jadvalda reestrda yo‘q (eskirgan) sahifa yo‘q', () => {
    const bor = new Set(SAHIFALAR.map((s) => s.kalit));
    expect(Object.keys(QAMROV).filter((k) => !bor.has(k))).toEqual([]);
  });
  it('havola qilingan vosita/niyat id lari mavjud; har sahifa kamida ochiladi (navigatsiya)', () => {
    const idlar = new Set<string>([...VOSITALAR.map((v) => v.id), ...NIYAT_OQIMLARI]);
    for (const [k, v] of Object.entries(QAMROV)) {
      expect(v.qila, k).toContain('niyat:navigatsiya');
      for (const id of v.qila) expect(idlar.has(id), `${k}: noma’lum vosita ${id}`).toBe(true);
      for (const s of v.sahifada) expect(s.trim().length, `${k}: bo‘sh bo‘shliq matni`).toBeGreaterThan(3);
    }
  });
  it('har vosita (yoq dan tashqari) kamida bitta sahifada ko‘rsatilgan — isrof bo‘lmasin', () => {
    const ishlatilgan = new Set(Object.values(QAMROV).flatMap((v) => v.qila));
    expect(VOSITALAR.map((v) => v.id).filter((id) => id !== 'yoq' && !ishlatilgan.has(id))).toEqual([]);
  });
  it('yozuv amali bor sahifa «sahifada» ro‘yxatida halol ko‘rsatilgan; yordamchi ishlaydi', () => {
    expect(jarvisQamrovi('f2-tarix')?.qila).toContain('f2_tasdiqla');
    expect(jarvisQamrovi('yoq-sahifa')).toBeNull();
    expect(QAMROV_BOSHLIQLARI().length).toBeGreaterThan(10);
  });
});
