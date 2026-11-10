"use client";

import { create } from "zustand";

// Several tabs (or an installed app plus a browser tab) can have Reptr open at once.
// They share one IndexedDB, so if two of them edited the workout, the last to save would
// silently overwrite the other. One tab per account is the "leader": it alone edits the
// workout and runs the sync loops. Other tabs show the workout read-only and follow the
// leader's changes, and can ask to take over. The Web Locks API queues the other tabs,
// so when the leader tab closes, the next one takes over by itself.

type TabRole = {
  /** null until known; true where Web Locks aren't supported (every tab leads, as before). */
  leader: boolean | null;
};
export const useTabRole = create<TabRole>(() => ({ leader: null }));

export const isLeader = () => useTabRole.getState().leader !== false;

type Message = { type: "yield"; from: string } | { type: "changed"; store: string; from: string };

const tabId = typeof crypto !== "undefined" ? crypto.randomUUID() : "tab";
let channel: BroadcastChannel | null = null;
let release: (() => void) | null = null;
let current: string | null = null;
const listeners = new Set<(store: string) => void>();
let onBecomeLeader: () => Promise<void> = async () => {};

const supported = () => typeof navigator !== "undefined" && "locks" in navigator;

function send(m: Message) {
  channel?.postMessage(m);
}

function queue(account: string) {
  navigator.locks
    .request(`reptr-leader:${account}`, async () => {
      if (current !== account) return;
      await onBecomeLeader();
      useTabRole.setState({ leader: true });
      await new Promise<void>((resolve) => (release = resolve));
      useTabRole.setState({ leader: false });
      // Wait in line to lead again (after the tab that asked).
      setTimeout(() => current === account && queue(account), 0);
    })
    .catch(() => useTabRole.setState({ leader: true }));
}

/**
 * Joins the line to lead for this account. `refresh` reloads the device stores from
 * IndexedDB, so a tab that takes over starts from the previous leader's latest data.
 */
export function joinTabs(account: string, refresh: () => Promise<void>) {
  onBecomeLeader = refresh;
  if (current === account) return;
  current = account;
  release?.();
  if (!supported()) {
    useTabRole.setState({ leader: true });
    return;
  }
  useTabRole.setState({ leader: false });
  channel?.close();
  channel = new BroadcastChannel(`reptr-tabs:${account}`);
  channel.onmessage = (e: MessageEvent<Message>) => {
    if (e.data.from === tabId) return;
    if (e.data.type === "yield" && useTabRole.getState().leader) release?.();
    if (e.data.type === "changed") for (const l of listeners) l(e.data.store);
  };
  queue(account);
}

/** Asks the leading tab to hand over; this tab is next in line and takes over. */
export function takeOverHere() {
  send({ type: "yield", from: tabId });
}

/** Tells other tabs a store changed, so they reload it. */
export function announceChange(store: string) {
  send({ type: "changed", store, from: tabId });
}

/** Called when another tab changed a store. */
export function onOtherTabChange(fn: (store: string) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/**
 * Runs a read-modify-write of a shared store under a lock, so two tabs adding to the
 * same queue at the same moment can't drop each other's entries.
 */
export async function withStoreLock<T>(store: string, fn: () => Promise<T>): Promise<T> {
  if (!supported() || !current) return fn();
  return navigator.locks.request(`reptr-store:${store}:${current}`, fn);
}
