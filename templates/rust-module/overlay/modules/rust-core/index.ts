import { requireNativeModule } from 'expo';

// One entry per Function(...) in ios/RustCoreModule.swift and android/.../RustCoreModule.kt.
interface RustCoreModule {
  add(a: number, b: number): number;
  greet(name: string): string;
  sum(values: number[]): number;
  /** Primes below `limit` (0 to 10,000,000). Rejects when it's out of range. */
  countPrimes(limit: number): Promise<number>;
}

export default requireNativeModule<RustCoreModule>('RustCore');
