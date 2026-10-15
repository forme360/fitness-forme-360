import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Forme — Health & Performance", description: "Your personal health and performance operating system.", applicationName: "Forme" };
export const viewport: Viewport = { themeColor: "#061110", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" suppressHydrationWarning><body>{children}</body></html>; }
