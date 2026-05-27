import { useMemo, useState } from "react";
import { createSpendCircleBackend } from "@spend-circle/convex";

type Backend = ReturnType<typeof createSpendCircleBackend>;
type Session = ReturnType<Backend["signInWithDevGoogle"]>;
type RegularCircleSession = ReturnType<Backend["createRegularCircle"]>;

export function App() {
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
