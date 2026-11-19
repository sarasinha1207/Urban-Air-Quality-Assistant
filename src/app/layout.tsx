import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/index.css";

export const metadata: Metadata = {
  title: "Urban Air Quality Assistant",
  description:
    "Low-emission routines, indoor air hacks and sustainable swaps for families facing winter smog, tailored to your location and lifestyle.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Root layout: sets the page language and wraps every route. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
