import * as ExpoCrypto from 'expo-crypto';

/**
 * Hermes has `crypto.getRandomValues` but not `crypto.subtle`. Supabase PKCE
 * needs SHA-256 via `subtle.digest`; without it, auth-js falls back to a
 * plaintext code challenge and logs a warning.
 *
 * Import this before `createClient`. expo-crypto is already in the native
 * binary — this only wires it onto the WebCrypto shape auth-js checks.
 */
const g = globalThis as typeof globalThis & {
  crypto?: { subtle?: { digest: typeof ExpoCrypto.digest }; getRandomValues?: typeof ExpoCrypto.getRandomValues };
};

if (typeof g.crypto?.subtle?.digest !== 'function') {
  const subtle = {
    digest(algorithm: AlgorithmIdentifier, data: BufferSource) {
      const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
      const algo =
        name === 'SHA-256' || name === 'SHA256'
          ? ExpoCrypto.CryptoDigestAlgorithm.SHA256
          : name === 'SHA-384' || name === 'SHA384'
            ? ExpoCrypto.CryptoDigestAlgorithm.SHA384
            : ExpoCrypto.CryptoDigestAlgorithm.SHA512;
      return ExpoCrypto.digest(algo, data);
    },
  };

  try {
    if (g.crypto) {
      Object.defineProperty(g.crypto, 'subtle', { configurable: true, value: subtle });
    } else {
      g.crypto = {
        subtle,
        getRandomValues: ExpoCrypto.getRandomValues.bind(ExpoCrypto),
      };
    }
  } catch {
    g.crypto = {
      ...g.crypto,
      subtle,
      getRandomValues: g.crypto?.getRandomValues ?? ExpoCrypto.getRandomValues.bind(ExpoCrypto),
    };
  }
}
