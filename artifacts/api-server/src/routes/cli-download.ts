import { Router } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

const cliScript = readFileSync(join(__dirname, "cli-script.mjs"), "utf-8");

router.get("/cli/outrive-cli.mjs", (_req, res) => {
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(cliScript);
});

export default router;
