import manifest from "./optimized-images.json";

type ImageVariant = { src: string; width: number; height: number; bytes: number };
const images = manifest as Record<string, { originalBytes: number; variants: ImageVariant[] }>;

export function imageSources(source: string, sizes = "64px") {
  const image = images[source];
  if (!image) return { src: source };
  return {
    src: image.variants[Math.min(1, image.variants.length - 1)].src,
    srcSet: image.variants.map(variant => `${variant.src} ${variant.width}w`).join(", "),
    sizes,
  };
}

export function backgroundImageSource(source: string) {
  const image = images[source];
  return image ? image.variants[image.variants.length - 1].src : source;
}
