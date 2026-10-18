"""Model loading and inference. Models load lazily on first use (or at startup if preloaded)."""

import logging
import threading
from dataclasses import dataclass
from typing import Protocol

import torch
from PIL import Image
from transformers import AutoConfig, AutoImageProcessor, AutoModelForImageClassification
from transformers.utils import logging as hf_logging

from app.ml.catalog import display_label
from app.ml.explain import ROLLOUT_MODEL_TYPES, attention_rollout, grad_cam, overlay

logger = logging.getLogger(__name__)
hf_logging.disable_progress_bar()

TOP_K = 5


class ModelUnavailableError(Exception):
    """The model could not be loaded (network, cache or configuration problem)."""


@dataclass(frozen=True)
class Prediction:
    label: str
    score: float


@dataclass(frozen=True)
class Inference:
    model_id: str
    predictions: list[Prediction]
    heatmap: Image.Image | None


class Engine(Protocol):
    def predict(self, analysis_type: str, image: Image.Image) -> Inference: ...

    def preload(self) -> None: ...


@dataclass
class _LoadedModel:
    model_id: str
    model: torch.nn.Module
    processor: object
    uses_rollout: bool
    grid: tuple[int, int]
    lock: threading.Lock


def resolve_device(preference: str) -> torch.device:
    if preference != "auto":
        return torch.device(preference)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class TransformersEngine:
    def __init__(self, model_ids: dict[str, str], device: str = "auto") -> None:
        self._model_ids = dict(model_ids)
        self.device = resolve_device(device)
        self._loaded: dict[str, _LoadedModel] = {}
        self._load_lock = threading.Lock()

    def preload(self) -> None:
        for analysis_type in self._model_ids:
            self._get(analysis_type)

    def predict(self, analysis_type: str, image: Image.Image) -> Inference:
        loaded = self._get(analysis_type)
        # Grad-CAM hooks mutate the module, so inference on one model is serialized.
        with loaded.lock:
            pixel_values = loaded.processor(images=image, return_tensors="pt")["pixel_values"]
            pixel_values = pixel_values.to(self.device)
            with torch.inference_mode():
                output = loaded.model(
                    pixel_values=pixel_values, output_attentions=loaded.uses_rollout
                )
            probabilities = torch.softmax(output.logits[0].float(), dim=-1).cpu()
            top = torch.topk(probabilities, k=min(TOP_K, probabilities.numel()))
            if loaded.uses_rollout:
                heatmap = attention_rollout(output.attentions, loaded.grid)
            else:
                heatmap = grad_cam(loaded.model, pixel_values, int(top.indices[0]))

        id2label = loaded.model.config.id2label
        predictions = [
            Prediction(display_label(analysis_type, id2label[int(index)]), round(float(score), 4))
            for score, index in zip(top.values, top.indices, strict=True)
        ]
        return Inference(
            model_id=loaded.model_id,
            predictions=predictions,
            heatmap=overlay(image, heatmap) if heatmap is not None else None,
        )

    def _get(self, analysis_type: str) -> _LoadedModel:
        if (loaded := self._loaded.get(analysis_type)) is not None:
            return loaded
        with self._load_lock:
            if (loaded := self._loaded.get(analysis_type)) is None:
                loaded = self._load(self._model_ids[analysis_type])
                self._loaded[analysis_type] = loaded
        return loaded

    def _load(self, model_id: str) -> _LoadedModel:
        logger.info("Loading model %s on %s", model_id, self.device)
        try:
            config = AutoConfig.from_pretrained(model_id)
            uses_rollout = config.model_type in ROLLOUT_MODEL_TYPES
            extra = {"attn_implementation": "eager"} if uses_rollout else {}
            model = AutoModelForImageClassification.from_pretrained(
                model_id, use_safetensors=True, **extra
            )
            processor = AutoImageProcessor.from_pretrained(model_id)
        except Exception as exc:  # hub, network and config errors all mean "unavailable"
            logger.exception("Could not load model %s", model_id)
            raise ModelUnavailableError(model_id) from exc
        model.to(self.device).eval()
        grid = (0, 0)
        if uses_rollout:
            side = config.image_size // config.patch_size
            grid = (side, side)
        return _LoadedModel(model_id, model, processor, uses_rollout, grid, threading.Lock())
