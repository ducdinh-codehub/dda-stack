#!/bin/sh
# Compiles rust/ for the app: ios/RustCore.xcframework and android/src/main/jniLibs.
# Run it before `expo prebuild`, and again after every change to the Rust code.
#
#   sh modules/rust-core/build-rust.sh            # iOS (on macOS) and Android
#   sh modules/rust-core/build-rust.sh android    # just one platform
set -eu

cd "$(dirname "$0")/rust"
platforms=${1:-ios android}

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found. Install Rust from https://rustup.rs" >&2
  exit 1
fi

# Installs a target's standard library if it's missing. Skipped without rustup
# (e.g. Rust from Homebrew), where the targets must be installed some other way.
add_targets() {
  if command -v rustup >/dev/null 2>&1; then rustup target add "$@"; fi
}

build_ios() {
  if [ "$(uname)" != Darwin ]; then
    echo "Skipping iOS: it needs macOS and Xcode."
    return
  fi
  add_targets aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
  # Match the podspec's minimum, so the linker doesn't warn about newer objects.
  export IPHONEOS_DEPLOYMENT_TARGET=15.1
  for target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
    cargo build --release --target "$target"
  done

  # An xcframework holds one library per platform, so the two simulator
  # architectures are merged into one first.
  mkdir -p target/ios-simulator
  lipo -create \
    target/aarch64-apple-ios-sim/release/librust_core.a \
    target/x86_64-apple-ios/release/librust_core.a \
    -output target/ios-simulator/librust_core.a

  rm -rf ../ios/RustCore.xcframework
  xcodebuild -create-xcframework \
    -library target/aarch64-apple-ios/release/librust_core.a \
    -library target/ios-simulator/librust_core.a \
    -output ../ios/RustCore.xcframework
}

build_android() {
  if ! command -v cargo-ndk >/dev/null 2>&1; then
    echo "cargo-ndk not found. Install it with: cargo install cargo-ndk" >&2
    exit 1
  fi
  add_targets aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
  rm -rf ../android/src/main/jniLibs
  # 16 KB pages: required by Google Play for 64-bit apps, and already the
  # default from NDK r28 — this covers older NDKs.
  CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384" \
  CARGO_TARGET_X86_64_LINUX_ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384" \
    cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 --platform 24 \
      -o ../android/src/main/jniLibs build --release
}

for platform in $platforms; do
  case "$platform" in
    ios) build_ios ;;
    android) build_android ;;
    *)
      echo "Unknown platform \"$platform\": use ios or android" >&2
      exit 1
      ;;
  esac
done
