import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useValueChange } from "./use-value-change.js";

function chainHandlers<E>(...handlers: Array<((event: E) => void) | undefined>) {
  return (event: E) => {
    for (const handler of handlers) {
      handler?.(event);
    }
  };
}

type ArmedSession = {
  identity: string;
  generation: number;
};

/**
 * Arm → confirm double-check for destructive inline actions (issue #207). First
 * activation arms; second within `timeoutMs` runs `onConfirm`. Resets on blur,
 * Escape, timeout, or after confirm. Mutation/pending/error stay at the call site.
 */
export function useDoubleCheck({
  onConfirm,
  identity,
  timeoutMs = 10_000,
}: {
  onConfirm: () => void;
  /**
   * Stable identity of the entity this button acts on (e.g. `transaction.id`).
   * MUST be a primitive that is referentially stable across renders for the same
   * entity — pass the id string, never a freshly-built object/array, or the
   * armed state will be cleared on every render. When this changes (the list
   * reordered and React recycled this instance for a different row), the hook
   * drops any armed state so a confirm can't fire against the wrong onConfirm.
   */
  identity: string;
  timeoutMs?: number;
}) {
  const [generation, setGeneration] = useState(0);
  const [armedSession, setArmedSession] = useState<ArmedSession | null>(null);
  const armed = armedSession?.identity === identity && armedSession.generation === generation;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const disarm = useCallback(() => {
    clearTimer();
    setArmedSession(null);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  // Synchronous reset on identity change (ADR 0025) — not a post-paint Effect, so
  // no committed frame can show armed UI bound to a different entity's onConfirm.
  // Bump `generation` so any still-scheduled timeout from the prior identity is
  // invalidated even if identity round-trips (A → B → A) before it fires.
  useValueChange(identity, () => {
    setArmedSession(null);
    setGeneration((current) => current + 1);
  });

  // Cancel the pending timeout when identity changes; generation covers any
  // effect-timing gap, but clearing the timer avoids pointless late callbacks.
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity is the intentional trigger.
  useEffect(() => {
    clearTimer();
  }, [identity, clearTimer]);

  function getButtonProps({
    onClick,
    onBlur,
    onKeyDown,
  }: {
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    onBlur?: (event: FocusEvent<HTMLButtonElement>) => void;
    onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  } = {}) {
    return {
      onClick: chainHandlers<MouseEvent<HTMLButtonElement>>(onClick, () => {
        if (!armed) {
          clearTimer();
          const armedIdentity = identity;
          const armedGeneration = generation;
          setArmedSession({ identity: armedIdentity, generation: armedGeneration });
          timerRef.current = setTimeout(() => {
            timerRef.current = undefined;
            setArmedSession((current) =>
              current?.identity === armedIdentity && current.generation === armedGeneration
                ? null
                : current,
            );
          }, timeoutMs);
          return;
        }
        disarm();
        onConfirmRef.current();
      }),
      onBlur: chainHandlers<FocusEvent<HTMLButtonElement>>(onBlur, () => {
        if (armed) disarm();
      }),
      onKeyDown: chainHandlers<KeyboardEvent<HTMLButtonElement>>(onKeyDown, (event) => {
        if (event.key === "Escape" && armed) {
          event.preventDefault();
          disarm();
        }
      }),
    };
  }

  return { armed, getButtonProps };
}
