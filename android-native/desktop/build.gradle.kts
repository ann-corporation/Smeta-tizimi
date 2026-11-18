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

val appVersion = "0.2.5"
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
// UI language: the Windows app reads the SAME translations as Android (app/src/main/res/values{,-ru,-en}/strings*.xml) - no second dictionary to keep in step.
val i18nDir = layout.buildDirectory.dir("generated/i18n")
val syncI18n = tasks.register<Sync>("syncI18n") {
    into(i18nDir.map { it.dir("i18n") })
    listOf("values" to "uz", "values-ru" to "ru", "values-en" to "en").forEach { (dir, loc) ->
        from(rootProject.file("app/src/main/res/$dir")) { include("strings*.xml"); into(loc) }
    }
    doLast {
        val root = destinationDir
        root.resolve("index.txt").writeText(root.walkTopDown().filter { it.isFile && it.extension == "xml" }.map { it.relativeTo(root).invariantSeparatorsPath }.sorted().joinToString("\n"))
    }
}
sourceSets { main { java.srcDir(genDir); resources.srcDir(i18nDir) } }
tasks.named("processResources") { dependsOn(syncI18n) }
tasks.named("compileKotlin") { dependsOn(genConfig) }

dependencies {
    implementation(project(":shared"))
    implementation(project(":ui-common"))
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
                iconFile.set(project.file("qurai.ico"))
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