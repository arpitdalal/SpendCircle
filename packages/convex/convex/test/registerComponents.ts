import { register as registerWorkpool } from "@convex-dev/workpool/test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "convex-test";

/** Registers Convex components used by transactional email (EML-2+). */
export function registerEmailWorkpool<Schema extends SchemaDefinition<GenericSchema, boolean>>(
  t: TestConvex<Schema>,
) {
  registerWorkpool(t, "emailWorkpool");
}
