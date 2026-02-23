import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import path from "path";
import fs from "fs";

const PENDING_DIR = path.join(process.cwd(), "data", "pdfs", "pending");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Honeypot check — silently accept if bot fills it
    const honeypot = formData.get("website");
    if (honeypot && String(honeypot).length > 0) {
      return NextResponse.json({ success: true });
    }

    // Extract fields
    const manufacturer = formData.get("manufacturer");
    const model = formData.get("model");
    const yearFrom = formData.get("yearFrom");
    const yearTo = formData.get("yearTo");
    const note = formData.get("note");
    const pdf = formData.get("pdf");

    // Validate required fields
    if (
      !manufacturer ||
      typeof manufacturer !== "string" ||
      !manufacturer.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "Manufacturer is required" },
        { status: 400 }
      );
    }

    if (!model || typeof model !== "string" || !model.trim()) {
      return NextResponse.json(
        { success: false, error: "Model is required" },
        { status: 400 }
      );
    }

    if (!pdf || !(pdf instanceof File)) {
      return NextResponse.json(
        { success: false, error: "PDF file is required" },
        { status: 400 }
      );
    }

    // Validate file type
    if (pdf.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "File must be a PDF" },
        { status: 400 }
      );
    }

    if (!pdf.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { success: false, error: "File must have a .pdf extension" },
        { status: 400 }
      );
    }

    // Validate file size
    if (pdf.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File must be smaller than 10MB" },
        { status: 400 }
      );
    }

    // Ensure pending directory exists
    if (!fs.existsSync(PENDING_DIR)) {
      fs.mkdirSync(PENDING_DIR, { recursive: true });
    }

    // Save file
    const timestamp = Date.now();
    const sanitizedName = sanitizeFilename(pdf.name);
    const filename = `${timestamp}_${sanitizedName}`;
    const filePath = path.join(PENDING_DIR, filename);

    const buffer = Buffer.from(await pdf.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Parse optional year fields
    const yearFromVal = yearFrom ? parseInt(String(yearFrom), 10) : null;
    const yearToVal = yearTo ? parseInt(String(yearTo), 10) : null;

    // Insert into database
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO pending_submissions (manufacturer_name, model_name, year_from, year_to, pdf_path, submitter_note)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      manufacturer.trim(),
      model.trim(),
      Number.isNaN(yearFromVal) ? null : yearFromVal,
      Number.isNaN(yearToVal) ? null : yearToVal,
      `data/pdfs/pending/${filename}`,
      note ? String(note).trim() || null : null
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Submission error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
