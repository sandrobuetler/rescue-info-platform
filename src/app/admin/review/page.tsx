"use client";

import { useState, useCallback } from "react";

interface Submission {
  id: number;
  manufacturer_name: string;
  model_name: string;
  year_from: number | null;
  year_to: number | null;
  pdf_path: string;
  submitter_note: string | null;
  submitted_at: string;
}

export default function AdminReviewPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSubmissions = useCallback(async (pw?: string) => {
    const usePw = pw ?? password;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/submissions", {
        headers: { Authorization: `Basic ${btoa(`admin:${usePw}`)}` },
      });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      setSubmissions(data);
      setAuthenticated(true);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [password]);

  async function handleAction(id: number, action: "approve" | "reject") {
    await fetch("/api/admin/submissions", {
      method: "PATCH",
      headers: {
        Authorization: `Basic ${btoa(`admin:${password}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, action }),
    });
    fetchSubmissions();
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold mb-4">Admin Review</h1>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchSubmissions()}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
        />
        <button
          onClick={() => fetchSubmissions()}
          className="px-6 py-2 bg-gray-900 text-white rounded-lg"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        Pending Submissions ({submissions.length})
      </h1>
      {loading && <p>Loading...</p>}
      {submissions.length === 0 && !loading && (
        <p className="text-gray-500">No pending submissions.</p>
      )}
      <div className="space-y-4">
        {submissions.map((s) => (
          <div key={s.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="font-semibold">
                  {s.manufacturer_name} {s.model_name}
                </h2>
                <p className="text-sm text-gray-500">
                  {s.year_from && s.year_to
                    ? `${s.year_from}–${s.year_to}`
                    : s.year_from || s.year_to || "No year"}
                </p>
                {s.submitter_note && (
                  <p className="text-sm mt-1">Note: {s.submitter_note}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Submitted: {s.submitted_at}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/pdfs/${s.pdf_path}`}
                  target="_blank"
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                >
                  Preview PDF
                </a>
                <button
                  onClick={() => handleAction(s.id, "approve")}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(s.id, "reject")}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
