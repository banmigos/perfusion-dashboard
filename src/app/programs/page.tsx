import Link from "next/link";
import { db } from "@/db/client";
import { CREDENTIALS } from "@/db/schema/canonical";
import { listApplicationRows } from "@/domain/applications";
import { listPrograms, parseProgramListFilters } from "@/domain/programs";
import { APPLICATION_STATUS_LABEL } from "@/components/applications/status";
import { ProgramMap } from "@/components/ProgramMap";
import { ProgramsBoard } from "@/components/programs/ProgramsBoard";
import { ProgramsTable } from "@/components/programs/ProgramsTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/components/ui/cn";
import {
  matchesQuery,
  parseApplicationQuery,
  programsHref,
  sortRows,
  type DueFilter,
  type View,
} from "@/lib/applicationQuery";
import { todayIso } from "@/lib/deadlines";
import { STALE_AFTER_DAYS } from "@/lib/freshness";

const VIEW_LABEL: Record<View, string> = {
  table: "Table",
  board: "Board",
  map: "Map",
};

const DUE_LABEL: Record<DueFilter, string> = {
  all: "Any",
  "30": "Next 30 days",
  "90": "Next 90 days",
  passed: "Passed",
  none: "No date",
};

export default async function ProgramsPage({
  searchParams,
}: PageProps<"/programs">) {
  const rawParams = await searchParams;
  const filters = parseProgramListFilters(rawParams);
  const query = parseApplicationQuery(rawParams);
  const state = { ...query, ...filters };

  const now = new Date();
  const today = todayIso(now);

  // Search and credential reuse the directory query, so every view
  // narrows the same way; status and deadline windows apply on top.
  const listed = listPrograms(db, filters);
  const listedKeys = new Set(
    listed.map((i) => `${i.school.slug}/${i.program.slug}`),
  );
  const allRows = listApplicationRows(db);
  const rows = sortRows(
    allRows.filter(
      (r) =>
        listedKeys.has(`${r.schoolSlug}/${r.programSlug}`) &&
        matchesQuery(r, query, today),
    ),
    query.sort,
    query.dir,
    today,
  );
  const visibleKeys = new Set(
    rows.map((r) => `${r.schoolSlug}/${r.programSlug}`),
  );
  const mapItems = listed.filter((i) =>
    visibleKeys.has(`${i.school.slug}/${i.program.slug}`),
  );

  const tracked = allRows.filter((r) => r.saved).length;
  const filtered =
    filters.q !== undefined ||
    filters.credential !== undefined ||
    query.status !== "all" ||
    query.due !== "all";
  const unlocated = mapItems.filter(
    (i) => i.program.latitude === null || i.program.longitude === null,
  ).length;

  return (
    <div>
      <PageHeader
        title="Programs"
        description={
          filtered
            ? `${rows.length} of ${allRows.length} programs match`
            : `${allRows.length} programs, ${tracked} tracked`
        }
        actions={
          <nav
            aria-label="View"
            className="flex rounded-md border border-line bg-surface p-0.5"
          >
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <Link
                key={v}
                href={programsHref(state, { view: v })}
                aria-current={query.view === v ? "page" : undefined}
                className={cn(
                  "rounded px-3 py-1 text-sm transition-colors",
                  query.view === v
                    ? "bg-raised font-medium text-fg"
                    : "text-muted hover:text-fg",
                )}
              >
                {VIEW_LABEL[v]}
              </Link>
            ))}
          </nav>
        }
      />

      <form
        method="get"
        className="mb-8 flex flex-wrap items-end gap-x-4 gap-y-3"
      >
        {query.view !== "table" && (
          <input type="hidden" name="view" value={query.view} />
        )}
        {query.sort !== "deadline" && (
          <input type="hidden" name="sort" value={query.sort} />
        )}
        {query.dir === "desc" && (
          <input type="hidden" name="dir" value="desc" />
        )}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Search
          <Input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="School or city"
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <Select name="status" defaultValue={query.status}>
            <option value="all">Any</option>
            <option value="tracking">Tracking</option>
            <option value="untracked">Not tracking</option>
            {Object.entries(APPLICATION_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Deadline
          <Select name="due" defaultValue={query.due}>
            {Object.entries(DUE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Credential
          <Select name="credential" defaultValue={filters.credential ?? ""}>
            <option value="">Any</option>
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
        {filtered && (
          <Link
            href={programsHref({ view: query.view })}
            className="py-1.5 text-sm text-muted hover:text-fg hover:underline"
          >
            Clear filters
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-semicondensed text-lg font-semibold text-fg">
            No programs match these filters.
          </p>
          <p className="mt-1 text-sm text-muted">
            Widen the deadline window or clear the search to see more.
          </p>
        </div>
      ) : query.view === "map" ? (
        <div>
          <ProgramMap items={mapItems} />
          {unlocated > 0 && (
            <p className="mt-3 text-xs text-subtle">
              {unlocated} {unlocated === 1 ? "program has" : "programs have"} no
              coordinates and {unlocated === 1 ? "is" : "are"} not shown.
            </p>
          )}
        </div>
      ) : query.view === "board" ? (
        <ProgramsBoard
          rows={rows}
          today={today}
          untrackedCount={rows.filter((r) => !r.saved).length}
        />
      ) : (
        <ProgramsTable
          rows={rows}
          now={now}
          today={today}
          staleAfterDays={STALE_AFTER_DAYS}
          query={state}
        />
      )}
    </div>
  );
}
