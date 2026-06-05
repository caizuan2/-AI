import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER
} from "next/constants.js";

function getDistDir(phase) {
  if (process.env.NETLIFY === "true") {
    return ".next";
  }

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return ".next";
  }

  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER) {
    return ".next-build";
  }

  return ".next";
}

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  return {
    distDir: getDistDir(phase)
  };
}
