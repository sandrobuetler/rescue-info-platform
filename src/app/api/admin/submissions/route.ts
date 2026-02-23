import { NextRequest, NextResponse } from "next/server";
import {
  getPendingSubmissions,
  approveSubmission,
  rejectSubmission,
} from "@/lib/queries";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [, password] = decoded.split(":");
  return password === process.env.ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
    });
  }
  const submissions = getPendingSubmissions();
  return NextResponse.json(submissions);
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
    });
  }

  const body = await request.json();
  const { id, action } = body as { id: number; action: "approve" | "reject" };

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  try {
    if (action === "approve") {
      approveSubmission(id);
    } else {
      rejectSubmission(id);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
