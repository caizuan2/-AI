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
    }
  };
}
