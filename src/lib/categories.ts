import { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";

export type Category = (typeof REQUIREMENT_CATEGORIES)[number];

/** Plural headings for checklist groups and the requirements tracker. */
export const CATEGORY_LABEL: Record<Category, string> = {
  letters: "Letters of recommendation",
  essay: "Essays and supplementals",
  transcript: "Transcripts",
  prerequisite: "Prerequisite courses",
  shadowing: "Shadowing and observation",
  experience: "Clinical experience",
  test: "Tests",
  interview: "Interviews",
  fee: "Fees",
  gpa: "GPA",
  other: "Other",
};

/** Order the tracker and checklists present categories in: application work first. */
export const CATEGORY_ORDER: Category[] = [
  "letters",
  "essay",
  "transcript",
  "prerequisite",
  "shadowing",
  "experience",
  "interview",
  "test",
  "fee",
  "gpa",
  "other",
];

export function categoryLabel(category: string | null | undefined): string {
  return category && category in CATEGORY_LABEL
    ? CATEGORY_LABEL[category as Category]
    : "Other";
}

export const CHECKLIST_STATUS_LABEL = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  skipped: "Skipped",
} as const;
