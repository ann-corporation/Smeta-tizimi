// Applies the QURAI mobile policy to the Tauri-generated Android project. Idempotent; fails loudly if the
// generated manifest no longer has the shape we patch, so a Tauri upgrade cannot silently drop a setting.
// Usage: node mobile/android-overlay.mjs <path to gen/android>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: android-overlay.mjs <gen/android>');
const file = join(root, 'app/src/main/AndroidManifest.xml');
let xml = readFileSync(file, 'utf8');

// Minimal permissions: INTERNET (already generated) + CAMERA for site photos. The photo picker needs none.
const add = (needle, line) => { if (!xml.includes(needle)) xml = xml.replace(/(<manifest[^>]*>)/, `$1\n    ${line}`); };
add('android.permission.INTERNET', '<uses-permission android:name="android.permission.INTERNET" />');
add('android.permission.CAMERA', '<uses-permission android:name="android.permission.CAMERA" />');
add('android.hardware.camera"', '<uses-feature android:name="android.hardware.camera" android:required="false" />');
add('android.hardware.camera.autofocus', '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />');

// No cloud backup / device-transfer of app data; HTTPS only.
const attr = (name, value) => {
  const re = new RegExp(`android:${name}="[^"]*"`);
  if (re.test(xml.match(/<application[\s\S]*?>/)[0])) xml = xml.replace(re, `android:${name}="${value}"`);
  else xml = xml.replace('<application', `<application\n        android:${name}="${value}"`);
};
if (!xml.includes('<application')) throw new Error('MANIFEST_APPLICATION_MISSING');
attr('allowBackup', 'false');
attr('fullBackupContent', 'false');
attr('usesCleartextTraffic', 'false');

for (const required of ['android.permission.INTERNET', 'android.permission.CAMERA', 'android:allowBackup="false"', 'android:usesCleartextTraffic="false"']) {
  if (!xml.includes(required)) throw new Error(`MANIFEST_PATCH_FAILED ${required}`);
}
for (const forbidden of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'READ_CONTACTS', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'RECORD_AUDIO']) {
  if (xml.includes(forbidden)) throw new Error(`MANIFEST_FORBIDDEN_PERMISSION ${forbidden}`);
}
// Deep link qurai://kirish (tizim brauzerida kirgach ilovaga qaytish) + singleTask (qaytganda yangi nusxa ochilmasin).
const act = xml.match(/<activity\b[^>]*MainActivity[^>]*>/);
if (!act) throw new Error('MANIFEST_MAIN_ACTIVITY_MISSING');
if (!xml.includes('android:scheme="qurai"')) {
  let tag = act[0];
  tag = /android:launchMode="[^"]*"/.test(tag) ? tag.replace(/android:launchMode="[^"]*"/, 'android:launchMode="singleTask"') : tag.replace('<activity', '<activity\n            android:launchMode="singleTask"');
  const i0 = xml.indexOf(act[0]);
  const end = xml.indexOf('</activity>', i0);
  if (end < 0) throw new Error('MANIFEST_ACTIVITY_NOT_CLOSED');
  const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="qurai" android:host="kirish" />
            </intent-filter>
        `;
  xml = xml.slice(0, i0) + tag + xml.slice(i0 + act[0].length, end) + filter + xml.slice(end);
}
for (const required of ['android:scheme="qurai"', 'android:launchMode="singleTask"']) {
  if (!xml.includes(required)) throw new Error(`MANIFEST_PATCH_FAILED ${required}`);
}
writeFileSync(file, xml);
console.log('android manifest policy applied');

// MainActivity: the generated one calls enableEdgeToEdge(), so the site was drawn under the status bar
// (clock/battery icons covered the header and its buttons could not be tapped). Pad the content view by the
// system bars, display cutout and on-screen keyboard instead, and and paint the bars with the site's dark theme colour (index.html theme-color #0e1113) with light icons.
const activity = join(root, 'app/src/main/java/uz/anncorp/smeta/MainActivity.kt');
const activitySrc = readFileSync(activity, 'utf8');
if (!/class MainActivity\s*:\s*TauriActivity\(\)/.test(activitySrc)) throw new Error('MAIN_ACTIVITY_SHAPE_CHANGED');
writeFileSync(activity, `package uz.anncorp.smeta

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private val ui = Handler(Looper.getMainLooper())

  @Suppress("DEPRECATION")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val fon = Color.parseColor("#0E1113")
    window.decorView.setBackgroundColor(fon)
    window.statusBarColor = fon
    window.navigationBarColor = fon
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
    tizimBrauzeridanQaytish(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    tizimBrauzeridanQaytish(intent)
  }

  // Sessiya cookie (Max-Age bilan doimiy) WebView xotirasida turadi va diskka kechikib yoziladi: ilova yopilishidan oldin
  // flush qilinmasa, yangi kirish yo'qoladi va ilova har ochilganda qayta kirishni so'raydi.
  override fun onPause() { CookieManager.getInstance().flush(); super.onPause() }
  override fun onStop() { CookieManager.getInstance().flush(); super.onStop() }
  override fun onDestroy() { CookieManager.getInstance().flush(); super.onDestroy() }

  // qurai://kirish?t=<bilet>: tizim brauzerida kirilgach ilovaga qaytish. Bilet faqat shakl jihatdan tekshiriladi va
  // saytning o'z sahifasiga beriladi; haqiqiy tekshiruv serverda (sir + muddat + imzo).
  private fun tizimBrauzeridanQaytish(i: Intent?, urinish: Int = 0) {
    val d = i?.data ?: return
    if (d.scheme != "qurai" || d.host != "kirish") return
    val t = d.getQueryParameter("t") ?: return
    if (!Regex("^[A-Za-z0-9_-]{20,4000}$").matches(t)) return
    val wv = topWebView(window.decorView)
    if (wv == null) {
      if (urinish < 40) ui.postDelayed({ tizimBrauzeridanQaytish(i, urinish + 1) }, 500)
      return
    }
    i.data = null
    wv.loadUrl("https://qurai.uz/ilova-qaytdi?t=" + t)
  }

  private fun topWebView(v: View): WebView? {
    if (v is WebView) return v
    if (v is ViewGroup) for (k in 0 until v.childCount) topWebView(v.getChildAt(k))?.let { return it }
    return null
  }
}
`);
console.log('android MainActivity insets applied');