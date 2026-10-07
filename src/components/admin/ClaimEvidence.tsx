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
            className="text-blue-600 underline dark:text-blue-400"
          >
            source
          </a>{" "}
          <span className="text-zinc-500">{hostOf(sourceUrl)}</span>
        </p>
      )}
      {quote && <p className="mt-1 italic">&ldquo;{quote}&rdquo;</p>}
      {note && <p className="mt-1 whitespace-pre-line text-zinc-500">{note}</p>}
    </>
  );
}
