// Synthetic canonical DB/business fixtures ONLY. Desktop security RPCs are the unmodified migration.
export const fixture = Object.freeze({ actor: 1, company: 1, object: 101, wrongTenantObject: 202 });
export function packet() {
  return {
    format:'t2-paket/1',obyekt_id:101,obyekt_nom:'M5 SYNTHETIC OBJECT',kompaniya_id:1,soni:3,
    lugat:{nom:['M5 SYNTHETIC SECTION','M5 SYNTHETIC WORK','M5 SYNTHETIC MATERIAL'],kod:['M5-W','M5-M'],birlik:['m3','kg'],tur:['rz','bl','rs'],kat:['МАТ']},
    q:{id:[1001,1002,1003],ota_id:[null,1001,1002],daraja:[0,1,2],tartib:[1,2,3],tur:[0,1,2],kat:[null,null,0],kod:[null,0,1],nom:[0,1,2],birlik:[null,0,1],hajm:[null,10,20],narx:[null,null,5],summa:[100,100,100],norma:[null,null,2],narx_usul:[null,null,'qolda'],versiya:[1,1,1],qoshimcha:[0,0,0],zamena:[0,0,0],xom_qator:{}},
    h:{fakt_hajm:[0,2,0],fakt_summa:[0,null,0],f2_hajm:[0,2,0],f2_summa:[0,null,0],f2_summa_yoq:[0,1,0],f2_summa_nomalum:[0,1,0],direct_fakt_hajm:[0,2,0],fakt_manbasi:[0,0,0],almashtirilgan_hajm:{},almashtirilgan_summa:{}},
    f2:[{akt_id:501,raqam:'M5-1',oy:'2026-11',holat:'qoralama',lifecycle_status:'draft',versiya:1,hujjat_jami:null,muhr_xesh:null}],
    meta:{fixture:'M5-SYNTHETIC-NON-PII',ustama:{},akt_podval:[{akt_id:501,blok:'',manba:'import',manba_akt_id:null,ishora:1,nk:{},qatorlar:[{kod:'nds',nom:'M5 SYNTHETIC NULL',foiz:null,summa:null,manzil:'M5!1'}],itogo1:null,itogo2:null,itogo3:null,itogo4:null,nds_foiz:null,hujjat_pryamye:null,hujjat_itogo4:null,hujjat_nds:null,hujjat_vsego:null,masshtab:1,tekshiruv:{holat:'noaniq',toliq:false},versiya:1}]},
  };
}
export async function seed(db) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.t2_foydalanuvchi(id bigint generated always as identity primary key, login text unique, ism text, holat text, sessiya_bekor_dan timestamptz);
    grant select on public.t2_foydalanuvchi to service_role;
    insert into public.t2_foydalanuvchi(login,ism,holat) values ('m5-synthetic','M5 SYNTHETIC ACTOR','faol'),('m5-other','M5 OTHER SYNTHETIC ACTOR','faol');
    create table public.t2_kompaniya(id bigint primary key,nom text,kod text,faol boolean not null);
    insert into public.t2_kompaniya values(1,'M5 SYNTHETIC COMPANY','M5',true),(2,'M5 OTHER COMPANY','M5B',true);
    create table public.t2_azolik(id bigint generated always as identity primary key,kompaniya_id bigint references public.t2_kompaniya,foydalanuvchi_id bigint references public.t2_foydalanuvchi,holat text,rol text);
    insert into public.t2_azolik(kompaniya_id,foydalanuvchi_id,holat,rol) values(1,1,'faol','pto'),(2,2,'faol','pto');
    grant select on public.t2_kompaniya,public.t2_azolik to service_role;
    create function public.t2_platforma_superadmin(p_actor_id bigint) returns boolean language sql stable as $$ select exists(select 1 from public.t2_azolik where foydalanuvchi_id=p_actor_id and holat='faol' and rol='superadmin') $$;
    create table public.t2_obyekt(id bigint primary key, kompaniya_id bigint not null, nom text,loyiha_id bigint,asosiy_shartnoma_id bigint);
    insert into public.t2_obyekt values(101,1,'M5 SYNTHETIC OBJECT',301,401),(202,2,'M5 OTHER TENANT OBJECT',null,null);
    create view public.t2_obyekt_jami as select id::int as id, nom, kompaniya_id::int as kompaniya_id,loyiha_id::int,asosiy_shartnoma_id::int from public.t2_obyekt;
    grant select on public.t2_obyekt_jami to service_role;
    create table public.m5_packet_fixture(obyekt_id bigint primary key, kompaniya_id bigint not null, paket jsonb);
    grant select on public.t2_obyekt,public.m5_packet_fixture to service_role;
    create function public.t2_men_v1(p_actor_id bigint) returns jsonb language sql stable as $$
      select case when p_actor_id in (1,2) then jsonb_build_object('ok',true,'platform_role','none',
        'foydalanuvchi',jsonb_build_object('id',p_actor_id,'login','m5-synthetic','ism','M5 SYNTHETIC ACTOR','holat',f.holat,'sessiya_bekor_dan',f.sessiya_bekor_dan),
        'context_kompaniyalar',jsonb_build_array(jsonb_build_object('kompaniya_id',p_actor_id,'kompaniya_nom','M5 SYNTHETIC COMPANY','nom','M5 SYNTHETIC COMPANY','effective_role','pto','faol',true,'membership_role','pto','is_director',false,'kod','M5',
          'permissions',jsonb_build_array('company.read','smeta.read','f2.read','narx.read','object.read','project.read','document.read','fakt.read','fakt.write','financial.read'),'explicit_denials','[]'::jsonb,'modullar_off','[]'::jsonb)),
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
      select 'W/"t2-paket-1-' || md5(paket::text) || '"' from public.m5_packet_fixture where obyekt_id=p_obyekt_id and kompaniya_id=p_actor_id;
    $$;
    create function public.t2_effective_authorization_v1(p_actor_id bigint,p_kompaniya_id bigint,p_loyiha_id bigint,p_obyekt_id bigint,p_permission text,p_capability_kod text) returns jsonb language sql stable as $$
      select jsonb_build_object('ok',true,'allowed',p_actor_id=coalesce(p_kompaniya_id,(select kompaniya_id from public.t2_obyekt where id=p_obyekt_id)), 'permission',p_permission);
    $$;
    create function public.t2_shartnoma_liniya_v1(p_kompaniya_id bigint,p_actor_id bigint) returns jsonb language sql stable as $$
      select case when p_kompaniya_id=1 and exists(select 1 from public.t2_azolik where kompaniya_id=p_kompaniya_id and foydalanuvchi_id=p_actor_id and holat='faol') then
        jsonb_build_object('loyihalar',jsonb_build_array(jsonb_build_object('id',301,'nom','M5 SYNTHETIC PROJECT','holat','faol')),
          'shartnomalar',jsonb_build_array(jsonb_build_object('id',401,'loyiha_id',301,'raqam','M5-SYNTHETIC-1','nom',null,'turi',null,'asosiy',true,'holat','faol','summa_bez_nds',null,'nds',null,'jami_nds_bilan',null,'izoh',null,'versiya',1,'tomonlar','[]'::jsonb,'obyektlar','[101]'::jsonb)),
          'obyektlar',jsonb_build_array(jsonb_build_object('id',101,'nom','M5 SYNTHETIC OBJECT','loyiha_id',301,'asosiy_shartnoma_id',401)),'rollar','[]'::jsonb,'turlar','[]'::jsonb) end $$;
    create function public.t2_akt_podval_ol_v1(p_obyekt_id bigint,p_actor_id bigint) returns jsonb language sql stable as $$
      select jsonb_build_object('ok',true,'podvallar',coalesce(p.paket->'meta'->'akt_podval','[]'::jsonb)) from public.m5_packet_fixture p join public.t2_azolik a on a.kompaniya_id=p.kompaniya_id and a.foydalanuvchi_id=p_actor_id and a.holat='faol' where p.obyekt_id=p_obyekt_id $$;
    grant execute on function public.t2_men_v1(bigint),public.t2_obyekt_paket_v1(bigint,bigint),public.t2_obyekt_paket_etag_v1(bigint,bigint),public.t2_obyekt_paket_muhr_v1(bigint,bigint),public.t2_effective_authorization_v1(bigint,bigint,bigint,bigint,text,text),public.t2_shartnoma_liniya_v1(bigint,bigint),public.t2_akt_podval_ol_v1(bigint,bigint) to service_role;`);
  await db.query('insert into public.m5_packet_fixture values ($1,$2,$3::jsonb)',[101,1,JSON.stringify(packet())]);
}

// Read models for the real export calls. The archived estimate does not contribute to active totals.
export async function seedExport(db, rows) {
  await db.exec(`
    create table public.t2_qator (
      id int primary key, obyekt_id int, kompaniya_id int, ota_id int, daraja int, tartib int,
      tur text, kod text, nom text, birlik text, hajm numeric, narx numeric, summa numeric, kat text,
      norma numeric, versiya int, change_type text, replaces_line_id int, versiya_holat text,
      almashtirgan_versiya_id int
    );
    create table public.t2_smeta_versiya (id int primary key, kompaniya_id int, obyekt_id int, nom text, manba_sana date);
    insert into public.t2_smeta_versiya values (701,1,101,'M5 SYNTHETIC PREVIOUS VERSION','2026-10-01');
    insert into public.t2_qator (id,obyekt_id,kompaniya_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,summa,kat,versiya,change_type,versiya_holat,almashtirgan_versiya_id)
    values (901,101,1,0,1,'mat','M5-OLD','M5 SYNTHETIC ARCHIVED MATERIAL','kg',1,50,50,'МАТ',1,'additional','almashtirilgan',701),
           (902,202,2,0,1,'mat','M5-OTHER','M5 OTHER TENANT MATERIAL','kg',1,70,70,'МАТ',1,'additional','faol',null);
    create table public.t2_nakrutka_podval_royxat (
      id int primary key, kompaniya_id int, obyekt_id int, obyekt text, shartnoma_id int, shartnoma text,
      nom text, qatorlar jsonb, versiya int, kim text, yaratildi timestamptz, yangilandi timestamptz
    );
    grant select on public.t2_qator,public.t2_smeta_versiya,public.t2_nakrutka_podval_royxat to service_role;

    create function public.t2_nakrutka_koef_ol_v1(p_kompaniya_id bigint,p_actor_id bigint,p_shartnoma_id bigint)
    returns jsonb language sql stable as $$
      select jsonb_build_object('ok',true,'shartnoma_id',p_shartnoma_id,'koeffitsientlar',nk,
        'jadval',public.t2_nakrutka_koef_jadval_v1(nk))
      from (select public.t2_nakrutka_default_v1() nk) d
      where exists(select 1 from public.t2_azolik where kompaniya_id=p_kompaniya_id and foydalanuvchi_id=p_actor_id and holat='faol');
    $$;
    create function public.t2_obyekt_nakrutka_v1(p_obyekt_id bigint,p_actor_id bigint,p_shartnoma_id bigint)
    returns jsonb language sql stable as $$
      select jsonb_build_object('ok',true,'obyekt_id',o.id,'shartnoma_id',coalesce(p_shartnoma_id,o.asosiy_shartnoma_id),
        'koeffitsientlar',nk,'jadval',public.t2_nakrutka_koef_jadval_v1(nk),'cats',cats,
        'nakrutka',public.t2_nakrutka_hisobla_v1(cats,nk),'nk_manba','sukut','nakrutka_podval_id',null)
      from public.t2_obyekt o
      cross join lateral (select jsonb_build_object('mat',sum(q.summa)) cats from public.t2_qator q
        where q.obyekt_id=o.id and q.versiya_holat='faol' and q.kat='МАТ') c
      cross join (select public.t2_nakrutka_default_v1() nk) d
      where o.id=p_obyekt_id and (p_shartnoma_id is null or p_shartnoma_id=o.asosiy_shartnoma_id)
      and exists(select 1 from public.t2_azolik where kompaniya_id=o.kompaniya_id and foydalanuvchi_id=p_actor_id and holat='faol');
    $$;
    grant execute on function public.t2_nakrutka_koef_ol_v1(bigint,bigint,bigint),public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint) to service_role;
  `);
  await db.query(`insert into public.t2_qator
    (id,obyekt_id,kompaniya_id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,summa,kat,norma,versiya,versiya_holat)
    select id,obyekt_id,$2,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,summa,kat,norma,versiya,'faol'
    from jsonb_to_recordset($1::jsonb) as r(id int,obyekt_id int,ota_id int,daraja int,tartib int,tur text,
      kod text,nom text,birlik text,hajm numeric,narx numeric,summa numeric,kat text,norma numeric,versiya int)`,
  [JSON.stringify(rows),fixture.company]);
}

export async function seedExportBilling(db, readMigration) {
  const base=await readMigration('20261105270000_t2_pto_tijorat_v1.sql');
  const pricing=await readMigration('20261105310000_t2_token_narx_v2_tolov.sql');
  const saga=await readMigration('20261106800000_t2_token_saga_v1.sql');
  async function applySection(sql, first, next) {
    const start=sql.indexOf(first), end=sql.indexOf(next,start+1);
    if(start<0 || end<0)throw new Error(`M5_BILLING_SECTION_MISSING: ${first}`);
    await db.exec(sql.slice(start,end));
  }
  await db.exec(`create function public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id bigint,p_actor_id bigint)
    returns text language plpgsql stable as $$
    declare v_role text;
    begin
      select rol into v_role from public.t2_azolik where kompaniya_id=p_kompaniya_id and foydalanuvchi_id=p_actor_id and holat='faol';
      if not found then raise exception 'TENANT_FORBIDDEN'; end if;
      return v_role;
    end $$;`);
  await applySection(base,'create table if not exists public.t2_token_narx','create table if not exists public.t2_tarif');
  await applySection(base,'create table if not exists public.t2_token_harakat','/* Narx hisobi');
  await applySection(pricing,'create table if not exists public.t2_token_sozlama','-- ═══ 5.');
  await applySection(saga,'create table if not exists public.t2_token_saga','create or replace function public.t2_boshqaruv_token_saga_v1');
  await db.exec(`insert into public.t2_token_harakat(kompaniya_id,miqdor,tur,operation_id)
    values (1,10000,'bonus','00000000-0000-4000-8000-000000005222');`);
}

export async function seedFakt(db, loadFunction) {
  await db.exec(`
    create table public.t2_smeta_revision (id bigint primary key, obyekt_id bigint, seq int);
    insert into public.t2_smeta_revision values (801,101,1);
    create function public.t2_smeta_baseline_kafolat_v1(p_obyekt_id bigint,p_actor_id bigint)
    returns void language plpgsql as $$ begin
      if not exists(select 1 from public.t2_smeta_revision where obyekt_id=p_obyekt_id) then raise exception 'M5_BASELINE_MISSING'; end if;
    end $$;
    create table public.t2_akt (
      id bigint generated always as identity primary key, obyekt_id bigint, kompaniya_id bigint,
      tur text, raqam text, oy date, holat text, operation_id uuid unique, manba text, kim text,
      revision_id bigint, hujjat_jami numeric, izoh text
    );
    create table public.t2_akt_qator (
      id bigint generated always as identity primary key, akt_id bigint references public.t2_akt,
      qator_id bigint, obyekt_id bigint, kompaniya_id bigint, hajm numeric not null, narx numeric, izoh text,
      baseline_narx numeric, baseline_summa numeric, actual_narx numeric, narx_manba text, narx_manba_id bigint,
      narx_izoh text, revision_id bigint, manba_akt_qator_id bigint references public.t2_akt_qator,
      certified_quantity numeric, certified_unit_price numeric, certified_amount numeric,
      summa numeric generated always as (coalesce(certified_amount,hajm*narx)) stored
    );
    create view public.t2_qator_holat as
      select q.id,q.id qator_id,q.obyekt_id,q.nom,q.hajm smeta_hajm,
        coalesce((p.paket->'h'->'fakt_hajm'->>(i.ord::int-1))::numeric,0) fakt_hajm,
        coalesce((p.paket->'h'->'f2_hajm'->>(i.ord::int-1))::numeric,0) f2_hajm
      from public.t2_qator q join public.m5_packet_fixture p on p.obyekt_id=q.obyekt_id
      cross join lateral jsonb_array_elements_text(p.paket->'q'->'id') with ordinality i(id,ord)
      where i.id::bigint=q.id;
  `);
  await loadFunction('20261012090100_t2_son_fix_digit_suffix_corruption.sql','t2_son');
  await loadFunction('20261114200000_t2_fakt_f2_rs_v1.sql','t2_akt_yarat');
  // The legacy writer definition is absent from migrations. This local adapter calls
  // the repo's act writer and refreshes the fixture packet within the same transaction.
  await db.exec(`create function public.t2_fakt_yoz(p_obyekt bigint,p_sana date,p_qatorlar jsonb,p_kim text,p_op uuid,p_izoh text,p_raqam text)
    returns jsonb language plpgsql as $$
    declare result jsonb; line record; row_index int;
    begin
      perform 1 from public.m5_packet_fixture where obyekt_id=p_obyekt for update;
      result:=public.t2_akt_yarat(p_obyekt,'fakt',p_sana,p_qatorlar,p_raqam,p_op,'m5-fixture',p_kim);
      if result->>'ok' is distinct from 'true' or result->>'takror'='true' then return result; end if;
      for line in select qator_id,hajm from public.t2_akt_qator where akt_id=(result->>'akt_id')::bigint loop
        select i.ord::int-1 into strict row_index from public.m5_packet_fixture p
        cross join lateral jsonb_array_elements_text(p.paket->'q'->'id') with ordinality i(id,ord)
        where p.obyekt_id=p_obyekt and i.id::bigint=line.qator_id;
        update public.m5_packet_fixture set paket=jsonb_set(
          jsonb_set(paket,array['h','fakt_hajm',row_index::text],to_jsonb((paket->'h'->'fakt_hajm'->>row_index)::numeric+line.hajm)),
          array['h','direct_fakt_hajm',row_index::text],to_jsonb((paket->'h'->'direct_fakt_hajm'->>row_index)::numeric+line.hajm))
        where obyekt_id=p_obyekt;
      end loop;
      return result;
    end $$;`);
  await loadFunction('20261114200000_t2_fakt_f2_rs_v1.sql','t2_fakt_yoz_v2');
}

export const rpcArgs = Object.freeze({
  t2_desktop_qurilma_yarat_v2:['p_actor_id','p_device_id','p_token_hash','p_sessiya_exp','p_operation_id','p_qurilma_nomi','p_os','p_ilova_versiya'],
  t2_desktop_qurilma_tekshir_v2:['p_token_hash','p_ilova_versiya'],
  t2_desktop_qurilma_bekor_v1:['p_actor_id','p_device_id','p_operation_id'],
  t2_desktop_lease_chegara_v2:['p_actor_id','p_device_id','p_kompaniya_id','p_obyekt_soni'],
  t2_men_v1:['p_actor_id'],t2_obyekt_paket_v1:['p_obyekt_id','p_actor_id'],t2_obyekt_paket_etag_v1:['p_obyekt_id','p_actor_id'],t2_obyekt_paket_muhr_v1:['p_obyekt_id','p_actor_id'],
  t2_effective_authorization_v1:['p_actor_id','p_kompaniya_id','p_loyiha_id','p_obyekt_id','p_permission','p_capability_kod'],
  t2_shartnoma_liniya_v1:['p_kompaniya_id','p_actor_id'],t2_akt_podval_ol_v1:['p_obyekt_id','p_actor_id'],
  t2_nakrutka_koef_ol_v1:['p_kompaniya_id','p_actor_id','p_shartnoma_id'],
  t2_obyekt_nakrutka_v1:['p_obyekt_id','p_actor_id','p_shartnoma_id'],
  t2_token_sarfla_v1:['p_actor_id','p_kompaniya_id','p_amal','p_birlik_soni','p_operation_id','p_meta'],
  t2_token_yakunla_v1:['p_actor_id','p_kompaniya_id','p_sarf_operation_id'],
  t2_token_qaytar_v1:['p_actor_id','p_kompaniya_id','p_sarf_operation_id','p_operation_id','p_sabab'],
  t2_fakt_yoz_v2:['p_obyekt_id','p_sana','p_qatorlar','p_actor_id','p_operation_id','p_izoh','p_raqam','p_actor_label'],
});
