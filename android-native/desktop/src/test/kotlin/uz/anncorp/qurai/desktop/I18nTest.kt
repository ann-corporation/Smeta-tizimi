package uz.anncorp.qurai.desktop

import org.junit.Test
import org.junit.Assert.assertEquals

class I18nTest {
    @Test fun readsAndroidStrings() {
        assertEquals("\u041c\u043e\u0439 \u0434\u0438\u0441\u043a", I18n.s("qa2_disk_mine", "x", "ru"))
        assertEquals("Mening diskim", I18n.s("qa2_disk_mine", "x", "uz"))
        assertEquals("\u0414\u0438\u0441\u043a", I18n.t("Disk", "ru"))
        assertEquals("Noma'lum matn", I18n.t("Noma'lum matn", "ru"))
    }
}