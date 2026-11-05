"use client";

import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

type Ask = { title: string; body?: string; confirm?: string; danger?: boolean };
const Ctx = createContext<(ask: Ask) => Promise<boolean>>(async () => false);

/** In-app confirmations instead of the browser's confirm() box. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolve = useRef<(ok: boolean) => void>(() => {});
  const confirm = useCallback(
    (a: Ask) =>
      new Promise<boolean>((r) => {
        resolve.current = r;
        setAsk(a);
      }),
    [],
  );
  const done = (ok: boolean) => {
    resolve.current(ok);
    resolve.current = () => {};
    setAsk(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={ask !== null} onClose={() => done(false)} title={ask?.title ?? ""}>
        {ask?.body && <p className="text-muted-foreground text-sm">{ask.body}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => done(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => done(true)}
            className={ask?.danger ? "bg-danger text-white" : undefined}
          >
            {ask?.confirm ?? "OK"}
          </Button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

/** `if (await confirm({ title: "Delete?" })) …` */
export const useConfirm = () => useContext(Ctx);
