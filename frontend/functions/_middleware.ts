import { eskiHostYonlantir } from './_shared/eski-host';

/** Domen ko'chishi: eski hostdagi brauzer sahifalari → qurai.uz (301); qolgan hamma narsa o'zgarmaydi. Qoidalar: _shared/eski-host.ts. */
export const onRequest: PagesFunction<{ PUBLIC_ORIGIN?: string; ESKI_HOST_YONLANTIRISH?: string }> = async (ctx) =>
  eskiHostYonlantir(ctx.request, ctx.env) ?? ctx.next();