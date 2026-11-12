/** Podval qatorlarining ichki kalitlari (tr_ob, prochie, nds ...) o'rniga foydalanuvchi o'qiydigan nomlar. Noma'lum kalit — o'zi. */
const YORLIQ: Record<string, string> = {
  tr_mat: 'Transport (material)', skl_mat: 'Ombor-zagotovka (material)', tr_kab: 'Transport (kabel)', itogo1: 'Jami 1',
  prochie: 'Boshqa xarajatlar', itogo2: 'Jami 2', tr_ob: 'Transport (uskuna)', zag_ob: 'Zagotovka (uskuna)', itogo3: 'Jami 3',
  strax: 'Sug‘urta', risk: 'Xavf', itogo4: 'Jami 4', nds: 'QQS', vsego: 'Jami to‘lovga',
};

export const podvalYorliq = (kalit: string): string => YORLIQ[kalit] ?? kalit;
