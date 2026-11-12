/* Domen arxitektura testlarining MEROS ro'yxatini (bugungi haqiqat) qayta yig'adi:
 *   node scripts/domen-meros-yigish.mjs
 * Faqat YANGI buzilishlar testni yiqitadi; meros ro'yxatini KENGAYTIRISH uchun egasining qarori va sabab kerak
 * (docs/architecture/DOMEN_SHARTNOMALARI.md). Ro'yxatni QISQARTIRISH (buzilish tuzatilganda) - erkin. */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buzilishlarniTop, katalogOqi } from '../src/lib/reestr/domen.sql-tahlil.ts';
import { egasi, PLATFORMA_SINKLAR, HISOB_YADRO_SQL, RUXSAT_MANBA_SQL, YOZISH_SABAB } from '../src/lib/reestr/domen.ts';

const ildiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const b = buzilishlarniTop(ildiz, { egasi, sinklar: PLATFORMA_SINKLAR, hisobYadro: HISOB_YADRO_SQL, ruxsatManba: RUXSAT_MANBA_SQL }, katalogOqi(ildiz));
const yozish = {};
for (const x of b.yozish) {
  const [f, t] = x.split('>');
  const a = egasi(f.replace(/_pre_\d{10,}$/, '')).domen, z = egasi(t).domen;
  yozish[x] = YOZISH_SABAB[a + '>' + z] ?? 'meros 2026-11-12: ' + a + ' -> ' + z + ' (sabab hali yozilmagan)';
}
const sabab = (m) => Object.fromEntries(m.map((x) => [x, 'meros 2026-11-12']));
const out = {
  sana: '2026-11-12',
  izoh: 'Bugungi haqiqat. Yangi buzilish testni yiqitadi. Faqat qisqartirish erkin.',
  yozish,
  pul: sabab(b.pul),
  rol: sabab(b.rol),
  idemsiz: Object.fromEntries(b.idemsiz.map((x) => [x, 'meros 2026-11-12: CAS (kutilgan_versiya) yoki tabiiy kalit bilan; operation_id qo\'shish tavsiya'])),
};
const yol = join(ildiz, 'frontend', 'src', 'lib', 'reestr', 'domen-meros.json');
writeFileSync(yol, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log('yozish', Object.keys(yozish).length, 'pul', b.pul.length, 'rol', b.rol.length, 'idemsiz', b.idemsiz.length, 'egasiz', b.egasiz.length, 'capsiz', b.capsiz.length);