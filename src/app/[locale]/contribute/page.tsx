"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function ContributePage() {
  const t = useTranslations("contribute");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");

    try {
      const formData = new FormData(e.currentTarget);
      const response = await fetch("/api/submissions", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">{t("title")}</h1>
      <p className="text-gray-600 mb-8">{t("intro")}</p>

      {status === "success" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800">{t("success")}</p>
        </div>
      )}

      {status === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{t("error")}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Honeypot field */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="absolute -left-[9999px]"
        />

        <div>
          <label htmlFor="manufacturer" className="block text-sm font-medium mb-1">
            {t("manufacturer")} *
          </label>
          <input
            type="text"
            id="manufacturer"
            name="manufacturer"
            required
            placeholder={t("manufacturerPlaceholder")}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div>
          <label htmlFor="model" className="block text-sm font-medium mb-1">
            {t("model")} *
          </label>
          <input
            type="text"
            id="model"
            name="model"
            required
            placeholder={t("modelPlaceholder")}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="yearFrom" className="block text-sm font-medium mb-1">
              {t("yearFrom")}
            </label>
            <input
              type="number"
              id="yearFrom"
              name="yearFrom"
              min={1990}
              max={2099}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="yearTo" className="block text-sm font-medium mb-1">
              {t("yearTo")}
            </label>
            <input
              type="number"
              id="yearTo"
              name="yearTo"
              min={1990}
              max={2099}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="pdf" className="block text-sm font-medium mb-1">
            {t("pdfFile")} *
          </label>
          <input
            type="file"
            id="pdf"
            name="pdf"
            accept=".pdf,application/pdf"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div>
          <label htmlFor="note" className="block text-sm font-medium mb-1">
            {t("note")}
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            placeholder={t("notePlaceholder")}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "submitting" ? "..." : t("submit")}
        </button>
      </form>
    </div>
  );
}
