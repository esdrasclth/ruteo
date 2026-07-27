"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  CustomerListItem,
  Driver,
  getSession,
  Role,
  TeamUser,
  UserStatus,
} from "@/lib/api";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  USER_STATUS_LABELS,
  userStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const NONE = "none";

const emptyForm = {
  email: "",
  name: "",
  role: "OPERATOR" as Role,
  password: "",
  driverId: undefined as string | undefined,
  customerId: undefined as string | undefined,
};

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [resetTarget, setResetTarget] = useState<TeamUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [linkables, setLinkables] = useState<{
    drivers: Driver[];
    customers: CustomerListItem[];
  } | null>(null);

  const session = getSession();
  const myId = session?.userId;
  const isOwner = session?.role === "OWNER";
  const roleOptions: Role[] = isOwner
    ? ["OWNER", ...ASSIGNABLE_ROLES]
    : ASSIGNABLE_ROLES;

  const load = useCallback(async () => {
    try {
      setUsers(await api<TeamUser[]>("/users"));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando el equipo",
      );
    }
  }, []);

  const loadLinkables = useCallback(async () => {
    try {
      const [drivers, customers] = await Promise.all([
        api<Driver[]>("/drivers"),
        api<CustomerListItem[]>("/customers"),
      ]);
      // Only records without an account can be linked to a new user.
      setLinkables({
        drivers: drivers.filter((d) => !d.userId),
        customers: customers.filter((c) => !c.userId),
      });
    } catch {
      setLinkables({ drivers: [], customers: [] });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (open && !linkables) {
      loadLinkables();
    }
  }, [open, linkables, loadLinkables]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api<TeamUser>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim(),
          name: form.name.trim() || undefined,
          role: form.role,
          password: form.password,
          driverId: form.role === "DRIVER" ? form.driverId : undefined,
          customerId: form.role === "CUSTOMER" ? form.customerId : undefined,
        }),
      });
      toast.success("Usuario creado");
      setOpen(false);
      setForm(emptyForm);
      await Promise.all([load(), loadLinkables()]);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo crear el usuario",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onRoleChange(user: TeamUser, role: Role) {
    try {
      await api(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      toast.success(`${user.name || user.email}: ${ROLE_LABELS[role]}`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar",
      );
    }
  }

  async function onStatusToggle(user: TeamUser) {
    const status: UserStatus =
      user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      await api(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(
        `${user.name || user.email}: ${USER_STATUS_LABELS[status]}`,
      );
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar",
      );
    }
  }

  async function onResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    try {
      await api(`/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      toast.success("Contraseña restablecida");
      setResetTarget(null);
      setNewPassword("");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo restablecer",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Equipo</h1>
          <p className="text-sm text-muted-foreground">
            {users ? `${users.length} miembros` : "Cargando…"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Nuevo usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo usuario</DialogTitle>
            </DialogHeader>
            <form onSubmit={onCreate} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Correo *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Rol</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        role: v as Role,
                        driverId: undefined,
                        customerId: undefined,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña *</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                  />
                </div>
              </div>
              {form.role === "DRIVER" ? (
                <div className="grid gap-2">
                  <Label>Vincular con driver (opcional)</Label>
                  <Select
                    value={form.driverId ?? NONE}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        driverId: v === NONE ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin vincular" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin vincular</SelectItem>
                      {linkables?.drivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                          {d.phone ? ` · ${d.phone}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkables && linkables.drivers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No hay drivers sin cuenta para vincular.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {form.role === "CUSTOMER" ? (
                <div className="grid gap-2">
                  <Label>Vincular con cliente (opcional)</Label>
                  <Select
                    value={form.customerId ?? NONE}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        customerId: v === NONE ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin vincular" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin vincular</SelectItem>
                      {linkables?.customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.email ? ` · ${c.email}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkables && linkables.customers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No hay clientes sin cuenta para vincular.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creando…" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {!users ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Aún no hay usuarios.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Vinculado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === myId;
                  // ADMINs cannot manage OWNER accounts.
                  const canManage =
                    !isSelf && (isOwner || u.role !== "OWNER");
                  const rowRoleOptions = roleOptions.includes(u.role)
                    ? roleOptions
                    : [u.role, ...roleOptions];
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.name || "—"}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (tú)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={u.role}
                            onValueChange={(v) => onRoleChange(u, v as Role)}
                          >
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {rowRoleOptions.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">
                            {ROLE_LABELS[u.role]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.driver
                          ? `Driver: ${u.driver.name}`
                          : u.customer
                            ? `Cliente: ${u.customer.name}`
                            : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={userStatusBadgeClass(u.status)}>
                          {USER_STATUS_LABELS[u.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canManage ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onStatusToggle(u)}
                              >
                                {u.status === "ACTIVE"
                                  ? "Deshabilitar"
                                  : "Activar"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Restablecer contraseña"
                                onClick={() => setResetTarget(u)}
                              >
                                <KeyRound className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={resetTarget !== null}
        onOpenChange={(v) => {
          if (!v) {
            setResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Restablecer contraseña de{" "}
              {resetTarget?.name || resetTarget?.email}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onResetPassword} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="reset-password">Nueva contraseña</Label>
              <Input
                id="reset-password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Restablecer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
