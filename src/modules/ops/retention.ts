// How long queued offline changes stay valid, shared by the device queue and the server.

/**
 * How long the server remembers an op id. A device never sends an op older than
 * OP_MAX_AGE_DAYS on its own, and this is longer, so a retry from a device that was
 * offline for months still can't double an entry.
 */
export const OP_RETENTION_DAYS = 400;
/** A device asks the person before sending anything queued longer than this. */
export const OP_MAX_AGE_DAYS = 365;

const DAY = 86_400_000;

/** True when a queued change is too old to send without the person confirming it. */
export const tooOldToSend = (queuedAt: number, now = Date.now()) =>
  now - queuedAt > OP_MAX_AGE_DAYS * DAY;
