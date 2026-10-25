import { APPLICATION_STATUSES } from "@/db/schema/personal";
import {
  APPLICATION_STATUS_LABEL,
  type ApplicationStatus,
} from "@/lib/deadlines";

export { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL };
export type { ApplicationStatus };

/** Text and fill classes per pipeline stage (literal for Tailwind's scanner). */
export const STAGE_TEXT: Record<ApplicationStatus, string> = {
  not_started: "text-stage-0",
  in_progress: "text-stage-1",
  submitted: "text-stage-2",
  interview: "text-stage-3",
  decision: "text-stage-4",
};

export const STAGE_BG: Record<ApplicationStatus, string> = {
  not_started: "bg-stage-0",
  in_progress: "bg-stage-1",
  submitted: "bg-stage-2",
  interview: "bg-stage-3",
  decision: "bg-stage-4",
};

/**
 * Short display names for the deadline strip: a parenthetical abbreviation
 * when the school has one ("UNMC"), otherwise the name minus "University".
 */
export function shortSchoolName(name: string): string {
  const abbreviation = /\(([^)]+)\)/.exec(name)?.[1];
  if (abbreviation) return abbreviation.replace(/ Keck School of Medicine/, "");
  return (
    name
      .replace(/^University of /, "")
      .replace(/ University$/, "")
      .replace(/ University /, " ")
      .trim() || name
  );
}
