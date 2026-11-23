package expo.modules.rustcore

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RustCoreModule : Module() {
  // See https://docs.expo.dev/modules/module-api for what a definition can contain.
  override fun definition() = ModuleDefinition {
    Name("RustCore")

    Function("add") { a: Int, b: Int ->
      RustBridge.add(a, b)
    }

    Function("greet") { name: String ->
      RustBridge.greet(name)
    }

    Function("sum") { values: List<Double> ->
      RustBridge.sum(values.toDoubleArray())
    }

    // AsyncFunction runs off the JS thread and returns a Promise; the exception
    // RustBridge throws on a Rust error rejects it.
    AsyncFunction("countPrimes") { limit: Long ->
      RustBridge.countPrimes(limit)
    }
  }
}
