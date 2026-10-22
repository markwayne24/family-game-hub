// Private messages between the host and one player. Everything in a room travels on one shared channel, so anything
// secret (your role, your word) is encrypted so that only its recipient can read it. Each player makes a fresh key pair
// when they join and shares the public half; the host derives a shared secret with each player (ECDH) and seals with AES-GCM.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toB64 = bytes => { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const supported = () => !!globalThis.crypto?.subtle;

export async function makeKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
}

// Derived keys are cached per (my private key, their public key) so each player is set up only once.
const derived = new WeakMap();
async function sharedKey(myPrivate, peerJwk) {
  let perPeer = derived.get(myPrivate);
  if (!perPeer) derived.set(myPrivate, perPeer = new Map());
  const id = `${peerJwk.x}.${peerJwk.y}`;
  if (!perPeer.has(id)) {
    perPeer.set(id, (async () => {
      const pub = await crypto.subtle.importKey('jwk', { ...peerJwk, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, myPrivate, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    })());
  }
  return perPeer.get(id);
}

// Encrypt any JSON value for one recipient: { iv, ct } as base64.
export async function seal(myPrivate, peerJwk, value) {
  const key = await sharedKey(myPrivate, peerJwk);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

// Decrypt a sealed value, or return null if it was not meant for us or has been tampered with.
export async function open(myPrivate, peerJwk, sealed) {
  try {
    const key = await sharedKey(myPrivate, peerJwk);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, key, fromB64(sealed.ct));
    return JSON.parse(decoder.decode(plain));
  } catch {
    return null;
  }
}
