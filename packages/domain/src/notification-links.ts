import { type IdValidator, parseRef } from "./ref.js";

/** Canonical in-app notification link shapes (NTF-1 / NTF-2 contract). */
export type NotificationLinkKind = "circle" | "transaction" | "category";

export interface ParsedNotificationLink {
  kind: NotificationLinkKind;
  circleRef: string;
  circleId: string;
  objectRef?: string;
  objectId?: string;
}

export function buildCircleNotificationLink(circleRef: string) {
  return `/circles/${circleRef}`;
}

export function buildTransactionNotificationLink(circleRef: string, transactionRef: string) {
  return `/circles/${circleRef}/transactions/${transactionRef}`;
}

export function buildCategoryNotificationLink(circleRef: string, categoryRef: string) {
  const params = new URLSearchParams({ categoryRef });
  return `/circles/${circleRef}/categories?${params.toString()}`;
}

/**
 * Parses a stored notification `link` path. Returns `null` when the shape does not
 * match one of the three canonical forms (circle path, transaction path segment,
 * category list route with `categoryRef` query) — callers treat that as text-only (ADR 0016).
 */
export function parseNotificationLinkPath(
  link: string,
  isValidId: IdValidator,
): ParsedNotificationLink | null {
  const queryIndex = link.indexOf("?");
  const path = queryIndex >= 0 ? link.slice(0, queryIndex) : link;
  const queryString = queryIndex >= 0 ? link.slice(queryIndex + 1) : "";

  const parts = path.split("/");
  if (parts.length < 3 || parts[0] !== "" || parts[1] !== "circles") {
    return null;
  }
  const circleRef = parts[2];
  if (!circleRef) {
    return null;
  }
  const circleParsed = parseRef(circleRef, isValidId);
  if (!circleParsed) {
    return null;
  }

  if (parts.length === 3) {
    return { kind: "circle", circleRef, circleId: circleParsed.id };
  }

  if (parts.length === 4 && parts[3] === "categories") {
    const categoryRef = new URLSearchParams(queryString).get("categoryRef");
    if (!categoryRef) {
      return null;
    }
    const objectParsed = parseRef(categoryRef, isValidId);
    if (!objectParsed) {
      return null;
    }
    return {
      kind: "category",
      circleRef,
      circleId: circleParsed.id,
      objectRef: categoryRef,
      objectId: objectParsed.id,
    };
  }

  if (parts.length !== 5) {
    return null;
  }

  const segment = parts[3];
  const objectRef = parts[4];
  if (!objectRef) {
    return null;
  }
  const objectParsed = parseRef(objectRef, isValidId);
  if (!objectParsed) {
    return null;
  }

  if (segment === "transactions") {
    return {
      kind: "transaction",
      circleRef,
      circleId: circleParsed.id,
      objectRef,
      objectId: objectParsed.id,
    };
  }

  return null;
}
