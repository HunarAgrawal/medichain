import { FingerprintIcon, LockKeyIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { homePath, safeNext, useLogin, useMe } from "../auth/session";
import { Badge, Button, Card, ErrorAlert, Field, PersonLine } from "../components/ui";
import { inputClass } from "../components/ui/classes";
import type { DemoAccount } from "../lib/api";
import { useMeta } from "../lib/queries";
import { ROLE_LABEL } from "../lib/roles";

const POINTS = [
  {
    Icon: LockKeyIcon,
    title: "Encrypted by default",
    text: "Scans and reports are encrypted before they are stored. Only people you authorise can open them.",
  },
  {
    Icon: UsersThreeIcon,
    title: "Patients decide who sees what",
    text: "Sharing with a clinician is a signed, on-chain consent that the patient can revoke at any time.",
  },
  {
    Icon: FingerprintIcon,
    title: "Verifiable reports",
    text: "Every signed report has a fingerprint on-chain. Anyone holding the PDF can check it is genuine.",
  },
];

export function LoginPage() {
  const { data: user } = useMe();
  const { data: meta } = useMeta();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingDemo, setPendingDemo] = useState<string | null>(null);

  if (user) return <Navigate to={next ?? homePath(user.role)} replace />;

  function signIn(credentials: { email: string; password: string }) {
    login.mutate(credentials, {
      onSuccess: (signedIn) => void navigate(next ?? homePath(signedIn.role), { replace: true }),
      onSettled: () => setPendingDemo(null),
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    signIn({ email: email.trim(), password });
  }

  function signInAs(account: DemoAccount) {
    setPendingDemo(account.email);
    signIn({ email: account.email, password: account.password });
  }

  return (
    <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16">
      <section className="motion-safe:animate-enter pt-2 lg:pt-8">
        <p className="text-muted text-xs font-medium tracking-[0.06em] uppercase">
          Medical imaging records
        </p>
        <h1 className="text-ink-strong mt-3 font-serif text-5xl leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          Imaging reports patients own and anyone can verify.
        </h1>
        <p className="text-muted mt-5 max-w-xl text-pretty">
          Clinicians run an AI-assisted analysis, review it and sign the report. Patients keep the
          record and choose who can open it. Every step is encrypted and leaves a tamper-evident
          trail.
        </p>
        <ul className="mt-10 grid max-w-xl gap-6">
          {POINTS.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span className="bg-surface border-line grid size-9 shrink-0 place-items-center rounded-lg border">
                <Icon aria-hidden weight="bold" className="text-ink size-4" />
              </span>
              <span>
                <span className="text-ink-strong block text-sm font-medium">{title}</span>
                <span className="text-muted block text-sm">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <Link
          to="/verify"
          className="text-ink-strong mt-10 inline-block text-sm underline underline-offset-4"
        >
          Verify a report without signing in
        </Link>
      </section>

      <div className="space-y-6">
        <Card>
          <h2 className="text-ink-strong font-serif text-3xl tracking-[-0.02em]">Sign in</h2>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field id="email" label="Email">
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field id="password" label="Password">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className={inputClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {login.isError && <ErrorAlert error={login.error} />}
            <Button
              type="submit"
              className="w-full"
              loading={login.isPending && pendingDemo === null}
            >
              Sign in
            </Button>
          </form>
        </Card>

        {meta?.demo_accounts && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-ink-strong text-[15px] font-medium">Demo accounts</h2>
              <Badge tone="warn">Demo mode</Badge>
            </div>
            <p className="text-muted mt-1 text-sm">
              One click signs you in. Every demo account uses the password{" "}
              <code className="bg-subtle rounded px-1 py-0.5 font-mono text-xs">
                {meta.demo_accounts[0]?.password}
              </code>
              .
            </p>
            <ul className="divide-line mt-4 divide-y">
              {meta.demo_accounts.map((account) => (
                <li key={account.email} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <PersonLine
                      name={account.name}
                      detail={`${ROLE_LABEL[account.role]} · ${account.description}`}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={pendingDemo === account.email}
                    disabled={login.isPending}
                    onClick={() => signInAs(account)}
                  >
                    Sign in
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
