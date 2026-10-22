import { MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent } from "react";

import { ROLE_LABEL } from "../../lib/roles";
import { useUser } from "../../auth/session";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmButton,
  CopyButton,
  ErrorAlert,
  Field,
  PageError,
  PageHeader,
  PersonLine,
  SectionTitle,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { cx, inputClass } from "../../components/ui/classes";
import { api, type NewUser, type Role } from "../../lib/api";
import { formatDate, shortHash } from "../../lib/format";

const FILTERS: { value: Role | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "patient", label: "Patients" },
  { value: "clinician", label: "Clinicians" },
  { value: "admin", label: "Admins" },
];

export function UsersPage() {
  const me = useUser();
  const client = useQueryClient();
  const [role, setRole] = useState<Role | undefined>();
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());
  const [adding, setAdding] = useState(false);
  const users = useQuery({
    queryKey: ["admin-users", role, term],
    queryFn: () => api.adminUsers({ role, q: term }),
    placeholderData: keepPreviousData,
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.setUserActive(id, active),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-users"] });
      void client.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Create accounts and control access. New clinicians are verified on the registry automatically."
        action={
          !adding && (
            <Button
              icon={<PlusIcon aria-hidden weight="bold" className="size-4" />}
              onClick={() => setAdding(true)}
            >
              Add user
            </Button>
          )
        }
      />
      {adding && <AddUser onClose={() => setAdding(false)} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          className="border-line bg-surface flex rounded-lg border p-1"
          role="group"
          aria-label="Filter by role"
        >
          {FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              aria-pressed={role === filter.value}
              onClick={() => setRole(filter.value)}
              className={cx(
                "rounded-md px-3 py-1 text-sm transition-colors",
                role === filter.value
                  ? "bg-ink-strong text-white"
                  : "text-muted hover:text-ink-strong",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <MagnifyingGlassIcon
            aria-hidden
            weight="bold"
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <input
            id="user-search"
            className={`${inputClass} pl-9`}
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {toggle.error && (
        <div className="mb-4">
          <ErrorAlert error={toggle.error} />
        </div>
      )}
      {users.isPending && <Skeleton className="h-48 rounded-xl" />}
      {users.error && <PageError error={users.error} onRetry={() => void users.refetch()} />}
      {users.data && (
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Wallet</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((user) => (
              <tr key={user.id} className="group">
                <Td>
                  <PersonLine name={user.name} detail={user.email} size="sm" />
                </Td>
                <Td>
                  <span className="text-ink-strong">{ROLE_LABEL[user.role]}</span>
                  {user.title && <span className="text-muted block text-xs">{user.title}</span>}
                </Td>
                <Td>
                  {user.wallet_address ? (
                    <span className="flex items-center gap-1 font-mono text-xs">
                      {shortHash(user.wallet_address)}
                      <CopyButton value={user.wallet_address} label="wallet address" />
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td>
                  {user.is_active ? (
                    <Badge tone="ok">Active</Badge>
                  ) : (
                    <Badge tone="bad">Deactivated</Badge>
                  )}
                </Td>
                <Td className="text-muted whitespace-nowrap">{formatDate(user.created_at)}</Td>
                <Td className="text-right whitespace-nowrap">
                  {user.id === me.id ? (
                    <span className="text-muted text-xs">You</span>
                  ) : user.is_active ? (
                    <ConfirmButton
                      confirmLabel="Deactivate"
                      loading={toggle.isPending && toggle.variables?.id === user.id}
                      onConfirm={() => toggle.mutate({ id: user.id, active: false })}
                    >
                      Deactivate
                    </ConfirmButton>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={toggle.isPending && toggle.variables?.id === user.id}
                      onClick={() => toggle.mutate({ id: user.id, active: true })}
                    >
                      Reactivate
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

function AddUser({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [form, setForm] = useState<NewUser>({ name: "", email: "", role: "patient" });
  const create = useMutation({
    mutationFn: () =>
      api.createUser({
        ...form,
        title: form.role === "clinician" ? form.title : undefined,
        date_of_birth: form.role === "patient" ? form.date_of_birth || undefined : undefined,
        password: form.password || undefined,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-users"] });
      void client.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
  const set = (patch: Partial<NewUser>) => setForm((current) => ({ ...current, ...patch }));

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  if (create.data) {
    const { user, temporary_password } = create.data;
    return (
      <Card className="mb-8">
        <Alert tone="success">
          Created {user.name} ({ROLE_LABEL[user.role].toLowerCase()})
          {user.role === "clinician" ? " and verified them on the registry." : "."}
        </Alert>
        {temporary_password && (
          <div className="mt-4">
            <p className="text-ink text-sm">
              Temporary password. Share it securely; it will not be shown again.
            </p>
            <div className="border-line bg-subtle mt-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2 font-mono text-sm">
              {temporary_password}
              <CopyButton value={temporary_password} label="temporary password" />
            </div>
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={() => create.reset()}>
            Add another
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <SectionTitle>Add user</SectionTitle>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field id="new-name" label="Full name">
          <input
            id="new-name"
            required
            className={inputClass}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field id="new-email" label="Email">
          <input
            id="new-email"
            type="email"
            required
            className={inputClass}
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </Field>
        <Field id="new-role" label="Role">
          <Select
            id="new-role"
            value={form.role}
            onChange={(e) => set({ role: e.target.value as Role })}
          >
            <option value="patient">Patient</option>
            <option value="clinician">Clinician</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        {form.role === "clinician" && (
          <Field id="new-title" label="Title" hint="For example: Consultant radiologist">
            <input
              id="new-title"
              className={inputClass}
              value={form.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
        )}
        {form.role === "patient" && (
          <Field id="new-dob" label="Date of birth">
            <input
              id="new-dob"
              type="date"
              className={inputClass}
              value={form.date_of_birth ?? ""}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set({ date_of_birth: e.target.value })}
            />
          </Field>
        )}
        <Field
          id="new-password"
          label="Password (optional)"
          hint="Leave empty to generate a temporary password."
        >
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            className={inputClass}
            value={form.password ?? ""}
            onChange={(e) => set({ password: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <ErrorAlert error={create.error} />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={create.isPending}>
            Create account
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
