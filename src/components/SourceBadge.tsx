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
      className="text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
    >
      {label}
    </a>
  );
}
