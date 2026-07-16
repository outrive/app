import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { runCalibrationCheck } from "./lib/virtuals.js";
import { checkSignerStatus } from "./lib/signerWallet.js";
import { startIndexer } from "./lib/indexer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliScript = readFileSync(join(__dirname, "cli-script.mjs"), "utf-8");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/cli/outrive-cli.mjs", (_req, res) => {
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(cliScript);
});

app.use("/api", router);

// Boot-time calibration check + signer status log + indexer start (non-blocking)
void runCalibrationCheck().then(async () => {
  await checkSignerStatus();
  startIndexer();
});

export default app;
