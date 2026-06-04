# Typed money values in history

Money changes in immutable history freeze semantic money values, not formatted text: an amount change stores integer minor units with the Circle Currency at the time of the event, then renders that value for the viewer's locale. This preserves audit meaning without leaking server or terminal locale into permanent history rows, and avoids locking old events to a display policy such as `USD 100.00` when future locales, currency displays, or non-two-decimal currencies need different presentation.

We keep Transactions themselves normalized as `amountMinorUnits` plus the Circle's Currency, because v1 forbids mixed currencies inside one Circle and locks Currency after the first Transaction. History intentionally duplicates Currency for money changes because it is append-only audit data: a history row must remain meaningful without re-resolving mutable Circle state.

Money formatting call sites choose an explicit presentation policy instead of relying on ambient `Intl` locale defaults. Normal web UI and history rendering use the viewer locale (`navigator.language` in the browser, with an explicit `en-US` fallback for non-browser test/render contexts), exports use a positive plain decimal amount plus a separate ISO Currency column, and Convex/server code does not format viewer-facing money.
