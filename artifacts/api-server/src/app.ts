import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { runCalibrationCheck } from "./lib/virtuals.js";
import { checkSignerStatus } from "./lib/signerWallet.js";
import { startIndexer } from "./lib/indexer.js";

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

app.use("/api", router);

// Boot-time calibration check + signer status log + indexer start (non-blocking)
void runCalibrationCheck().then(async () => {
  await checkSignerStatus();
  startIndexer();
});

export default app;
