import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// The wordmark's face (D-134); one weight, only used for "Dopl".
const outfit = Outfit({ subsets: ["latin"], weight: "600", variable: "--font-outfit" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Dopl", template: "%s · Dopl" },
  description: "Projects, notes, mail and an AI teammate for the IT team.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#F5F5F6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${outfit.variable}`}>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
