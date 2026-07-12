import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../../../db/schema";
import { getOrCreateUser } from "../../../../lib/users";
import { submitReview } from "../../../../lib/review";
import type { ReviewRating } from "../../../../lib/sm2";

const VALID_RATINGS: ReviewRating[] = ["again", "hard", "good", "easy"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { cardId } = await params;
  const body = (await req.json()) as { rating?: ReviewRating };
  if (!body.rating || !VALID_RATINGS.includes(body.rating)) {
    return NextResponse.json({ error: "invalid rating" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const db = drizzle(env.DB, { schema });
  const user = await getOrCreateUser(db, clerkUserId);
  const now = Math.floor(Date.now() / 1000);
  const result = await submitReview(db, cardId, user.id, body.rating, now);
  return NextResponse.json(result);
}
