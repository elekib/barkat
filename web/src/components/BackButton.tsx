import Link from "next/link";
import { MdArrowBack } from "react-icons/md";
import { btnGhost } from "./ui";

/** A real button that goes back to the page this one belongs to. Say where: "Back to December 2026". */
export function BackButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${btnGhost} mb-3 gap-1.5 !px-3 !py-2`}>
      <MdArrowBack className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}
