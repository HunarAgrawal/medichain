import { useCallback, useEffect, useRef, useState } from "react";

/** An object URL for a Blob/File that is revoked when replaced or on unmount. */
export function useBlobUrl(): [string | null, (blob: Blob | null) => void] {
  const current = useRef<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const set = useCallback((blob: Blob | null) => {
    if (current.current) URL.revokeObjectURL(current.current);
    current.current = blob ? URL.createObjectURL(blob) : null;
    setUrl(current.current);
  }, []);

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
    },
    [],
  );

  return [url, set];
}
