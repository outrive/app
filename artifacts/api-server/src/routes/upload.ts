/**
 * POST /api/upload/image  — Upload agent token image to GCS
 * GET  /api/upload/image/:filename — Serve stored image
 *
 * Accepts: PNG, JPG/JPEG, WebP (max 5 MB)
 * Returns: { url: string } — publicly accessible HTTPS URL
 * No auth required: images are public assets used on-chain as token icons.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage.js";

const router = Router();

const BUCKET_ID      = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
const IMAGE_DIR      = "agent-images";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// multer: in-memory, image-only, 5 MB cap
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error("Only PNG, JPG, and WebP images are supported"));
  },
});

/** Build the public serving URL for an image file */
function imageUrl(req: Request, filename: string): string {
  const base = process.env.SITE_URL
    ? process.env.SITE_URL.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host")}`;
  return `${base}/api/upload/image/${filename}`;
}

/* ── POST /api/upload/image ────────────────────────────────────────────────── */
router.post(
  "/upload/image",
  upload.single("image"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }
    if (!BUCKET_ID) {
      return res.status(500).json({ error: "Object storage not configured" });
    }

    const ext      = ALLOWED_TYPES[req.file.mimetype] ?? "bin";
    const filename = `${randomUUID()}.${ext}`;
    const gcsPath  = `${IMAGE_DIR}/${filename}`;

    try {
      const bucket = objectStorageClient.bucket(BUCKET_ID);
      const file   = bucket.file(gcsPath);
      await file.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
        resumable: false,
      });

      return res.json({ url: imageUrl(req, filename), filename });
    } catch (err) {
      console.error("[upload] GCS save failed:", err);
      return res.status(500).json({ error: "Upload failed" });
    }
  }
);

/* ── GET /api/upload/image/:filename ──────────────────────────────────────── */
router.get("/upload/image/:filename", async (req: Request, res: Response) => {
  if (!BUCKET_ID) {
    return res.status(500).json({ error: "Object storage not configured" });
  }

  const { filename } = req.params;
  // Prevent path traversal
  if (!filename || filename.includes("/") || filename.includes("..")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  try {
    const bucket = objectStorageClient.bucket(BUCKET_ID);
    const file   = bucket.file(`${IMAGE_DIR}/${filename}`);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ error: "Not found" });

    const [meta] = await file.getMetadata();
    const ct = (meta as { contentType?: string }).contentType ?? "image/png";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    file.createReadStream().pipe(res);
  } catch (err) {
    console.error("[upload] GCS read failed:", err);
    return res.status(500).json({ error: "Fetch failed" });
  }
});

export default router;
