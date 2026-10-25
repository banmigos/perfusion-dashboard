"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Shown when a page fails to render, most often because the database file
 * is missing, locked, or behind on migrations. Says so plainly and offers
 * the two fixes that cover nearly every case.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const looksLikeSchema = /no such (table|column)/i.test(error.message);

  return (
    <div className="max-w-xl border-l-2 border-arterial py-2 pl-5">
      <h1 className="font-condensed text-4xl font-semibold text-fg">
        This page couldn&rsquo;t load.
      </h1>
      <p className="mt-3 text-sm text-muted">
        {looksLikeSchema
          ? "The database is missing a table or column this version expects. Run migrations, then try again:"
          : "Reading from the database failed. Check that the database file exists and is writable, then try again."}
      </p>
      {looksLikeSchema && (
        <pre className="mt-3 rounded bg-raised px-3 py-2 font-mono text-xs text-fg">
          npm run db:migrate
        </pre>
      )}
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-subtle">
          Error reference {error.digest}
        </p>
      )}
      <Button variant="primary" className="mt-5" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
