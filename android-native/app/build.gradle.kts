plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "uz.anncorp.smeta"
    compileSdk = 35

    defaultConfig {
        // Same identifier as the desktop (Tauri) app, so the product keeps one identity.
        applicationId = "uz.anncorp.smeta"
        minSdk = 26
        targetSdk = 35
        // Tauri Android build: major*1e6+minor*1e3+patch (0.1.1 -> 1001). Start above it so a native release upgrades it in place.
        versionCode = 2_000_007
        // Format must match the server's ilovaVersiya() regex: d{1,4}.d{1,4}.d{1,6}
        versionName = "0.1.8"
        // Domain move (qurai.uz): ONE source for the API host. Canonical host first; the fallback list (comma separated, tried in order
        // on a network failure, see core/data/HostFallback.kt) keeps old/other hosts reachable. Override: -PapiBase=... -PapiFallbacks=...
        val apiBase = (project.findProperty("apiBase") as String?) ?: "https://qurai.uz"
        val apiFallbacks = (project.findProperty("apiFallbacks") as String?) ?: "https://smeta-tizimi.pages.dev"
        buildConfigField("String", "API_BASE_URL", "\"$apiBase\"")
        buildConfigField("String", "API_FALLBACK_URLS", "\"$apiFallbacks\"")
        resourceConfigurations += listOf("uz", "ru", "en")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"   // installs next to the Tauri build / a release build
            manifestPlaceholders["appLabel"] = "QURAI Dev"
        }
        release {
            manifestPlaceholders["appLabel"] = "QURAI"
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        // Release-like build for measurements only (R8-minified, not debuggable, debug-signed) that still carries the debug demo fixtures
        // (src/debug): `./gradlew assembleBench`. Never shipped: the real release uses src/release, where the demo mode does not exist.
        create("bench") {
            initWith(getByName("release"))
            applicationIdSuffix = ".bench"
            manifestPlaceholders["appLabel"] = "QURAI Bench"
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += "release"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
        unitTests.isIncludeAndroidResources = true
    }
    sourceSets {
        getByName("test").resources.srcDir("src/debug/assets")
        getByName("bench") { java.srcDir("src/debug/java"); assets.srcDir("src/debug/assets") }
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
    implementation(libs.googleid)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.sqlcipher)
    implementation(libs.sqlite.ktx)
    implementation(libs.work.runtime)
    implementation(libs.icons.extended)
    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.mlkit.barcode)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}



