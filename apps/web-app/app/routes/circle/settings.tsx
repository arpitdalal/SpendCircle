import {
  CIRCLE_PURPOSES,
  type CircleSetupAnswers,
  circleSettingsColorChoices,
  colorHex,
  colorLabel,
  LIMITS,
  RESIDENCE_TYPES,
} from "@spend-circle/domain";
import { type FormEvent, useRef, useState } from "react";
import { href, Navigate } from "react-router";
import { CircleMark } from "~/components/circle-mark.js";
import { Button } from "~/components/ui/button.js";
import {
  type Member,
  useMembers,
  useRenameCircle,
  useSetPersonalCircleNameAutoSync,
  useUpdateCircleSettings,
} from "~/lib/data.js";
import { useSnackbar } from "~/lib/snackbar.js";
import { cn } from "~/lib/utils.js";
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

/**
 * Circle-scoped Settings (CS-2): Owner-only Color and Setup answers, plus rename via
 * the existing `renameCircle` mutation. Distinct from the user-level App Settings at
 * `/settings` (SET-1). Members who land here are redirected; the server enforces too.
 */
export default function CircleSettings() {
  const circle = useCircle();
  const members = useMembers(circle.id);
  const renameCircle = useRenameCircle();
  const setPersonalCircleNameAutoSync = useSetPersonalCircleNameAutoSync();
  const updateSettings = useUpdateCircleSettings();
  const { show } = useSnackbar();

  const [name, setName] = useState(circle.name);
  const [color, setColor] = useState(circle.color);
  const [purpose, setPurpose] = useState<PurposeChoice>(circle.setupAnswers?.purpose ?? "");
  const [residenceType, setResidenceType] = useState<ResidenceChoice>(
    circle.setupAnswers?.residenceType ?? "",
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [syncingName, setSyncingName] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);

  const dashboardPath = href("/circles/:circleRef", { circleRef: circle.ref });

  const syncedCircle = useRef(circle);
  if (circle !== syncedCircle.current) {
    syncedCircle.current = circle;
    setName(circle.name);
    setColor(circle.color);
    setPurpose(circle.setupAnswers?.purpose ?? "");
    setResidenceType(circle.setupAnswers?.residenceType ?? "");
  }

  if (members === undefined) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  if (!viewerIsOwner(members)) {
    return <Navigate to={dashboardPath} replace />;
  }

  const nameDirty = name.trim() !== circle.name;
  const setupDirty = setupAnswersChanged(circle.setupAnswers, setupAnswers(purpose, residenceType));

  async function onToggleNameAutoSync() {
    setSyncingName(true);
    try {
      await setPersonalCircleNameAutoSync({ enabled: circle.nameCustomized });
    } catch (caught) {
      console.error("setPersonalCircleNameAutoSync failed", caught);
      show("Couldn't update name sync. Please try again.");
    } finally {
      setSyncingName(false);
    }
  }

  async function onSaveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    const trimmed = name.trim();
    if (trimmed === "") {
      setNameError("Name is required");
      return;
    }
    if (trimmed.length > LIMITS.circleNameMax) {
      setNameError(`Name must be at most ${LIMITS.circleNameMax} characters`);
      return;
    }
    if (trimmed === circle.name) {
      return;
    }

    setSavingName(true);
    try {
      await renameCircle({ circleId: circle.id, name: trimmed });
      show("Circle name updated.");
    } catch (caught) {
      console.error("renameCircle failed", caught);
      setNameError("Couldn't save the name. Please try again.");
    } finally {
      setSavingName(false);
    }
  }

  async function onPickColor(nextColor: string) {
    if (nextColor === circle.color) {
      setColor(nextColor);
      return;
    }
    setColor(nextColor);
    setSavingColor(true);
    try {
      await updateSettings({ circleId: circle.id, color: nextColor });
      show("Circle color updated.");
    } catch (caught) {
      console.error("updateCircleSettings (color) failed", caught);
      setColor(circle.color);
      show("Couldn't save the color. Please try again.");
    } finally {
      setSavingColor(false);
    }
  }

  async function onSaveSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSetupError(null);
    const answers = setupAnswers(purpose, residenceType);
    if (!setupAnswersChanged(circle.setupAnswers, answers)) {
      return;
    }

    setSavingSetup(true);
    try {
      await updateSettings({ circleId: circle.id, setupAnswers: answers });
      show("Setup answers updated.");
    } catch (caught) {
      console.error("updateCircleSettings (setup) failed", caught);
      setSetupError("Couldn't save setup answers. Please try again.");
    } finally {
      setSavingSetup(false);
    }
  }

  const colorChoices = circleSettingsColorChoices(circle.kind);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">Circle settings</h2>
        <p className="text-sm text-muted-foreground">
          Change how this circle looks and the setup context you picked.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <CircleMark mark={circle.mark} color={color} className="size-12 text-base" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{circle.name}</p>
          <p className="text-xs text-muted-foreground">
            Mark tint follows the circle color ({colorLabel(color)})
          </p>
          <p
            className="text-xs text-muted-foreground"
            data-testid="mark-tint"
            data-color-hex={colorHex(color)}
          >
            Preview uses {colorHex(color)}
          </p>
        </div>
      </div>

      <form
        onSubmit={onSaveName}
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <h3 className="text-sm font-medium">Name</h3>
        <div className="space-y-1.5">
          <label htmlFor="circle-settings-name" className="block text-sm text-muted-foreground">
            Circle name
          </label>
          <input
            id="circle-settings-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) {
                setNameError(null);
              }
            }}
            maxLength={LIMITS.circleNameMax}
            autoComplete="off"
            aria-invalid={nameError != null}
            aria-describedby={nameError ? "circle-settings-name-error" : undefined}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
        {nameError ? (
          <p id="circle-settings-name-error" role="alert" className="text-sm text-destructive">
            {nameError}
          </p>
        ) : null}
        {circle.kind === "personal" ? (
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <input
                id="circle-settings-name-auto-sync"
                type="checkbox"
                role="switch"
                aria-checked={!circle.nameCustomized}
                checked={!circle.nameCustomized}
                disabled={syncingName}
                onChange={() => void onToggleNameAutoSync()}
                className="mt-0.5 size-4 shrink-0 rounded border border-input accent-primary"
              />
              <div className="space-y-1">
                <label htmlFor="circle-settings-name-auto-sync" className="text-sm font-medium">
                  Match my display name
                </label>
                <p className="text-xs text-muted-foreground">
                  When on, your Personal Circle&apos;s name and icon update automatically whenever
                  you change your display name. Renaming it yourself turns this off.
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <Button type="submit" disabled={!nameDirty || savingName}>
          {savingName ? "Saving…" : "Save name"}
        </Button>
      </form>

      <fieldset
        disabled={savingColor}
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <legend className="text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {colorChoices.map((paletteColor) => (
            <button
              key={paletteColor.id}
              type="button"
              aria-label={paletteColor.name}
              aria-pressed={color === paletteColor.id}
              onClick={() => void onPickColor(paletteColor.id)}
              style={{ backgroundColor: paletteColor.hex }}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-background transition",
                color === paletteColor.id ? "ring-2 ring-ring" : "ring-0",
              )}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{colorLabel(color)}</p>
      </fieldset>

      <form
        onSubmit={onSaveSetup}
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <h3 className="text-sm font-medium">Setup answers</h3>
        <p className="text-xs text-muted-foreground">
          Changing these does not add or remove existing categories.
        </p>

        <div className="space-y-1.5">
          <label htmlFor="settings-purpose" className="block text-sm font-medium">
            Circle use
          </label>
          <select
            id="settings-purpose"
            value={purpose}
            onChange={(event) => {
              const next = normalizePurpose(event.target.value);
              setPurpose(next);
              if (next !== "residence") {
                setResidenceType("");
              }
              if (setupError) {
                setSetupError(null);
              }
            }}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            <option value="">Not set</option>
            {CIRCLE_PURPOSES.map((option) => (
              <option key={option} value={option}>
                {PURPOSE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        {purpose === "residence" ? (
          <div className="space-y-1.5">
            <label htmlFor="settings-residence-type" className="block text-sm font-medium">
              Residence type
            </label>
            <select
              id="settings-residence-type"
              value={residenceType}
              onChange={(event) => {
                setResidenceType(normalizeResidenceType(event.target.value));
                if (setupError) {
                  setSetupError(null);
                }
              }}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="">Not set</option>
              {RESIDENCE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {RESIDENCE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {setupError ? (
          <p role="alert" className="text-sm text-destructive">
            {setupError}
          </p>
        ) : null}

        <Button type="submit" disabled={!setupDirty || savingSetup}>
          {savingSetup ? "Saving…" : "Save setup answers"}
        </Button>
      </form>
    </div>
  );
}

function viewerIsOwner(members: Member[] | null) {
  return members?.find((member) => member.isSelf)?.role === "owner";
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

function setupAnswersChanged(before: CircleSetupAnswers | undefined, after: CircleSetupAnswers) {
  return before?.purpose !== after.purpose || before?.residenceType !== after.residenceType;
}
