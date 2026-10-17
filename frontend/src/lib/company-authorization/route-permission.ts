import type { PermissionCode } from './effective-authorization';
export function routePermission(path:string):PermissionCode {
  const p=path.replace(/^\/admin\//,'').split('/')[0];
  if(p==='boshqaruv') return 'control.global.read';
  if(p==='system-control') return 'control.company.read';
  if(p==='f2') return 'f2.import';
  if(p==='f2-tayyorlash') return 'f2.prepare';
  if(['f2-tarix','nakopitelniy'].includes(p)) return 'f2.read';
  if(['holat','smeta-studio','obyektlar'].includes(p)) return 'smeta.read';
  if(p==='fakt') return 'fakt.read';
  if(['narxlar','narx-dalil','narx-manbalari','narx-katalog','smeta-narxlash','nakrutka'].includes(p)) return 'narx.read';
  if(['dashboard','moliya'].includes(p)) return 'financial.read';
  if(p==='kompaniya'||p==='tokenlar'||p==='tizim-sozlama') return 'company.read';
  if(p==='loyiha'||p==='participants') return 'project.read';
  return 'document.read';
}
