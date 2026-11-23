//! Called from Swift through the C functions below (declared in ios/rust_core.h)
//! and from Kotlin through the JNI functions in `android` (RustBridge.kt).
//! After changing anything here, run `build:rust` and rebuild the app.
//!
//! Each example shows one kind of value crossing into Rust:
//! - `add`: numbers
//! - `greet`: strings, and who frees them
//! - `sum`: arrays
//! - `count_primes`: errors, panics and slow work (an AsyncFunction in JS)
//!
//! The plain Rust functions hold the logic and are what `cargo test` checks;
//! the exported ones only convert values for Swift and Kotlin.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::panic::{self, UnwindSafe};

pub fn add(a: i32, b: i32) -> i32 {
    a.wrapping_add(b)
}

pub fn greet(name: &str) -> String {
    format!("Hello, {name}, from Rust!")
}

pub fn sum(values: &[f64]) -> f64 {
    values.iter().sum()
}

/// Above this, the sieve's memory use (one byte per number) gets too big for a phone.
pub const MAX_PRIME_LIMIT: i64 = 10_000_000;

/// Counts the primes below `limit`. Big limits take a while, which is why JS
/// calls it as an AsyncFunction — off the JS thread, returning a Promise.
pub fn count_primes(limit: i64) -> Result<i64, String> {
    if !(0..=MAX_PRIME_LIMIT).contains(&limit) {
        return Err(format!(
            "limit must be between 0 and {MAX_PRIME_LIMIT}, got {limit}"
        ));
    }
    let limit = limit as usize;
    if limit <= 2 {
        return Ok(0);
    }
    let mut is_prime = vec![true; limit];
    is_prime[0] = false;
    is_prime[1] = false;
    let mut i = 2;
    while i * i < limit {
        if is_prime[i] {
            for multiple in (i * i..limit).step_by(i) {
                is_prime[multiple] = false;
            }
        }
        i += 1;
    }
    Ok(is_prime.iter().filter(|&&prime| prime).count() as i64)
}

/// Runs `f`, turning a panic into an error: unwinding into Swift or Kotlin
/// would crash the app. Wrap anything that can panic (unwrap, indexing, ...).
fn catch_panic<T>(f: impl FnOnce() -> Result<T, String> + UnwindSafe) -> Result<T, String> {
    panic::catch_unwind(f).unwrap_or_else(|_| Err("Rust code panicked".to_string()))
}

// ---- iOS: C ABI ----
// Functions that take pointers are `unsafe`: Rust can't check what Swift
// passes, so each one's `# Safety` section says what the caller must promise.

#[no_mangle]
pub extern "C" fn rust_core_add(a: i32, b: i32) -> i32 {
    add(a, b)
}

/// Returns a string Rust allocated: pass it to `rust_core_free_string` when done.
///
/// # Safety
/// `name` must point to a NUL-terminated string that stays valid during the call.
#[no_mangle]
pub unsafe extern "C" fn rust_core_greet(name: *const c_char) -> *mut c_char {
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy();
    // A Rust string with no NUL bytes in it, so this can't fail.
    CString::new(greet(&name)).unwrap().into_raw()
}

/// # Safety
/// `s` must be null or a string from this library, and is freed only once.
#[no_mangle]
pub unsafe extern "C" fn rust_core_free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe { drop(CString::from_raw(s)) }
    }
}

/// An array arrives as a pointer to its first element plus a length. Swift
/// owns the memory and only lends it for this call, so don't keep the slice.
///
/// # Safety
/// `values` must be null or point to `len` doubles that stay valid during the call.
#[no_mangle]
pub unsafe extern "C" fn rust_core_sum(values: *const f64, len: usize) -> f64 {
    if values.is_null() || len == 0 {
        // An empty Swift array may pass a null pointer, which a slice can't hold.
        return 0.0;
    }
    sum(unsafe { std::slice::from_raw_parts(values, len) })
}

/// C has no exceptions, so failure is reported through `error`: on success it's
/// left null, on failure it's set to a message (free it with
/// `rust_core_free_string`) and the return value means nothing.
///
/// # Safety
/// `error` must be null or point to a writable `char *`.
#[no_mangle]
pub unsafe extern "C" fn rust_core_count_primes(limit: i64, error: *mut *mut c_char) -> i64 {
    match catch_panic(|| count_primes(limit)) {
        Ok(count) => count,
        Err(message) => {
            if !error.is_null() {
                let message = CString::new(message).unwrap_or_default();
                unsafe { *error = message.into_raw() };
            }
            -1
        }
    }
}

// ---- Android: JNI ----
// Each name is Java_<package>_<class>_<method> for expo.modules.rustcore.RustBridge.

#[cfg(target_os = "android")]
mod android {
    use jni::objects::{JClass, JDoubleArray, JString};
    use jni::sys::{jdouble, jint, jlong, jstring};
    use jni::JNIEnv;

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_rustcore_RustBridge_add(
        _env: JNIEnv,
        _class: JClass,
        a: jint,
        b: jint,
    ) -> jint {
        super::add(a, b)
    }

    /// Java strings are copied into Rust and back, so there's nothing to free by hand.
    #[no_mangle]
    pub extern "system" fn Java_expo_modules_rustcore_RustBridge_greet<'local>(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        name: JString<'local>,
    ) -> jstring {
        let name: String = env.get_string(&name).unwrap().into();
        env.new_string(super::greet(&name)).unwrap().into_raw()
    }

    /// The Java array lives on the JVM's heap, so it's copied into a Rust Vec first.
    #[no_mangle]
    pub extern "system" fn Java_expo_modules_rustcore_RustBridge_sum<'local>(
        env: JNIEnv<'local>,
        _class: JClass<'local>,
        values: JDoubleArray<'local>,
    ) -> jdouble {
        let len = env.get_array_length(&values).unwrap() as usize;
        let mut buffer = vec![0.0; len];
        env.get_double_array_region(&values, 0, &mut buffer)
            .unwrap();
        super::sum(&buffer)
    }

    /// An error becomes a Java exception: Kotlin sees it thrown as soon as this
    /// returns, and Expo turns it into a rejected Promise in JS.
    #[no_mangle]
    pub extern "system" fn Java_expo_modules_rustcore_RustBridge_countPrimes<'local>(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        limit: jlong,
    ) -> jlong {
        match super::catch_panic(|| super::count_primes(limit)) {
            Ok(count) => count,
            Err(message) => {
                let _ = env.throw_new("java/lang/IllegalArgumentException", message);
                // Ignored: Kotlin throws the exception instead of returning this.
                -1
            }
        }
    }
}

// `cargo test` (from rust/) runs these on your computer — no device needed.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn sums() {
        assert_eq!(sum(&[1.5, 2.5, 3.0]), 7.0);
        assert_eq!(sum(&[]), 0.0);
    }

    #[test]
    fn counts_primes() {
        assert_eq!(count_primes(0), Ok(0));
        assert_eq!(count_primes(10), Ok(4)); // 2, 3, 5, 7
        assert_eq!(count_primes(1_000_000), Ok(78_498));
    }

    #[test]
    fn rejects_limits_out_of_range() {
        assert!(count_primes(-1).is_err());
        assert!(count_primes(MAX_PRIME_LIMIT + 1).is_err());
    }

    #[test]
    fn reports_errors_over_the_c_abi() {
        let mut error: *mut c_char = std::ptr::null_mut();
        unsafe {
            assert_eq!(rust_core_count_primes(-1, &mut error), -1);
            assert!(!error.is_null());
            rust_core_free_string(error);
        }
    }
}
