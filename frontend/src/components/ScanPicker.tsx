import { UploadSimpleIcon } from "@phosphor-icons/react";
import { useRef, useState, type DragEvent } from "react";

import { Button } from "./ui";
import { ACCEPTED_SCAN_TYPES } from "../lib/files";
import { formatBytes } from "../lib/format";

interface ScanPickerProps {
  file: File | null;
  previewUrl: string | null;
  maxUploadMb: number;
  error?: string;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}

export function ScanPicker({
  file,
  previewUrl,
  maxUploadMb,
  error,
  disabled,
  onChange,
}: ScanPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !disabled) onChange(dropped);
  }

  return (
    <div>
      <input
        ref={input}
        id="scan"
        type="file"
        accept={ACCEPTED_SCAN_TYPES.join(",")}
        className="sr-only"
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby="scan-message"
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />

      {file && previewUrl ? (
        <div className="border-line bg-subtle flex items-center gap-4 rounded-lg border p-3">
          <img
            src={previewUrl}
            alt="Selected scan preview"
            className="size-20 shrink-0 rounded-md bg-black object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="text-ink-strong truncate text-sm font-medium">{file.name}</p>
            <p className="text-muted text-xs">{formatBytes(file.size)}</p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              Replace
            </Button>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor="scan"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
            dragging
              ? "border-ink-strong bg-subtle"
              : error
                ? "border-bad/50"
                : "hover:bg-subtle border-[#d8d8d6]"
          }`}
        >
          <UploadSimpleIcon aria-hidden weight="bold" className="text-muted size-5" />
          <span className="text-ink-strong text-sm font-medium">
            Drop a scan here or choose a file
          </span>
          <span className="text-muted text-xs">PNG or JPEG, up to {maxUploadMb} MB</span>
        </label>
      )}

      <p id="scan-message" className={`mt-1.5 text-xs ${error ? "text-bad" : "sr-only"}`}>
        {error ?? "PNG or JPEG image"}
      </p>
    </div>
  );
}
