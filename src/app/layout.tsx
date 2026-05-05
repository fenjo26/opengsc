import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import ClientSessionProvider from "@/components/ClientSessionProvider";
import DashboardShell from "@/components/DashboardShell";
import { PrivacyProvider } from "@/lib/PrivacyContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { LayoutProvider } from "@/lib/LayoutContext";

export const metadata: Metadata = {
  title: "OpenGSC Dashboard",
  description: "Advanced Search Console Analytics without Limits",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ClientSessionProvider>
          <ThemeProvider>
            <LayoutProvider>
              <PrivacyProvider>
                <LanguageProvider>
                  <DashboardShell>
                    {children}
                  </DashboardShell>
                </LanguageProvider>
              </PrivacyProvider>
            </LayoutProvider>
          </ThemeProvider>
        </ClientSessionProvider>
      </body>
    </html>
  );
}
