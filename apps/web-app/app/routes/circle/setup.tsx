import {
  CIRCLE_PURPOSES,
  type CircleSetupAnswers,
  RESIDENCE_TYPES,
  SUPPORTED_CURRENCIES,
} from "@spend-circle/domain";
import { type FormEvent, useState } from "react";
import { href, useNavigate } from "react-router";
import { Button } from "~/components/ui/button.js";
import { useCompleteCircleSetup } from "~/lib/data.js";
import { useSnackbar } from "~/lib/snackbar.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

const PURPOSE_LABELS: Record<NonNullable<CircleSetupAnswers["purpose"]>, string> = {
  residence: "Residence",
  trip: "Trip",
  family: "Family",
  roommates: "Roommates",
  project: "Project",
  personal: "Personal",
  other: "Other",
};

const RESIDENCE_LABELS: Record<NonNullable<CircleSetupAnswers["residenceType"]>, string> = {
  leased: "Leased",
  owned: "Owned",
};

type PurposeChoice = NonNullable<CircleSetupAnswers["purpose"]> | "";
type ResidenceChoice = NonNullable<CircleSetupAnswers["residenceType"]> | "";

export default function CircleSetup() {
  const circle = useCircle();
  const navigate = useNavigate();
  const completeSetup = useCompleteCircleSetup();
  const { show } = useSnackbar();
  const [purpose, setPurpose] = useState<PurposeChoice>(circle.setupAnswers?.purpose ?? "");
  const [residenceType, setResidenceType] = useState<ResidenceChoice>(
    circle.setupAnswers?.residenceType ?? "",
  );
  const [currency, setCurrency] = useState(circle.currency);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dashboardPath = href("/circles/:circleRef", { circleRef: circle.ref });

  async function finish() {
    await navigate(dashboardPath);
  }

  async function onSkip() {
    await finish();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await completeSetup({
        circleId: circle.id,
        answers: setupAnswers(purpose, residenceType),
        ...(circle.currencyLocked ? {} : { currency }),
      });
      show("Circle setup complete.");
      await finish();
    } catch (caught) {
      console.error("completeCircleSetup failed", caught);
      setError("Couldn't complete setup. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">Circle setup</h2>
        <p className="text-sm text-muted-foreground">
          Pick starter context and confirm the circle currency.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="space-y-1.5">
          <label htmlFor="setup-purpose" className="block text-sm font-medium">
            Circle use
          </label>
          <select
            id="setup-purpose"
            value={purpose}
            onChange={(event) => {
              const next = normalizePurpose(event.target.value);
              setPurpose(next);
              if (next !== "residence") {
                setResidenceType("");
              }
            }}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            <option value="">Not sure yet</option>
            {CIRCLE_PURPOSES.map((option) => (
              <option key={option} value={option}>
                {PURPOSE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        {purpose === "residence" ? (
          <div className="space-y-1.5">
            <label htmlFor="residence-type" className="block text-sm font-medium">
              Residence type
            </label>
            <select
              id="residence-type"
              value={residenceType}
              onChange={(event) => setResidenceType(normalizeResidenceType(event.target.value))}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="">Not sure yet</option>
              {RESIDENCE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {RESIDENCE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="setup-currency" className="block text-sm font-medium">
            Currency
          </label>
          <select
            id="setup-currency"
            value={currency}
            disabled={circle.currencyLocked}
            onChange={(event) => setCurrency(event.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
          >
            {SUPPORTED_CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} · {option.name}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <p id="setup-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Finish setup"}
          </Button>
          <Button type="button" variant="ghost" disabled={submitting} onClick={onSkip}>
            Skip
          </Button>
        </div>
      </form>
    </div>
  );
}

function setupAnswers(purpose: PurposeChoice, residenceType: ResidenceChoice) {
  if (purpose === "") {
    return {};
  }
  if (purpose === "residence") {
    return { purpose, ...(residenceType ? { residenceType } : {}) };
  }
  return { purpose };
}

function normalizePurpose(value: string) {
  return CIRCLE_PURPOSES.find((option) => option === value) ?? "";
}

function normalizeResidenceType(value: string) {
  return RESIDENCE_TYPES.find((option) => option === value) ?? "";
}
