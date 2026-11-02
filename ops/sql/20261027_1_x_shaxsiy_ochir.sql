-- 1/4: Sinovda xato ochilgan bo'sh «X shaxsiy» (kompaniya 177) ni o'chirish. Bir necha soniya.
begin;
set local lock_timeout = '10s';
delete from t2_azolik where kompaniya_id=177 and foydalanuvchi_id=183;
delete from t2_obuna where kompaniya_id=177;
delete from t2_audit_log where kompaniya_id=177;
delete from t2_onboarding_command_log where actor_id=183 and command='ish_joyi_yarat' and natija->>'kompaniya_id'='177';
delete from t2_kompaniya where id=177 and nom='X shaxsiy';
commit;
select count(*) as qolgan_177 from t2_kompaniya where id=177;  -- 0 chiqishi kerak
