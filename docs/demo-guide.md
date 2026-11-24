# Demo guide

A twelve-minute walkthrough of Medichain for a hospital, imaging centre, diagnostic lab or
teleradiology client, with what to click, what to say, and straight answers to the questions buyers
ask.

## Before the meeting

1. Start the demo: `make demo`, then open <http://localhost:3000>. To use the hosted copy instead,
   see [hosted-demo.md](hosted-demo.md). Every start is a fresh workspace, so restart it to reset.
2. Optional: rebrand it for the client. Sign in as **Neha Kapoor** (admin), open **Settings**, and
   set their name, address and accreditation. New reports carry their letterhead.
3. Check the radiologist's worklist has a **STAT** chest X-ray at the top, and the pathologist's a
   **STAT** blood count (both are always seeded).
4. On the hosted demo, keep a phone ready to scan a report's QR code. On a laptop, the QR code
   points at `localhost`, so verify by uploading the PDF instead.

Switch roles with **Switch role** in the bar at the bottom of the screen. No passwords are needed.

## The storyline

### 1. The problem, in one sentence (landing page, 30 seconds)

> "Reports are slow to reach doctors, patients carry paper copies anyone can edit, and nobody can
> see turnaround until someone complains. Medichain fixes all three."

Point at the ways to work (hospital, imaging centre, teleradiology, diagnostic lab), then scroll
to **Built for every diagnostic report**: scans and lab tests run live in the demo, and the same
platform takes CT, ultrasound, more lab panels, dermatology and ECG per client.

### 2. The front desk (Rahul Verma, technician, 2 minutes)

1. **Today** shows what has come in and what is waiting.
2. **New study**, then **Register a new patient**: name, sex, age, optional mobile and ABHA number.
   A UHID is issued automatically.
3. Choose **Chest X-ray**, priority **Urgent**, referring doctor **Dr. Arjun Mehta**, and a short
   indication. Click the **Pneumonia** sample scan, then **Send for reporting**.

> "The AI pre-read ran while we watched. The study is already on the radiologists' worklist."

### 3. Reporting (Dr. Ananya Rao, radiologist, 3 minutes)

1. The **worklist** puts STAT first, then the longest waiting. Waiting times turn amber, then red,
   as they approach their target.
2. Open your new study. Show the scan, the AI's attention heatmap and its confidence.
3. **Start from the pneumonia template**, edit a word, tick the attestation, and
   **Sign and deliver report**.
4. **Open report (PDF)**: hospital letterhead, UHID, accession, referring doctor, the radiologist's
   registration number and a QR code.

> "AI suggests, the radiologist decides. Nothing reaches a patient without a signature."

Optional, and memorable: open the **Lotus Clinic** chest X-ray for Rohit Bansal. The AI says
pneumonia; the film is normal. Choose **Normal** and sign. The report records that the radiologist
overrode the AI.

### 4. The laboratory (Imran Sheikh, then Dr. Farah Siddiqui, 2 minutes)

1. As **Imran Sheikh** (lab technologist): **Lab results**, pick a patient, keep **Complete blood
   count**. Type a haemoglobin of 9.5: it flags **Low** as you type. Click the **Critical
   haemoglobin** sample result and point at the red **Critical low** flag and the summary.
   **Send to the pathologist**.
2. Switch to **Dr. Farah Siddiqui** (pathologist). Her worklist holds only lab studies: a **STAT**
   blood count for Ramesh Chandra with a critical haemoglobin, a positive drug screen and a routine
   blood count.
3. Open the STAT one. The results table bolds every flagged value and calls out the critical one.
   The report starts marked critical, and the finding is suggested by the flags. **Start from the
   anaemia template**, tick the attestation, **Sign and deliver report**, then open the PDF: a lab
   report with the results table, reference intervals and flags, on the same letterhead.

> "Same platform, second department. Results flag themselves, nothing is signed unverified, and
> the referring doctor gets it the moment it is signed."

### 5. The referring doctor (Dr. Arjun Mehta, 1 minute)

**Reports** shows the report you just signed, already there. Critical findings sit at the top.

> "No phone calls, no courier, no WhatsApp photo of a printout."

### 6. The patient (Priya Sharma, 1 minute)

1. **Records**: her scan and blood test reports, in plain language.
2. **Sharing**: share her records with another doctor in one click, and withdraw it as easily.
3. **Activity**: who opened her reports, and when.

> "Consent the patient controls, as the DPDP Act expects."

### 7. Verification (anyone, 1 minute)

Open **Verify a report** (no sign-in) and upload the PDF you downloaded: **Authentic report**, with
the signing doctor, hospital and accession. Then upload any other PDF: **No matching report**.

> "A forged or edited report fails this check. Insurers, other hospitals and courts can verify a
> report without calling you."

### 8. Management (Neha Kapoor, admin, 2 minutes)

1. **Dashboard**: studies today, median turnaround, share within target, AI agreement (imaging),
   critical findings, volume per day by department (imaging and laboratory), and the load per site
   and per reporting doctor. Point at the three sites: the main campus, the imaging centre and the
   partner clinic reported remotely.
2. **Staff**: radiologists, pathologists and doctors are verified on the registry when added. Deactivating one
   ends their access to every record at once.
3. **Audit log**: every sign-in, report, view and consent change.

## What to emphasise for each kind of client

| Client | Lead with |
| --- | --- |
| Hospital | One worklist for every department, reports in doctors' hands the moment they are signed, turnaround visible to management. |
| Imaging centre | Fast walk-in registration, reports for outside doctors without phone calls, and verifiable reports patients can share anywhere. |
| Teleradiology | Partner sites upload, remote radiologists report, and turnaround is tracked per site against each client's targets. |
| Diagnostic lab | Results that flag themselves, critical values first on the pathologist's worklist, and lab reports patients and employers can verify. |

## Questions clients ask

**Is the AI approved for clinical use?**
No, and we say so. The models are decision support, and every report is signed by a radiologist
or pathologist.
Before clinical use the models need validation on the client's own data, and an AI that informs
diagnosis may need clearance under India's medical device rules (CDSCO). A pilot is the right
first step.

**Does it work with our PACS, LIS and HIS?**
Today scans are uploaded as images and lab results are typed in. DICOM import and PACS, analyser
interfaces (ASTM/HL7), and HL7 and FHIR integration are the first items on the pilot plan, scoped
to the client's systems.

**Is it only for radiology?**
No. Every report type shares the worklist, signing, delivery, consent, verification and dashboard.
The demo runs chest X-ray, brain MRI, blood counts and drug screens. CT, ultrasound, more lab panels
(LFT, KFT, lipids, thyroid, HbA1c), histopathology, dermatology photos and ECG are configuration:
a lab panel needs its analytes and the lab's validated reference intervals; an imaging type can run
with no AI, or with a model validated for it.

**Where do the reference intervals come from?**
The demo uses typical adult values. Each laboratory sets its own validated intervals and critical
limits, per sex (and, when needed, per age).

**Where is our data stored?**
Scans and reports are encrypted before storage, on a server in an Indian cloud region or on the
client's own premises. Only fingerprints and consent records go on the ledger, never names,
images or reports.

**Why a blockchain, and what does it cost?**
It is a tamper-evident ledger for two things: report fingerprints, so a report can be verified,
and patient consent, so access is provable. It holds no patient data. For a client it runs as a
private network with no per-transaction fees.

**Is it ABDM-compliant?**
ABHA numbers are captured today. Integrating as an ABDM health information provider is on the
roadmap and requires certification.

**What does it cost?**
Fill in your own pricing model here: per study, per site per month, or a pilot fee.

## If something goes wrong

- **The page is slow on the first click:** the AI models load on first use. Give it a few seconds.
- **The demo got messy:** restart it; every start is a clean workspace.
- **The hosted demo shows "Building" or "Sleeping":** it wakes on the first visit, which takes a
  few minutes. Open it before the meeting.
