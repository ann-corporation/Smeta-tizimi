# Release (code protection): names are obfuscated; keep only what reflection / serialization / JNA need.
-dontwarn **
-keepattributes *Annotation*,InnerClasses,Signature,EnclosingMethod
-keep class kotlinx.serialization.** { *; }
-keepclassmembers class **$$serializer { *; }
-keepclassmembers class * { *** Companion; }
-keep,includedescriptorclasses class uz.anncorp.smeta.core.data.**$$serializer { *; }
-keepclassmembers @kotlinx.serialization.Serializable class ** { *** Companion; *** $serializer(...); kotlinx.serialization.KSerializer serializer(...); }
# OkHttp / Okio
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.internal.platform.** { *; }
# JNA (DPAPI): native binding uses reflection on interfaces/structures
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
# Compose Desktop / Skiko
-keep class org.jetbrains.skia.** { *; }
-keep class org.jetbrains.skiko.** { *; }
-keep class kotlinx.coroutines.swing.** { *; }
-keep class kotlinx.coroutines.internal.MainDispatcherFactory { *; }
-keep class kotlinx.coroutines.swing.SwingDispatcherFactory { *; }
-keep class uz.anncorp.qurai.desktop.MainKt { public static void main(java.lang.String[]); }
