import Link from "next/link";

export function Breadcrumb({ href, label }: { href: string; label: string }) {
  return (
    <p className="mb-2 text-sm">
      <Link href={href} className="text-muted hover:text-fg hover:underline">
        ← {label}
      </Link>
    </p>
  );
}
