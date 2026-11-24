import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { meKey } from "../../auth/session";
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorAlert,
  Field,
  PageError,
  PageHeader,
  PageLoading,
  SectionTitle,
  Select,
} from "../../components/ui";
import { inputClass } from "../../components/ui/classes";
import {
  api,
  type NewSite,
  type Organization,
  type OrganizationUpdate,
  type OrgKind,
  type SiteKind,
} from "../../lib/api";
import { ORG_KIND_LABEL, SITE_KIND_LABEL } from "../../lib/roles";

export function SettingsPage() {
  const org = useQuery({ queryKey: ["organization"], queryFn: api.organization });
  if (org.isPending) return <PageLoading />;
  if (org.isError) return <PageError error={org.error} onRetry={() => void org.refetch()} />;
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your organization's details appear across the workspace and on the letterhead of every signed report."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <OrganizationForm org={org.data} />
        <Sites />
      </div>
    </>
  );
}

const FIELDS: { key: keyof OrganizationUpdate; label: string; hint?: string; type?: string }[] = [
  { key: "name", label: "Name", hint: "Printed at the top of every report." },
  { key: "short_name", label: "Short name", hint: "Shown in the app header." },
  { key: "department", label: "Department" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  {
    key: "accreditation",
    label: "Accreditation",
    hint: "e.g. NABH accredited. Printed under the address.",
  },
];

function OrganizationForm({ org }: { org: Organization }) {
  const client = useQueryClient();
  const [form, setForm] = useState<OrganizationUpdate>({
    name: org.name,
    short_name: org.short_name,
    kind: org.kind,
    department: org.department,
    address: org.address ?? "",
    city: org.city ?? "",
    phone: org.phone ?? "",
    email: org.email ?? "",
    accreditation: org.accreditation ?? "",
  });
  const save = useMutation({
    mutationFn: () => api.updateOrganization({ ...form, email: form.email || null }),
    onSuccess: (updated) => {
      client.setQueryData(["organization"], updated);
      void client.invalidateQueries({ queryKey: meKey });
      void client.invalidateQueries({ queryKey: ["meta"] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Card>
      <SectionTitle>Organization</SectionTitle>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2">
          <Field id="org-kind" label="Type">
            <Select
              id="org-kind"
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value as OrgKind })}
            >
              {(Object.keys(ORG_KIND_LABEL) as OrgKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {ORG_KIND_LABEL[kind]}
                </option>
              ))}
            </Select>
          </Field>
          {FIELDS.map((field) => (
            <Field key={field.key} id={`org-${field.key}`} label={field.label} hint={field.hint}>
              <input
                id={`org-${field.key}`}
                type={field.type ?? "text"}
                required={
                  field.key === "name" || field.key === "short_name" || field.key === "department"
                }
                className={inputClass}
                value={form[field.key] ?? ""}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              />
            </Field>
          ))}
        </fieldset>
        <ErrorAlert error={save.error} />
        {save.isSuccess && <Alert tone="success">Saved. New reports use these details.</Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
          <span className="text-muted text-xs">
            Patient numbers start with <code className="font-mono">{org.uhid_prefix}</code> · times
            in {org.timezone}
          </span>
        </div>
      </form>
    </Card>
  );
}

function Sites() {
  const client = useQueryClient();
  const sites = useQuery({ queryKey: ["admin-sites"], queryFn: api.adminSites });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<NewSite>({ name: "", code: "", kind: "radiology_department" });
  const create = useMutation({
    mutationFn: () => api.createSite({ ...form, city: form.city?.trim() || undefined }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-sites"] });
      void client.invalidateQueries({ queryKey: ["sites"] });
      setAdding(false);
      setForm({ name: "", code: "", kind: "radiology_department" });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Card>
      <SectionTitle
        action={
          !adding && (
            <Button
              size="sm"
              variant="secondary"
              icon={<PlusIcon aria-hidden weight="bold" className="size-3.5" />}
              onClick={() => setAdding(true)}
            >
              Add site
            </Button>
          )
        }
      >
        Sites
      </SectionTitle>
      <p className="text-muted -mt-2 mb-4 text-sm">
        Hospital departments, imaging centres and partner sites reported remotely.
      </p>
      <ul className="divide-line divide-y">
        {sites.data?.map((site) => (
          <li key={site.id} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="text-ink-strong block truncate text-sm font-medium">
                {site.name}
              </span>
              <span className="text-muted block text-xs">
                {SITE_KIND_LABEL[site.kind]}
                {site.city ? ` · ${site.city}` : ""}
              </span>
            </span>
            <Badge>{site.code}</Badge>
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={submit} className="border-line mt-4 space-y-4 border-t pt-4">
          <fieldset disabled={create.isPending} className="grid gap-4 sm:grid-cols-2">
            <Field id="site-name" label="Name">
              <input
                id="site-name"
                required
                className={inputClass}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field id="site-code" label="Code" hint="2–12 letters or digits">
              <input
                id="site-code"
                required
                pattern="[A-Za-z0-9-]{2,12}"
                className={inputClass}
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
              />
            </Field>
            <Field id="site-kind" label="Type">
              <Select
                id="site-kind"
                value={form.kind}
                onChange={(event) => setForm({ ...form, kind: event.target.value as SiteKind })}
              >
                {(Object.keys(SITE_KIND_LABEL) as SiteKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {SITE_KIND_LABEL[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="site-city" label="City">
              <input
                id="site-city"
                className={inputClass}
                value={form.city ?? ""}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </Field>
          </fieldset>
          <ErrorAlert error={create.error} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={create.isPending}>
              Add site
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
