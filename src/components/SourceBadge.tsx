export function SourceBadge({
  url,
  title,
  label,
}: {
  url: string;
  title: string | null;
  label?: string;
}) {
  const name = title ?? new URL(url).hostname;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label ? `Source: ${name}` : undefined}
      title={name}
      className="text-xs text-accent underline-offset-2 hover:text-accent-strong hover:underline"
    >
      {label ?? name}
    </a>
  );
}
