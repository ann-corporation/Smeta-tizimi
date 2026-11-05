// Synthetic canonical DB/business fixtures ONLY. Desktop security RPCs are the unmodified migration.
export const fixture = Object.freeze({ actor: 1, company: 1, object: 101, wrongTenantObject: 202 });
export const etag = 'W/"t2-paket-1-11111111111111111111111111111111"';
export function packet() {
  return {
    format:'t2-paket/1',obyekt_id:101,obyekt_nom:'M5 SYNTHETIC OBJECT',kompaniya_id:1,soni:3,
    lugat:{nom:['M5 SYNTHETIC SECTION','M5 SYNTHETIC WORK','M5 SYNTHETIC MATERIAL'],kod:['M5-W','M5-M'],birlik:['m3','kg'],tur:['rz','bl','rs'],kat:['МАТ']},
    q:{id:[1001,1002,1003],ota_id:[null,1001,1002],daraja:[0,1,2],tartib:[1,2,3],tur:[0,1,2],kat:[null,null,0],kod:[null,0,1],nom:[0,1,2],birlik:[null,0,1],hajm:[null,10,20],narx:[null,null,5],summa:[100,100,100],norma:[null,null,2],narx_usul:[null,null,'qolda'],versiya:[1,1,1],qoshimcha:[0,0,0],zamena:[0,0,0],xom_qator:{}},
    h:{fakt_hajm:[0,0,0],fakt_summa:[0,0,0],f2_hajm:[0,0,0],f2_summa:[0,0,0],f2_summa_yoq:[0,0,0],f2_summa_nomalum:[0,0,0],direct_fakt_hajm:[0,0,0],fakt_manbasi:[0,0,0],almashtirilgan_hajm:{},almashtirilgan_summa:{}},
    f2:[],meta:{fixture:'M5-SYNTHETIC-NON-PII',ustama:{},akt_podval:[]},
  };
}
export async function seed(db) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.t2_foydalanuvchi(id bigint generated always as identity primary key, login text unique, ism text, holat text, sessiya_bekor_dan timestamptz);
    grant select on public.t2_foydalanuvchi to service_role;
    insert into public.t2_foydalanuvchi(login,ism,holat) values ('m5-synthetic','M5 SYNTHETIC ACTOR','faol'),('m5-other','M5 OTHER SYNTHETIC ACTOR','faol');
    create table public.t2_obyekt(id bigint primary key, kompaniya_id bigint not null, nom text);
    insert into public.t2_obyekt values(101,1,'M5 SYNTHETIC OBJECT'),(202,2,'M5 OTHER TENANT OBJECT');
    create view public.t2_obyekt_jami as select id::int as id, nom, kompaniya_id::int as kompaniya_id from public.t2_obyekt;
    grant select on public.t2_obyekt_jami to service_role;
    create table public.m5_packet_fixture(obyekt_id bigint primary key, kompaniya_id bigint not null, paket jsonb);
    grant select on public.t2_obyekt,public.m5_packet_fixture to service_role;
    create function public.t2_men_v1(p_actor_id bigint) returns jsonb language sql stable as $$
      select case when p_actor_id in (1,2) then jsonb_build_object('ok',true,'platform_role','none',
        'foydalanuvchi',jsonb_build_object('id',p_actor_id,'login','m5-synthetic','ism','M5 SYNTHETIC ACTOR','holat',f.holat,'sessiya_bekor_dan',f.sessiya_bekor_dan),
        'context_kompaniyalar',jsonb_build_array(jsonb_build_object('kompaniya_id',p_actor_id,'kompaniya_nom','M5 SYNTHETIC COMPANY','nom','M5 SYNTHETIC COMPANY','effective_role','pto',
          'permissions',jsonb_build_array('company.read','smeta.read','f2.read','narx.read','object.read','project.read'),'explicit_denials','[]'::jsonb,'modullar_off','[]'::jsonb)),
        'azoliklar',jsonb_build_array(jsonb_build_object('kompaniya_id',p_actor_id,'kompaniya_nom','M5 SYNTHETIC COMPANY','nom','M5 SYNTHETIC COMPANY','rol','pto','faol',true)))
      else jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND') end from public.t2_foydalanuvchi f where f.id=p_actor_id;
    $$;
    create function public.t2_obyekt_paket_v1(p_obyekt_id bigint,p_actor_id bigint) returns jsonb language sql stable as $$
      select paket from public.m5_packet_fixture where obyekt_id=p_obyekt_id and kompaniya_id=p_actor_id;
    $$;
    create function public.t2_obyekt_paket_etag_v1(p_obyekt_id bigint,p_actor_id bigint) returns jsonb language sql stable as $$
      select public.t2_obyekt_paket_v1(p_obyekt_id,p_actor_id);
    $$;
    create function public.t2_obyekt_paket_muhr_v1(p_obyekt_id bigint,p_actor_id bigint) returns text language sql stable as $$
      select 'W/"t2-paket-1-11111111111111111111111111111111"' where exists(select 1 from public.m5_packet_fixture where obyekt_id=p_obyekt_id and kompaniya_id=p_actor_id);
    $$;
    create function public.t2_effective_authorization_v1(p_actor_id bigint,p_kompaniya_id bigint,p_loyiha_id bigint,p_obyekt_id bigint,p_permission text,p_capability_kod text) returns jsonb language sql stable as $$
      select jsonb_build_object('ok',true,'allowed',p_actor_id=coalesce(p_kompaniya_id,(select kompaniya_id from public.t2_obyekt where id=p_obyekt_id)), 'permission',p_permission);
    $$;
    grant execute on function public.t2_men_v1(bigint),public.t2_obyekt_paket_v1(bigint,bigint),public.t2_obyekt_paket_etag_v1(bigint,bigint),public.t2_obyekt_paket_muhr_v1(bigint,bigint),public.t2_effective_authorization_v1(bigint,bigint,bigint,bigint,text,text) to service_role;`);
  await db.query('insert into public.m5_packet_fixture values ($1,$2,$3::jsonb)',[101,1,JSON.stringify(packet())]);
}
export const rpcArgs = Object.freeze({
  t2_desktop_qurilma_yarat_v1:['p_actor_id','p_device_id','p_token_hash','p_sessiya_exp','p_operation_id'],
  t2_desktop_qurilma_tekshir_v1:['p_token_hash'],
  t2_desktop_qurilma_bekor_v1:['p_actor_id','p_device_id','p_operation_id'],
  t2_men_v1:['p_actor_id'],t2_obyekt_paket_v1:['p_obyekt_id','p_actor_id'],t2_obyekt_paket_etag_v1:['p_obyekt_id','p_actor_id'],t2_obyekt_paket_muhr_v1:['p_obyekt_id','p_actor_id'],
  t2_effective_authorization_v1:['p_actor_id','p_kompaniya_id','p_loyiha_id','p_obyekt_id','p_permission','p_capability_kod'],
});
