import { kalit } from './matn';
import type { Dalil, Ishonch, Manzil, Sarlavha, SarlavhaTuri } from './turlar';

/**
 * RZ yo'li quruvchi. Hozirgi tizim sarlavhalarni tekis oladi — ketma-ket
 * `ОЗЕРА → КАНАЛ 1 → КЖ` dan faqat oxirgisi qolardi. Bu yerda har sarlavha
 * stekka joylanadi va hech biri tashlab yuborilmaydi.
 *
 * Dalillar (kontrakt §5):
 *  D1 kalit so'z darajasi: СМЕТА № (lokal) > РАЗДЕЛ (razdel)
 *  D2 raqam prefiksi chuqurligi: 1. / 1.1. / 1.1.1.
 *  D3 raqamlash qayta boshlanishi: 3.2. ostida 1. → ichki sxema
 *  D4 ketma-ket sarlavhalar (orada ish yo'q) → har keyingisi bola
 *  D5 yopuvchi jami: ИТОГО ПО РАЗДЕЛУ / ПО СМЕТЕ
 */

type Tur = 'kalit' | 'raqam' | 'harf' | 'oddiy';

interface StekBandi {
  s: Sarlavha;
  tur: Tur;
  /** Kalit so'zli: obyekt 1, lokal 2, razdel 3. Boshqalar: ota darajasi + 0.5. */
  rang: number;
  /** raqam: [3,2] ("3.2."); harf: [3] ("В)"). */
  segs: number[];
  /** "5." sarlavhasi manbada yo'q, "5.2." bor — u 1-darajada 5 ning vakili. */
  yetim?: boolean;
  /** Oddiy sarlavha, darhol ostida yana sarlavha kelgan — guruh ochuvchi. */
  guruh?: boolean;
}

const HARFLAR = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

export interface SarlavhaTahlili {
  tur: Tur;
  sarlavhaTuri: SarlavhaTuri;
  rang: number;
  segs: number[];
  belgi: string | null;
}

/** Sarlavha matnining shakli. Matn o'zgartirilmaydi — faqat o'qiladi. */
export function sarlavhaniTahlilQil(xomMatn: string): SarlavhaTahlili {
  const k = kalit(xomMatn);
  const razdel = k.match(/^(РАЗДЕЛ|БЎЛИМ|BO.?LIM)\s*(\d+)?\s*[:.]?\s*(.*)$/);
  const tana = razdel ? razdel[3] : k;
  const razdelBelgi = razdel ? (razdel[2] ? `${razdel[1]} ${razdel[2]}` : razdel[1]) : null;
  if (/^(ЛОКАЛЬНАЯ |ОБЪЕКТНАЯ )?СМЕТА\s*№/.test(tana)) {
    return { tur: 'kalit', sarlavhaTuri: 'lokal', rang: 2, segs: [], belgi: razdelBelgi };
  }
  if (/^ОБЪЕКТ\s*(№|:)/.test(tana)) {
    return { tur: 'kalit', sarlavhaTuri: 'obyekt', rang: 1, segs: [], belgi: null };
  }
  if (razdel) {
    return { tur: 'kalit', sarlavhaTuri: 'razdel', rang: 3, segs: [], belgi: razdelBelgi };
  }
  const raqam = k.match(/^((?:\d+\.)+)(?=\s*\S)/) ?? k.match(/^(\d+(?:\.\d+)*\))(?=\s*\S)/);
  if (raqam) {
    const segs = raqam[1].replace(/[.)]$/, '').split('.').map(Number);
    return { tur: 'raqam', sarlavhaTuri: 'blok', rang: 0, segs, belgi: raqam[1] };
  }
  const harf = k.match(/^([А-ЯA-Z])\)\.?(?=\s*\S)/);
  if (harf) {
    const i = HARFLAR.indexOf(harf[1]);
    const n = i >= 0 ? i + 1 : harf[1].charCodeAt(0) - 64;
    return { tur: 'harf', sarlavhaTuri: 'blok', rang: 0, segs: [n], belgi: harf[0].replace(/\.$/, '') };
  }
  return { tur: 'oddiy', sarlavhaTuri: 'blok', rang: 0, segs: [], belgi: null };
}

function dalil(qoida: string, ishonch: Ishonch, izoh: string): Dalil {
  return { qoida, ishonch, izoh };
}

export class IerarxiyaQuruvchi {
  readonly sarlavhalar: Sarlavha[] = [];
  private stek: StekBandi[] = [];
  private oxirgiQatorSarlavha = false;
  private yetimKeyingi = false;
  private keyingiId: number;

  constructor(boshId = 1) {
    this.keyingiId = boshId;
  }

  /** Stek tepasidagi sarlavha id si — joriy ish shu ostiga tushadi. */
  get joriy(): number | null {
    return this.stek.length ? this.stek[this.stek.length - 1].s.id : null;
  }

  /** Ildizga majburiy sarlavha (titul: obyekt/lokal). Ish daraxtidan oldin chaqiriladi. */
  ildizQosh(xomMatn: string, tur: SarlavhaTuri, manzil: Manzil, izoh: string): Sarlavha {
    const rang = tur === 'qurilish' ? 0 : tur === 'obyekt' ? 1 : tur === 'lokal' ? 2 : 3;
    return this.joyla(xomMatn, tur, null, manzil, { tur: 'kalit', rang, segs: [] }, [dalil('titul', 'yuqori', izoh)]);
  }

  /**
   * Varaq ichida yangi lokal smeta boshlandi (bitta varaqda КЖ, АР, ВК, ОВ ketma-ket — Prime Towers 2026-10-17):
   * oldingi lokal va uning bo'limlari yopiladi, yangisi u bilan bir darajada (obyekt bo'lsa — uning ostida).
   */
  lokalQosh(xomMatn: string, manzil: Manzil, izoh: string): Sarlavha {
    while (this.stek.length && this.tepa().rang >= 2) this.stek.pop();
    const s = this.joyla(xomMatn, 'lokal', null, manzil, { tur: 'kalit', rang: 2, segs: [] }, [dalil('D1', 'yuqori', izoh)]);
    this.oxirgiQatorSarlavha = true;
    return s;
  }

  /** Ish yoki resurs qatori o'tdi — D4 (ketma-ketlik) uzildi. */
  ishKeldi(): void {
    this.oxirgiQatorSarlavha = false;
  }

  /** D5: ИТОГО ПО РАЗДЕЛУ / ПО СМЕТЕ — tegishli darajani yopadi. */
  jamiKeldi(xomMatn: string): void {
    const k = kalit(xomMatn);
    const rang = /ПО РАЗДЕЛУ/.test(k) ? 3 : /ПО (ЛОКАЛЬНОЙ )?СМЕТЕ/.test(k) ? 2 : null;
    if (rang == null) return;
    const i = this.stek.map((b) => b.tur === 'kalit' && b.rang === rang).lastIndexOf(true);
    if (i >= 0) this.stek.length = i;
    this.oxirgiQatorSarlavha = false;
  }

  /**
   * @param keyingisiSarlavha keyingi to'liq qator ham sarlavhami (lookahead) —
   *   bo'lsa, bu sarlavha guruh ochuvchi: ishlardan keyin kelsa avvalgi guruhning
   *   qo'shnisi bo'ladi, oxirgi bargning emas (MAF "zinapoya" xatosi).
   */
  sarlavha(xomMatn: string, manzil: Manzil, keyingisiSarlavha = false): Sarlavha {
    const t = sarlavhaniTahlilQil(xomMatn);
    const ketmaKet = this.oxirgiQatorSarlavha;
    let dalillar: Dalil[] = [];

    if (t.tur === 'kalit') {
      // D1: o'zidan past yoki teng darajalarni yopadi; yuqoriroq (masalan ketma-ket
      // kelgan oddiy sarlavha "КЛ-0,4КВТ, УЧАСТОК №1") ota bo'lib qoladi.
      while (this.stek.length && this.tepa().rang >= t.rang) this.stek.pop();
      // Prime Towers ЭС (2026-10-24): «ЩК-3» oddiy sarlavhasi ostida ishlar o'tgach kelgan «РАЗДЕЛ 1. …» — ЩК-3 ning
      // bolasi emas, qo'shnisi. Guruh ochuvchi oddiy sarlavha (darhol ostida sarlavha kelgan: «КЛ-0,4КВТ, УЧАСТОК №1»)
      // va ketma-ket kelgan sarlavha esa ota bo'lib qoladi (yuqoridagi holat).
      if (!ketmaKet && t.sarlavhaTuri === 'razdel') {
        while (this.stek.length && this.tepa().tur === 'oddiy' && !this.tepa().guruh) this.stek.pop();
      }
      dalillar = [dalil('D1', 'yuqori', `kalit so'z: ${t.sarlavhaTuri}`)];
    } else if (t.tur === 'raqam') {
      dalillar = this.raqamliJoy(t.segs);
    } else if (t.tur === 'harf') {
      dalillar = this.harfliJoy(t.segs[0]);
    } else if (ketmaKet) {
      dalillar = [dalil('D4', 'yuqori', "oldingi qator ham sarlavha — ichki daraja")];
    } else {
      const g = keyingisiSarlavha ? this.oxirgiGuruh() : -1;
      const i = g >= 0 ? g : this.oxirgiOddiy();
      if (g >= 0) {
        this.stek.length = g;
        dalillar = [dalil('D4', 'orta', "guruh sarlavhasi — oldingi guruhning qo'shnisi")];
      } else if (i >= 0) {
        this.stek.length = i;
        dalillar = [dalil('D4', 'orta', "ishlardan keyin — oldingi raqamsiz sarlavhaning qo'shnisi")];
      } else {
        dalillar = [dalil('D4', 'orta', 'ishlardan keyin — joriy bo‘limning ichki sarlavhasi')];
      }
    }
    const s = this.joyla(xomMatn, t.sarlavhaTuri, t.belgi, manzil, t, dalillar);
    if (keyingisiSarlavha && t.tur === 'oddiy') this.tepa().guruh = true;
    this.oxirgiQatorSarlavha = true;
    return s;
  }

  /** Stekda (kalit/raqamli chegaradan o'tmay) eng yuqoridagi guruh ochuvchi oddiy sarlavha. */
  private oxirgiGuruh(): number {
    for (let i = this.stek.length - 1; i >= 0; i--) {
      const b = this.stek[i];
      if (b.tur !== 'oddiy') return -1;
      if (b.guruh) return i;
    }
    return -1;
  }

  private tepa(): StekBandi {
    return this.stek[this.stek.length - 1];
  }

  /** Stek tepasi raqamsiz (oddiy) sarlavha bo'lsa — uning indeksi, aks holda -1. */
  private oxirgiOddiy(): number {
    return this.stek.length && this.tepa().tur === 'oddiy' ? this.stek.length - 1 : -1;
  }

  private raqamliJoy(segs: number[]): Dalil[] {
    const d = segs.length;
    const teng = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    if (d > 1) {
      const ota = segs.slice(0, -1);
      const oi = this.qidir((b) => b.tur === 'raqam' && teng(b.segs, ota));
      if (oi >= 0) {
        this.stek.length = oi + 1;
        return [dalil('D2', 'yuqori', `ota raqam ${ota.join('.')}. topildi`)];
      }
      const qi = this.qidir((b) => b.tur === 'raqam' && b.segs.length === d && teng(b.segs.slice(0, -1), ota));
      if (qi >= 0) {
        this.stek.length = qi;
        return [dalil('D2', 'yuqori', `qo'shni ${ota.join('.')}.x topildi`)];
      }
      // Ota sarlavha manbada yo'q ("5." siz "5.2."): o'sha darajadagi eng yaqin
      // kichik qo'shni ("4.") yoniga qo'yiladi va 5 ning vakili bo'ladi.
      if (d === 2) {
        const qoshni = this.birDarajaliNomzod(ota[0], 'raqam');
        if (qoshni) {
          this.stek.length = qoshni.i;
          this.yetimKeyingi = true;
          return [dalil('D2', 'past', `ota sarlavha ${ota.join('.')}. manbada topilmadi — ${qoshni.qiymat}. bilan bir darajada`)];
        }
      }
      const si = this.qidir((b) => b.tur === 'raqam' && b.segs.length === d - 1);
      if (si >= 0) {
        this.stek.length = si;
        return [dalil('D2', 'past', `ota sarlavha ${ota.join('.')}. manbada topilmadi`)];
      }
      return [dalil('D3', 'orta', 'yangi ko‘p darajali raqamlash — joriy sarlavha ostida')];
    }
    return this.birDarajali(segs[0], 'raqam');
  }

  private harfliJoy(n: number): Dalil[] {
    return this.birDarajali(n, 'harf');
  }

  /** Stekdagi 1-darajali raqam/harf sarlavhalar (yetim "5.2." ham 5 sifatida). */
  private birDarajalilar(tur: 'raqam' | 'harf'): Array<{ i: number; qiymat: number }> {
    return this.stek
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.tur === tur && (b.segs.length === 1 || b.yetim))
      .map(({ b, i }) => ({ i, qiymat: b.segs[0] }));
  }

  /** n dan kichik, eng kichik oraliqli 1-darajali nomzod (n=1 uchun yo'q). */
  private birDarajaliNomzod(n: number, tur: 'raqam' | 'harf'): { i: number; qiymat: number } | null {
    if (n === 1) return null;
    return this.birDarajalilar(tur)
      .filter((x) => n > x.qiymat)
      .sort((a, b) => (n - a.qiymat) - (n - b.qiymat))[0] ?? null;
  }

  /** 1-darajali raqam/harf: +1 davomi → qo'shni; eng kichik oraliq → qo'shni; aks holda ichki sxema. */
  private birDarajali(n: number, tur: 'raqam' | 'harf'): Dalil[] {
    const nomzodlar = this.birDarajalilar(tur);
    const davom = [...nomzodlar].reverse().find((x) => x.qiymat + 1 === n);
    if (davom) {
      this.stek.length = davom.i;
      return [dalil('D2', 'yuqori', `${n} — ${davom.qiymat} ning davomi`)];
    }
    const tepadagi = nomzodlar[nomzodlar.length - 1];
    if (tepadagi && tepadagi.qiymat === n) {
      this.stek.length = tepadagi.i;
      return [dalil('D2', 'past', `takroriy raqam ${n} — qo'shni deb olindi`)];
    }
    const kattaroq = this.birDarajaliNomzod(n, tur);
    if (kattaroq) {
      this.stek.length = kattaroq.i;
      return [dalil('D2', 'orta', `${n} — ${kattaroq.qiymat} dan keyin (oradagi raqam manbada yo'q)`)];
    }
    return [dalil('D3', n === 1 ? 'yuqori' : 'past', n === 1
      ? 'raqamlash 1 dan qayta boshlandi — ichki daraja'
      : `raqamlash ${n} dan boshlandi — ichki daraja`)];
  }

  private qidir(f: (b: StekBandi) => boolean): number {
    for (let i = this.stek.length - 1; i >= 0; i--) if (f(this.stek[i])) return i;
    return -1;
  }

  private joyla(
    xomMatn: string, tur: SarlavhaTuri, belgi: string | null, manzil: Manzil,
    t: { tur: Tur; rang: number; segs: number[] }, dalillar: Dalil[],
  ): Sarlavha {
    const ota = this.stek.length ? this.tepa() : null;
    const rang = t.tur === 'kalit' ? t.rang : (ota?.rang ?? 0) + 0.5;
    const s: Sarlavha = {
      id: this.keyingiId++,
      ota: ota?.s.id ?? null,
      daraja: this.stek.length + 1,
      tur, xom: xomMatn, belgi, manzil, dalil: dalillar,
    };
    this.sarlavhalar.push(s);
    this.stek.push({ s, tur: t.tur, rang, segs: t.segs, ...(this.yetimKeyingi ? { yetim: true } : {}) });
    this.yetimKeyingi = false;
    return s;
  }
}

/** Ildizdan berilgan sarlavhagacha yo'l. */
export function sarlavhaYoli(sarlavhalar: readonly Sarlavha[], id: number | null): Sarlavha[] {
  const byId = new Map(sarlavhalar.map((s) => [s.id, s]));
  const yol: Sarlavha[] = [];
  let joriy = id == null ? undefined : byId.get(id);
  while (joriy) {
    yol.unshift(joriy);
    joriy = joriy.ota == null ? undefined : byId.get(joriy.ota);
  }
  return yol;
}
