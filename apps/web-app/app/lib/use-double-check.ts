import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

function chainHandlers<E>(...handlers: Array<((event: E) => void) | undefined>) {
  return (event: E) => {
    for (const handler of handlers) {
      handler?.(event);
    }
  };
}

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
  const [armed, setArmed] = useState(false);
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
    setArmed(false);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  // Self-protection against list reordering / key recycling (#207 follow-up):
  // if the entity this instance represents changes, abandon any armed state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity is the intentional trigger.
  useEffect(() => {
    disarm();
  }, [identity, disarm]);

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
          setArmed(true);
          timerRef.current = setTimeout(() => {
            timerRef.current = undefined;
            setArmed(false);
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
