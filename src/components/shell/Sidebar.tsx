import { NavLink } from "./NavLink";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/programs", label: "Programs" },
  { href: "/my", label: "My Applications" },
  { href: "/verify", label: "Needs Verification" },
  { href: "/admin", label: "Admin" },
];

export function Sidebar() {
  return (
    <aside className="border-b border-line bg-surface md:w-56 md:shrink-0 md:border-r md:border-b-0">
      <div className="md:sticky md:top-0 md:flex md:h-screen md:flex-col md:p-4">
        <p className="px-4 pt-3 text-sm font-semibold tracking-wide text-fg md:px-3 md:pt-0 md:pb-4">
          Perfusion Path
        </p>
        <nav aria-label="Primary">
          <ul className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-0 md:pb-0">
            {LINKS.map((link) => (
              <li key={link.href} className="shrink-0">
                <NavLink href={link.href}>{link.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
