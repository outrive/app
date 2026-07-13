import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateConversationBody,
  ListConversationsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/conversations", async (req, res): Promise<void> => {
  const params = ListConversationsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  const { walletAddress, limit = 20 } = params.data;

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.walletAddress, walletAddress.toLowerCase()))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(Math.min(limit, 100));

  res.json(conversations);
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { walletAddress, title } = parsed.data;

  // Upsert user
  const [user] = await db
    .insert(usersTable)
    .values({ walletAddress: walletAddress.toLowerCase() })
    .onConflictDoUpdate({
      target: usersTable.walletAddress,
      set: { walletAddress: walletAddress.toLowerCase() },
    })
    .returning();

  const [conversation] = await db
    .insert(conversationsTable)
    .values({
      userId: user.id,
      walletAddress: walletAddress.toLowerCase(),
      title,
    })
    .returning();

  res.status(201).json(conversation);
});

router.get("/conversations/:id/messages", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(messagesTable.createdAt)
    .limit(200);

  res.json(messages);
});

export default router;
