# rust-core

A local Expo module whose code is written in Rust. Expo links everything in `modules/` into the app automatically.

```ts
import RustCore from './modules/rust-core'; // adjust the path to where you import it from

RustCore.add(2, 3); // 5
RustCore.greet('Ana'); // "Hello, Ana, from Rust!"
RustCore.sum([1.5, 2.5, 3]); // 7

// Slow work runs off the JS thread and returns a Promise. Rust errors reject it.
await RustCore.countPrimes(1_000_000); // 78498
await RustCore.countPrimes(-1); // rejects; the message includes "limit must be between 0 and 10000000, got -1"
```

Each one shows how a different kind of value crosses into Rust:

| Function | Shows |
| --- | --- |
| `add` | Numbers |
| `greet` | Strings, and freeing memory Rust allocated |
| `sum` | Arrays |
| `countPrimes` | Errors, catching panics, and slow work as an `AsyncFunction` |

Test the Rust logic on your computer, without a device: `cd modules/rust-core/rust && cargo test`.

## Setup

You need, once:

- Rust: https://rustup.rs
- For Android: the Android NDK (Android Studio > SDK Manager > SDK Tools > NDK) and `cargo install cargo-ndk`
- For iOS: macOS with Xcode

Then build the Rust code before generating the native projects:

```sh
npm run build:rust      # or: sh modules/rust-core/build-rust.sh ios|android
npx expo prebuild
```

Run `build:rust` again after every change to the Rust code, then rebuild the app (`npm run ios` / `npm run android`). The build output is git-ignored, so a fresh clone needs it too.

This is native code, so it doesn't run in Expo Go.

## How a call gets to Rust

| Layer | iOS | Android |
| --- | --- | --- |
| JS | `index.ts` | `index.ts` |
| Expo module | `ios/RustCoreModule.swift` | `android/.../RustCoreModule.kt` |
| Into Rust | C functions declared in `ios/rust_core.h` | JNI functions declared in `android/.../RustBridge.kt` |
| Rust | `rust/src/lib.rs` | `rust/src/lib.rs` |

## Adding a function

1. Write it in `rust/src/lib.rs` as a plain Rust function, then export it twice: as an `extern "C"` function for iOS, and as a `Java_expo_modules_rustcore_RustBridge_<name>` function in the `android` module.
2. Declare the C function in `ios/rust_core.h` and the JNI one in `RustBridge.kt`.
3. Add a `Function(...)` for it to `RustCoreModule.swift` and `RustCoreModule.kt`, and its type to `index.ts`.
4. Run `build:rust` and rebuild the app.

Things to keep in mind:

- **Memory**: whoever allocates frees. A string Rust returns over the C ABI must go back to Rust to be freed, like `rust_core_free_string`.
- **Panics**: a panic must not cross into Swift or Kotlin. Where code can panic, wrap it in `catch_panic` (see `countPrimes`), which turns a panic into an error.
- **Slow work**: `Function` runs on the JS thread. Use `AsyncFunction` in the Swift and Kotlin modules for anything slow, and it returns a Promise in JS.
