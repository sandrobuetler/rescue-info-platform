"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useState, useCallback, useEffect } from "react";
import Combobox from "@/components/Combobox";

type Status = "idle" | "submitting" | "success" | "error";

interface Manufacturer {
  id: number;
  name: string;
}

interface Model {
  id: number;
  name: string;
}

function generateCaptcha() {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  return { a, b, answer: a + b };
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1990 + 2 }, (_, i) =>
  String(currentYear + 1 - i)
);

export default function ContributePage() {
  const t = useTranslations("contribute");
  const [status, setStatus] = useState<Status>("idle");
  const [captcha, setCaptcha] = useState(() => generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");

  // Track whether the selected manufacturer is from DB (has an ID)
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<
    number | null
  >(null);

  const resetForm = useCallback(() => {
    setStatus("idle");
    setCaptcha(generateCaptcha());
    setCaptchaInput("");
    setManufacturer("");
    setModel("");
    setYearFrom("");
    setYearTo("");
    setSelectedManufacturerId(null);
    setModels([]);
  }, []);

  // Generate a new captcha on mount to avoid SSR mismatch
  useEffect(() => {
    setCaptcha(generateCaptcha());
  }, []);

  // Fetch manufacturers on mount
  useEffect(() => {
    fetch("/api/vehicles/manufacturers")
      .then((res) => res.json())
      .then(setManufacturers)
      .catch(() => {});
  }, []);

  // Fetch models when a known manufacturer is selected
  useEffect(() => {
    if (selectedManufacturerId) {
      fetch(`/api/vehicles/models?manufacturer_id=${selectedManufacturerId}`)
        .then((res) => res.json())
        .then(setModels)
        .catch(() => {});
    }
  }, [selectedManufacturerId]);

  function handleManufacturerChange(value: string) {
    const mfr = manufacturers.find((m) => m.name === value);
    setSelectedManufacturerId(mfr ? mfr.id : null);
    setManufacturer(value);
    setModel("");
    if (!mfr) setModels([]);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Validate captcha
    if (parseInt(captchaInput) !== captcha.answer) {
      setStatus("error");
      setCaptcha(generateCaptcha());
      setCaptchaInput("");
      return;
    }

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
        setCaptcha(generateCaptcha());
        setCaptchaInput("");
      }
    } catch {
      setStatus("error");
      setCaptcha(generateCaptcha());
      setCaptchaInput("");
    }
  }

  const manufacturerOptions = manufacturers.map((m) => ({
    value: m.name,
    label: m.name,
  }));

  const modelOptions = models.map((m) => ({
    value: m.name,
    label: m.name,
  }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">{t("title")}</h1>
      <p className="text-gray-600 mb-8">{t("intro")}</p>

      {status === "success" ? (
        <div className="text-center py-12">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <p className="text-green-800 text-lg font-medium">
              {t("success")}
            </p>
          </div>
          <button
            onClick={resetForm}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
          >
            {t("addAnother")}
          </button>
        </div>
      ) : (
        <>
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
              <label
                htmlFor="manufacturer"
                className="block text-sm font-medium mb-1"
              >
                {t("manufacturer")} *
              </label>
              <Combobox
                options={manufacturerOptions}
                value={manufacturer}
                onChange={handleManufacturerChange}
                placeholder={t("selectManufacturer")}
                addNewLabel={t("addNew")}
                addNewPlaceholder={t("newManufacturerPlaceholder")}
                name="manufacturer"
                required
              />
            </div>

            <div>
              <label
                htmlFor="model"
                className="block text-sm font-medium mb-1"
              >
                {t("model")} *
              </label>
              <Combobox
                options={modelOptions}
                value={model}
                onChange={setModel}
                placeholder={t("selectModel")}
                addNewLabel={t("addNew")}
                addNewPlaceholder={t("newModelPlaceholder")}
                name="model"
                required
                disabled={!manufacturer}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="yearFrom"
                  className="block text-sm font-medium mb-1"
                >
                  {t("yearFrom")}
                </label>
                <select
                  id="yearFrom"
                  name="yearFrom"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">–</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="yearTo"
                  className="block text-sm font-medium mb-1"
                >
                  {t("yearTo")}
                </label>
                <select
                  id="yearTo"
                  name="yearTo"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">–</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="pdf"
                className="block text-sm font-medium mb-1"
              >
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
              <label
                htmlFor="note"
                className="block text-sm font-medium mb-1"
              >
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

            {/* Math captcha */}
            <div>
              <label
                htmlFor="captcha"
                className="block text-sm font-medium mb-1"
              >
                {t("captcha", { a: captcha.a, b: captcha.b })} *
              </label>
              <input
                type="number"
                id="captcha"
                required
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
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
        </>
      )}
    </div>
  );
}
