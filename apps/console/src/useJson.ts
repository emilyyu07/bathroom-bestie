import { useEffect, useState } from "react";

export function useJson<T>(url: string): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: ${r.status}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [url]);
  return { data, error };
}
