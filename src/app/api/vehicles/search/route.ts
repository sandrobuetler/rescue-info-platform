import { NextRequest, NextResponse } from "next/server";
import { searchRescueCards } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const make = request.nextUrl.searchParams.get("make") || undefined;
  const model = request.nextUrl.searchParams.get("model") || undefined;
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? Number(yearStr) : undefined;
  const results = searchRescueCards({ make, model, year });
  return NextResponse.json(results);
}
