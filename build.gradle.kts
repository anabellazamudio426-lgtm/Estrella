plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// La isla (HTML/JS) vive en /web y se comparte con la app de escritorio: se copia a los assets al compilar.
val carpetaAssets = layout.buildDirectory.get().asFile.resolve("generated/agenteassets")
val copiarWeb by tasks.registering(Copy::class) {
    from(rootProject.file("../web"))
    into(carpetaAssets.resolve("web"))
}

android {
    namespace = "ar.dia.agenteflotante"
    compileSdk = 34
    defaultConfig {
        applicationId = "ar.dia.flotante.estrella"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(carpetaAssets)
}

tasks.named("preBuild") { dependsOn(copiarWeb) }
