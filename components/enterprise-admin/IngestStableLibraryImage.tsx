"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  bundledAdminIngestImageManifest,
  loadAdminIngestImageManifest,
  selectAdminIngestStableImage,
  type AdminIngestImageManifest
} from "@/lib/enterprise/admin-ingest-image-library";

type IngestStableLibraryImageProps = {
  slotKey: string;
  alt?: string;
  className?: string;
  fallback: ReactNode;
  priority?: boolean;
  size?: number;
};

export function IngestStableLibraryImage({
  slotKey,
  alt = "",
  className = "",
  fallback,
  priority = false,
  size = 64,
}: IngestStableLibraryImageProps) {
  const [manifest, setManifest] = useState<AdminIngestImageManifest>(
    bundledAdminIngestImageManifest
  );
  const [failedSource, setFailedSource] = useState("");
  const selectedAsset = useMemo(
    () => selectAdminIngestStableImage(manifest, slotKey),
    [manifest, slotKey]
  );

  useEffect(() => {
    let isMounted = true;

    void loadAdminIngestImageManifest().then((nextManifest) => {
      if (isMounted) {
        setManifest(nextManifest);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (failedSource && selectedAsset?.src !== failedSource) {
      setFailedSource("");
    }
  }, [failedSource, selectedAsset?.src]);

  if (!selectedAsset || failedSource === selectedAsset.src) {
    return fallback;
  }

  return (
    <Image
      src={selectedAsset.src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      priority={priority}
      unoptimized
      onError={() => setFailedSource(selectedAsset.src)}
    />
  );
}
