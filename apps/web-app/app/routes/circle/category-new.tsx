import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { NewCategoryForm } from "~/components/category-form.js";
import { Splash } from "~/components/splash.js";
import { parseReturnTo, RETURN_TO_PARAM } from "~/lib/return-to-url.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

/**
 * The new-Category route — `/circles/:circleRef/categories/new` (issue #96). A dedicated
 * create page so the Categories list no longer renders a new-Category form above its rows
 * alongside per-row edit forms and history panels — the overload this issue removes. Same
 * static-segment + lifecycle pattern as `transaction-new.tsx`.
 *
 * Own param: `type=expense|income` (required — Categories are type-specific). The list CTA
 * deep-links the active type tab; a missing / invalid type has nothing safe to create, so
 * the route ejects to the validated `returnTo` origin (issue #123) rather than guessing.
 *
 * Close (cancel / successful save), the invalid-`type` guard, and the archived-Circle
 * redirect all land on `returnTo` — the categories list the CTA was opened FROM, with its
 * type/status/search intact, or the bare list when absent / malformed / out-of-scope. The
 * server enforces writability anyway (ADR 0015), but the page shouldn't offer a form every
 * submit would reject. `closing` + `Splash` keep the form from flashing while leaving.
 */
export default function CategoryNew() {
  const circle = useCircle();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const writable = circle.status === "active";

  const listBase = `/circles/${circle.ref}/categories`;
  const returnUrl = parseReturnTo(searchParams.get(RETURN_TO_PARAM), { fallback: listBase });

  const rawType = searchParams.get("type");
  const type = rawType === "expense" || rawType === "income" ? rawType : null;

  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    navigate(returnUrl);
  };

  // An archived Circle is read-only and a missing / invalid `type` has nothing to create:
  // both eject to the return target. Replace so the dead create URL leaves no Back entry.
  useEffect(() => {
    if (!writable || type === null) {
      navigate(returnUrl, { replace: true });
    }
  }, [writable, type, navigate, returnUrl]);

  // While ejecting or leaving, show the splash. The inline `type === null` check also
  // narrows `type` to a concrete `TransactionType` for the form below.
  if (!writable || type === null || closing) {
    return <Splash label="Opening category…" />;
  }

  return <NewCategoryForm circleId={circle.id} type={type} onClose={close} />;
}
