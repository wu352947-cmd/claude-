# sherpa-onnx 的原生代码按名字访问这些 Kotlin 类和字段，不能被混淆或删除
-keep class com.k2fsa.sherpa.onnx.** { *; }
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
