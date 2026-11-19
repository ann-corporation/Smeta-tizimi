/** Test yordamchisi: yagona raqam formati NBSP (U+00A0) / ingichka NBSP (U+202F) ishlatadi; assertionlar oddiy probel bilan yoziladi. */
export const oddiyProbel = (s: string | null | undefined): string => (s ?? '').replace(/[  ]/g, ' ');
