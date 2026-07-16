import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import systemRouter from "./system.js";
import marketRouter from "./market.js";
import virtualsMarketRouter from "./virtuals-market.js";
import launchesRouter from "./launches.js";
import launchActivateRouter from "./launch-activate.js";
import launchRebuildRouter from "./launch-rebuild.js";
import uploadRouter from "./upload.js";
import conversationsRouter from "./conversations.js";
import chatRouter from "./chat.js";
import creditsRouter from "./credits.js";
import cliAuthRouter from "./cli-auth.js";
const router: IRouter = Router();

router.use(healthRouter);
router.use(systemRouter);
router.use(marketRouter);
router.use(virtualsMarketRouter);
router.use(launchesRouter);
router.use(launchActivateRouter);
router.use(launchRebuildRouter);
router.use(uploadRouter);
router.use(conversationsRouter);
router.use(chatRouter);
router.use(creditsRouter);
router.use(cliAuthRouter);

export default router;
