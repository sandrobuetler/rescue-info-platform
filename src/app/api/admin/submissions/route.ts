import { NextRequest, NextResponse } from "next/server";
import {
  getPendingSubmissions,
  approveSubmission,
  rejectSubmission,
  updateSubmission,
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
  const { id, action, data } = body as {
    id: number;
    action: "approve" | "reject" | "update";
    data?: {
      manufacturer_name: string;
      model_name: string;
      year_from: number | null;
      year_to: number | null;
    };
  };

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  try {
    if (action === "approve") {
      approveSubmission(id);
    } else if (action === "update") {
      if (!data) {
        return NextResponse.json({ error: "data required for update" }, { status: 400 });
      }
      updateSubmission(id, data);
    } else {
      rejectSubmission(id);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
