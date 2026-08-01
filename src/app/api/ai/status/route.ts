import { NextResponse } from "next/server";
import { getPublicAiStatus } from "@/lib/ai/config";

export async function GET() {
  return NextResponse.json(getPublicAiStatus());
}
