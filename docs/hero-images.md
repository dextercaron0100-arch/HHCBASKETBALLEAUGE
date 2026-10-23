# Homepage hero images

The slideshow uses local copies of stock basketball photos from Unsplash, not photographs of HHC teams or events. Replace them with official league photos when available; slide definitions are in `frontend/components/hero-carousel.tsx`.

- `basketball-court.jpg`: https://images.unsplash.com/photo-1546519638-68e109498ffc
- `basketball-action.jpg`: https://images.unsplash.com/photo-1519861531473-9200262188bf
- `basketball-arena.jpg`: https://images.unsplash.com/photo-1504450758481-7338eba7524a

The slideshow advances every 5 seconds and crossfades over 900 milliseconds. Hover, keyboard focus, background tabs, and the pause button stop automatic advancement. Reduced-motion preferences disable automatic advancement initially and remove transitions; viewers can explicitly start playback.
