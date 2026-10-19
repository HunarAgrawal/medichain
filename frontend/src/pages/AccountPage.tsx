import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { meKey, useUser } from "../auth/session";
import {
  Alert,
  Button,
  Card,
  DetailList,
  ErrorAlert,
  Field,
  PageHeader,
  SectionTitle,
} from "../components/ui";
import { inputClass } from "../components/ui/classes";
import { api } from "../lib/api";
import { age, formatDate, formatDateTime, shortHash } from "../lib/format";
import { explorerAddressUrl, useMeta } from "../lib/queries";
import { ROLE_LABEL } from "../lib/roles";

export function AccountPage() {
  const user = useUser();
  const { data: meta } = useMeta();
  const client = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: (updated) => {
      client.setQueryData(meKey, updated);
      setCurrent("");
      setNext("");
      setConfirm("");
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setMismatch(next !== confirm);
    if (next === confirm) change.mutate();
  }

  return (
    <>
      <PageHeader title="Account" description="Your profile and sign-in settings." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Profile</SectionTitle>
          <DetailList
            items={[
              { label: "Name", value: user.name },
              { label: "Email", value: user.email },
              { label: "Role", value: ROLE_LABEL[user.role] },
              ...(user.title ? [{ label: "Title", value: user.title }] : []),
              { label: "Reference", value: user.reference, mono: true, copy: true },
              ...(user.date_of_birth
                ? [
                    {
                      label: "Date of birth",
                      value: `${formatDate(user.date_of_birth)} (age ${age(user.date_of_birth)})`,
                    },
                  ]
                : []),
              ...(user.last_login_at
                ? [{ label: "Last sign-in", value: formatDateTime(user.last_login_at) }]
                : []),
            ]}
          />
          {user.wallet_address && (
            <div className="border-line mt-6 border-t pt-5">
              <SectionTitle>On-chain identity</SectionTitle>
              <p className="text-muted mb-3 text-sm">
                {user.role === "patient"
                  ? "Your records and sharing consents are registered to this address. Medichain holds its key for you, encrypted."
                  : "Reports you sign are registered from this address. Medichain holds its key for you, encrypted."}
              </p>
              <DetailList
                items={[
                  {
                    label: "Address",
                    value: user.wallet_address,
                    display: shortHash(user.wallet_address, 10, 8),
                    mono: true,
                    copy: true,
                    href: explorerAddressUrl(meta?.chain.explorer_url, user.wallet_address),
                  },
                ]}
              />
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Change password</SectionTitle>
          <form onSubmit={submit} className="space-y-4">
            <Field id="current" label="Current password">
              <input
                id="current"
                type="password"
                autoComplete="current-password"
                required
                className={inputClass}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field
              id="new"
              label="New password"
              hint="At least 10 characters. Changing it signs out your other devices."
            >
              <input
                id="new"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                className={inputClass}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <Field
              id="confirm"
              label="Confirm new password"
              error={mismatch ? "The passwords do not match." : undefined}
            >
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                className={inputClass}
                aria-invalid={mismatch}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <ErrorAlert error={change.error} />
            {change.isSuccess && (
              <Alert tone="success">Password changed. Other devices have been signed out.</Alert>
            )}
            <Button type="submit" loading={change.isPending}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
