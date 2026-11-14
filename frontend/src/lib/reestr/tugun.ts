/** MINDMAP TUGUN TURLARI (ekotizim V2 §2). Yozuvlar 11-qadamda; hozir faqat tur. */
export type TugunTur = {
  kalit: string;
  /** Tugun ochiladigan sahifa kaliti (Sahifa.kalit). */
  sahifa: string;
  /** Yaratish amali kaliti (Amal.kalit). */
  yaratAmal: string;
  /** Bog'lash amallari kalitlari. */
  bogAmal: readonly string[];
  /** Ota bo'lishi mumkin tugun turlari. */
  otaTurlari: readonly string[];
};

export const TUGUN_TURLARI: readonly TugunTur[] = [];
