"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { upload } from "@/lib/api";
export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string | number;
  options?: { value: string; label: string }[];
  hint?: string;
  min?: number;
  max?: number;
};
export function Form({
  fields,
  onSubmit,
  label = "Save",
  children,
}: {
  fields: Field[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  label?: string;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="module-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setMessage("");
        try {
          await onSubmit(
            Object.fromEntries(new FormData(form)) as Record<string, string>,
          );
          setMessage("Saved successfully.");
          form.reset();
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select
                aria-label={f.label}
                name={f.name}
                required={f.required}
                defaultValue={f.value || ""}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                required={f.required}
                defaultValue={f.value}
              />
            ) : (
              <input
                name={f.name}
                type={f.type || "text"}
                required={f.required}
                defaultValue={f.value}
                min={f.min}
                max={f.max}
                step={f.type === "number" ? "any" : undefined}
              />
            )}{" "}
            {f.hint && <small className="muted">{f.hint}</small>}
          </label>
        ))}
      </div>
      {children}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : label}
      </Button>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
export function Upload({
  onUploaded,
  confidential = false,
  label,
}: {
  onUploaded: (url: string) => void;
  confidential?: boolean;
  label: string;
}) {
  const [message, setMessage] = useState("");
  return (
    <label className="upload-field">
      {label}
      <input
        type="file"
        accept={
          confidential
            ? "image/jpeg,image/png,image/webp,application/pdf"
            : "image/jpeg,image/png,image/webp"
        }
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setMessage("Uploading…");
          try {
            onUploaded(await upload(file, confidential));
            setMessage("File uploaded.");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      />
      <small role="status">{message || "JPG, PNG, WEBP · Maximum 10 MB"}</small>
    </label>
  );
}
export const options = (
  items: { id: string; name: string }[],
  empty = "Choose…",
) => [
  { value: "", label: empty },
  ...items.map((i) => ({ value: i.id, label: i.name })),
];
