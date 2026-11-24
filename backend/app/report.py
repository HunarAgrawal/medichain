"""PDF report rendering: the organization's letterhead, the signed report (imaging with its AI
pre-read as decision support, or laboratory results flagged against reference intervals), and the
data needed to verify the PDF."""

import io
from dataclasses import dataclass
from datetime import date, datetime
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from PIL import Image
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Image as PdfImage
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.ml.engine import Prediction

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#6B6B68")
RULE = colors.HexColor("#E4E4E1")
OK = colors.HexColor("#346538")
BAD = colors.HexColor("#9F2F2D")
BAD_TINT = colors.HexColor("#FDEBEC")
TINT = colors.HexColor("#F6F5F2")

_BASE = ParagraphStyle("base", fontName="Helvetica", fontSize=9.2, leading=12.6, textColor=INK)
_ORG = ParagraphStyle("org", parent=_BASE, fontName="Helvetica-Bold", fontSize=14, leading=17)
_DEPT = ParagraphStyle("dept", parent=_BASE, textColor=MUTED, fontSize=8.5, leading=11)
_RIGHT = ParagraphStyle(
    "right", parent=_BASE, alignment=2, textColor=MUTED, fontSize=7.8, leading=10
)
_TITLE = ParagraphStyle("title", parent=_BASE, fontName="Helvetica-Bold", fontSize=12.5, leading=16)
_LABEL = ParagraphStyle(
    "label", parent=_BASE, fontName="Helvetica-Bold", fontSize=7.2, leading=9, textColor=MUTED
)
_HEADING = ParagraphStyle(
    "heading", parent=_BASE, fontName="Helvetica-Bold", fontSize=9.5, spaceBefore=2, spaceAfter=3
)
_IMPRESSION = ParagraphStyle(
    "impression", parent=_BASE, fontName="Helvetica-Bold", fontSize=10, leading=13.5
)
_MUTED = ParagraphStyle("muted", parent=_BASE, textColor=MUTED, fontSize=8, leading=10.8)
_MONO = ParagraphStyle("mono", parent=_BASE, fontName="Courier", fontSize=7, leading=9)
_CRITICAL = ParagraphStyle(
    "critical", parent=_BASE, fontName="Helvetica-Bold", textColor=BAD, fontSize=9
)

# SimpleDocTemplate's frame pads 6pt on each side.
_FRAME_PADDING = 12
_SEX = {"F": "F", "M": "M", "O": "Other"}


@dataclass(frozen=True)
class Letterhead:
    name: str
    department: str
    address: str
    contact: str
    accreditation: str | None
    timezone: str = "Asia/Kolkata"


@dataclass(frozen=True)
class ReportInput:
    letterhead: Letterhead
    record_id: str
    accession: str
    site_name: str
    published_at: datetime
    acquired_at: datetime
    patient_name: str
    patient_uhid: str
    patient_sex: str | None
    patient_dob: date | None
    referred_by: str | None
    priority: str
    indication: str | None
    analysis_name: str
    modality: str
    model_id: str
    predictions: list[Prediction]
    final_finding: str
    findings: str | None
    impression: str
    critical: bool
    reporter_name: str
    reporter_title: str | None
    reporter_qualification: str | None
    reporter_registration: str | None
    scan: Image.Image | None
    heatmap: Image.Image | None
    scan_sha256: str
    verify_url: str
    lab_results: list[dict[str, object]] | None = None


def render_report(data: ReportInput) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=13 * mm,
        bottomMargin=16 * mm,
        title=f"{data.letterhead.name} report {data.accession}",
        author=data.letterhead.name,
        creator="Medichain",
    )
    width = doc.width - _FRAME_PADDING
    zone = ZoneInfo(data.letterhead.timezone)
    story = [
        _letterhead(data.letterhead, width),
        Spacer(1, 3.5 * mm),
        _title_row(data, width),
        Spacer(1, 2.5 * mm),
        _patient_table(data, width, zone),
        Spacer(1, 3.5 * mm),
    ]
    if data.critical:
        story += [_critical_banner(width), Spacer(1, 3 * mm)]
    if data.indication:
        story += [Paragraph("Clinical indication", _HEADING), _multiline(data.indication)]
        story.append(Spacer(1, 2.5 * mm))
    lab = data.lab_results is not None
    if data.lab_results is not None:
        results = _lab_table(data.lab_results, width)
        story += [KeepTogether([Paragraph("Results", _HEADING), results]), Spacer(1, 3.5 * mm)]
    if data.findings:
        story += [Paragraph("Comments" if lab else "Findings", _HEADING), _multiline(data.findings)]
        story.append(Spacer(1, 2.5 * mm))
    heading = "Interpretation" if lab else "Impression"
    story += [
        KeepTogether([Paragraph(heading, _HEADING), _impression_block(data, width)]),
        Spacer(1, 3.5 * mm),
    ]
    if lab:
        story.append(
            _text(
                "Results are flagged automatically against the biological reference intervals "
                "shown (L/H: outside the interval; LL/HH: critical; POS: above the screening "
                "cutoff) and verified by the pathologist. Screening results are presumptive.",
                _MUTED,
            )
        )
    else:
        ai = [Paragraph("AI pre-read (decision support)", _HEADING), _ai_block(data, width)]
        story.append(KeepTogether(ai))
    story += [Spacer(1, 4 * mm), KeepTogether([_signature_and_verification(data, width, zone)])]
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


def _footer(canvas: Canvas, doc: SimpleDocTemplate) -> None:
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.line(doc.leftMargin, 12 * mm, doc.pagesize[0] - doc.rightMargin, 12 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(
        doc.leftMargin,
        8.5 * mm,
        "AI pre-reads and result flags are decision support. This report is the signing "
        "doctor's interpretation; read it with the clinical context.",
    )
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 8.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _text(value: object, style: ParagraphStyle = _BASE) -> Paragraph:
    # Paragraph parses markup, so user-supplied text must be escaped.
    return Paragraph(escape(str(value)), style)


def _multiline(value: str, style: ParagraphStyle = _BASE) -> Paragraph:
    return Paragraph(escape(value).replace("\n", "<br/>"), style)


def _age(dob: date, on: date) -> int:
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


def _when(value: datetime, zone: ZoneInfo) -> str:
    local = value.astimezone(zone)
    return f"{local:%d %b %Y, %H:%M} {local.tzname() or ''}".strip()


def _letterhead(head: Letterhead, width: float) -> Table:
    left = [_text(head.name, _ORG), _text(head.department, _DEPT)]
    right = [_text(line, _RIGHT) for line in (head.address, head.contact) if line]
    if head.accreditation:
        right.append(_text(head.accreditation, _RIGHT))
    table = Table([[left, right]], colWidths=[width * 0.55, width * 0.45])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LINEBELOW", (0, 0), (-1, 0), 1.2, INK),
            ]
        )
    )
    return table


def _title_row(data: ReportInput, width: float) -> Table:
    title = _text(f"{data.modality.upper()} · {data.analysis_name}", _TITLE)
    status = "FINAL REPORT" + (f" · {data.priority.upper()}" if data.priority != "routine" else "")
    table = Table([[title, _text(status, _RIGHT)]], colWidths=[width * 0.7, width * 0.3])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _patient_table(data: ReportInput, width: float, zone: ZoneInfo) -> Table:
    age_sex = "Not recorded"
    if data.patient_dob:
        age_sex = f"{_age(data.patient_dob, data.published_at.date())} y"
    if data.patient_sex:
        age_sex = f"{age_sex} / {_SEX.get(data.patient_sex, data.patient_sex)}"
    cells = [
        ("Patient", data.patient_name),
        ("UHID", data.patient_uhid),
        ("Age / Sex", age_sex),
        ("Accession", data.accession),
        ("Referred by", data.referred_by or "Self"),
        ("Site", data.site_name),
        (
            "Collected" if data.lab_results is not None else "Acquired",
            _when(data.acquired_at, zone),
        ),
        ("Reported", _when(data.published_at, zone)),
    ]
    rows = [
        [[_text(label, _LABEL), _text(value)] for label, value in cells[:4]],
        [[_text(label, _LABEL), _text(value)] for label, value in cells[4:]],
    ]
    col = width / 4
    table = Table(rows, colWidths=[col * 1.15, col * 0.95, col * 0.9, col])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), TINT),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.4, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def _critical_banner(width: float) -> Table:
    table = Table(
        [
            [
                _text(
                    "CRITICAL FINDING · flagged by the reporting doctor for urgent attention",
                    _CRITICAL,
                )
            ]
        ],
        colWidths=[width],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BAD_TINT),
                ("LINEBEFORE", (0, 0), (0, -1), 2.5, BAD),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def _impression_block(data: ReportInput, width: float) -> Table:
    content = [
        _text(data.final_finding, _IMPRESSION),
        Spacer(1, 1.5 * mm),
        _multiline(data.impression),
    ]
    table = Table([[content]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("LINEBEFORE", (0, 0), (0, -1), 2, OK),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def _ai_block(data: ReportInput, width: float) -> Table:
    top = data.predictions[0] if data.predictions else None
    if top is None:
        agreement = "No AI result was available."
    elif top.label == data.final_finding:
        agreement = "The radiologist's impression agrees with the AI's top finding."
    else:
        agreement = "The radiologist's impression differs from the AI's top finding."
    scores = ", ".join(f"{p.label} {p.score * 100:.1f}%" for p in data.predictions)
    text = [
        _text(scores or "No AI result.", _BASE),
        Spacer(1, 1.2 * mm),
        _text(agreement, _MUTED),
        _text(f"Model: {data.model_id}", _MUTED),
    ]
    side = 30 * mm
    if data.heatmap is None or data.scan is None:
        return Table([[text]], colWidths=[width], style=[("LEFTPADDING", (0, 0), (-1, -1), 0)])
    images = Table(
        [
            [_pdf_image(data.scan, side), _pdf_image(data.heatmap, side)],
            [_text("Scan", _MUTED), _text("AI attention", _MUTED)],
        ],
        colWidths=[side + 3 * mm, side + 3 * mm],
    )
    images.setStyle(
        TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP")])
    )
    images_width = 2 * (side + 3 * mm)
    table = Table([[text, images]], colWidths=[width - images_width, images_width])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 6 * mm),
            ]
        )
    )
    return table


def _signature_and_verification(data: ReportInput, width: float, zone: ZoneInfo) -> Table:
    credentials = ", ".join(p for p in (data.reporter_qualification, data.reporter_title) if p)
    signature = [
        _text("ELECTRONICALLY SIGNED BY", _LABEL),
        Spacer(1, 1 * mm),
        _text(data.reporter_name, _IMPRESSION),
        _text(credentials, _MUTED) if credentials else Spacer(1, 0),
        _text(f"Reg. No. {data.reporter_registration}", _MUTED)
        if data.reporter_registration
        else Spacer(1, 0),
        _text(_when(data.published_at, zone), _MUTED),
    ]
    qr_size = 23 * mm
    widget = QrCodeWidget(data.verify_url)
    x1, y1, x2, y2 = widget.getBounds()
    drawing = Drawing(
        qr_size, qr_size, transform=[qr_size / (x2 - x1), 0, 0, qr_size / (y2 - y1), 0, 0]
    )
    drawing.add(widget)
    verification = [
        _text("VERIFY THIS REPORT", _LABEL),
        Spacer(1, 1 * mm),
        _text(
            "This PDF's fingerprint is registered on a tamper-evident ledger. Scan the code, or "
            f"open {data.verify_url.split('?')[0]} and upload the file, to confirm it is genuine "
            "and unaltered.",
            _MUTED,
        ),
        Spacer(1, 1 * mm),
        _text(f"Record {data.record_id}", _MONO),
    ]
    left = width * 0.42
    middle = width - left - qr_size - 4 * mm
    table = Table([[signature, verification, drawing]], colWidths=[left, middle, qr_size + 4 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEABOVE", (0, 0), (-1, 0), 0.6, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (1, 0), 5 * mm),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
            ]
        )
    )
    return table


_FLAG_STYLE = ParagraphStyle("flag", parent=_BASE, fontName="Helvetica-Bold")
_CRITICAL_FLAG = ParagraphStyle("criticalflag", parent=_FLAG_STYLE, textColor=BAD)


def _lab_table(results: list[dict[str, object]], width: float) -> Table:
    header = [_text(h, _LABEL) for h in ("TEST", "RESULT", "UNIT", "REFERENCE INTERVAL", "FLAG")]
    rows = [header]
    for row in results:
        flag = str(row.get("flag") or "")
        shown = str(row.get("text") or row["value"])
        style = _CRITICAL_FLAG if flag in ("LL", "HH") else _FLAG_STYLE if flag else _BASE
        rows.append(
            [
                _text(row["name"]),
                _text(shown, style),
                _text(row.get("unit") or "", _MUTED),
                _text(row.get("reference") or "", _MUTED),
                _text(flag, style),
            ]
        )
    table = Table(
        rows, colWidths=[width * 0.34, width * 0.16, width * 0.14, width * 0.26, width * 0.10]
    )
    table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, INK),
                ("LINEBELOW", (0, 1), (-1, -1), 0.3, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return table


def _pdf_image(image: Image.Image, max_side: float) -> PdfImage:
    preview = image.convert("RGB")
    preview.thumbnail((640, 640))
    buffer = io.BytesIO()
    # JPEG keeps reports small (PDF embeds it as-is); quality 88 is visually lossless here.
    preview.save(buffer, format="JPEG", quality=88, optimize=True)
    buffer.seek(0)
    ratio = preview.width / preview.height
    width, height = (max_side, max_side / ratio) if ratio >= 1 else (max_side * ratio, max_side)
    return PdfImage(buffer, width=width, height=height)
