import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
export const metadata: Metadata = {
  title: "HHC BASKETBALL LEAGUE · Every game. One community.",
  description:
    "Your home court for schedules, live scores, standings and community basketball.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    title: "HHC BASKETBALL LEAGUE",
    statusBarStyle: "black-translucent",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
