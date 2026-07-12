import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../../../db/schema";
import { getOrCreateUser } from "../../../../lib/users";
import { getDueReviewCards } from "../../../../lib/review";

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { env } = getCloudflareContext();
  const db = drizzle(env.DB, { schema });
  const user = await getOrCreateUser(db, clerkUserId);
  const now = Math.floor(Date.now() / 1000);
  const cards = await getDueReviewCards(db, user.id, now);
  return NextResponse.json(cards);
}
