/**
 * Lightweight, zero-dependency, isomorphic SHA-256 and HMAC-SHA256
 * Operates synchronously in both Node.js and modern Web Browsers without externalizing errors.
 */

function rotr(n, b) {
  return (n >>> b) | (n << (32 - b));
}

export function sha256(ascii) {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i, j;
  let result = '';

  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  let hash = [];
  const k = [];
  let primeCounter = 0;

  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  hash = hash.slice(0, 8);

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return; // UTF-8 outside ASCII boundary fallback
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const s0 = i >= 16 ? rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3) : 0;
      const s1 = i >= 16 ? rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10) : 0;

      if (i >= 16) {
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const s0h = rotr(hash[0], 2) ^ rotr(hash[0], 13) ^ rotr(hash[0], 22);
      const s1h = rotr(hash[4], 6) ^ rotr(hash[4], 11) ^ rotr(hash[4], 25);

      const t1 = (hash[7] + s1h + ch + k[i] + w[i]) | 0;
      const t2 = (s0h + maj) | 0;

      hash = [(t1 + t2) | 0, hash[0], hash[1], hash[2], (hash[3] + t1) | 0, hash[4], hash[5], hash[6]];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export function hmacSha256(key, message) {
  // Simple HMAC implementation using standard block padding
  let k = key;
  if (k.length > 64) {
    k = sha256(k);
  }
  while (k.length < 64) {
    k += '\x00';
  }

  let oKeyPad = '';
  let iKeyPad = '';
  for (let i = 0; i < 64; i++) {
    oKeyPad += String.fromCharCode(k.charCodeAt(i) ^ 0x5c);
    iKeyPad += String.fromCharCode(k.charCodeAt(i) ^ 0x36);
  }

  const innerHash = hexToAscii(sha256(iKeyPad + message));
  return sha256(oKeyPad + innerHash);
}

function hexToAscii(hex) {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}
