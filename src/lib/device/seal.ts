// Encrypts what an account keeps on this device with that account's key (AES-GCM).
// The key lives in memory only while the account is signed in here, so data left in the
// browser after sign-out can't be read by someone else using the same browser.

const PREFIX = "enc1:";

function toB64(bytes: Uint8Array) {
  let text = "";
  // In slices: spreading a large workout into one call overflows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export const canSeal = () => typeof crypto !== "undefined" && !!crypto.subtle;

/** Turns the base64 key from the server into a key that can't be read back out. */
export async function importKey(base64: string) {
  return crypto.subtle.importKey("raw", fromB64(base64), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export const isSealed = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(PREFIX);

export async function seal(key: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );
  return `${PREFIX}${toB64(iv)}:${toB64(new Uint8Array(data))}`;
}

/** The plain text, or null when the value was sealed with another key or is damaged. */
export async function unseal(key: CryptoKey, value: string) {
  try {
    const [iv, data] = value.slice(PREFIX.length).split(":");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(iv) },
      key,
      fromB64(data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
