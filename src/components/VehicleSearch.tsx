"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

interface Manufacturer {
  id: number;
  name: string;
}

interface Model {
  id: number;
  name: string;
}

export default function VehicleSearch() {
  const t = useTranslations("search");
  const router = useRouter();

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedMakeId, setSelectedMakeId] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [year, setYear] = useState("");

  useEffect(() => {
    fetch("/api/vehicles/manufacturers")
      .then((res) => res.json())
      .then(setManufacturers);
  }, []);

  useEffect(() => {
    if (selectedMakeId) {
      fetch(`/api/vehicles/models?manufacturer_id=${selectedMakeId}`)
        .then((res) => res.json())
        .then(setModels);
    } else {
      setModels([]);
    }
    setSelectedModel("");
  }, [selectedMakeId]);

  function handleManufacturerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const mfr = manufacturers.find((m) => m.id === Number(e.target.value));
    setSelectedMakeId(mfr ? mfr.id : null);
    setSelectedMake(mfr ? mfr.name : "");
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMake) return;

    const params = new URLSearchParams();
    params.set("make", selectedMake);
    if (selectedModel) params.set("model", selectedModel);
    if (year) params.set("year", year);

    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSearch} className="w-full max-w-md mx-auto space-y-4">
      <select
        value={selectedMakeId ?? ""}
        onChange={handleManufacturerChange}
        className="w-full p-3 border border-gray-300 rounded-lg text-lg"
      >
        <option value="">{t("selectManufacturer")}</option>
        {manufacturers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        disabled={!selectedMakeId}
        className="w-full p-3 border border-gray-300 rounded-lg text-lg disabled:opacity-50"
      >
        <option value="">{t("selectModel")}</option>
        {models.map((m) => (
          <option key={m.id} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>

      <input
        type="number"
        value={year}
        onChange={(e) => setYear(e.target.value)}
        placeholder={t("enterYear")}
        min="1990"
        max="2030"
        className="w-full p-3 border border-gray-300 rounded-lg text-lg"
      />

      <button
        type="submit"
        disabled={!selectedMake}
        className="w-full p-3 bg-red-600 text-white rounded-lg text-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {t("searchButton")}
      </button>
    </form>
  );
}
