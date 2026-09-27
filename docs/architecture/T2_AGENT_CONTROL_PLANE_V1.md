# T2 Agent Control Plane V1

Status: SOURCE READY · production migration NOT APPLIED

## Maqsad

TIZIM_02 ichidagi o‘nta bounded agentni boshqarish uchun audit qilinadigan,
tenant bilan chegaralangan va qayta bajarishda duplicate yozmaydigan kontrakt.
Bu AI uchun yangi business truth emas. Smeta, F2, ombor, moliya va hujjat
hisoblari o‘zining canonical jadval/RPC/commandlarida qoladi.

## Ro‘yxatdan o‘tgan rollar

`platform_orchestrator`, `company_access`, `project_contract`, `pto_smeta`,
`document_control`, `procurement`, `warehouse`, `finance`,
`schedule_execution`, `quality_handover`.

Har profil `permission_mode`, `default_scope`, `allowed_commands` va
`allowed_tools` bilan keladi. Agent client `requires_approval=false` yuborsa ham
`command_prepare`/`human_approval_required` profilida server approvalni majburan
yoqadi.
Tool — stable capability code; u JavaScript function yoki SQL nomi emas.

## Ish oqimi

```text
verified session
  -> t2_agent_scope_guard_v1
  -> t2_agent_run_start_v1 (operation_id)
  -> approval_required (write/command path)
  -> t2_agent_approval_decide_v1
  -> queued/running/applying/exporting
  -> completed | failed | cancelled
```

`versiya` optimistic lock hisoblanadi. Takroriy `operation_id` oldingi natijani
qaytaradi. Stale versiya blind last-write-wins qilmaydi.

## Xavfsizlik

- Actor server sessiondan olinadi; client yuborgan actor ishonchli emas.
- Company/project/object lineage server-side tekshiriladi.
- Global scope faqat platform superadmin uchun.
- RLS yoqilgan; public/anon/authenticated uchun direct table/function access
  yopiq, Cloudflare service-role RPC allowlist orqali kiradi.
- Tool call faqat profile `allowed_tools` ichida bo‘lsa `prepared` receipt oladi.
  Bu qatlam arbitrary SQL, Drive scan yoki GAS call bajarmaydi.
- Approval, transition va tool call audit/receipt sifatida yoziladi.

## API boundary

- `GET /api/agent-control[?kompaniya_id=&limit=]`
- `POST /api/agent-control` actions: `run_start`, `run_transition`,
  `approval_decide`, `tool_prepare`.

Frontend typed client bor, ammo UI integration ataylab qilinmagan: Freebuff/UI
lane keyin shu contractni consume qiladi.

## Keyingi integratsiya

1. Claude har domain agentiga real read command adapterini bog‘laydi.
2. Write/side-effect commandlar approvaldan keyin canonical domain RPC orqali
   bajariladi; agent run o‘zi business jadvalga yozmaydi.
3. Control Center shu run/approval/tool receiptlarni bounded read model sifatida
   ko‘rsatadi.
4. Background execution mavjud `t2_job` infrastructure bilan bog‘lanadi; bu
   migration yangi parallel queue yaratmaydi.

## Ishga tushirish holati

Migration, rollback va acceptance SQL source-ready. Production apply, live
agent worker va UI integration bu checkpointda qilinmagan.
