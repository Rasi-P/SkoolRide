import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { App, Button } from "antd";
import { api, errorMessage } from "@/api/client";
import { API_BASE_URL } from "@/lib/env";

function privateMediaUrl(src: string): string | null {
  const path = new URL(src, window.location.origin).pathname;
  if (!path.startsWith("/media/")) return null;
  return new URL(path, new URL(API_BASE_URL, window.location.origin)).href;
}

export function useProtectedImage(src?: string | null) {
  const [loaded, setLoaded] = useState<{ source: string; blob: string } | null>(null);
  const privateUrl = src ? privateMediaUrl(src) : null;
  useEffect(() => {
    if (!privateUrl || !src) return;
    let disposed = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    api.get<Blob>(privateUrl, { responseType: "blob", signal: controller.signal }).then((response) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(response.data);
      setLoaded({ source: src, blob: objectUrl });
    }).catch(() => { /* The avatar initials remain available on denied or failed images. */ });
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, privateUrl]);
  return privateUrl ? (loaded && loaded.source === src ? loaded.blob : undefined) : src || undefined;
}

export function ProtectedImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const image = useProtectedImage(src);
  return <img {...props} src={image} />;
}

export function DocumentLink({ src }: { src: string }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const url = privateMediaUrl(src);
      if (!url) throw new Error("This document is not hosted by the school.");
      const response = await api.get<Blob>(url, { responseType: "blob" });
      const blob = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = blob;
      anchor.download = decodeURIComponent(new URL(url).pathname.split("/").pop() || "document");
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(blob), 1000);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return <Button type="link" size="small" loading={busy} onClick={download}>Download</Button>;
}
