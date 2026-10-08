import Link from "next/link";
import type { ProgramTableRow } from "@/lib/programRows";
import { FactCell } from "../FactCell";

const HEADERS = [
  "School",
  "Location",
  "Credential",
  "Length",
  "Deadline",
  "GPA",
  "Tuition",
];

const TD = "px-4 py-3 align-top";

export function ProgramsTable({
  rows,
  now,
  staleAfterDays,
}: {
  rows: ProgramTableRow[];
  now: Date;
  staleAfterDays: number;
}) {
  const fact = { now, staleAfterDays };

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-raised text-xs tracking-wide text-muted uppercase">
            {HEADERS.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr
              key={`${row.schoolSlug}/${row.programSlug}`}
              className="hover:bg-raised/50"
            >
              <td className={TD}>
                <Link
                  href={`/programs/${row.schoolSlug}/${row.programSlug}`}
                  className="font-medium text-fg hover:text-accent-strong hover:underline"
                >
                  {row.schoolName}
                  <span className="block text-xs font-normal text-muted">
                    {row.programName}
                  </span>
                </Link>
              </td>
              <td className={TD} data-col="location">
                {row.location ? (
                  <span className="text-fg">{row.location}</span>
                ) : (
                  <span className="text-subtle">Not researched</span>
                )}
              </td>
              <td className={TD} data-col="credential">
                <FactCell {...row.credential} {...fact} />
              </td>
              <td className={TD} data-col="length">
                <FactCell {...row.length} {...fact} />
              </td>
              <td className={TD} data-col="deadline">
                <FactCell {...row.deadline} {...fact} />
                {row.deadline.cycleLabel && (
                  <span className="mt-0.5 block text-xs text-subtle">
                    {row.deadline.cycleLabel} cycle
                  </span>
                )}
              </td>
              <td className={TD} data-col="gpa">
                <FactCell {...row.gpa} {...fact} />
              </td>
              <td className={TD} data-col="tuition">
                {row.tuition.length === 0 ? (
                  <FactCell value={null} claim={undefined} {...fact} />
                ) : (
                  <ul className="space-y-1.5">
                    {row.tuition.map((t) => (
                      <li key={t.label}>
                        <FactCell {...t} {...fact} />
                        <span className="block text-xs text-subtle">
                          {t.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
