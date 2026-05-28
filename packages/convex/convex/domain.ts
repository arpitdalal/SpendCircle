import type { Id } from "./_generated/dataModel";

export const circleColors = ["#1f6f50", "#185e78", "#8a5a21", "#7f4f7f", "#a33f3f"] as const;
export const categoryColors = ["#2f7d5f", "#2d6f88", "#9a6a2f"] as const;

export type CircleSetup = {
  residenceType?: "leased" | "owned";
};

export type SupportedCurrency = "CAD" | "USD";

export type AuthenticatedProfile = {
  googleSubject: string;
  googleAccountEmail: string;
  displayName: string;
  profilePictureUrl: string | null;
};

export function validateCurrency(currency: string): SupportedCurrency {
  if (currency === "CAD" || currency === "USD") {
    return currency;
  }
  throw new Error("Unsupported Currency.");
}

export function resolveCurrency(locale: string): SupportedCurrency {
  if (locale.toUpperCase().includes("-CA")) {
    return "CAD";
  }
  return "USD";
}

export function circleMark(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.at(0)?.toUpperCase() ?? "")
    .join("");
}

export function starterCategoryNames(setup: CircleSetup) {
  const residenceExpense = setup.residenceType === "owned" ? "Mortgage" : "Rent";
  return [
    { name: residenceExpense, type: "expense" as const },
    { name: "Groceries", type: "expense" as const },
    { name: "Paycheck", type: "income" as const }
  ];
}

export function personalCircleName(displayName: string) {
  return `${displayName.split(" ")[0]}'s Personal Circle`;
}

export function assertPersonalCircleMutation(kind: "personal" | "regular", action: string) {
  if (kind === "personal") {
    throw new Error(`Personal Circle cannot ${action}.`);
  }
}

export type CircleId = Id<"circles">;
export type UserId = Id<"users">;
