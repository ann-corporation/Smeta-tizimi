import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.compose.multiplatform)
}

// Native Windows app (Compose Multiplatform Desktop). Shares the API client, auth, models and Jarvis with the Android app via :shared.
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}
kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

val appVersion = "0.1.0"
val apiBase = (project.findProperty("apiBase") as String?) ?: "https://qurai.uz"

// Build-time constants (no secrets): app version and the canonical API host.
val genDir = layout.buildDirectory.dir("generated/buildconfig")
val genConfig = tasks.register("generateBuildConfig") {
    val out = genDir
    inputs.property("v", appVersion); inputs.property("b", apiBase)
    outputs.dir(out)
    doLast {
        val f = out.get().asFile.resolve("uz/anncorp/qurai/desktop/BuildInfo.kt")
        f.parentFile.mkdirs()
        f.writeText("package uz.anncorp.qurai.desktop\n\nobject BuildInfo {\n    const val VERSION = \"$appVersion\"\n    const val API_BASE = \"$apiBase\"\n}\n")
    }
}
sourceSets { main { java.srcDir(genDir) } }
tasks.named("compileKotlin") { dependsOn(genConfig) }

dependencies {
    implementation(project(":shared"))
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(libs.kotlinx.coroutines.swing)
    implementation(libs.jna.platform)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}

compose.desktop {
    application {
        mainClass = "uz.anncorp.qurai.desktop.MainKt"
        // The Windows tray/start-menu name and the installer name are the product name.
        nativeDistributions {
            targetFormats(TargetFormat.Msi)
            packageName = "QURAI"
            packageVersion = appVersion
            description = "QURAI - qurilish smeta va fakt tizimi"
            vendor = "ANN Corporation"
            modules("java.net.http", "jdk.unsupported")
            windows {
                menuGroup = "QURAI"
                perUserInstall = true
                // Fixed UUID: later versions upgrade this install in place instead of installing side by side.
                upgradeUuid = "6f1c0d4e-52c3-4f5b-9a77-3c1d8e2b9a10"
                shortcut = true
                menu = true
            }
        }
        buildTypes.release.proguard {
            isEnabled.set(true)
            obfuscate.set(true)
            optimize.set(false)
            configurationFiles.from(project.file("proguard-rules.pro"))
        }
    }
}