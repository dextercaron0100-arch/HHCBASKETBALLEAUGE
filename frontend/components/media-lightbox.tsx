"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export default function MediaLightbox({ image, onClose }: { image: { src: string; title: string }; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return (
    <dialog ref={dialog} className="media-lightbox" aria-labelledby={titleId} onClose={onClose} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close();
    }}>
      <div className="media-lightbox-heading"><h2 id={titleId}>{image.title}</h2><button autoFocus aria-label="Close image preview" onClick={() => dialog.current?.close()}><X size={22} /></button></div>
      <img src={image.src} alt={image.title} />
    </dialog>
  );
}
