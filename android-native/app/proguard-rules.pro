# kotlinx.serialization keeps generated serializers
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class uz.anncorp.smeta.** {
    *** Companion;
}
-keepclasseswithmembers class uz.anncorp.smeta.** {
    kotlinx.serialization.KSerializer serializer(...);
}
