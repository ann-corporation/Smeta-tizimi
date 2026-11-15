// Applies the Smeta mobile policy to the Tauri-generated Android project. Idempotent; fails loudly if the
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
writeFileSync(file, xml);
console.log('android manifest policy applied');

// MainActivity: the generated one calls enableEdgeToEdge(), so the site was drawn under the status bar
// (clock/battery icons covered the header and its buttons could not be tapped). Pad the content view by the
// system bars, display cutout and on-screen keyboard instead, and keep dark status-bar icons on the light page.
const activity = join(root, 'app/src/main/java/uz/anncorp/smeta/MainActivity.kt');
const activitySrc = readFileSync(activity, 'utf8');
if (!/class MainActivity\s*:\s*TauriActivity\(\)/.test(activitySrc)) throw new Error('MAIN_ACTIVITY_SHAPE_CHANGED');
writeFileSync(activity, `package uz.anncorp.smeta

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.decorView.setBackgroundColor(Color.parseColor("#F4F2EE"))
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
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
  }
}
`);
console.log('android MainActivity insets applied');