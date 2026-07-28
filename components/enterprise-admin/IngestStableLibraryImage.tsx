"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  bundledAdminIngestImageManifest,
  getAdminIngestAgentAccentStyle,
  getAdminIngestPageRefreshKey,
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
  selectionIndex?: number;
};

export function IngestStableLibraryImage({
  slotKey,
  alt = "",
  className = "",
  fallback,
  priority = false,
  size = 64,
  selectionIndex,
}: IngestStableLibraryImageProps) {
  const [manifest, setManifest] = useState<AdminIngestImageManifest>(
    bundledAdminIngestImageManifest
  );
  const [pageRefreshKey, setPageRefreshKey] = useState("initial-render");
  const [failedSource, setFailedSource] = useState("");
  const selectedAsset = useMemo(
    () => selectAdminIngestStableImage(
      manifest,
      slotKey,
      pageRefreshKey,
      selectionIndex
    ),
    [manifest, pageRefreshKey, selectionIndex, slotKey]
  );
  const accentStyle = selectionIndex === undefined
    ? undefined
    : getAdminIngestAgentAccentStyle(selectionIndex, pageRefreshKey);

  useEffect(() => {
    let isMounted = true;

    setPageRefreshKey(getAdminIngestPageRefreshKey());
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

  const content = !selectedAsset || failedSource === selectedAsset.src
    ? fallback
    : (
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

  if (!accentStyle) {
    return content;
  }

  return (
    <span aria-hidden="true" className="flex h-full w-full p-[2px]" style={accentStyle}>
      {content}
    </span>
  );
}
