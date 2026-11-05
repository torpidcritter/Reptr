/**
 * Sample data lives only in this one account, never in a real user's. Run
 * `pnpm db:demo` to fill it and `REPTR_DEMO=1 pnpm dev` to look around as it.
 */
export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000de30";

export const isDemoUser = (id: string | null | undefined) => id === DEMO_USER_ID;
