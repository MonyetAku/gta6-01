// Seeded random numbers (splitmix32) so the same seed always builds the
// same city, traffic layout and mission targets.
export function splitmix32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x9e3779b9) | 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = splitmix32(seed);
  }
  /** Float in [0, 1). */
  float() {
    return this.next();
  }
  /** Float in [min, max). */
  range(min, max) {
    return min + (max - min) * this.next();
  }
  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  /** Random element of an array. */
  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }
  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }
  /** Random unit vector on the XZ plane. */
  dir2() {
    const a = this.next() * Math.PI * 2;
    return { x: Math.cos(a), z: Math.sin(a) };
  }
}
