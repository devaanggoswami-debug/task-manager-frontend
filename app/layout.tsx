import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AppShell from "./components/AppShell";
import CurrentSidebarNav, { SidebarNav } from "./components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Manager",
  description: "Manage projects, sprints and tasks.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#121514" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <AppShell
          nav={
            // The pathname of /projects/[id] is only known at request time, so the active link needs a boundary.
            <Suspense fallback={<SidebarNav pathname={null} />}>
              <CurrentSidebarNav />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
