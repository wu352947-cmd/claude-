import java.net.URI
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// 离线语音识别库（sherpa-onnx）。体积较大，不放进 git，首次构建时自动下载。
val sherpaVersion = "1.10.45"
val sherpaAar = file("libs/sherpa-onnx-$sherpaVersion.aar")
if (!sherpaAar.exists()) {
    sherpaAar.parentFile.mkdirs()
    val url = "https://huggingface.co/csukuangfj/sherpa-onnx-libs/resolve/main/android/aar/" +
        "sherpa-onnx-static-link-onnxruntime-$sherpaVersion.aar"
    logger.lifecycle("Downloading $url")
    URI(url).toURL().openStream().use { input ->
        sherpaAar.outputStream().use { input.copyTo(it) }
    }
}

android {
    namespace = "com.yimu.subtitle"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.yimu.subtitle"
        minSdk = 29 // 捕获其他 App 声音需要 Android 10+
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        ndk { abiFilters += "arm64-v8a" }
    }

    // 固定签名：以后每个新版本都能直接覆盖安装，不丢设置。
    signingConfigs {
        create("yimu") {
            storeFile = rootProject.file("keystore/yimu.jks")
            storePassword = "yimu-subtitle"
            keyAlias = "yimu"
            keyPassword = "yimu-subtitle"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("yimu")
        }
        debug {
            signingConfig = signingConfigs.getByName("yimu")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true }

    packaging {
        jniLibs { useLegacyPackaging = true }
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(files(sherpaAar))
    implementation(platform("androidx.compose:compose-bom:2025.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
