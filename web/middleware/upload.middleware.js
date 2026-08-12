/**
 * File Upload Middleware
 * Multer configuration for handling file uploads
 */

import multer from "multer";
import path from "path";
import fs from "fs";
import config from "../config/index.js";

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.upload.dest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter for validation
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (config.upload.allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${config.upload.allowedExtensions.join(", ")}`), false);
  }
};

// Create multer upload instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize
  }
});

export default upload;

/**
 * How long an uploaded sheet may sit before it is assumed abandoned.
 *
 * Every normal path deletes the file it finished with, so anything still here is
 * from a process that died mid-run. Six hours rather than "everything at boot": a
 * rolling deploy can leave the outgoing container still working through a sheet, and
 * a run of the maximum 500 rows is nowhere near that long.
 */
const UPLOAD_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Delete uploaded sheets left behind by a process that died.
 *
 * uploads/ is a Docker volume, so a leaked file stays there for the life of the
 * deployment. Called once at boot.
 *
 * @returns {number} how many files were removed
 */
export const sweepStaleUploads = () => {
  let removed = 0;

  let entries = [];
  try {
    entries = fs.readdirSync(config.upload.dest);
  } catch {
    return removed; // nothing has ever been uploaded
  }

  const cutoff = Date.now() - UPLOAD_TTL_MS;

  for (const name of entries) {
    // Never touch dotfiles. .gitkeep is what keeps this directory in the repo at
    // all, and sweeping it away deletes the folder on the next clean checkout.
    if (name.startsWith(".")) continue;

    const full = path.join(config.upload.dest, name);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.mtimeMs > cutoff) continue;
      fs.unlinkSync(full);
      removed += 1;
    } catch (e) {
      console.warn(`[uploads] could not remove ${name}:`, e.message);
    }
  }

  if (removed) console.log(`[uploads] removed ${removed} abandoned upload(s)`);
  return removed;
};
