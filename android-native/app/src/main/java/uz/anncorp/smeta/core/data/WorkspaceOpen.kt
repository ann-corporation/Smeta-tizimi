package uz.anncorp.smeta.core.data

// Android-side mapping (needs ModuleCatalog); the desktop app has its own mapping over the shared WsOpen type.

/** Module codes this cabinet's workspace offers as native actions: the server already checked them, so the module access rule counts them as allowed. */
fun Workspace.grantedModules(): Set<String> = actions.filter { it.target.native }.map { it.target.code }.toSet()

/** Existing screens are the targets: the module code maps to a [NativeTarget]; anything unknown (or only a website page) is null = the button is hidden. No page comes from the website. */
fun WsAction.open(): WsOpen? {
    // A website page of a module this app has natively (e.g. "/admin/moliya") opens that module.
    val web = target.path?.takeIf { it.startsWith("/") }?.let { p -> ModuleCatalog.all.firstOrNull { it.webPath == p && it.target != null && it.enabled }?.target?.let { WsOpen.Native(it) } }
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
        "ombor" -> WsOpen.Native(NativeTarget.WAREHOUSE)
        "jarvis" -> if (Features.JARVIS) WsOpen.Native(NativeTarget.JARVIS) else null
        "rahbar" -> WsOpen.Native(NativeTarget.RAHBAR)
        "zayavka" -> WsOpen.Native(NativeTarget.ZAYAVKA)
        "onboarding" -> WsOpen.Onboard
        // Every other module the app has a native screen for (M-29, naryad, documents, F-2 registry, cumulative, debtors, acceptance, resources...).
        else -> nativeTargetFor(target.code)?.let { WsOpen.Native(it) } ?: web
    }
}