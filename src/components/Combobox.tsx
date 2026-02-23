"use client";

import { useState } from "react";

interface ComboboxProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  addNewLabel: string;
  addNewPlaceholder: string;
  name: string;
  required?: boolean;
  disabled?: boolean;
}

const ADD_NEW = "__add_new__";

export default function Combobox({
  options,
  value,
  onChange,
  placeholder,
  addNewLabel,
  addNewPlaceholder,
  name,
  required,
  disabled,
}: ComboboxProps) {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newValue, setNewValue] = useState("");

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500";

  if (isAddingNew) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={newValue}
          onChange={(e) => {
            setNewValue(e.target.value);
            onChange(e.target.value);
          }}
          placeholder={addNewPlaceholder}
          required={required}
          className={`${inputClass} flex-1`}
        />
        <button
          type="button"
          onClick={() => {
            setIsAddingNew(false);
            setNewValue("");
            onChange("");
          }}
          className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          &larr;
        </button>
        <input type="hidden" name={name} value={newValue} />
      </div>
    );
  }

  return (
    <>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD_NEW) {
            setIsAddingNew(true);
            onChange("");
          } else {
            onChange(e.target.value);
          }
        }}
        required={required}
        disabled={disabled}
        className={`${inputClass} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value={ADD_NEW}>{addNewLabel}</option>
      </select>
      <input type="hidden" name={name} value={value} />
    </>
  );
}
