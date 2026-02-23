import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const PDF_DIR = path.join(process.cwd(), "data", "pdfs");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(PDF_DIR, ...segments);

  // Prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PDF_DIR))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(resolved) || !resolved.endsWith(".pdf")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(resolved);
  const filename = path.basename(resolved);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
