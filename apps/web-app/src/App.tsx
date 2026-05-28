import { useEffect, useMemo, useState } from "react";
import { ConvexReactClient, useMutation, useQuery } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { api } from "@spend-circle/convex/api";
import { createSpendCircleBackend } from "@spend-circle/convex";
import type { Id } from "@spend-circle/convex/dataModel";
import { authClient } from "./auth-client";

type Backend = ReturnType<typeof createSpendCircleBackend>;
type Session = ReturnType<Backend["signInWithDevGoogle"]>;
type RegularCircleSession = ReturnType<Backend["createRegularCircle"]>;

export function App() {
  const convexUrl = import.meta.env.MODE === "test" ? undefined : (import.meta.env.VITE_CONVEX_URL as string | undefined);

  if (convexUrl) {
    return <ConnectedAppProvider convexUrl={convexUrl} />;
  }

  return <LocalApp />;
}

function ConnectedAppProvider({ convexUrl }: { convexUrl: string }) {
  const convex = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl]);

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <ConnectedApp />
    </ConvexBetterAuthProvider>
  );
}

function LocalApp() {
  const backend = useMemo(() => createSpendCircleBackend(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [regularCircles, setRegularCircles] = useState<RegularCircleSession[]>([]);
  const [circleName, setCircleName] = useState("");
  const [newCircleName, setNewCircleName] = useState("");
  const [residenceType, setResidenceType] = useState<"leased" | "owned" | "skip">("skip");

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="signin-panel">
          <p className="eyebrow">Spend Circle</p>
          <h1>Track money in your own Circle first.</h1>
          <p>
            By continuing, you accept the <a href="/terms">Terms</a> and <a href="/privacy">Privacy</a>.
          </p>
          <button
            type="button"
            onClick={() => {
              const nextSession = backend.signInWithDevGoogle({
                googleSubject: "dev-google-ada",
                googleAccountEmail: "ada@example.com",
                displayName: "Ada Lovelace",
                profilePictureUrl: null,
                now: new Date().toISOString()
              });
              setSession(nextSession);
              setCircleName(nextSession.circle.name);
            }}
          >
            Continue with Google
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <nav>
        <strong>Spend Circle</strong>
        <span>App Version 0.1.0</span>
      </nav>
      <section className="circle-view">
        <div>
          <p className="eyebrow">Personal Circle</p>
          <h1>{session.circle.name}</h1>
          <p>{session.user.displayName} is the only Member. Invitations, archive, delete, leave, and ownership transfer are disabled server-side.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const circle = backend.renameCircle({
              actorUserId: session.user.id,
              circleId: session.circle.id,
              name: circleName
            });
            setSession({ ...session, circle });
          }}
        >
          <label htmlFor="circle-name">Circle name</label>
          <input id="circle-name" value={circleName} onChange={(event) => setCircleName(event.target.value)} />
          <button type="submit">Rename Circle</button>
        </form>
      </section>
      <section className="circle-workspace">
        <form
          className="create-circle"
          onSubmit={(event) => {
            event.preventDefault();
            const createdCircle = backend.createRegularCircle({
              actorUserId: session.user.id,
              name: newCircleName,
              locale: navigator.language,
              setup: residenceType === "skip" ? {} : { residenceType }
            });
            setRegularCircles([...regularCircles, createdCircle]);
            setNewCircleName("");
          }}
        >
          <h2>Create regular Circle</h2>
          <label htmlFor="new-circle-name">New Circle name</label>
          <input
            id="new-circle-name"
            value={newCircleName}
            onChange={(event) => setNewCircleName(event.target.value)}
          />
          <label htmlFor="residence-type">Residence type</label>
          <select
            id="residence-type"
            value={residenceType}
            onChange={(event) => setResidenceType(event.target.value as "leased" | "owned" | "skip")}
          >
            <option value="skip">Skip</option>
            <option value="leased">Leased</option>
            <option value="owned">Owned</option>
          </select>
          <button type="submit">Create Circle</button>
        </form>
        <div className="circle-list">
          <h2>Your Circles</h2>
          <article>
            <span>{session.circle.kind}</span>
            <p className="circle-title">{session.circle.name}</p>
            <p>
              <span>{session.circle.currency}</span> · <span>Mark {session.circle.mark}</span>
            </p>
          </article>
          {regularCircles.map((createdCircle) => (
            <article key={createdCircle.circle.id}>
              <span>{createdCircle.circle.kind}</span>
              <h3>{createdCircle.circle.name}</h3>
              <p>
                <span>{createdCircle.circle.currency}</span> · <span>Mark {createdCircle.circle.mark}</span>
              </p>
              <p>{createdCircle.categories.map((category) => category.name).join(", ")}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function ConnectedApp() {
  const authSession = authClient.useSession();
  const completeDevSignIn = useMutation(api.users.completeDevSignIn);
  const completeAuthenticatedSignIn = useMutation(api.users.completeAuthenticatedSignIn);
  const renameCircle = useMutation(api.circles.rename);
  const createRegularCircle = useMutation(api.circles.createRegular);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [authBootstrapStarted, setAuthBootstrapStarted] = useState(false);
  const [circleName, setCircleName] = useState("");
  const [newCircleName, setNewCircleName] = useState("");
  const [residenceType, setResidenceType] = useState<"leased" | "owned" | "skip">("skip");
  const circles = useQuery(api.circles.listVisible, userId ? { userId } : "skip");
  const personalCircle = circles?.find((circle) => circle.kind === "personal") ?? null;
  const regularCircles = circles?.filter((circle) => circle.kind === "regular") ?? [];
  const googleAuthEnabled = import.meta.env.VITE_AUTH_MODE !== "dev";

  useEffect(() => {
    if (!googleAuthEnabled || userId || authBootstrapStarted || !authSession.data) {
      return;
    }
    setAuthBootstrapStarted(true);
    void completeAuthenticatedSignIn({ acceptedAt: new Date().toISOString() }).then((session) => {
      setUserId(session.user._id);
      setCircleName(session.circle.name);
    });
  }, [authBootstrapStarted, authSession.data, completeAuthenticatedSignIn, googleAuthEnabled, userId]);

  if (!userId || !personalCircle) {
    return (
      <main className="auth-shell">
        <section className="signin-panel">
          <p className="eyebrow">Spend Circle</p>
          <h1>Track money in your own Circle first.</h1>
          <p>
            By continuing, you accept the <a href="/terms">Terms</a> and <a href="/privacy">Privacy</a>.
          </p>
          <button
            type="button"
            onClick={async () => {
              if (googleAuthEnabled) {
                await authClient.signIn.social({
                  provider: "google",
                  callbackURL: "/"
                });
                return;
              }
              const localStorageKey = "spend-circle-dev-google-subject";
              const existingSubject = window.localStorage.getItem(localStorageKey);
              const googleSubject = existingSubject ?? `dev-google-${crypto.randomUUID()}`;
              window.localStorage.setItem(localStorageKey, googleSubject);
              const session = await completeDevSignIn({
                googleSubject,
                googleAccountEmail: "ada@example.com",
                displayName: "Ada Lovelace",
                profilePictureUrl: null,
                acceptedAt: new Date().toISOString()
              });
              setUserId(session.user._id);
              setCircleName(session.circle.name);
            }}
          >
            Continue with Google
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <nav>
        <strong>Spend Circle</strong>
        <span>App Version 0.1.0</span>
      </nav>
      <section className="circle-view">
        <div>
          <p className="eyebrow">Personal Circle</p>
          <h1>{personalCircle.name}</h1>
          <p>
            Ada Lovelace is the only Member. Invitations, archive, delete, leave, and ownership transfer are disabled
            server-side.
          </p>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await renameCircle({
              actorUserId: userId,
              circleId: personalCircle._id,
              name: circleName
            });
          }}
        >
          <label htmlFor="circle-name">Circle name</label>
          <input id="circle-name" value={circleName} onChange={(event) => setCircleName(event.target.value)} />
          <button type="submit">Rename Circle</button>
        </form>
      </section>
      <section className="circle-workspace">
        <form
          className="create-circle"
          onSubmit={async (event) => {
            event.preventDefault();
            await createRegularCircle({
              actorUserId: userId,
              name: newCircleName,
              locale: navigator.language,
              setup: residenceType === "skip" ? {} : { residenceType }
            });
            setNewCircleName("");
          }}
        >
          <h2>Create regular Circle</h2>
          <label htmlFor="new-circle-name">New Circle name</label>
          <input
            id="new-circle-name"
            value={newCircleName}
            onChange={(event) => setNewCircleName(event.target.value)}
          />
          <label htmlFor="residence-type">Residence type</label>
          <select
            id="residence-type"
            value={residenceType}
            onChange={(event) => setResidenceType(event.target.value as "leased" | "owned" | "skip")}
          >
            <option value="skip">Skip</option>
            <option value="leased">Leased</option>
            <option value="owned">Owned</option>
          </select>
          <button type="submit">Create Circle</button>
        </form>
        <div className="circle-list">
          <h2>Your Circles</h2>
          <article>
            <span>{personalCircle.kind}</span>
            <p className="circle-title">{personalCircle.name}</p>
            <p>
              <span>{personalCircle.currency}</span> · <span>Mark {personalCircle.mark}</span>
            </p>
          </article>
          {regularCircles.map((circle) => (
            <article key={circle._id}>
              <span>{circle.kind}</span>
              <h3>{circle.name}</h3>
              <p>
                <span>{circle.currency}</span> · <span>Mark {circle.mark}</span>
              </p>
              <p>{circle.categories.map((category) => category.name).join(", ")}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
