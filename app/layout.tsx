import type { Metadata } from "next";
import AuthFlow from "./auth-flow";
import "./globals.css";

export const metadata: Metadata = {
  title: "Truly Govern — Architecture Governance Platform",
  description: "AI-augmented enterprise architecture governance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthFlow>{children}</AuthFlow>
      </body>
    </html>
  );
}
