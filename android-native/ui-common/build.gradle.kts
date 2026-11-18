import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.compose.multiplatform)
}

// QURAI design system + shared screens (Compose Multiplatform): ONE look for the website, the Android app and the Windows app.
// Targets: Android (library) and JVM desktop. No dependency on :shared (that module is JVM-only): pure UI, data arrives as plain values.
kotlin {
    androidTarget { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
    jvm("desktop") { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
    compilerOptions { optIn.addAll("androidx.compose.foundation.layout.ExperimentalLayoutApi", "androidx.compose.material3.ExperimentalMaterial3Api", "androidx.compose.foundation.ExperimentalFoundationApi") }
    sourceSets {
        commonMain.dependencies {
            api(compose.runtime)
            api(compose.foundation)
            api(compose.material3)
            api(compose.ui)
        }
        val desktopTest by getting {
            dependencies { implementation(kotlin("test-junit")) }
        }
    }
}

android {
    namespace = "uz.anncorp.qurai.ui"
    compileSdk = 35
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
