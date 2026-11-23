#pragma once
#include <stddef.h>
#include <stdint.h>

// The C functions rust/src/lib.rs exports — keep this in step with it.
int32_t rust_core_add(int32_t a, int32_t b);
char *rust_core_greet(const char *name);
void rust_core_free_string(char *s);
double rust_core_sum(const double *values, size_t len);
// On failure, sets *error to a message to free with rust_core_free_string.
int64_t rust_core_count_primes(int64_t limit, char **error);
