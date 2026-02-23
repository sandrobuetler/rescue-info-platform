import { NextRequest, NextResponse } from "next/server";
import { getModelsByManufacturer } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const manufacturerId = request.nextUrl.searchParams.get("manufacturer_id");
  if (!manufacturerId) {
    return NextResponse.json(
      { error: "manufacturer_id is required" },
      { status: 400 }
    );
  }
  const models = getModelsByManufacturer(Number(manufacturerId));
  return NextResponse.json(models);
}
