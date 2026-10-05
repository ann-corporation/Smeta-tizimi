export const APP_TITLE = 'SMETA TIZIM 02';
const titles: Array<[RegExp, string]> = [
  [/^\/admin\/storage(?:\/|$)/, 'Fayl saqlash'], [/^\/admin\/(?:test\/)?saqlash(?:\/|$)/, 'Fayl saqlash'],
  [/^\/admin\/mindmap(?:\/|$)/, 'Mindmap'], [/^\/admin\/(?:test\/)?xarita(?:\/|$)/, 'Mindmap'],
  [/^\/admin\/zakazchik(?:\/|$)/, 'Buyurtmachi kabineti'], [/^\/admin\/taqdimlar(?:\/|$)/, 'Tomonlar hujjatlari'], [/^\/admin\/aloqalar(?:\/|$)/, 'Tomonlar aloqasi'],
  [/^\/admin\/participants(?:\/|$)/, 'Loyiha ishtirokchilari'], [/^\/admin\/(?:system-control|control)(?:\/|$)/, 'Tizim boshqaruv markazi'],
  [/^\/admin\/documents(?:\/|$)/, 'Hujjatlar'], [/^\/admin\/sayt-xaritasi(?:\/|$)/, 'Sayt xaritasi'], [/^\/admin\/dashboard(?:\/|$)/, 'Rahbar paneli'],
  [/^\/admin\/obyektlar(?:\/|$)/, 'Loyihalar va obyektlar'],
  [/^\/admin\/holat(?:\/|$)/, 'PTO workbench'], [/^\/admin\/fakt(?:\/|$)/, 'Fakt'],
  [/^\/admin\/f2-tayyorlash(?:\/|$)/, 'F2 tayyorlash'], [/^\/admin\/f2(?:\/|$)/, 'F2 import'],
  [/^\/admin\/f2-tarix(?:\/|$)/, 'F2 tarixi'], [/^\/admin\/hujjat-nazorat(?:\/|$)/, 'Nakopitelniy / hujjat nazorati'],
  [/^\/admin\/narxlar(?:\/|$)/, 'Narxlar nazorati'], [/^\/admin\/fayl-boglash(?:\/|$)/, 'Sinxronizatsiya'],
  [/^\/admin\/kompaniya(?:\/|$)/, 'Kompaniya va a\'zolik'],
  [/^\/admin(?:\/|$)/, 'Rahbar paneli'],
];
export function titleForPath(pathname: string): string { const match = titles.find(([pattern]) => pattern.test(pathname)); return match ? `${match[1]} | ${APP_TITLE}` : APP_TITLE; }
