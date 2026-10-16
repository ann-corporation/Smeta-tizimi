/** Navigation only. Server authorization remains authoritative.
 * A canonical active platform superadmin membership is independent of the
 * selected company's work role. Admin is NOT promoted to superadmin.
 */
export function navigationRole(input:{global:boolean;companyRole?:string|null;memberships:readonly {rol:string;faol?:boolean;holat?:string}[]}) {
 const roles=input.memberships.filter(a=>a.faol!==false&&(a.holat===undefined||a.holat==='faol')).map(a=>a.rol);
 const platform=roles.includes('superadmin')?'superadmin':roles.includes('admin')?'admin':null;
 return {platform,company:input.companyRole??null,effective:platform==='superadmin'?'superadmin':input.global?(platform??''):(input.companyRole??'')};
}
