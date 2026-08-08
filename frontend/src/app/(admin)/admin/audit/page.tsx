"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PlatformAudit } from "@/components/platform-audit";

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Historial de plataforma
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo cambio hecho desde este panel, con quién lo hizo y desde dónde.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <PlatformAudit titulo="Últimos movimientos" />
        </CardContent>
      </Card>
    </div>
  );
}
