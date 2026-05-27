import { useMemo, useState } from "react";
import { createSpendCircleBackend } from "@spend-circle/convex";

type Session = ReturnType<ReturnType<typeof createSpendCircleBackend>["signInWithDevGoogle"]>;

export function App() {
  const backend = useMemo(() => createSpendCircleBackend(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [circleName, setCircleName] = useState("");

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
    </main>
  );
}
