import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/programs", label: "Programs" },
  { href: "/my", label: "My Applications" },
  { href: "/verify", label: "Needs Verification" },
  { href: "/admin", label: "Admin" },
];

export function Nav() {
  return (
    <nav className="border-b border-black/10 dark:border-white/10">
      <ul className="mx-auto flex max-w-3xl gap-6 px-6 py-4 text-sm font-medium">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
