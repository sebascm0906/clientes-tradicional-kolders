import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KOLD Canal Tradicional",
  description: "Portal B2B para socios KOLD",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0066FF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;

}>) {
  return (
    <html lang="es" className="antialiased">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body>
        <div className="max-w-md mx-auto min-h-screen bg-background relative overflow-x-hidden shadow-2xl">
          {children}
        </div>
      </body>
    </html>
  );
}
