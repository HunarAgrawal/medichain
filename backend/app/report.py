"""PDF report rendering."""

import io
from dataclasses import dataclass
from datetime import datetime
from xml.sax.saxutils import escape

from PIL import Image
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image as PdfImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.ml.engine import Prediction

INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#6B7280")
RULE = colors.HexColor("#E5E7EB")
ACCENT = colors.HexColor("#0F766E")

_BASE = ParagraphStyle("base", fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK)
_TITLE = ParagraphStyle("title", parent=_BASE, fontName="Helvetica-Bold", fontSize=18, leading=22)
_BRAND = ParagraphStyle("brand", parent=_BASE, textColor=ACCENT, fontName="Helvetica-Bold")
_HEADING = ParagraphStyle(
    "heading", parent=_BASE, fontName="Helvetica-Bold", fontSize=11, spaceBefore=6, spaceAfter=4
)
_MUTED = ParagraphStyle("muted", parent=_BASE, textColor=MUTED, fontSize=8.5, leading=11.5)
_MONO = ParagraphStyle("mono", parent=_BASE, fontName="Courier", fontSize=8, leading=10.5)
_CAPTION = ParagraphStyle("caption", parent=_MUTED, alignment=TA_LEFT)


@dataclass(frozen=True)
class ReportInput:
    report_id: str
    created_at: datetime
    patient_id: str
    patient_name: str
    patient_age: int
    analysis_name: str
    modality: str
    model_id: str
    predictions: list[Prediction]
    scan: Image.Image
    heatmap: Image.Image | None
    scan_sha256: str
    record_url: str


def render_report(data: ReportInput) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Medichain report {data.report_id}",
        author="Medichain",
    )
    width = doc.width - 12  # SimpleDocTemplate's frame pads 6pt on each side
    story = [
        Paragraph("MEDICHAIN", _BRAND),
        Paragraph("Imaging Analysis Report", _TITLE),
        Spacer(1, 4 * mm),
        _details_table(data, width),
        Spacer(1, 5 * mm),
        Paragraph("Findings", _HEADING),
        _findings_table(data.predictions, width),
        Spacer(1, 5 * mm),
    ]
    if data.heatmap is not None:
        story += [
            Paragraph("Visual evidence", _HEADING),
            _evidence_table(data.scan, data.heatmap, width),
        ]
        story.append(Spacer(1, 5 * mm))
    story += [
        Paragraph("Verification", _HEADING),
        _verification_table(data, width),
        Spacer(1, 6 * mm),
        Paragraph(
            "Research prototype. These are preliminary, AI-generated findings and not a "
            "diagnosis. They must be reviewed by a qualified clinician before any clinical use.",
            _MUTED,
        ),
    ]
    doc.build(story)
    return buffer.getvalue()


def _text(value: object, style: ParagraphStyle = _BASE) -> Paragraph:
    # Paragraph parses markup, so user-supplied text must be escaped.
    return Paragraph(escape(str(value)), style)


def _details_table(data: ReportInput, width: float) -> Table:
    rows = [
        ("Patient ID", data.patient_id, "Report ID", data.report_id),
        ("Name", data.patient_name, "Generated", data.created_at.strftime("%Y-%m-%d %H:%M UTC")),
        ("Age", data.patient_age, "Analysis", f"{data.analysis_name} ({data.modality})"),
        ("", "", "Model", data.model_id),
    ]
    cells = [[_text(a, _MUTED), _text(b), _text(c, _MUTED), _text(d)] for a, b, c, d in rows]
    table = Table(cells, colWidths=[width * 0.14, width * 0.30, width * 0.14, width * 0.42])
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


def _findings_table(predictions: list[Prediction], width: float) -> Table:
    header = [_text("Finding", _MUTED), _text("Confidence", _MUTED)]
    rows = [[_text(p.label), _text(f"{p.score * 100:.1f}%")] for p in predictions]
    table = Table([header, *rows], colWidths=[width * 0.7, width * 0.3])
    style = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, INK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]
    if rows:
        style.append(("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F0FDFA")))
    table.setStyle(TableStyle(style))
    return table


def _evidence_table(scan: Image.Image, heatmap: Image.Image, width: float) -> Table:
    side = (width - 6 * mm) / 2
    images = [_pdf_image(scan, side), _pdf_image(heatmap, side)]
    captions = [_text("Original scan", _CAPTION), _text("Model attention", _CAPTION)]
    table = Table([images, captions], colWidths=[side + 3 * mm, side + 3 * mm])
    table.setStyle(
        TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP")])
    )
    return table


def _verification_table(data: ReportInput, width: float) -> Table:
    qr_size = 28 * mm
    widget = QrCodeWidget(data.record_url)
    x1, y1, x2, y2 = widget.getBounds()
    drawing = Drawing(
        qr_size, qr_size, transform=[qr_size / (x2 - x1), 0, 0, qr_size / (y2 - y1), 0, 0]
    )
    drawing.add(widget)
    details = [
        _text("Scan SHA-256", _MUTED),
        _text(data.scan_sha256, _MONO),
        Spacer(1, 2 * mm),
        _text(
            "Files are stored encrypted on IPFS and anchored on-chain. Scan the code to open this "
            "record in Medichain; access requires an authorized wallet.",
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
    preview.save(buffer, format="PNG")
    buffer.seek(0)
    ratio = preview.width / preview.height
    width, height = (max_side, max_side / ratio) if ratio >= 1 else (max_side * ratio, max_side)
    return PdfImage(buffer, width=width, height=height)
