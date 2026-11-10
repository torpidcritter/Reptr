"use client";

import { del, get, keys, set } from "idb-keyval";
import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
import { canSeal, importKey, isSealed, seal, unseal } from "./seal";
import { announceChange, isLeader, joinTabs, onOtherTabChange } from "./tabs";

// Everything Reptr keeps on a device (the workout being logged, offline quick logs) is
// stored under the signed-in account's id. Another account on the same browser reads
// and writes its own keys and never sees, sends or replaces the first account's data.

const hasIdb = () => typeof indexedDB !== "undefined";

/** Device stores that hold one account's data. */
export const ACCOUNT_STORES = ["reptr-active-workout", "reptr-outbox"] as const;

let account: string | null = null;
/** The account's device key, in memory only (see seal.ts). Null means stored in plain. */
let sealKey: CryptoKey | null = null;
/** While switching, the in-memory reset must not be written over anyone's saved data. */
let switching = false;
/** Writes made before the account was known; saved once it is. */
const early = new Map<string, string>();

export const currentAccount = () => account;
export const scopedKey = (name: string, id = account) => (id ? `${name}:${id}` : null);

/** Health of on-device storage, shown to the person when something is wrong. */
type StorageHealth = {
  /** Set when a save to the device failed, for example because storage is full. */
  writeError: string | null;
  /** Whether the browser agreed not to clear Reptr's storage under pressure. */
  persisted: boolean | null;
  /** Fraction of the storage quota in use, when the browser reports it. */
  usage: number | null;
  /** Saved device data that couldn't be read; set aside, never deleted. */
  unreadable: string[];
};
export const useStorageHealth = create<StorageHealth>(() => ({
  writeError: null,
  persisted: null,
  usage: null,
  unreadable: [],
}));

function writeFailed(err: unknown) {
  const quota =
    err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
  useStorageHealth.setState({
    writeError: quota
      ? "This device is out of storage space, so new sets may not be kept if you go offline. Free up space."
      : "This device couldn't save your latest change. Keep the app open until it syncs.",
  });
}

/**
 * IndexedDB storage for zustand that reads and writes the current account's key only.
 * Before an account is set nothing is read, and writes wait in memory.
 */
export const accountStorage: StateStorage = {
  getItem: async (name) => {
    const key = scopedKey(name);
    if (!hasIdb() || !key) return null;
    const raw = (await get<string>(key)) ?? (await adoptLegacy(name, key));
    if (raw == null) return null;
    // Encrypted, but this session has no key: leave it untouched for when it does.
    if (isSealed(raw) && !sealKey) return null;
    const value = await openValue(raw);
    if (value != null && readable(name, value)) {
      // Saved before encryption existed: encrypt it now.
      if (sealKey && !isSealed(raw)) await set(key, await seal(sealKey, value));
      return value;
    }
    await setAside(name, key, raw);
    return null;
  },
  setItem: async (name, value) => {
    if (switching) return;
    // Only the leading tab writes the workout; the others show it read-only.
    if (name === "reptr-active-workout" && !isLeader()) return;
    // Stores shared by every tab are only written under a lock (see writeShared).
    if (SHARED.has(name)) return;
    await write(name, value);
  },
  removeItem: async (name) => {
    const key = scopedKey(name);
    if (hasIdb() && key) await del(key);
  },
};

/** Stores that any tab may change; written only through writeShared, under a lock. */
const SHARED = new Set(["reptr-outbox"]);

async function write(name: string, value: string) {
  const key = scopedKey(name);
  if (!key) {
    early.set(name, value);
    return;
  }
  if (!hasIdb()) return;
  try {
    // Without the key, never replace a copy that was stored encrypted: it is opened again
    // once the key is back.
    if (!sealKey && isSealed(await get(key))) return;
    await set(key, sealKey ? await seal(sealKey, value) : value);
    announceChange(name);
    if (useStorageHealth.getState().writeError) useStorageHealth.setState({ writeError: null });
  } catch (err) {
    writeFailed(err);
    throw err;
  }
}

/** Saves a shared store. Call only while holding its lock (withStoreLock). */
export const writeShared = (name: string, value: string) => write(name, value);

/**
 * Before device data was kept per account, it was stored under the bare store name.
 * The first account to sign in on the device after the update takes it over, once. The
 * server still refuses a workout that belongs to another account, and the device keeps
 * it rather than dropping it.
 */
async function adoptLegacy(name: string, key: string) {
  const legacy = (await get<string>(name)) ?? null;
  if (legacy == null) return null;
  await set(key, legacy);
  await del(name);
  return legacy;
}

/** The saved text: decrypted when it was encrypted, null when this key can't open it. */
async function openValue(raw: string) {
  if (!isSealed(raw)) return raw;
  return sealKey ? unseal(sealKey, raw) : null;
}

/** Checks a saved value has the shape its store expects. */
type Validator = (state: Record<string, unknown>) => boolean;
const validators = new Map<string, Validator>();

function readable(name: string, value: unknown) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : null;
    const state = parsed?.state;
    if (!state || typeof state !== "object" || Array.isArray(state)) return false;
    return validators.get(name)?.(state) ?? true;
  } catch {
    return false;
  }
}

/** Prefix for saved data that couldn't be read. Kept under the account until wiped. */
export const UNREADABLE_PREFIX = "reptr-unreadable/";

/**
 * A saved copy that can't be read (cut short by a crash, or from a build with a different
 * shape) would otherwise break the app on every load. It is moved aside, under the same
 * account, so the app starts clean and the person can still download it.
 */
async function setAside(name: string, key: string, value: unknown) {
  const id = key.slice(name.length + 1);
  await set(`${UNREADABLE_PREFIX}${name}/${Date.now()}:${id}`, value);
  await del(key);
  useStorageHealth.setState((s) => ({ unreadable: [...new Set([...s.unreadable, name])] }));
}

/** Data set aside for the current account, as one JSON document to download. */
export async function unreadableData() {
  if (!hasIdb() || !account) return null;
  const mine = (await keys())
    .map(String)
    .filter((k) => k.startsWith(UNREADABLE_PREFIX) && k.endsWith(`:${account}`));
  const entries = await Promise.all(
    mine.map(async (k) => {
      const raw = await get(k);
      return [k, typeof raw === "string" ? ((await openValue(raw)) ?? raw) : raw] as const;
    }),
  );
  return { format: "reptr-unreadable-v1", account, entries: Object.fromEntries(entries) };
}

type Rehydratable = {
  persist: { rehydrate: () => Promise<void> | void; getOptions: () => { name?: string } };
};
const stores: { reset: () => void; store: Rehydratable }[] = [];

/** Each device store registers itself so it can be reloaded when the account changes. */
export function registerAccountStore(store: Rehydratable, reset: () => void, validate?: Validator) {
  stores.push({ store, reset });
  const name = store.persist.getOptions().name;
  if (name && validate) validators.set(name, validate);
}

const reloadAll = async () => {
  await Promise.all(stores.map((s) => s.store.persist.rehydrate()));
};

// Another tab saved: reload that store here so this tab shows the latest.
onOtherTabChange((name) => {
  for (const s of stores)
    if (s.store.persist.getOptions().name === name) s.store.persist.rehydrate();
});

/**
 * Points the device stores at an account. A different account than before starts from
 * empty memory and loads its own data; any writes made before this are saved under it.
 * With the account's device key, everything is stored encrypted.
 */
export async function switchAccount(id: string, keyBase64?: string) {
  if (account === id) return;
  const nextKey = keyBase64 && canSeal() ? await importKey(keyBase64) : null;
  const previous = account;
  if (previous) {
    switching = true;
    try {
      for (const s of stores) s.reset();
    } finally {
      switching = false;
    }
  }
  account = id;
  sealKey = nextKey;
  for (const [name, value] of early) await write(name, value);
  early.clear();
  await reloadAll();
  joinTabs(id, reloadAll);
  await rememberAccount(id);
}

const LAST_ACCOUNT = "reptr-last-account";

/**
 * When a different account than last time opens the app on this device, pages cached
 * for the previous account are cleared, so they can't be opened offline.
 */
async function rememberAccount(id: string) {
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_ACCOUNT);
    localStorage.setItem(LAST_ACCOUNT, id);
  } catch {}
  if (last && last !== id) await clearPageCaches();
}

/** Removes cached app pages (never the build files, which hold nothing personal). */
export async function clearPageCaches() {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith("reptr-pages")).map((n) => caches.delete(n)));
}

/** Deletes everything this device holds for an account. */
export async function wipeAccount(id: string) {
  if (hasIdb()) {
    // Every key stored under the account: the stores and anything set aside.
    const mine = (await keys()).map(String).filter((k) => k.endsWith(`:${id}`));
    await Promise.all(
      [...ACCOUNT_STORES.map((name) => scopedKey(name, id)!), ...mine].map((k) => del(k)),
    );
  }
  try {
    if (localStorage.getItem(LAST_ACCOUNT) === id) localStorage.removeItem(LAST_ACCOUNT);
  } catch {}
  await clearPageCaches();
}

/** Accounts with data on this device, for diagnostics and tests. */
export async function accountsOnDevice() {
  if (!hasIdb()) return [];
  const all = (await keys()).map(String);
  return [
    ...new Set(all.filter((k) => k.includes(":")).map((k) => k.split(":").slice(1).join(":"))),
  ];
}

/**
 * Asks the browser to keep Reptr's storage even when the device is low on space, and
 * checks how full it is. Browsers that don't support it simply say no.
 */
export async function protectStorage() {
  try {
    const sm = navigator.storage;
    if (!sm) return;
    const persisted = (await sm.persisted?.()) || (await sm.persist?.()) || false;
    const est = await sm.estimate?.();
    const usage = est?.quota ? (est.usage ?? 0) / est.quota : null;
    useStorageHealth.setState({ persisted, usage });
  } catch {}
}
