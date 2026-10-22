"""PDF report rendering: AI findings, the clinician's signed review, and verification data."""

import io
from dataclasses import dataclass
from datetime import date, datetime
from xml.sax.saxutils import escape

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
ACCENT = colors.HexColor("#346538")
TINT = colors.HexColor("#F4F4F1")

_BASE = ParagraphStyle("base", fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK)
_TITLE = ParagraphStyle("title", parent=_BASE, fontName="Helvetica-Bold", fontSize=18, leading=22)
_BRAND = ParagraphStyle(
    "brand", parent=_BASE, fontName="Helvetica-Bold", fontSize=8.5, textColor=MUTED
)
_HEADING = ParagraphStyle(
    "heading", parent=_BASE, fontName="Helvetica-Bold", fontSize=11, spaceBefore=4, spaceAfter=5
)
_FINDING = ParagraphStyle(
    "finding", parent=_BASE, fontName="Helvetica-Bold", fontSize=14, leading=18
)
_MUTED = ParagraphStyle("muted", parent=_BASE, textColor=MUTED, fontSize=8.5, leading=11.5)
_MONO = ParagraphStyle("mono", parent=_BASE, fontName="Courier", fontSize=7.5, leading=10)

# SimpleDocTemplate's frame pads 6pt on each side.
_FRAME_PADDING = 12


@dataclass(frozen=True)
class ReportInput:
    report_id: str
    record_id: str
    published_at: datetime
    patient_name: str
    patient_reference: str
    patient_dob: date | None
    analysis_name: str
    modality: str
    model_id: str
    predictions: list[Prediction]
    final_finding: str
    impression: str
    clinician_name: str
    clinician_title: str | None
    scan: Image.Image
    heatmap: Image.Image | None
    scan_sha256: str
    verify_url: str


def render_report(data: ReportInput) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=f"Medichain report {data.report_id}",
        author="Medichain",
    )
    width = doc.width - _FRAME_PADDING
    story = [
        Paragraph("MEDICHAIN · IMAGING REPORT", _BRAND),
        Spacer(1, 1.5 * mm),
        Paragraph(f"{escape(data.analysis_name)} · {escape(data.modality)}", _TITLE),
        Spacer(1, 4 * mm),
        _details_table(data, width),
        Spacer(1, 4 * mm),
        KeepTogether([Paragraph("Clinician review", _HEADING), _review_block(data, width)]),
        Spacer(1, 4 * mm),
        KeepTogether(
            [Paragraph("AI findings", _HEADING), _findings_table(data.predictions, width)]
        ),
        Spacer(1, 4 * mm),
    ]
    if data.heatmap is not None:
        story += [
            KeepTogether(
                [
                    Paragraph("Visual evidence", _HEADING),
                    _evidence_table(data.scan, data.heatmap, width),
                ]
            ),
            Spacer(1, 4 * mm),
        ]
    story.append(
        KeepTogether([Paragraph("Verification", _HEADING), _verification_table(data, width)])
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


def _footer(canvas: Canvas, doc: SimpleDocTemplate) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(
        doc.leftMargin,
        9 * mm,
        "AI findings are decision support, not a diagnosis. "
        "The clinician review is the clinical interpretation.",
    )
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _text(value: object, style: ParagraphStyle = _BASE) -> Paragraph:
    # Paragraph parses markup, so user-supplied text must be escaped.
    return Paragraph(escape(str(value)), style)


def _multiline(value: str, style: ParagraphStyle = _BASE) -> Paragraph:
    return Paragraph(escape(value).replace("\n", "<br/>"), style)


def _age(dob: date, on: date) -> int:
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


def _details_table(data: ReportInput, width: float) -> Table:
    published = data.published_at
    dob = data.patient_dob
    born = f"{dob.isoformat()} (age {_age(dob, published.date())})" if dob else "Not recorded"
    rows = [
        ("Patient", data.patient_name, "Published", published.strftime("%Y-%m-%d %H:%M UTC")),
        ("Reference", data.patient_reference, "Report ID", data.report_id),
        ("Date of birth", born, "Model", data.model_id),
    ]
    cells = [[_text(a, _MUTED), _text(b), _text(c, _MUTED), _text(d)] for a, b, c, d in rows]
    table = Table(cells, colWidths=[width * 0.15, width * 0.33, width * 0.13, width * 0.39])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _review_block(data: ReportInput, width: float) -> Table:
    top = data.predictions[0] if data.predictions else None
    agrees = top is not None and top.label == data.final_finding
    agreement = (
        "Agrees with the AI's top finding."
        if agrees
        else f"Differs from the AI's top finding ({top.label}, {top.score * 100:.1f}%)."
        if top
        else "No AI finding was available."
    )
    signer = data.clinician_name + (f", {data.clinician_title}" if data.clinician_title else "")
    content = [
        _text("Final finding", _MUTED),
        _text(data.final_finding, _FINDING),
        Spacer(1, 2.5 * mm),
        _text("Impression", _MUTED),
        _multiline(data.impression),
        Spacer(1, 2.5 * mm),
        _text(f"Reviewed and signed by {signer}. {agreement}", _MUTED),
    ]
    table = Table([[content]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), TINT),
                ("LINEBEFORE", (0, 0), (0, -1), 2, ACCENT),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def _findings_table(predictions: list[Prediction], width: float) -> Table:
    header = [_text("Finding", _MUTED), _text("Model confidence", _MUTED)]
    rows = [[_text(p.label), _text(f"{p.score * 100:.1f}%")] for p in predictions]
    table = Table([header, *rows], colWidths=[width * 0.7, width * 0.3])
    table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, INK),
                ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _evidence_table(scan: Image.Image, heatmap: Image.Image, width: float) -> Table:
    # Capped so a typical report, verification included, fits on one A4 page.
    side = min((width - 6 * mm) / 2, 52 * mm)
    images = [_pdf_image(scan, side), _pdf_image(heatmap, side)]
    captions = [_text("Original scan", _MUTED), _text("Regions the model relied on", _MUTED)]
    table = Table([images, captions], colWidths=[side + 6 * mm, side + 6 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP")])
    )
    return table


def _verification_table(data: ReportInput, width: float) -> Table:
    qr_size = 26 * mm
    widget = QrCodeWidget(data.verify_url)
    x1, y1, x2, y2 = widget.getBounds()
    drawing = Drawing(
        qr_size, qr_size, transform=[qr_size / (x2 - x1), 0, 0, qr_size / (y2 - y1), 0, 0]
    )
    drawing.add(widget)
    details = [
        _text("On-chain record ID", _MUTED),
        _text(data.record_id, _MONO),
        Spacer(1, 1.5 * mm),
        _text("Scan SHA-256", _MUTED),
        _text(data.scan_sha256, _MONO),
        Spacer(1, 2 * mm),
        _text(
            "The SHA-256 of this PDF is anchored on-chain. Scan the code or open "
            f"{data.verify_url.split('?')[0]} and upload this file to confirm it is authentic "
            "and unaltered. The scan and report are stored encrypted on IPFS.",
            _MUTED,
        ),
    ]
    table = Table([[details, drawing]], colWidths=[width - qr_size - 6 * mm, qr_size + 6 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ]
        )
    )
    return table


def _pdf_image(image: Image.Image, max_side: float) -> PdfImage:
    preview = image.convert("RGB")
    preview.thumbnail((768, 768))
    buffer = io.BytesIO()
    # JPEG keeps reports small (PDF embeds it as-is); quality 88 is visually lossless here.
    preview.save(buffer, format="JPEG", quality=88, optimize=True)
    buffer.seek(0)
    ratio = preview.width / preview.height
    width, height = (max_side, max_side / ratio) if ratio >= 1 else (max_side * ratio, max_side)
    return PdfImage(buffer, width=width, height=height)
