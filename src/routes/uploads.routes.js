const crypto = require("crypto");
const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const { asyncRoute } = require("../lib/async-route");
const { HttpError } = require("../lib/http-error");

const router = express.Router();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const uploadDir = path.join(__dirname, "..", "..", "site", "img", "uploads");

const imageTypes = {
  "image/jpeg": { extension: "jpg", valid: isJpeg },
  "image/png": { extension: "png", valid: isPng },
  "image/webp": { extension: "webp", valid: isWebp }
};

function isJpeg(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPng(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);
}

function isWebp(buffer) {
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

const rawImage = express.raw({
  type: Object.keys(imageTypes),
  limit: MAX_IMAGE_BYTES
});

router.post("/vehicle-image", rawImage, asyncRoute(async (req, res) => {
  const type = String(req.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const descriptor = imageTypes[type];
  if (!descriptor) {
    throw new HttpError(415, "Разрешены только JPG, PNG и WebP", "UNSUPPORTED_IMAGE_TYPE");
  }
  if (!Buffer.isBuffer(req.body) || req.body.length < 32 || !descriptor.valid(req.body)) {
    throw new HttpError(400, "Файл не является корректным изображением", "INVALID_IMAGE");
  }
  if (req.body.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "Изображение больше 5 МБ", "IMAGE_TOO_LARGE");
  }

  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `vehicle-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${descriptor.extension}`;
  const destination = path.join(uploadDir, filename);
  await fs.writeFile(destination, req.body, { flag: "wx", mode: 0o644 });

  const publicPath = `/site/img/uploads/${filename}`;

  res.status(201).json({ success: true, path: publicPath });
}));

module.exports = router;
