package uz.anncorp.smeta.core.data

/**
 * Who may see the money of an F-2 act. ONE rule for every screen (act detail, approval detail, Windows): the server RPC
 * `akt_summa_paket_v1` requires `f2.read`, so the clients hide the amount for everyone without it - never show it on one screen and
 * "no permission" on the next. Unknown permissions (offline / not loaded) = allowed; the server still decides.
 */
const val AMOUNT_PERMISSION = "f2.read"

fun canSeeActAmounts(permissions: Set<String>?): Boolean = permissions == null || AMOUNT_PERMISSION in permissions
