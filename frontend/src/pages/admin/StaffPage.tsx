import { UserPlusIcon } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

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
  Segmented,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { inputClass } from "../../components/ui/classes";
import { api, type NewStaff, type StaffRole, type User } from "../../lib/api";
import { ROLE_LABEL } from "../../lib/roles";

const ROLES: StaffRole[] = ["radiologist", "technician", "doctor", "admin"];
const CLINICAL: StaffRole[] = ["radiologist", "doctor"];

export function StaffPage() {
  const me = useUser();
  const client = useQueryClient();
  const [role, setRole] = useState<StaffRole | "all">("all");
  const [adding, setAdding] = useState(false);
  const staff = useQuery({
    queryKey: ["staff", role],
    queryFn: () => api.staff(role === "all" ? {} : { role }),
    placeholderData: keepPreviousData,
  });
  const toggle = useMutation({
    mutationFn: ({ user, active }: { user: User; active: boolean }) =>
      api.setUserActive(user.id, active),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["staff"] }),
  });

  return (
    <>
      <PageHeader
        title="Staff"
        description="Radiologists and referring doctors are verified on the registry when added, and lose all access the moment they are deactivated."
        action={
          !adding && (
            <Button
              icon={<UserPlusIcon aria-hidden weight="bold" className="size-4" />}
              onClick={() => setAdding(true)}
            >
              Add staff
            </Button>
          )
        }
      />
      {adding && <AddStaff onClose={() => setAdding(false)} />}

      <div className="mb-4">
        <Segmented
          name="role"
          label="Filter by role"
          value={role}
          onChange={setRole}
          options={[
            { value: "all", label: "All" },
            ...ROLES.map((value) => ({ value, label: `${ROLE_LABEL[value]}s` })),
          ]}
        />
      </div>
      <ErrorAlert error={toggle.error} />
      {staff.isError ? (
        <PageError error={staff.error} onRetry={() => void staff.refetch()} />
      ) : staff.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Credentials</Th>
              <Th>Site</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {staff.data.map((user) => (
              <tr key={user.id} className="group">
                <Td>
                  <PersonLine name={user.name} detail={user.email} />
                </Td>
                <Td>
                  <span className="text-ink-strong block text-sm">{ROLE_LABEL[user.role]}</span>
                  {user.title && <span className="text-muted block text-xs">{user.title}</span>}
                </Td>
                <Td className="text-sm">
                  {user.qualification ?? <span className="text-muted">–</span>}
                  {user.registration_number && (
                    <span className="text-muted block text-xs">
                      Reg. {user.registration_number}
                    </span>
                  )}
                </Td>
                <Td className="text-muted text-sm">{user.site?.name ?? "All sites"}</Td>
                <Td>
                  {user.is_active ? (
                    <Badge tone="ok">Active</Badge>
                  ) : (
                    <Badge tone="bad">Deactivated</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  {user.id === me.id ? (
                    <span className="text-muted text-xs">You</span>
                  ) : user.is_active ? (
                    <ConfirmButton
                      confirmLabel="Deactivate"
                      loading={toggle.isPending && toggle.variables?.user.id === user.id}
                      onConfirm={() => toggle.mutate({ user, active: false })}
                    >
                      Deactivate
                    </ConfirmButton>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={toggle.isPending && toggle.variables?.user.id === user.id}
                      onClick={() => toggle.mutate({ user, active: true })}
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

function AddStaff({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites });
  const [form, setForm] = useState<NewStaff>({ name: "", email: "", role: "radiologist" });
  const set = (patch: Partial<NewStaff>) => setForm((current) => ({ ...current, ...patch }));
  const create = useMutation({
    mutationFn: () =>
      api.createStaff({
        ...form,
        title: form.title?.trim() || undefined,
        qualification: CLINICAL.includes(form.role)
          ? form.qualification?.trim() || undefined
          : undefined,
        registration_number: CLINICAL.includes(form.role)
          ? form.registration_number?.trim() || undefined
          : undefined,
        site_id: form.site_id || undefined,
        phone: form.phone?.trim() || undefined,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["staff"] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  if (create.data) {
    return (
      <Card className="mb-8 max-w-2xl">
        <Alert tone="success">
          {create.data.user.name} was added
          {CLINICAL.includes(create.data.user.role as StaffRole)
            ? " and verified on the registry"
            : ""}
          .
        </Alert>
        {create.data.temporary_password && (
          <div className="border-line bg-subtle mt-4 rounded-lg border p-3 text-sm">
            <p className="text-muted text-xs">Temporary password (shown once)</p>
            <p className="flex items-center gap-2">
              <code className="text-ink-strong font-mono">{create.data.temporary_password}</code>
              <CopyButton value={create.data.temporary_password} label="temporary password" />
            </p>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              create.reset();
              setForm({ name: "", email: "", role: form.role });
            }}
          >
            Add another
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </Card>
    );
  }

  const clinical = CLINICAL.includes(form.role);
  return (
    <Card className="mb-8 max-w-3xl">
      <SectionTitle>Add staff</SectionTitle>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={create.isPending} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="staff-name" label="Full name">
              <input
                id="staff-name"
                required
                className={inputClass}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field id="staff-email" label="Work email">
              <input
                id="staff-email"
                type="email"
                required
                className={inputClass}
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            </Field>
            <Field id="staff-role" label="Role">
              <Select
                id="staff-role"
                value={form.role}
                onChange={(e) => set({ role: e.target.value as StaffRole })}
              >
                {ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="staff-title"
              label="Designation"
              hint="e.g. Consultant Radiologist, Radiographer"
            >
              <input
                id="staff-title"
                className={inputClass}
                value={form.title ?? ""}
                onChange={(e) => set({ title: e.target.value })}
              />
            </Field>
            {clinical && (
              <>
                <Field
                  id="staff-qualification"
                  label="Qualification"
                  hint="Printed on signed reports"
                >
                  <input
                    id="staff-qualification"
                    placeholder="MD (Radiodiagnosis)"
                    className={inputClass}
                    value={form.qualification ?? ""}
                    onChange={(e) => set({ qualification: e.target.value })}
                  />
                </Field>
                <Field id="staff-registration" label="Medical council registration no.">
                  <input
                    id="staff-registration"
                    className={inputClass}
                    value={form.registration_number ?? ""}
                    onChange={(e) => set({ registration_number: e.target.value })}
                  />
                </Field>
              </>
            )}
            <Field id="staff-site" label="Site">
              <Select
                id="staff-site"
                value={form.site_id ?? ""}
                onChange={(e) => set({ site_id: e.target.value })}
              >
                <option value="">All sites</option>
                {sites.data?.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="staff-phone" label="Mobile number" hint="Optional">
              <input
                id="staff-phone"
                type="tel"
                className={inputClass}
                value={form.phone ?? ""}
                onChange={(e) => set({ phone: e.target.value })}
              />
            </Field>
          </div>
        </fieldset>
        <p className="text-muted text-xs">A temporary password is generated and shown once.</p>
        <ErrorAlert error={create.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending}>
            Add {ROLE_LABEL[form.role].toLowerCase()}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
