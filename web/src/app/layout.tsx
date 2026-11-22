import type { Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Barkat",
  description: "Household bills, income and cushion, tracked week by week.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e3e8da" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

// Runs before first paint so a saved Light or Dark choice never flashes the other theme.
const themeScript = `try{var t=localStorage.getItem("barkat-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
