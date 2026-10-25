import { NavLink } from "./NavLink";
import { ThemeSwitch } from "./ThemeSwitch";

// Two jobs live in this app: running the application season, and keeping the
// sourced research behind it honest. The nav keeps them apart.
const GROUPS = [
  {
    label: "Applications",
    links: [
      { href: "/", label: "Overview" },
      { href: "/programs", label: "Programs" },
      { href: "/timeline", label: "Timeline" },
      { href: "/requirements", label: "Requirements" },
      { href: "/my", label: "Checklists" },
    ],
  },
  {
    label: "Research",
    links: [
      { href: "/verify", label: "Needs verification" },
      { href: "/admin", label: "Admin" },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="border-b border-line bg-surface md:w-52 md:shrink-0 md:border-r md:border-b-0">
      <div className="md:sticky md:top-0 md:flex md:h-screen md:flex-col md:px-4 md:py-6">
        <div className="flex items-center justify-between gap-4 px-4 pt-3 md:block md:px-2 md:pt-0">
          <p className="font-condensed text-xl leading-none font-semibold tracking-tight text-fg">
            Perfusion Path
          </p>
          <div className="md:hidden">
            <ThemeSwitch />
          </div>
        </div>
        <nav aria-label="Primary" className="md:mt-8">
          <div className="flex gap-4 overflow-x-auto px-3 py-2 md:flex-col md:gap-6 md:overflow-visible md:p-0">
            {GROUPS.map((group) => (
              <div key={group.label} className="shrink-0">
                <p className="mb-1 hidden px-2 text-xs text-subtle md:block">
                  {group.label}
                </p>
                <ul className="flex gap-1 md:flex-col md:gap-0.5">
                  {group.links.map((link) => (
                    <li key={link.href} className="shrink-0">
                      <NavLink href={link.href}>{link.label}</NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="mt-auto hidden px-2 md:block">
          <ThemeSwitch />
        </div>
      </div>
    </aside>
  );
}
