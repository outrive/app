import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { launchesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListLaunchesQueryParams, RecordLaunchBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/launches", async (req, res): Promise<void> => {
  const params = ListLaunchesQueryParams.safeParse(req.query);
  const walletAddress = params.success ? params.data.walletAddress : undefined;
  const limit = params.success ? (params.data.limit ?? 20) : 20;

  const launches = walletAddress
    ? await db
        .select()
        .from(launchesTable)
        .where(eq(launchesTable.walletAddress, walletAddress.toLowerCase()))
        .orderBy(desc(launchesTable.createdAt))
        .limit(Math.min(limit, 100))
    : await db
        .select()
        .from(launchesTable)
        .orderBy(desc(launchesTable.createdAt))
        .limit(Math.min(limit, 100));

  res.json(launches);
});

router.post("/launches", async (req, res): Promise<void> => {
  const parsed = RecordLaunchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  await db
    .insert(usersTable)
    .values({ walletAddress: data.walletAddress.toLowerCase() })
    .onConflictDoNothing();

  const [launch] = await db
    .insert(launchesTable)
    .values({
      walletAddress: data.walletAddress.toLowerCase(),
      tokenAddress: data.tokenAddress ?? null,
      name: data.name,
      ticker: data.ticker,
      imageUri: data.imageUri ?? null,
      txHash: data.txHash,
      blockNumber: data.blockNumber ?? null,
      network: data.network,
      status: "pending",
    })
    .returning();

  res.status(201).json(launch);
});

export default router;
