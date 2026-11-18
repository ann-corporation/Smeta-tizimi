package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * F-2 lifecycle transitions and server error texts, shared by Android and Windows. Same wire as the web
 * (frontend/src/api/t2-akt-lifecycle.ts -> POST /api/sb-yoz, amal akt_lifecycle_transition_v1; texts mirror
 * frontend/src/lib/f2-lifecycle-workflow.ts f2LifecycleError). The database decides who may do what (permissions,
 * separation of duties: submitter != checker != approver); the app only sends the step and shows the server's answer.
 */

/** The single next step of the corporate flow (draft/rejected -> submitted -> checked -> approved); null = nothing to do. */
fun f2NextStep(status: F2Status): F2Status? = when (status) {
    F2Status.DRAFT, F2Status.REJECTED -> F2Status.SUBMITTED
    F2Status.SUBMITTED -> F2Status.CHECKED
    F2Status.CHECKED -> F2Status.APPROVED
    else -> null
}

/** Button label of the next step (web f2QadamTugmasi, korporativ). */
fun f2StepLabel(status: F2Status): String? = when (f2NextStep(status)) {
    F2Status.SUBMITTED -> "Tekshiruvga yuborish"
    F2Status.CHECKED -> "Tekshirildi"
    F2Status.APPROVED -> "Tasdiqlash"
    else -> null
}

/** Rejecting is only possible from the checked state, in one step (web f2RadRejasi, korporativ). */
fun f2CanReject(status: F2Status) = status == F2Status.CHECKED

fun f2TransitionPayload(companyId: Long, aktId: Long, to: F2Status, expectedVersion: Int, operationId: String, reason: String?): JsonObject = buildJsonObject {
    put("amal", "akt_lifecycle_transition_v1"); put("kompaniya_id", companyId); put("akt_id", aktId); put("to_status", to.code)
    put("kutilgan_versiya", expectedVersion); put("operation_id", operationId)
    if (reason.isNullOrBlank()) put("sabab", JsonPrimitive(null as String?)) else put("sabab", reason.trim().take(2000))
}

sealed interface F2TransitionResult {
    data class Done(val status: String?, val version: Int?) : F2TransitionResult
    data class Error(val code: String?, val offline: Boolean = false) : F2TransitionResult
}

fun f2TransitionResult(r: ApiResult): F2TransitionResult {
    if (r.networkError) return F2TransitionResult.Error(null, offline = true)
    val o = r.body.obj()
    val ok = r.ok && (o?.get("ok") as? JsonPrimitive)?.booleanOrNull != false
    return if (ok) F2TransitionResult.Done(o?.get("status").str(), o?.get("version").num()?.toInt())
    else F2TransitionResult.Error(r.code ?: o?.get("code").str() ?: "HTTP ${r.status}")
}

/** Uzbek text of a server error code (the same sentences the website shows). Unknown codes show the code itself. */
fun serverErrorText(code: String?): String = when (code) {
    "NARXSIZ_QATOR_BOR" -> "Hujjatda narxi aniqlanmagan qatorlar bor - saytda «F2 tayyorlash»da narx kiriting yoki ongli «narxsiz» deb belgilang, so'ng tasdiqlang."
    "F2_RESURS_TUSHGAN" -> "F2 da ish qatori bor, lekin uning resurslari tushmagan - summa to'liq emas. «F2 tayyorlash»da resurslarni qo'shing, so'ng yuboring."
    "SOD_TEKSHIRUVCHI_YUBORUVCHI" -> "Hujjatni yuborgan odam uni o'zi tekshira olmaydi - boshqa xodim tekshirishi kerak."
    "SOD_TASDIQLOVCHI_TAKRORLANDI" -> "Hujjatni yuborgan yoki tekshirgan odam uni tasdiqlay olmaydi - uchinchi xodim tasdiqlashi kerak."
    "STALE_VERSION" -> "Hujjat boshqa joyda yangilangan. Ro'yxatni yangilab, qayta urinib ko'ring."
    "INVALID_LIFECYCLE_TRANSITION" -> "Hujjatning holati o'zgargan. Ro'yxatni yangilang."
    "AKT_NOT_FOUND" -> "Bu hujjat tanlangan kompaniyada topilmadi."
    "REASON_REQUIRED" -> "Rad etish yoki bekor qilish sababini kiriting."
    "NAVBAT_EMAS" -> "Hozir sizning navbatingiz emas yoki qaror allaqachon qabul qilingan."
    "ROL_YETARLI_EMAS" -> "Sizning rolingiz bu qaror uchun yetarli emas."
    "AZO_EMAS" -> "Siz bu kompaniya a'zosi emassiz."
    "PERMISSION_DENIED", "FORBIDDEN" -> "Bu amal uchun ruxsatingiz yo'q."
    null, "" -> "Noma'lum xato"
    else -> if (code.startsWith("SOD_")) "Vazifalar ajratilishi qoidasi buzildi ($code): boshqa xodim bajarishi kerak." else "Server xatosi: $code"
}

/** Message for a failed approval decision (chain decision from the inbox). */
fun decisionErrorText(e: DecisionError, code: String?): String = when (e) {
    DecisionError.OFFLINE -> "Internet yo'q: qaror faqat onlayn yuboriladi."
    DecisionError.NOT_YOUR_TURN -> serverErrorText("NAVBAT_EMAS")
    DecisionError.CHANGED -> "Hujjat zanjiri o'zgargan (qayta yuborilgan yoki boshqa qaror bor). Yangi holat yuklandi - tekshirib qayta yuboring."
    DecisionError.ROLE -> serverErrorText("ROL_YETARLI_EMAS")
    DecisionError.FORBIDDEN -> serverErrorText("PERMISSION_DENIED")
    DecisionError.FAILED -> serverErrorText(code)
}

/** Repository for F-2 transitions (online only; nothing is queued, an offline press says so). */
class F2TransitionRepository(private val api: BffApi) {
    suspend fun transition(companyId: Long, act: F2Act, to: F2Status, operationId: String, reason: String? = null): F2TransitionResult {
        val v = act.version ?: return F2TransitionResult.Error("STALE_VERSION")
        return f2TransitionResult(api.bff("/api/sb-yoz", "POST", f2TransitionPayload(companyId, act.id, to, v, operationId, reason)))
    }
}