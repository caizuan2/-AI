import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnterpriseAutoUpdate } from "@/components/EnterpriseAutoUpdate";
import "./globals.css";

export const metadata: Metadata = {
  title: "小董AI",
  description: "小董AI，基于小董AI大脑和 AI 思考处理客户问题。",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/brand/xiaodong-ai-logo.png", type: "image/png" }
    ],
    apple: "/brand/xiaodong-ai-logo.png"
  }
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
