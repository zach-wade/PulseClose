"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";

// Borrower-facing per-property photo upload. JPEG ideal (EXIF GPS
// only present on JPEG), but PNG/WebP/HEIC accepted (vision check
// still runs, GPS just stays null). Server records EXIF + Claude
// vision verdict on property_photo_verifications.

interface Verification {
  id: string;
  exif_lat: number | null;
  exif_lng: number | null;
  vision_verdict: string | null;
  distance_from_property_m: number | null;
}

interface Props {
  token: string;
}

const VERDICT_LABEL: Record<string, string> = {
  plausible_property: "Looks like a real property",
  stock_or_synthetic: "Looks like a stock / map / AI image",
  indoor_only: "Indoor only — exterior preferred",
  unknown: "Inconclusive",
};

const VERDICT_COLOR: Record<string, string> = {
  plausible_property: "text-emerald-700",
  stock_or_synthetic: "text-red-700",
  indoor_only: "text-amber-700",
  unknown: "text-muted-foreground",
};

export function PropertyPhotoUpload({ token }: Props) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Verification | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setLast(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/share/${token}/upload-photo`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => null)) as
        | { verification?: Verification; error?: string }
        | null;
      if (!res.ok) {
        toast.error(j?.error ?? "Couldn't process the photo.");
        return;
      }
      if (j?.verification) {
        setLast(j.verification);
        toast.success("Photo uploaded. Lender can see the verification on their report.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4" />
          Property photos (optional)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload a current photo of the subject property. JPEG with GPS
          metadata is best — proves you took the photo on-site. We
          extract location + run a quick check that it looks like a real
          property (not a stock image or screenshot). Repeat for each
          property as needed.
        </p>
        <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Drop a JPEG (or PNG / HEIC).
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="mr-2 h-4 w-4" />
            )}
            {busy ? "Processing…" : "Upload photo"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {last && (
          <div className="rounded-md border bg-muted/20 p-3 space-y-1 text-sm">
            {last.vision_verdict && (
              <p>
                <span className="text-muted-foreground">Verdict: </span>
                <span className={`font-medium ${VERDICT_COLOR[last.vision_verdict] ?? ""}`}>
                  {VERDICT_LABEL[last.vision_verdict] ?? last.vision_verdict}
                </span>
              </p>
            )}
            {last.exif_lat != null && last.exif_lng != null ? (
              <p className="text-xs">
                <span className="text-muted-foreground">GPS: </span>
                <span className="font-mono">
                  {last.exif_lat.toFixed(5)}, {last.exif_lng.toFixed(5)}
                </span>
                {last.distance_from_property_m != null && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {last.distance_from_property_m}m from the property address
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No GPS metadata in this photo. Consider a JPEG taken on
                a phone with location services on.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
