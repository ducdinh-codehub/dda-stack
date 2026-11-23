package expo.modules.rustcore

// The JNI functions in rust/src/lib.rs. Their names there must match this
// package, class and method name: Java_expo_modules_rustcore_RustBridge_<method>.
object RustBridge {
  init {
    // librust_core.so, built into src/main/jniLibs by `build:rust`.
    System.loadLibrary("rust_core")
  }

  @JvmStatic external fun add(a: Int, b: Int): Int

  @JvmStatic external fun greet(name: String): String

  @JvmStatic external fun sum(values: DoubleArray): Double

  /** Throws IllegalArgumentException when Rust reports an error. */
  @JvmStatic external fun countPrimes(limit: Long): Long
}
