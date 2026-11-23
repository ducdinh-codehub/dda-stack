import ExpoModulesCore

public class RustCoreModule: Module {
  // See https://docs.expo.dev/modules/module-api for what a definition can contain.
  public func definition() -> ModuleDefinition {
    Name("RustCore")

    Function("add") { (a: Int32, b: Int32) -> Int32 in
      rust_core_add(a, b)
    }

    Function("greet") { (name: String) -> String in
      let pointer = rust_core_greet(name)!
      // Rust allocated the string, so Rust has to free it.
      defer { rust_core_free_string(pointer) }
      return String(cString: pointer)
    }

    Function("sum") { (values: [Double]) -> Double in
      // Lends Rust the array's memory for the duration of the call.
      values.withUnsafeBufferPointer { buffer in
        rust_core_sum(buffer.baseAddress, buffer.count)
      }
    }

    // AsyncFunction runs off the JS thread and returns a Promise; a thrown
    // error rejects it.
    AsyncFunction("countPrimes") { (limit: Int) throws -> Int in
      var error: UnsafeMutablePointer<CChar>?
      let count = rust_core_count_primes(Int64(limit), &error)
      if let error {
        defer { rust_core_free_string(error) }
        throw RustException(String(cString: error))
      }
      return Int(count)
    }
  }
}

/// An error message from Rust, passed on to JS as the rejection reason.
final class RustException: GenericException<String> {
  override var reason: String {
    param
  }
}
