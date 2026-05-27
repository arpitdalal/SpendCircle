import { createInitialUserProfile, type GoogleIdentityInput, type UserProfile } from "@spend-circle/domain";

type User = UserProfile & {
  id: string;
};

type Circle = {
  id: string;
  ownerUserId: string;
  kind: "personal" | "regular";
  name: string;
  color: string;
  mark: string;
  currency: SupportedCurrency;
  archived: boolean;
  hasTransactions: boolean;
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

type Category = {
  id: string;
  circleId: string;
  name: string;
  type: "expense" | "income";
  color: string;
  createdByUserId: string;
};

type CircleSetup = {
  residenceType?: "leased" | "owned";
};

type SupportedCurrency = "CAD" | "USD";

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
  const categories = new Map<string, Category>();
  let nextUser = 1;
  let nextCircle = 1;
  let nextMember = 1;
  let nextCategory = 1;

  const circleColors = ["#1f6f50", "#185e78", "#8a5a21", "#7f4f7f", "#a33f3f"];
  const categoryColors = ["#2f7d5f", "#2d6f88", "#9a6a2f"];

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

  function validateCurrency(currency: string): SupportedCurrency {
    if (currency === "CAD" || currency === "USD") {
      return currency;
    }
    throw new Error("Unsupported Currency.");
  }

  function resolveCurrency(locale: string): SupportedCurrency {
    if (locale.toUpperCase().includes("-CA")) {
      return "CAD" as const;
    }
    return "USD" as const;
  }

  function circleMark(name: string) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.at(0)?.toUpperCase() ?? "")
      .join("");
  }

  function starterCategoryNames(setup: CircleSetup) {
    const residenceExpense = setup.residenceType === "owned" ? "Mortgage" : "Rent";
    return [
      { name: residenceExpense, type: "expense" as const },
      { name: "Groceries", type: "expense" as const },
      { name: "Paycheck", type: "income" as const }
    ];
  }

  function requireOwner(actorUserId: string, circle: Circle) {
    const member = memberFor(actorUserId, circle.id);
    if (member?.role !== "owner") {
      throw new Error("Owner permission required.");
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
          color: circleColors[0],
          mark: "PC",
          currency: "USD",
          hasTransactions: false,
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

    createRegularCircle(input: {
      actorUserId: string;
      name: string;
      locale: string;
      currency?: string;
      setup: CircleSetup;
    }) {
      if (!users.has(input.actorUserId)) {
        throw new Error("User required.");
      }
      const currency = input.currency === undefined ? resolveCurrency(input.locale) : validateCurrency(input.currency);

      const circle: Circle = {
        id: `circle-${nextCircle++}`,
        ownerUserId: input.actorUserId,
        kind: "regular",
        name: input.name.trim(),
        color: circleColors[(nextCircle - 2) % circleColors.length],
        mark: circleMark(input.name),
        currency,
        hasTransactions: false,
        archived: false
      };
      const memberId = `member-${nextMember++}`;
      const ownerMember: Member = {
        id: memberId,
        userId: input.actorUserId,
        circleId: circle.id,
        role: "owner"
      };
      const starterCategories = starterCategoryNames(input.setup).map((starter, index) => {
        const category: Category = {
          id: `category-${nextCategory++}`,
          circleId: circle.id,
          name: starter.name,
          type: starter.type,
          color: categoryColors[index % categoryColors.length],
          createdByUserId: input.actorUserId
        };
        categories.set(category.id, category);
        return category;
      });

      circles.set(circle.id, circle);
      members.set(ownerMember.id, ownerMember);

      return { circle, members: [ownerMember], categories: starterCategories };
    },

    updateCircleCurrency(input: { actorUserId: string; circleId: string; currency: string }) {
      const circle = requireCircle(input.actorUserId, input.circleId);
      requireOwner(input.actorUserId, circle);
      if (circle.hasTransactions) {
        throw new Error("Currency is locked after the first Transaction.");
      }
      circle.currency = validateCurrency(input.currency);
      return circle;
    },

    recordTransactionForTest(input: { circleId: string }) {
      const circle = circles.get(input.circleId);
      if (!circle) {
        throw new Error("Circle not found.");
      }
      circle.hasTransactions = true;
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
