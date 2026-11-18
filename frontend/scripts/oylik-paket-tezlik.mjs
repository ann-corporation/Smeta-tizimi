// Oylik paket: ochilish va yig'ish vaqti - MODEL (mock kechikishlar bilan), "avval" va "keyin" oqimlari aynan sahifa kodidagi tartibda.
// Kechikish doimiylari - taxminiy (haqiqiy emas): aniq son emas, QAYTA CHAQIRUVLAR SONI va tartib (ketma-ket/parallel) farqini ko'rsatadi.
// Ishga tushirish: node scripts/oylik-paket-tezlik.mjs
const MS = { rtt: 150, obyektOqish: 5000, aktSummasi: 300, f2Dvigatel: 2000, obyektHujjatlari: 6000, tokenChaqiruv: 300 };
const OBYEKT = 8, AKT = 40, TANLANGAN = 24, OBYEKT_HUJJAT_TURI = 4;
const SCALE = 20; // 20x tezlashtirilgan soat (natija qayta ko'paytiriladi)
const uyqu = (ms) => new Promise((r) => setTimeout(r, ms / SCALE));
let chaqiruv = 0;
const chaqir = async (ms) => { chaqiruv++; await uyqu(ms); };
async function parallel(n, soni, ish) { let k = 0; await Promise.all(Array.from({ length: Math.min(n, soni) }, async () => { while (k < soni) { const i = k++; await ish(i); } })); }
async function olc(nom, f) { chaqiruv = 0; const t0 = performance.now(); const x = await f(); const dt = (performance.now() - t0) * SCALE; return { nom, soniya: +(dt / 1000).toFixed(1), chaqiruv, ...x }; }

// AVVAL: ochilish = har obyektning to'liq smetasi + F2 tafsilot + podval (3 parallel) va har obyekt uchun alohida fakt / M-29 so'rovlari (ketma-ket).
const avvalOchilish = () => olc('AVVAL ochilish (summalar to\'liq chiqquncha)', async () => {
  const yuk = parallel(3, OBYEKT, async () => { await Promise.all([chaqir(MS.obyektOqish), chaqir(MS.rtt), chaqir(MS.rtt), chaqir(MS.rtt), chaqir(MS.rtt)]); });
  const bayroq = (async () => { for (let i = 0; i < OBYEKT; i++) await Promise.all([chaqir(MS.rtt + 200), chaqir(MS.rtt + 200)]); })();
  await Promise.all([yuk, bayroq]);
  return { ishlatsaBoladi: 'summalar chiqqanda' };
});
// KEYIN: bitta oylik so'rov (bayroqlar) + akt summalari serverdan (3 aktdan, 4 parallel); sahifa birinchi so'rovdan keyin ishlaydi.
const keyinOchilish = () => olc('KEYIN ochilish', async () => {
  const t0 = performance.now(); await chaqir(MS.rtt + 150);
  const birinchi = (performance.now() - t0) * SCALE;
  const bolak = Math.ceil(AKT / 3);
  await parallel(4, bolak, async () => chaqir(3 * MS.aktSummasi));
  return { ishlatsaBoladi: `${(birinchi / 1000).toFixed(1)} s dan keyin (summalar jarayon bilan to'lib boradi)` };
});
// AVVAL: yig'ish - F2 lar va obyekt hujjatlari ketma-ket, har hujjat uchun alohida token chaqiruvi.
const avvalYigish = () => olc('AVVAL yig\'ish', async () => {
  for (let i = 0; i < TANLANGAN; i++) await chaqir(MS.f2Dvigatel);
  for (let i = 0; i < OBYEKT; i++) { await chaqir(MS.obyektHujjatlari); for (let j = 0; j < OBYEKT_HUJJAT_TURI; j++) await chaqir(MS.tokenChaqiruv); }
  for (let i = 0; i < 4; i++) await chaqir(MS.tokenChaqiruv); // reestr, F3, sverka, mundarija
  return {};
});
const keyinYigish = () => olc('KEYIN yig\'ish', async () => {
  await parallel(4, TANLANGAN, async () => chaqir(MS.f2Dvigatel));
  await parallel(4, OBYEKT, async () => chaqir(MS.obyektHujjatlari));
  await chaqir(MS.tokenChaqiruv); // BITTA paket tokeni
  return {};
});
for (const f of [avvalOchilish, keyinOchilish, avvalYigish, keyinYigish]) console.log(JSON.stringify(await f()));