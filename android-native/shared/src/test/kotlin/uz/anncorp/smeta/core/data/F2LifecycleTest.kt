package uz.anncorp.smeta.core.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class F2LifecycleTest {
    @Test fun nextStepFollowsCorporateFlow() {
        assertEquals(F2Status.SUBMITTED, f2NextStep(F2Status.DRAFT))
        assertEquals(F2Status.SUBMITTED, f2NextStep(F2Status.REJECTED))
        assertEquals(F2Status.CHECKED, f2NextStep(F2Status.SUBMITTED))
        assertEquals(F2Status.APPROVED, f2NextStep(F2Status.CHECKED))
        assertNull(f2NextStep(F2Status.APPROVED))
        assertEquals("Tasdiqlash", f2StepLabel(F2Status.CHECKED))
        assertTrue(f2CanReject(F2Status.CHECKED)); assertTrue(!f2CanReject(F2Status.DRAFT))
    }
    @Test fun payloadMatchesWeb() {
        val p = f2TransitionPayload(17, 5, F2Status.CHECKED, 3, "op-1", " sabab ")
        assertEquals("akt_lifecycle_transition_v1", p["amal"].str()); assertEquals("checked", p["to_status"].str())
        assertEquals(3.0, p["kutilgan_versiya"].num()); assertEquals("sabab", p["sabab"].str())
    }
    @Test fun serverCodesAreUzbek() {
        assertTrue(serverErrorText("F2_RESURS_TUSHGAN").contains("resurs"))
        assertTrue(serverErrorText("NARXSIZ_QATOR_BOR").contains("narx"))
        assertTrue(serverErrorText("SOD_TEKSHIRUVCHI_YUBORUVCHI").contains("boshqa xodim"))
        assertTrue(serverErrorText("SOD_BOSHQA").contains("SOD_BOSHQA"))
        assertTrue(decisionErrorText(DecisionError.FAILED, "F2_RESURS_TUSHGAN").contains("resurs"))
    }
}
