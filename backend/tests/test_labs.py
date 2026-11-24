import pytest

from app import labs
from app.models import Role, Sex
from tests.conftest import Env

CBC = labs.LAB_PANELS["cbc"]
SCREEN = labs.LAB_PANELS["drug_screen"]
NORMAL_CBC = {
    "hb": 13.1,
    "rbc": 4.4,
    "hct": 40.2,
    "mcv": 89,
    "wbc": 7.1,
    "neut": 60,
    "lymph": 30,
    "plt": 250,
}
NEGATIVE_SCREEN = {a.code: "negative" for a in SCREEN.analytes}


def _flags(values: dict, sex: Sex | None = Sex.FEMALE) -> dict[str, str]:
    return {r.code: r.flag.value for r in labs.evaluate(CBC, values, sex)}


def test_reference_intervals_flag_by_sex_and_critical_limits() -> None:
    assert set(_flags(NORMAL_CBC).values()) == {""}
    assert _flags(NORMAL_CBC | {"hb": 12.5}, Sex.MALE)["hb"] == "L"
    assert _flags(NORMAL_CBC | {"hb": 12.5}, Sex.FEMALE)["hb"] == ""
    # Without a recorded sex the interval is the union of both, so neither is flagged wrongly.
    assert _flags(NORMAL_CBC | {"hb": 12.5}, None)["hb"] == ""
    flags = _flags(NORMAL_CBC | {"hb": 6.4, "wbc": 13.0, "plt": 40})
    assert (flags["hb"], flags["wbc"], flags["plt"]) == ("LL", "H", "LL")

    results = labs.evaluate(CBC, NORMAL_CBC | {"hb": 6.4}, Sex.FEMALE)
    assert labs.is_critical(results) and labs.suggest(CBC, results) == "Anaemia"
    hb = next(r for r in results if r.code == "hb")
    assert (hb.text, hb.reference) == ("6.4", "12.0 - 15.0")
    assert labs.suggest(CBC, labs.evaluate(CBC, NORMAL_CBC | {"plt": 90}, Sex.MALE)) == (
        "Thrombocytopenia"
    )


def test_a_reactive_screen_is_flagged_positive() -> None:
    results = labs.evaluate(SCREEN, NEGATIVE_SCREEN | {"thc": "Positive"}, None)
    thc = next(r for r in results if r.code == "thc")
    assert (thc.flag, thc.text, thc.reference) == ("POS", "Positive", "Negative (cutoff 50 ng/mL)")
    assert labs.suggest(SCREEN, results) == "Positive" and not labs.is_critical(results)


@pytest.mark.parametrize(
    ("values", "message"),
    [
        ({k: v for k, v in NORMAL_CBC.items() if k != "plt"}, "Enter a result for Platelet"),
        (NORMAL_CBC | {"hb": 140}, "not a plausible result"),
        (NORMAL_CBC | {"hb": "13"}, "must be a number"),
        (NORMAL_CBC | {"hb": True}, "must be a number"),
        (NORMAL_CBC | {"ldl": 90}, "Unknown test codes: ldl"),
    ],
)
def test_missing_or_implausible_values_are_rejected(values: dict, message: str) -> None:
    with pytest.raises(labs.LabValueError, match=message):
        labs.evaluate(CBC, values, Sex.FEMALE)


def _lab_draft(env: Env, actor, patient, panel: str = "cbc", **fields: object):
    env.login(actor)
    values = NORMAL_CBC if panel == "cbc" else NEGATIVE_SCREEN
    body = {"patient_id": patient.id, "panel": panel, "values": values, **fields}
    return env.client.post("/api/v1/studies/lab", json=body)


def test_a_lab_technologist_records_results_for_the_pathologist(env: Env) -> None:
    technician, patient = env.user(Role.TECHNICIAN), env.user(Role.PATIENT)
    doctor = env.user(Role.DOCTOR)
    response = _lab_draft(
        env,
        technician,
        patient,
        values=NORMAL_CBC | {"hb": 9.8, "mcv": 74},
        priority="urgent",
        referrer_id=doctor.id,
    )
    assert response.status_code == 201, response.text
    study = response.json()
    assert (study["discipline"], study["analysis_type"], study["modality"]) == (
        "laboratory",
        "cbc",
        "Blood test",
    )
    assert study["access"] == "status" and study["results"] == []

    env.login(env.user(Role.PATHOLOGIST))
    worklist = env.client.get("/api/v1/studies", params={"status": "draft"}).json()
    assert [s["id"] for s in worklist] == [study["id"]]
    assert worklist[0]["top_finding"] == "Anaemia"
    full = env.client.get(f"/api/v1/studies/{study['id']}").json()
    assert full["access"] == "full" and full["model_id"] == "reference-intervals"
    flags = {r["code"]: r["flag"] for r in full["results"]}
    assert flags["hb"] == "L" and flags["mcv"] == "L" and flags["plt"] == ""
    source = env.client.get(f"/api/v1/studies/{study['id']}/files/scan")
    assert source.headers["content-type"] == "application/json"
    assert source.json()["values"]["hb"] == 9.8

    response = _lab_draft(env, technician, patient, values=NORMAL_CBC | {"hb": 140})
    assert response.status_code == 422 and "plausible" in response.json()["detail"]


def test_each_discipline_reports_only_its_own_studies(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    radiologist, pathologist = env.user(Role.RADIOLOGIST), env.user(Role.PATHOLOGIST)
    scan = env.draft(env.user(Role.TECHNICIAN), patient)

    assert _lab_draft(env, radiologist, patient).status_code == 403
    env.login(pathologist)
    upload = env.client.post(
        "/api/v1/studies",
        data={"patient_id": patient.id, "analysis_type": "chest_xray"},
        files={"file": ("scan.png", b"not read", "image/png")},
    )
    assert upload.status_code == 403
    lab = _lab_draft(env, pathologist, patient).json()
    assert lab["access"] == "full", "a pathologist may enter results and sign them"

    report = {"final_finding": "Normal", "impression": "Within normal limits."}
    assert (
        env.client.get("/api/v1/studies", params={"status": "draft"}).json()[0]["id"] == (lab["id"])
    )
    assert env.client.get(f"/api/v1/studies/{scan['id']}").json()["access"] == "status"
    assert env.client.post(f"/api/v1/studies/{scan['id']}/publish", json=report).status_code == 403
    assert env.client.delete(f"/api/v1/studies/{scan['id']}").status_code == 409

    env.login(radiologist)
    assert env.client.post(f"/api/v1/studies/{lab['id']}/publish", json=report).status_code == 403
    listed = {s["id"] for s in env.client.get("/api/v1/studies").json()}
    assert listed == {scan["id"]}


def test_a_signed_lab_report_is_anchored_and_reaches_the_patient(env: Env) -> None:
    technician, pathologist = env.user(Role.TECHNICIAN), env.user(Role.PATHOLOGIST, "Dr. Siddiqui")
    patient = env.user(Role.PATIENT)
    lab = _lab_draft(env, technician, patient, values=NORMAL_CBC | {"hb": 6.2}).json()

    env.login(pathologist)
    response = env.client.post(
        f"/api/v1/studies/{lab['id']}/publish",
        json={
            "final_finding": "Anaemia",
            "impression": "Severe anaemia. Informed the treating doctor by phone.",
            "critical": True,
        },
    )
    assert response.status_code == 200, response.text
    signed = response.json()
    assert signed["reporter"]["name"] == "Dr. Siddiqui" and signed["ai_agrees"] is None
    record = env.registry.records[signed["record"]["record_id"]]
    assert record.issuer == pathologist.wallet_address and record.patient == patient.wallet_address

    env.login(patient)
    mine = env.client.get(f"/api/v1/studies/{lab['id']}").json()
    assert mine["access"] == "full" and mine["results"][0]["flag"] == "LL"
    pdf = env.client.get(f"/api/v1/studies/{lab['id']}/files/report")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


def test_the_dashboard_splits_volume_by_discipline(env: Env) -> None:
    technician, radiologist = env.user(Role.TECHNICIAN), env.user(Role.RADIOLOGIST)
    pathologist, patient = env.user(Role.PATHOLOGIST), env.user(Role.PATIENT)
    env.published(radiologist, patient, final_finding="No tumor")
    lab = _lab_draft(env, technician, patient, panel="drug_screen").json()
    env.login(pathologist)
    report = {"final_finding": "Negative", "impression": "Negative urine drug screen."}
    assert env.client.post(f"/api/v1/studies/{lab['id']}/publish", json=report).status_code == 200

    env.login(env.user(Role.ADMIN))
    board = env.client.get("/api/v1/admin/dashboard", params={"days": 7}).json()
    assert board["daily"][-1]["by_discipline"] == {"Imaging": 1, "Laboratory": 1}
    # The lab report agrees with its flags, but AI agreement counts imaging only.
    assert board["kpis"]["ai_agreement_pct"] == 0.0
    assert {r["reports"] for r in board["reporters"]} == {1}
    assert board["staff"]["pathologist"] == 1
