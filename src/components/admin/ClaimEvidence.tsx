// src/components/admin/ClaimEvidence.tsx
// What a claim rests on: its source link, verbatim quote and note. Shared by
// ClaimsPanel and the /verify queue so a reviewer sees the evidence they are
// verifying.

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function ClaimEvidence({
  sourceUrl,
  quote,
  note,
}: {
  sourceUrl: string | null;
  quote: string | null;
  note: string | null;
}) {
  return (
    <>
      {sourceUrl && (
        <p className="mt-1">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-strong hover:underline"
          >
            source
          </a>{" "}
          <span className="text-subtle">{hostOf(sourceUrl)}</span>
        </p>
      )}
      {quote && <p className="mt-1 text-fg italic">&ldquo;{quote}&rdquo;</p>}
      {note && <p className="mt-1 whitespace-pre-line text-muted">{note}</p>}
    </>
  );
}
