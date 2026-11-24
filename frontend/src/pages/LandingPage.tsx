import {
  BandaidsIcon,
  BuildingsIcon,
  DropIcon,
  GlobeHemisphereEastIcon,
  HospitalIcon,
  MicroscopeIcon,
  QrCodeIcon,
  ScanIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TestTubeIcon,
  TimerIcon,
  UsersThreeIcon,
  WaveformIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Link, Navigate } from "react-router";

import { homePath, useMe } from "../auth/session";
import { DemoPersonas } from "../components/DemoPersonas";
import { Brand, Footer } from "../components/Layouts";
import { Badge, PageLoading } from "../components/ui";
import { buttonClass, cx } from "../components/ui/classes";
import { useMeta } from "../lib/queries";

const VALUE: { Icon: Icon; title: string; text: string }[] = [
  {
    Icon: TimerIcon,
    title: "Turnaround you can see",
    text: "Every study is tracked against its target: STAT within an hour, urgent within four, routine within a day.",
  },
  {
    Icon: SparkleIcon,
    title: "Automation assists, doctors decide",
    text: "AI pre-reads brain MRI and chest X-ray; lab values flag themselves against reference intervals. A radiologist or pathologist signs every report.",
  },
  {
    Icon: QrCodeIcon,
    title: "Reports that cannot be forged",
    text: "Each signed PDF is fingerprinted on a tamper-evident ledger. Anyone can scan its QR code to confirm it is genuine.",
  },
  {
    Icon: UsersThreeIcon,
    title: "Patients control sharing",
    text: "Patients share their records with any doctor and can withdraw access at any time. Every view is logged.",
  },
];

const AUDIENCES: { Icon: Icon; title: string; who: string; text: string }[] = [
  {
    Icon: HospitalIcon,
    title: "Hospitals",
    who: "In-house radiology",
    text: "Technicians acquire, radiologists and pathologists report, and OPD and ward doctors receive reports the moment they are signed.",
  },
  {
    Icon: BuildingsIcon,
    title: "Imaging centres",
    who: "Walk-ins and outside doctors",
    text: "Register walk-ins in seconds, report for any referring doctor, and give patients a verifiable report instead of a photocopy.",
  },
  {
    Icon: GlobeHemisphereEastIcon,
    title: "Teleradiology",
    who: "Remote reporting",
    text: "Partner clinics upload; your radiologists report from anywhere, with turnaround tracked for every site.",
  },
  {
    Icon: MicroscopeIcon,
    title: "Diagnostic labs",
    who: "Pathology and screening",
    text: "Technologists enter results, abnormal and critical values flag themselves, and pathologists verify and sign.",
  },
];

/** Report families: what runs in this demo, and what a client deployment adds by configuration. */
const COVERAGE: { Icon: Icon; title: string; examples: string; text: string; live: boolean }[] = [
  {
    Icon: ScanIcon,
    title: "Imaging",
    examples: "Chest X-ray · Brain MRI",
    text: "AI pre-read with an attention heatmap. The radiologist reviews, edits and signs.",
    live: true,
  },
  {
    Icon: DropIcon,
    title: "Blood tests",
    examples: "Complete blood count",
    text: "Each value checked against sex-specific reference intervals and critical limits.",
    live: true,
  },
  {
    Icon: TestTubeIcon,
    title: "Drug tests",
    examples: "Six-panel urine screen",
    text: "Pre-employment and workplace screening, reported as presumptive until confirmed.",
    live: true,
  },
  {
    Icon: WaveformIcon,
    title: "More imaging",
    examples: "CT · Ultrasound (sonography) · Mammography",
    text: "Same worklist and signing. Report without AI, or add a validated model per modality.",
    live: false,
  },
  {
    Icon: MicroscopeIcon,
    title: "More lab panels",
    examples: "LFT · KFT · Lipids · Thyroid · HbA1c · Histopathology",
    text: "Add a panel with your laboratory's own validated reference intervals.",
    live: false,
  },
  {
    Icon: BandaidsIcon,
    title: "Other specialities",
    examples: "Dermatology photos · ECG · Fundus",
    text: "Any test that ends in a signed report fits the same workflow.",
    live: false,
  },
];

const STEPS = [
  [
    "Register and acquire",
    "UHID, ABHA number and referring doctor captured at the desk; the scan uploaded or the results entered.",
  ],
  [
    "Pre-read in seconds",
    "AI findings and a heatmap for scans, flags for lab values: ready before the doctor opens the study.",
  ],
  [
    "Report and sign",
    "Findings, impression and a critical flag, signed by the radiologist or pathologist.",
  ],
  [
    "Deliver and verify",
    "Doctor and patient get the report at once; its QR code proves it is genuine.",
  ],
];

const TRUST = [
  "Scans, lab results and reports encrypted at rest (AES-256), with separate keys for files and signing.",
  "Role-based access within each hospital. Administrators never see clinical content.",
  "A complete audit trail: every sign-in, report, view and consent change.",
  "Consent designed around the DPDP Act 2023: purpose-bound, revocable sharing.",
  "UHID and ABHA numbers captured today. ABDM integration is on the roadmap.",
  "Runs on an Indian cloud region or on-premises, so data can stay in India.",
];

export function LandingPage() {
  const { data: meta, isPending } = useMeta();
  const { data: user } = useMe();
  if (isPending) return <PageLoading />;
  // Outside demo mode the app goes straight to sign-in; there is nothing to market.
  if (!meta?.demo) return <Navigate to={user ? homePath(user.role) : "/login"} replace />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Brand to="/" />
          <nav aria-label="Sections" className="text-muted hidden gap-6 text-sm md:flex">
            <a href="#coverage" className="hover:text-ink-strong">
              What it reports
            </a>
            <a href="#how" className="hover:text-ink-strong">
              How it works
            </a>
            <a href="#trust" className="hover:text-ink-strong">
              Security
            </a>
            <Link to="/verify" className="hover:text-ink-strong">
              Verify a report
            </Link>
          </nav>
          <div className="ml-auto">
            {user ? (
              <Link to={homePath(user.role)} className={buttonClass("primary", "sm")}>
                Open your workspace
              </Link>
            ) : (
              <Link to="/login" className={buttonClass("secondary", "sm")}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24">
          <p className="text-muted motion-safe:animate-enter text-xs font-medium tracking-[0.08em] uppercase">
            Diagnostic reporting for hospitals, imaging centres, labs and teleradiology
          </p>
          <h1 className="text-ink-strong motion-safe:animate-enter mt-4 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-0.03em] text-balance sm:text-7xl">
            Faster diagnostic reports that patients and doctors can trust.
          </h1>
          <p className="text-muted motion-safe:animate-enter mt-6 max-w-2xl text-lg text-pretty">
            Medichain runs diagnostic reporting end to end, for scans and lab tests alike: register
            the patient, add the scan or the results, get an AI pre-read or automatic flags in
            seconds, and deliver a signed report to the referring doctor and the patient the moment
            it is ready.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#demo" className={buttonClass("primary")}>
              Explore the live demo
            </a>
            <Link to="/verify" className={buttonClass("secondary")}>
              Verify a report
            </Link>
          </div>
          <p className="text-muted mt-6 text-sm">
            Built for India: UHID and ABHA capture, DPDP-aligned consent, IST-stamped reports.
          </p>
        </section>

        <section aria-label="Why Medichain" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUE.map(({ Icon, title, text }) => (
              <li key={title} className="border-line bg-surface rounded-xl border p-5">
                <Icon aria-hidden weight="bold" className="text-ink size-5" />
                <h2 className="text-ink-strong mt-4 text-[15px] font-medium">{title}</h2>
                <p className="text-muted mt-1.5 text-sm text-pretty">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-line bg-surface border-y">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-ink-strong max-w-2xl font-serif text-4xl tracking-[-0.02em]">
              One platform, every way you report.
            </h2>
            <p className="text-muted mt-3 max-w-2xl">
              The same workflow, configured for how your organization reports.
            </p>
            <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map(({ Icon, title, who, text }) => (
                <li key={title}>
                  <span className="bg-canvas border-line grid size-10 place-items-center rounded-lg border">
                    <Icon aria-hidden weight="bold" className="text-ink size-5" />
                  </span>
                  <h3 className="text-ink-strong mt-4 text-lg font-medium">{title}</h3>
                  <p className="text-muted text-xs font-medium tracking-[0.06em] uppercase">
                    {who}
                  </p>
                  <p className="text-muted mt-2 text-sm text-pretty">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="coverage" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-20 sm:px-6">
          <h2 className="text-ink-strong max-w-2xl font-serif text-4xl tracking-[-0.02em]">
            Built for every diagnostic report.
          </h2>
          <p className="text-muted mt-3 max-w-2xl">
            Worklists, turnaround targets, signing, delivery, consent, verification and the audit
            trail are shared by every report type. Adding one is configuration, not a new product.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COVERAGE.map(({ Icon, title, examples, text, live }) => (
              <li
                key={title}
                className={cx(
                  "rounded-xl border p-5",
                  live ? "border-line bg-surface" : "border-line border-dashed",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <Icon aria-hidden weight="bold" className="text-ink size-5" />
                  <Badge tone={live ? "ok" : "neutral"}>
                    {live ? "In this demo" : "Per client"}
                  </Badge>
                </span>
                <h3 className="text-ink-strong mt-4 text-[15px] font-medium">{title}</h3>
                <p className="text-muted text-xs">{examples}</p>
                <p className="text-muted mt-2 text-sm text-pretty">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="how"
          className="border-line mx-auto max-w-6xl scroll-mt-8 border-t px-4 py-20 sm:px-6"
        >
          <h2 className="text-ink-strong font-serif text-4xl tracking-[-0.02em]">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {STEPS.map(([title, text], index) => (
              <li key={title} className="border-line border-t pt-5">
                <span className="text-muted font-mono text-xs">0{index + 1}</span>
                <h3 className="text-ink-strong mt-2 font-medium">{title}</h3>
                <p className="text-muted mt-1.5 text-sm text-pretty">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="trust" className="bg-ink-strong scroll-mt-0 text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <ShieldCheckIcon aria-hidden weight="bold" className="size-7 text-white/70" />
              <h2 className="mt-4 font-serif text-4xl tracking-[-0.02em]">
                Security and consent by design
              </h2>
              <p className="mt-3 text-white/70">
                Medical records deserve the same care as the people they describe.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {TRUST.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-white/10 p-4 text-sm text-white/85"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-20 sm:px-6">
          <h2 className="text-ink-strong font-serif text-4xl tracking-[-0.02em]">
            Try it now. Pick a role.
          </h2>
          <p className="text-muted mt-3 max-w-2xl">
            {meta.demo.workspace
              ? `You'll enter ${meta.demo.workspace.name}, a fictional hospital with its own laboratory, an imaging centre and a partner clinic. `
              : ""}
            Each role sees only what it should. Switch roles any time from the bar at the bottom.
          </p>
          <div className="mt-8">
            <DemoPersonas />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
