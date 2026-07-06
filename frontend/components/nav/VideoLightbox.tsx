"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface VideoLightboxProps {
  youtubeId: string | null;
  title?: string;
  onClose: () => void;
}

/** 共用的 YouTube 播放視窗：portal 到 body，Esc 關閉，鎖背景捲動。比照 SideNav 的 modal 模式。 */
export function VideoLightbox({ youtubeId, title, onClose }: VideoLightboxProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 開啟時鎖背景捲動 + Esc 關閉。
  useEffect(() => {
    if (!youtubeId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [youtubeId, onClose]);

  if (!mounted || !youtubeId) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "教學影片"}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="relative w-[92vw] max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉影片"
          className="absolute -top-11 right-0 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:border-ember/60 hover:text-ember"
        >
          <X className="h-4 w-4" />
        </button>

        {title ? <p className="mb-2 text-sm text-slate-300">{title}</p> : null}

        <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
            className="h-full w-full"
            title={title ?? "教學影片"}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            frameBorder={0}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
