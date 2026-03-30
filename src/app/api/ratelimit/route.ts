import { getRateLimitStatus } from "@/lib/ratelimit";

export async function GET(): Promise<Response> {
  return Response.json(getRateLimitStatus());
}
