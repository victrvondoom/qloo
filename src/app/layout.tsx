import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import { THEME_BOOT } from "@/components/ui/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tastespec · what “warm and modern” means to this client", template: "%s · Tastespec" },
  description:
    "Paste what a client wrote. Tastespec reads what they love through Qloo's taste graph, finds the rooms people like them actually choose, and hands a designer a spec, a drawn room and a client link, with every line traced to evidence.",
  applicationName: "Tastespec",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
