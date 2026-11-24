import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { homePath, safeNext, useLogin, useMe } from "../auth/session";
import { DemoPersonas } from "../components/DemoPersonas";
import { Badge, Button, Card, ErrorAlert, Field } from "../components/ui";
import { inputClass } from "../components/ui/classes";
import { useMeta } from "../lib/queries";

export function LoginPage() {
  const { data: user } = useMe();
  const { data: meta } = useMeta();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) return <Navigate to={next ?? homePath(user.role)} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (signedIn) => void navigate(next ?? homePath(signedIn.role), { replace: true }),
      },
    );
  }

  const demo = meta?.demo;
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[26rem_minmax(0,1fr)] lg:gap-14">
      <Card className="motion-safe:animate-enter">
        <h1 className="text-ink-strong font-serif text-3xl tracking-[-0.02em]">Sign in</h1>
        <p className="text-muted mt-1 text-sm">
          {demo?.workspace ? `Workspace: ${demo.workspace.name}` : "Use your hospital account."}
        </p>
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
          <Button type="submit" className="w-full" loading={login.isPending}>
            Sign in
          </Button>
        </form>
        <p className="text-muted border-line mt-6 border-t pt-4 text-sm">
          Have a report PDF?{" "}
          <Link to="/verify" className="text-ink-strong underline underline-offset-4">
            Verify it without signing in
          </Link>
          .
        </p>
      </Card>

      {demo && (
        <section aria-labelledby="demo-heading" className="motion-safe:animate-enter">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="demo-heading" className="text-ink-strong text-[15px] font-medium">
              Explore the demo as
            </h2>
            <Badge tone="warn">Demo workspace</Badge>
          </div>
          <p className="text-muted mt-1 mb-5 text-sm">
            One click signs you in. Every demo account uses the password{" "}
            <code className="bg-subtle rounded px-1 py-0.5 font-mono text-xs">{demo.password}</code>
            . Switch roles any time from the bar at the bottom of the screen.
          </p>
          <DemoPersonas next={next} />
        </section>
      )}
    </div>
  );
}
