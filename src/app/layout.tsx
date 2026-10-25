import type { Metadata, Viewport } from "next";
import { Archivo, Azeret_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { THEME_STORAGE_KEY } from "@/components/shell/theme";
import "./globals.css";

// Fonts are downloaded at build time and served from this app; no runtime
// request leaves the tailnet.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const azeret = Azeret_Mono({
  variable: "--font-azeret",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Perfusion Path",
  description:
    "Cardiovascular perfusion program research and application tracker.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f3f2" },
    { media: "(prefers-color-scheme: dark)", color: "#101b25" },
  ],
};

// Applies a stored light/dark choice before first paint so the page never
// flashes the wrong theme. "system" (or nothing stored) leaves it to CSS.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${azeret.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
