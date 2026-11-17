package uz.anncorp.smeta.core.data

/** Lower-case, no apostrophe variants, so "o'zbek", "oʻzbek" and "ozbek" all match. */
fun normalizeSearch(s: String): String = s.lowercase().filter { it != '\'' && it != '‘' && it != '’' && it != 'ʻ' && it != 'ʼ' && it != '`' }
