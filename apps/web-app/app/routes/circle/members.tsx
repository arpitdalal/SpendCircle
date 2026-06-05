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
      <h2 className="text-base font-semibold">Members</h2>
      <MemberList members={members} />
    </div>
  );
}

function MemberList({ members }: { members: Member[] | null | undefined }) {
  if (members === undefined) {
    return <p className="text-sm text-neutral-500">Loading members…</p>;
  }
  // null ≡ inaccessible Circle (ADR 0016); the Circle guard already gated entry, so
  // a late null means there's nothing to show. An empty list can't normally happen
  // (every Circle keeps its Owner) — fall through to the same message defensively.
  if (members === null || members.length === 0) {
    return <p className="text-sm text-neutral-500">Members are unavailable.</p>;
  }

  return (
    <ul className="space-y-2">
      {members.map((member) => (
        <li
          key={member.id}
          className="flex items-center gap-3 rounded-md border border-neutral-800 px-3 py-2"
        >
          <Avatar name={member.displayName} image={member.image} seed={member.id} />
          <span className="text-sm font-medium">{member.displayName}</span>
          {member.isSelf ? <span className="text-xs text-neutral-500">(You)</span> : null}
          {member.role === "owner" ? (
            <span className="ml-auto rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
              Owner
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
