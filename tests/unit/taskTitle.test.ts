import { describe, expect, it } from "vitest";
import { taskTitle } from "@/lib/taskTitle";

const derived = { derivedFromRequirementId: 1 };

describe("taskTitle", () => {
  it("rewrites requirement-derived tasks into actions", () => {
    expect(
      taskTitle({
        ...derived,
        title: "Tuition (unit and residency tier not yet determined)",
        category: "other",
      }),
    ).toBe("Research tuition details");
    expect(
      taskTitle({ ...derived, title: "Minimum overall GPA", category: "gpa" }),
    ).toBe("Confirm GPA requirement");
    expect(
      taskTitle({ ...derived, title: "GRE required", category: "test" }),
    ).toBe("Confirm whether the GRE is required");
    expect(
      taskTitle({
        ...derived,
        title: "Observation / shadowing hours",
        category: "shadowing",
      }),
    ).toBe("Plan shadowing hours");
  });

  it("leaves unmapped derived tasks and user-written tasks alone", () => {
    expect(
      taskTitle({ ...derived, title: "Three letters", category: "letters" }),
    ).toBe("Three letters");
    expect(
      taskTitle({
        title: "Minimum overall GPA",
        category: "gpa",
        derivedFromRequirementId: null,
      }),
    ).toBe("Minimum overall GPA");
  });
});
