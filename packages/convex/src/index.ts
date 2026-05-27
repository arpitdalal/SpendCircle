import { createInitialUserProfile, type GoogleIdentityInput, type UserProfile } from "@spend-circle/domain";

type User = UserProfile & {
  id: string;
};

type Circle = {
  id: string;
  ownerUserId: string;
  kind: "personal" | "regular";
  name: string;
  archived: boolean;
};

type Member = {
  id: string;
  userId: string;
  circleId: string;
  role: "owner" | "member";
};

type DevGoogleSignIn = Omit<GoogleIdentityInput, "acceptedAt"> & {
  now: string;
};

export class PersonalCircleInvariantError extends Error {
  constructor(action: string) {
    super(`Personal Circle cannot ${action}.`);
    this.name = "PersonalCircleInvariantError";
  }
}

export function createSpendCircleBackend() {
  const users = new Map<string, User>();
  const usersByGoogleSubject = new Map<string, string>();
  const circles = new Map<string, Circle>();
  const members = new Map<string, Member>();
  let nextUser = 1;
  let nextCircle = 1;
  let nextMember = 1;

  function personalCircleFor(userId: string) {
    return [...circles.values()].find((circle) => circle.ownerUserId === userId && circle.kind === "personal");
  }

  function memberFor(userId: string, circleId: string) {
    return [...members.values()].find((member) => member.userId === userId && member.circleId === circleId);
  }

  function requireCircle(actorUserId: string, circleId: string) {
    const circle = circles.get(circleId);
    if (!circle || !memberFor(actorUserId, circleId)) {
      throw new Error("Circle not visible.");
    }
    return circle;
  }

  function rejectPersonalCircle(circle: Circle, action: string) {
    if (circle.kind === "personal") {
      throw new PersonalCircleInvariantError(action);
    }
  }

  return {
    signInWithDevGoogle(input: DevGoogleSignIn) {
      const existingUserId = usersByGoogleSubject.get(input.googleSubject);
      const user =
        existingUserId === undefined
          ? {
              id: `user-${nextUser++}`,
              ...createInitialUserProfile({ ...input, acceptedAt: input.now })
            }
          : users.get(existingUserId);

      if (!user) {
        throw new Error("User identity index is corrupt.");
      }

      users.set(user.id, user);
      usersByGoogleSubject.set(user.googleSubject, user.id);

      let circle = personalCircleFor(user.id);
      if (!circle) {
        circle = {
          id: `circle-${nextCircle++}`,
          ownerUserId: user.id,
          kind: "personal",
          name: `${user.displayName.split(" ")[0]}'s Personal Circle`,
          archived: false
        };
        circles.set(circle.id, circle);
        const memberId = `member-${nextMember++}`;
        members.set(memberId, {
          id: memberId,
          userId: user.id,
          circleId: circle.id,
          role: "owner"
        });
      }

      return {
        user,
        circle,
        members: [...members.values()].filter((member) => member.circleId === circle.id)
      };
    },

    visibleCirclesForUser(userId: string) {
      const circleIds = new Set(
        [...members.values()].filter((member) => member.userId === userId).map((member) => member.circleId)
      );
      return [...circles.values()].filter((circle) => circleIds.has(circle.id));
    },

    renameCircle(input: { actorUserId: string; circleId: string; name: string }) {
      const circle = requireCircle(input.actorUserId, input.circleId);
      circle.name = input.name.trim();
      return circle;
    },

    inviteMember(input: { actorUserId: string; circleId: string }) {
      rejectPersonalCircle(requireCircle(input.actorUserId, input.circleId), "invite Members");
    },

    archiveCircle(input: { actorUserId: string; circleId: string }) {
      rejectPersonalCircle(requireCircle(input.actorUserId, input.circleId), "be archived");
    },

    deleteCircle(input: { actorUserId: string; circleId: string }) {
      rejectPersonalCircle(requireCircle(input.actorUserId, input.circleId), "be deleted");
    },

    leaveCircle(input: { actorUserId: string; circleId: string }) {
      rejectPersonalCircle(requireCircle(input.actorUserId, input.circleId), "be left");
    },

    transferOwnership(input: { actorUserId: string; circleId: string; newOwnerUserId: string }) {
      void input.newOwnerUserId;
      rejectPersonalCircle(requireCircle(input.actorUserId, input.circleId), "transfer ownership");
    }
  };
}
