import { cn } from "../ui/cn";
import { STAGE_TEXT, type ApplicationStatus } from "./status";

/**
 * Pipeline stage as a shape that fills as the application advances, so the
 * status reads in grayscale and without relying on hue: hollow, half, full,
 * full with an outer ring, and a check.
 */
export function StatusGlyph({
  status,
  className,
}: {
  status: ApplicationStatus | null;
  className?: string;
}) {
  if (status === null) {
    return (
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={cn("size-3.5 shrink-0 text-line-strong", className)}
      >
        <circle
          cx="8"
          cy="8"
          r="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0 transition-colors duration-300",
        STAGE_TEXT[status],
        className,
      )}
    >
      {status === "not_started" && (
        <circle
          cx="8"
          cy="8"
          r="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      )}
      {status === "in_progress" && (
        <>
          <circle
            cx="8"
            cy="8"
            r="5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path d="M8 3a5 5 0 0 1 0 10z" fill="currentColor" />
        </>
      )}
      {status === "submitted" && (
        <circle cx="8" cy="8" r="5.5" fill="currentColor" />
      )}
      {status === "interview" && (
        <>
          <circle cx="8" cy="8" r="4" fill="currentColor" />
          <circle
            cx="8"
            cy="8"
            r="6.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          />
        </>
      )}
      {status === "decision" && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path
            d="M5 8.2l2 2 4-4.2"
            fill="none"
            stroke="var(--paper)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
