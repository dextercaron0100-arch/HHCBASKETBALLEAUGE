import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = (process.env.LEAGUE_ASSET_ORIGIN || "http://localhost:5080").replace(/\/+$/, "");
const manifestPath = resolve(root, "lib/optimized-images.json");
const output = resolve(root, "public/optimized-images");
await mkdir(output, { recursive: true });
const previous = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}"));
const manifest = {};
const response = await fetch(`${origin}/api/v1/public`, { signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error("Cannot load the public team directory.");
const league = await response.json();
const logos = [...new Set(league.teams.map(team => team.logo).filter(src => /^\/api\/v1\/uploads\/[a-f0-9-]{32,36}$/.test(src)))];
let originalBytes = 0, cardBytes = 0;
for (const src of [...logos, "/images/hero/basketball-court.jpg", "/images/hero/basketball-action.jpg", "/images/hero/basketball-arena.jpg"]) {
  const isLogo = logos.includes(src);
  const old = previous[src];
  if (isLogo && old && await Promise.all(old.variants.map(variant => access(resolve(root, "public", variant.src.slice(1))).then(() => true, () => false))).then(results => results.every(Boolean))) {
    manifest[src] = old;
  } else {
    let bytes;
    if (isLogo) {
      const image = await fetch(`${origin}${src}`, { signal: AbortSignal.timeout(20000) });
      if (!image.ok || !image.headers.get("content-type")?.startsWith("image/")) throw new Error(`Cannot download public image ${src}`);
      bytes = Buffer.from(await image.arrayBuffer());
    } else bytes = await readFile(resolve(root, "public", src.slice(1)));
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const variants = [];
    for (const width of isLogo ? [96, 384, 1024] : [640, 1600]) {
      const filename = `${hash}-${width}.webp`;
      const info = await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(resolve(output, filename));
      variants.push({ src: `/optimized-images/${filename}`, width: info.width, height: info.height, bytes: info.size });
    }
    manifest[src] = { originalBytes: bytes.length, variants };
  }
  if (isLogo) { originalBytes += manifest[src].originalBytes; cardBytes += manifest[src].variants[1].bytes; }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ logos: logos.length, originalBytes, cardBytes, reductionPercent: Math.round((1 - cardBytes / originalBytes) * 100) }));
