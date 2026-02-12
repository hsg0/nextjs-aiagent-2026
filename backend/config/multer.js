// multer configuration
import multer from "multer";

/* ------------------ base config ------------------ */
export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
});

/* ------------------ controller helper ------------------ */
/**
 * Runs a multer handler inside a controller.
 *
 * Usage inside controller:
 *   await runMulter(req, res, uploadMemory.single("pdf"));
 *   console.log(req.file); // ✅ available
 */
export async function runMulter(req, res, multerHandler) {
  console.log("[universalmulter] runMulter start");

  // If multer throws, we want to stop the controller and return an error.
  // This keeps the controller code simple.
  await new Promise((resolve, reject) => {
    multerHandler(req, res, (err) => {
      if (err) {
        console.log("[universalmulter] ❌ multer error:", err?.message || err);
        return reject(err);
      }
      console.log("[universalmulter] ✅ multer finished");
      resolve();
    });
  });
}