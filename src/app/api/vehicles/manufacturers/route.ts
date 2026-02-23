import { NextResponse } from "next/server";
import { getManufacturers } from "@/lib/queries";

export async function GET() {
  const manufacturers = getManufacturers();
  return NextResponse.json(manufacturers);
}
