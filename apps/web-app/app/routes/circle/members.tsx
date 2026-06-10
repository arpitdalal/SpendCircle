import { Avatar } from "~/components/ui/avatar.js";
import { type Member, useMembers } from "~/lib/data.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

/**
 * Circle-scoped Member List (CONTEXT: Member List; PRD story 43). Read-only — the
 * surface the invite/remove/transfer slices (MEM-2/5/7) later act on. Lists active
 * Members Owner-first, each with their materialized identity: the display name is
 * current for an active Member and frozen for a Removed Member, and the avatar is
 * the Profile Picture or a generated initials fallback. All current Members can
 * view it; the server (ADR 0015/0016) is the enforcement.
 */
export default function CircleMembers() {
  const circle = useCircle();
  const members = useMembers(circle.id);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">Members</h2>
      <MemberList members={members} />
    </div>
  );
}

function MemberList({ members }: { members: Member[] | null | undefined }) {
  if (members === undefined) {
    return <p className="text-sm text-muted-foreground">Loading members…</p>;
  }
  // null ≡ inaccessible Circle (ADR 0016); the Circle guard already gated entry, so
  // a late null means there's nothing to show. An empty list can't normally happen
  // (every Circle keeps its Owner) — fall through to the same message defensively.
  if (members === null || members.length === 0) {
    return <p className="text-sm text-muted-foreground">Members are unavailable.</p>;
  }

  return (
    <ul className="space-y-2">
      {members.map((member) => (
        <li
          key={member.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
        >
          <Avatar name={member.displayName} image={member.image} />
          {/* Name + (You) form one flex-1 cluster: the name truncates so a long
              Google display name can't push the Owner badge off a narrow row,
              while (You) stays pinned beside it. */}
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium">{member.displayName}</span>
            {member.isSelf ? (
              <span className="shrink-0 text-xs text-muted-foreground">(You)</span>
            ) : null}
          </span>
          {member.role === "owner" ? (
            <span className="shrink-0 rounded-full border border-primary/40 bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-foreground">
              Owner
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
