package uz.anncorp.smeta.core.data

// Android-side mapping (needs ModuleCatalog); the desktop app has its own mapping over the shared WsOpen type.

/** Existing screens are the targets: the module code maps to a [NativeTarget]; anything unknown falls back to its web path, else null (button hidden). */
fun WsAction.open(): WsOpen? {
    val web = target.path?.takeIf { it.startsWith("/") }?.let { WsOpen.Web(it) }
    // The server still describes Material so'rovi as a web page (older clients and Windows keep using it); this client has the native screen.
    if (target.code == "zayavka") return WsOpen.Native(NativeTarget.ZAYAVKA)
    // Same for texnadzor acceptance: the server action is a web page for older clients; this client has the native acceptance screen (P10).
    if (target.code == "nazorat") return WsOpen.Native(NativeTarget.NAZORAT)
    if (!target.native) return web
    return when (target.code) {
        "obyektlar" -> WsOpen.Native(NativeTarget.OBJECTS)
        "fakt" -> WsOpen.Native(NativeTarget.FAKT)
        "foto" -> WsOpen.Native(NativeTarget.PHOTO)
        "tasdiq" -> WsOpen.Native(NativeTarget.APPROVALS)
        "bugun" -> WsOpen.Native(NativeTarget.TODAY)
        "ombor" -> if (Features.NATIVE_WAREHOUSE) WsOpen.Native(NativeTarget.WAREHOUSE) else web
        "jarvis" -> if (Features.JARVIS) WsOpen.Native(NativeTarget.JARVIS) else null
        "rahbar" -> WsOpen.Native(NativeTarget.RAHBAR)
        "zayavka" -> WsOpen.Native(NativeTarget.ZAYAVKA)
        "onboarding" -> WsOpen.Onboard
        // Every other module the app has a native screen for (M-29, naryad, documents, F-2 registry, cumulative, debtors, acceptance, resources...).
        else -> nativeTargetFor(target.code)?.let { WsOpen.Native(it) } ?: web
    }
}