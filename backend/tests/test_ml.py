"""Exercise the real inference path on tiny, randomly initialised models (no downloads)."""

from pathlib import Path

import pytest
from PIL import Image
from transformers import (
    ResNetConfig,
    ResNetForImageClassification,
    ViTConfig,
    ViTForImageClassification,
    ViTImageProcessor,
)

from app.ml.catalog import display_label
from app.ml.engine import ModelUnavailableError, TransformersEngine


def _save_tiny_vit(path: Path) -> None:
    config = ViTConfig(
        image_size=32,
        patch_size=8,
        hidden_size=16,
        num_hidden_layers=2,
        num_attention_heads=2,
        intermediate_size=32,
        num_labels=4,
        id2label={0: "glioma", 1: "meningioma", 2: "notumor", 3: "pituitary"},
        label2id={"glioma": 0, "meningioma": 1, "notumor": 2, "pituitary": 3},
    )
    ViTForImageClassification(config).save_pretrained(path)
    ViTImageProcessor(size={"height": 32, "width": 32}).save_pretrained(path)


def _save_tiny_resnet(path: Path) -> None:
    config = ResNetConfig(embedding_size=8, hidden_sizes=[8, 16], depths=[1, 1], num_labels=2)
    ResNetForImageClassification(config).save_pretrained(path)
    ViTImageProcessor(size={"height": 64, "width": 64}).save_pretrained(path)


@pytest.fixture(scope="module")
def scan() -> Image.Image:
    return Image.linear_gradient("L").resize((96, 80)).convert("RGB")


def test_vit_prediction_with_attention_rollout(tmp_path: Path, scan: Image.Image) -> None:
    _save_tiny_vit(tmp_path)
    engine = TransformersEngine({"brain_tumor": str(tmp_path)}, device="cpu")

    result = engine.predict("brain_tumor", scan)

    labels = [p.label for p in result.predictions]
    assert sorted(labels) == ["Glioma", "Meningioma", "No tumor", "Pituitary tumor"]
    assert [p.score for p in result.predictions] == sorted(
        (p.score for p in result.predictions), reverse=True
    )
    assert sum(p.score for p in result.predictions) == pytest.approx(1.0, abs=1e-3)
    assert result.heatmap is not None
    assert result.heatmap.size == scan.size


def test_cnn_prediction_with_grad_cam(tmp_path: Path, scan: Image.Image) -> None:
    _save_tiny_resnet(tmp_path)
    engine = TransformersEngine({"chest_xray": str(tmp_path)}, device="cpu")

    result = engine.predict("chest_xray", scan)

    assert len(result.predictions) == 2
    assert result.heatmap is not None
    assert result.heatmap.size == scan.size


def test_missing_model_raises_unavailable(tmp_path: Path, scan: Image.Image) -> None:
    engine = TransformersEngine({"brain_tumor": str(tmp_path / "missing")}, device="cpu")
    with pytest.raises(ModelUnavailableError):
        engine.predict("brain_tumor", scan)


def test_unknown_labels_get_readable_names() -> None:
    assert display_label("chest_xray", "PNEUMONIA") == "Pneumonia"
    assert display_label("chest_xray", "LABEL_0") == "Label 0"
