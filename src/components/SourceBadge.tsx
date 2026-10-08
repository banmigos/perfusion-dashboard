export function SourceBadge({
  url,
  title,
}: {
  url: string;
  title: string | null;
}) {
  const label = title ?? new URL(url).hostname;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-accent underline hover:text-accent-strong"
    >
      {label}
    </a>
  );
}
