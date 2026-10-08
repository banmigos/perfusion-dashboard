import Link from "next/link";
import { db } from "@/db/client";
import { CREDENTIALS } from "@/db/schema/canonical";
import {
  getProgramDetail,
  listPrograms,
  parseProgramListFilters,
} from "@/domain/programs";
import { ProgramMap } from "@/components/ProgramMap";
import { ProgramsTable } from "@/components/programs/ProgramsTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/components/ui/cn";
import { STALE_AFTER_DAYS } from "@/lib/freshness";
import { buildProgramRow, type ProgramTableRow } from "@/lib/programRows";

type View = "table" | "map";

function parseView(raw: string | string[] | undefined): View {
  return raw === "map" ? "map" : "table";
}

function viewHref(
  view: View,
  filters: { q?: string; credential?: string },
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.credential) params.set("credential", filters.credential);
  if (view === "map") params.set("view", "map");
  const qs = params.toString();
  return qs ? `/programs?${qs}` : "/programs";
}

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const filters = parseProgramListFilters(rawParams);
  const view = parseView(rawParams.view);
  const items = listPrograms(db, filters);

  const now = new Date();
  const rows: ProgramTableRow[] =
    view === "table"
      ? items.flatMap((item) => {
          const detail = getProgramDetail(
            db,
            item.school.slug,
            item.program.slug,
          );
          return detail ? [buildProgramRow(detail)] : [];
        })
      : [];

  const toggle = (target: View, label: string) => (
    <Link
      href={viewHref(target, filters)}
      aria-current={view === target ? "page" : undefined}
      className={cn(
        "rounded px-3 py-1 text-sm font-medium transition-colors",
        view === target
          ? "bg-accent-soft text-accent-strong"
          : "text-muted hover:text-fg",
      )}
    >
      {label}
    </Link>
  );

  const unlocated = items.filter(
    (i) => i.program.latitude === null || i.program.longitude === null,
  ).length;

  return (
    <div>
      <PageHeader
        title="Programs"
        description={`${items.length} ${items.length === 1 ? "program" : "programs"}`}
        actions={
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {toggle("table", "Table")}
            {toggle("map", "Map")}
          </div>
        }
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-4">
        {view === "map" && <input type="hidden" name="view" value="map" />}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Search
          <Input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="School or city"
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Credential
          <Select name="credential" defaultValue={filters.credential ?? ""}>
            <option value="">All</option>
            {CREDENTIALS.map((credential) => (
              <option key={credential} value={credential}>
                {credential}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="primary">
          Filter
        </Button>
      </form>

      {items.length === 0 ? (
        <Card className="p-6 text-sm text-muted">No programs match.</Card>
      ) : view === "map" ? (
        <div>
          <ProgramMap items={items} />
          {unlocated > 0 && (
            <p className="mt-3 text-xs text-subtle">
              {unlocated} {unlocated === 1 ? "program has" : "programs have"} no
              coordinates and {unlocated === 1 ? "is" : "are"} not shown.
            </p>
          )}
        </div>
      ) : (
        <ProgramsTable
          rows={rows}
          now={now}
          staleAfterDays={STALE_AFTER_DAYS}
        />
      )}
    </div>
  );
}
