"use client";

import { del, get, keys, set } from "idb-keyval";
import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";

// Everything Reptr keeps on a device (the workout being logged, offline quick logs) is
// stored under the signed-in account's id. Another account on the same browser reads
// and writes its own keys and never sees, sends or replaces the first account's data.

const hasIdb = () => typeof indexedDB !== "undefined";

/** Device stores that hold one account's data. */
export const ACCOUNT_STORES = ["reptr-active-workout", "reptr-outbox"] as const;

let account: string | null = null;
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
};
export const useStorageHealth = create<StorageHealth>(() => ({
  writeError: null,
  persisted: null,
  usage: null,
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
    const value = (await get<string>(key)) ?? null;
    return value ?? (await adoptLegacy(name, key));
  },
  setItem: async (name, value) => {
    if (switching) return;
    const key = scopedKey(name);
    if (!key) {
      early.set(name, value);
      return;
    }
    if (!hasIdb()) return;
    try {
      await set(key, value);
      if (useStorageHealth.getState().writeError) useStorageHealth.setState({ writeError: null });
    } catch (err) {
      writeFailed(err);
      throw err;
    }
  },
  removeItem: async (name) => {
    const key = scopedKey(name);
    if (hasIdb() && key) await del(key);
  },
};

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

type Rehydratable = { persist: { rehydrate: () => Promise<void> | void } };
const stores: { reset: () => void; store: Rehydratable }[] = [];

/** Each device store registers itself so it can be reloaded when the account changes. */
export function registerAccountStore(store: Rehydratable, reset: () => void) {
  stores.push({ store, reset });
}

/**
 * Points the device stores at an account. A different account than before starts from
 * empty memory and loads its own data; any writes made before this are saved under it.
 */
export async function switchAccount(id: string) {
  if (account === id) return;
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
  for (const [name, value] of early) await accountStorage.setItem(name, value);
  early.clear();
  await Promise.all(stores.map((s) => s.store.persist.rehydrate()));
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
    await Promise.all(ACCOUNT_STORES.map((name) => del(scopedKey(name, id)!)));
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
