import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnterpriseAutoUpdate } from "@/components/EnterpriseAutoUpdate";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 知识库",
  description: "面向团队的 AI 知识库工作台"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">
        {children}
        <EnterpriseAutoUpdate />
      </body>
    </html>
  );
}
