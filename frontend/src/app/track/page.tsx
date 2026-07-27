"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function TrackSearchPage() {
  const router = useRouter();
  const [tracking, setTracking] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const tn = tracking.trim().toUpperCase();
    if (tn) router.push(`/track/${encodeURIComponent(tn)}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <PackageSearch className="size-10 text-primary" />
            <h1 className="text-xl font-semibold">Rastrea tu envío</h1>
            <p className="text-sm text-muted-foreground">
              Ingresa tu número de rastreo para ver por dónde viene tu paquete.
            </p>
          </div>
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              placeholder="RUT-XXXXXXXXXX"
              className="font-mono"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
            <Button type="submit" disabled={!tracking.trim()}>
              Rastrear
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
