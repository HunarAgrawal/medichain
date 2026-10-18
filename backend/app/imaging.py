"""Validation and decoding of uploaded scans."""

import io
from dataclasses import dataclass

import numpy as np
from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

MEDIA_TYPES = {"PNG": "image/png", "JPEG": "image/jpeg"}
MIN_SIDE_PX = 64
MAX_PIXELS = 36_000_000
_CHUNK_BYTES = 1024 * 1024

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


@dataclass(frozen=True)
class Scan:
    data: bytes
    image: Image.Image
    media_type: str


async def read_upload(upload: UploadFile, max_bytes: int) -> bytes:
    """Read an upload without ever holding more than ``max_bytes`` in memory."""
    buffer = bytearray()
    while chunk := await upload.read(_CHUNK_BYTES):
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE,
                f"The file is larger than {max_bytes // (1024 * 1024)} MB.",
            )
    if not buffer:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The uploaded file is empty.")
    return bytes(buffer)


def decode_scan(data: bytes) -> Scan:
    """Decode PNG/JPEG bytes into an RGB image, rejecting anything else."""
    unsupported = HTTPException(
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a PNG or JPEG image."
    )
    try:
        image = Image.open(io.BytesIO(data))
        if image.format not in MEDIA_TYPES:
            raise unsupported
        width, height = image.size
        if min(width, height) < MIN_SIDE_PX:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"The image is too small (minimum {MIN_SIDE_PX} px per side).",
            )
        if width * height > MAX_PIXELS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "The image resolution is too large."
            )
        image.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as exc:
        raise unsupported from exc
    return Scan(data=data, image=_to_rgb(image), media_type=MEDIA_TYPES[image.format])


def media_type_of(data: bytes) -> str:
    try:
        with Image.open(io.BytesIO(data)) as image:
            return MEDIA_TYPES.get(image.format or "", "application/octet-stream")
    except (UnidentifiedImageError, OSError):
        return "application/octet-stream"


def _to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in {"I", "I;16", "I;16B", "I;16L"}:
        # 16-bit grayscale (common for medical PNGs): stretch to 8-bit before converting.
        pixels = np.asarray(image, dtype=np.float32)
        low, high = float(pixels.min()), float(pixels.max())
        scaled = (pixels - low) / (high - low) * 255 if high > low else np.zeros_like(pixels)
        image = Image.fromarray(scaled.astype(np.uint8))
    return image.convert("RGB")
