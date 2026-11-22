import type { IconType } from "react-icons";
import { MdGroup, MdHome, MdPerson } from "react-icons/md";

export interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  admin?: boolean;
}

/** Top-level destinations. Spaces are listed separately, from the database. */
export const NAV: NavItem[] = [
  { href: "/", label: "Books", icon: MdHome },
  { href: "/users", label: "Users", icon: MdGroup, admin: true },
  { href: "/account", label: "Account", icon: MdPerson },
];

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
