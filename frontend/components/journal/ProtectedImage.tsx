"use client";

import { useEffect, useRef, useState } from "react";
import { journalImageUrl } from "@/lib/journal-api";

// Keep only nearby images decoded while reading an image-heavy journal.
// Retain the image's aspect ratio so releasing a blob does not move the text.
export function ProtectedImage({ imageId, alt, releaseOffscreen = false }: { imageId: number; alt: string; releaseOffscreen?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [url, setUrl] = useState("");
  const [aspectRatio, setAspectRatio] = useState<number>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) { setNearby(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      setNearby(entry.isIntersecting);
      // Editing keeps loaded images mounted to avoid disturbing selections.
      if (entry.isIntersecting && !releaseOffscreen) observer.disconnect();
    }, { rootMargin: "800px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [releaseOffscreen]);

  useEffect(() => {
    if (!nearby) return;
    const controller = new AbortController();
    let objectUrl = "";
    setFailed(false);
    journalImageUrl(imageId, controller.signal).then((value) => {
      if (controller.signal.aborted) { URL.revokeObjectURL(value); return; }
      objectUrl = value;
      setUrl(value);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl("");
    };
  }, [imageId, nearby, attempt]);

  return <div ref={container} className="my-4 w-full overflow-hidden rounded-lg border border-white/10" style={{ aspectRatio, maxHeight: 700, minHeight: aspectRatio ? undefined : 160 }}>
    {nearby && url && !failed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} decoding="async" draggable={false} onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalWidth && image.naturalHeight) setAspectRatio(image.naturalWidth / image.naturalHeight);
      }} onError={() => setFailed(true)} className="!m-0 block max-h-[700px] w-full object-contain" />
    ) : <div className="flex h-full min-h-40 items-center justify-center p-4 text-sm text-slate-500">
      {failed ? <button type="button" className="text-gold" onClick={() => setAttempt((value) => value + 1)}>圖片載入失敗，點此重試</button> : nearby ? "圖片載入中…" : "日誌圖片"}
    </div>}
  </div>;
}
