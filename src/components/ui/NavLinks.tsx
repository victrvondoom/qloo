"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "Workspace" },
  { href: "/compare", label: "Same words" },
  { href: "/lab", label: "Proof Lab" },
  { href: "/projects", label: "Projects", hideSm: true },
  { href: "/method", label: "Method", hideSm: true },
  { href: "/verify", label: "Verify", hideSm: true },
];

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <div className="navlinks">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`link${l.hideSm ? " hide-sm" : ""}`} aria-current={path === l.href || path.startsWith(`${l.href}/`) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}
