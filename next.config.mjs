/** @type {() => import('next').NextConfig} */
export default function nextConfig() {
  return {
    distDir: ".next",
    async redirects() {
      return [
        {
          source: "/chat-ui",
          destination: "/app/chat",
          permanent: false
        },
        {
          source: "/chat",
          destination: "/app/chat",
          permanent: false
        }
      ];
    },
    async headers() {
      const noStoreHeaders = [
        {
          key: "Cache-Control",
          value: "private, no-store, no-cache, max-age=0, must-revalidate"
        },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" }
      ];

      return [
        { source: "/app/chat", headers: noStoreHeaders },
        { source: "/app/chat/:path*", headers: noStoreHeaders },
        { source: "/chat-ui", headers: noStoreHeaders },
        { source: "/chat", headers: noStoreHeaders }
      ];
    }
  };
}
