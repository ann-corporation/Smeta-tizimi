package uz.anncorp.smeta.core.ui

/*
 * ONE design source for Android and Windows: the website's "Firuza" tokens (frontend/src/dizayn/firuza.css).
 * Values are plain ARGB longs so :shared stays Compose-free; each platform maps them 1:1 to its Material colour scheme
 * (QuraiTheme in :app and :desktop). Change a colour here and both apps follow; keep in sync with firuza.css.
 */
data class QuraiPalette(
    val bg: Long, val surface: Long, val surface2: Long, val surface3: Long, val border: Long, val borderStrong: Long,
    val text: Long, val textDim: Long, val textMute: Long,
    val accent: Long, val accentText: Long, val onAccent: Long, val accentSoft: Long,
    val info: Long, val ok: Long, val warn: Long, val danger: Long, val dangerSoft: Long,
    val katChel: Long, val katMash: Long, val katMat: Long, val katOb: Long,
)

object QuraiTokens {
    /** Dark theme (web default, `:root`). */
    val dark = QuraiPalette(
        bg = 0xFF0E1113, surface = 0xFF151A1D, surface2 = 0xFF1C2226, surface3 = 0xFF252C31, border = 0xFF2B3338, borderStrong = 0xFF64707A,
        text = 0xFFE8ECEA, textDim = 0xFFA7B1AF, textMute = 0xFF8A9593,
        accent = 0xFF2EC4B6, accentText = 0xFF5FD6CA, onAccent = 0xFF04211E, accentSoft = 0x242EC4B6,
        info = 0xFF86A6FF, ok = 0xFF62C97A, warn = 0xFFF0B450, danger = 0xFFFF7A6E, dangerSoft = 0x1FFF7A6E,
        katChel = 0xFF74B8F2, katMash = 0xFFE9A94F, katMat = 0xFF76C98F, katOb = 0xFFB9A2F5,
    )

    /** Light theme (web `data-mavzu="ganch"`). */
    val light = QuraiPalette(
        bg = 0xFFF5F4F0, surface = 0xFFFFFFFF, surface2 = 0xFFF1F0EB, surface3 = 0xFFE7E5DE, border = 0xFFDEDBD3, borderStrong = 0xFF8F8A7E,
        text = 0xFF191C1D, textDim = 0xFF4B5254, textMute = 0xFF5C6365,
        accent = 0xFF0B7A72, accentText = 0xFF08665F, onAccent = 0xFFFFFFFF, accentSoft = 0x140B7A72,
        info = 0xFF2F54C4, ok = 0xFF236A34, warn = 0xFF8F5600, danger = 0xFFB0301F, dangerSoft = 0x14B0301F,
        katChel = 0xFF1F62A8, katMash = 0xFF8A5300, katMat = 0xFF26733F, katOb = 0xFF6A49C2,
    )

    /** Brand mark (favicon.svg): navy tile, white Q, gold tail. */
    const val BRAND_NAVY = 0xFF14213D
    const val BRAND_GOLD = 0xFFB08D57

    // Radii (dp), spacing (dp), control heights (dp), layout (dp): web --radius-*, --space-*, --control-*, --sidebar-*.
    const val RADIUS_XS = 3; const val RADIUS_SM = 6; const val RADIUS_MD = 8; const val RADIUS_LG = 12
    const val SPACE_1 = 4; const val SPACE_2 = 8; const val SPACE_3 = 12; const val SPACE_4 = 16; const val SPACE_5 = 20; const val SPACE_6 = 24; const val SPACE_8 = 32
    const val CONTROL_SM = 28; const val CONTROL_MD = 32; const val CONTROL_LG = 40
    /** Android touch target (accessibility minimum, used for every tappable control on the phone). */
    const val TOUCH_TARGET = 48
    const val ROW_DENSE = 32; const val ROW_COMFORT = 40
    const val SIDEBAR_RAIL = 60; const val SIDEBAR_OPEN = 264
    const val FONT_SANS = "IBM Plex Sans"; const val FONT_MONO = "IBM Plex Mono"
}
