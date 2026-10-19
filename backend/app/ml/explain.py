"""Visual explanations: attention rollout for ViT-family models, Grad-CAM for CNNs."""

import numpy as np
import torch
from PIL import Image

ROLLOUT_MODEL_TYPES = frozenset({"vit", "deit"})


def attention_rollout(attentions: tuple[torch.Tensor, ...], grid: tuple[int, int]) -> np.ndarray:
    """Propagate attention through all layers (Abnar & Zuidema, 2020); returns a grid map."""
    rollout: torch.Tensor | None = None
    for layer in attentions:
        attn = layer[0].float().mean(dim=0)
        attn = attn + torch.eye(attn.size(-1), device=attn.device)
        attn = attn / attn.sum(dim=-1, keepdim=True)
        rollout = attn if rollout is None else attn @ rollout
    if rollout is None:
        raise ValueError("No attention layers supplied")
    patches = grid[0] * grid[1]
    # Patch tokens come last (after [CLS], and [DIST] for DeiT).
    cls_to_patches = rollout[0, -patches:]
    return _normalize(cls_to_patches.reshape(grid).cpu().numpy())


def grad_cam(model: torch.nn.Module, pixel_values: torch.Tensor, target: int) -> np.ndarray | None:
    """Grad-CAM on the last convolution layer; ``None`` if the model has none."""
    layer = next(
        (m for m in reversed(list(model.modules())) if isinstance(m, torch.nn.Conv2d)), None
    )
    if layer is None:
        return None
    captured: dict[str, torch.Tensor] = {}

    def hook(_module: torch.nn.Module, _inputs: object, output: torch.Tensor) -> None:
        captured["activation"] = output
        output.register_hook(lambda grad: captured.__setitem__("gradient", grad))

    handle = layer.register_forward_hook(hook)
    try:
        with torch.enable_grad():
            logits = model(pixel_values=pixel_values).logits
            model.zero_grad(set_to_none=True)
            logits[0, target].backward()
    finally:
        handle.remove()
    activation, gradient = captured["activation"][0], captured["gradient"][0]
    weights = gradient.mean(dim=(1, 2), keepdim=True)
    cam = torch.relu((weights * activation).sum(dim=0))
    return _normalize(cam.detach().float().cpu().numpy())


def overlay(
    image: Image.Image, heatmap: np.ndarray, max_alpha: float = 0.6, keep_top: float = 0.35
) -> Image.Image:
    """Blend the strongest ``keep_top`` share of a [0, 1] heatmap onto the image.

    Attention maps are diffuse; showing only the top regions keeps the overlay readable.
    """
    floor = float(np.quantile(heatmap, 1 - keep_top))
    focused = np.clip((heatmap - floor) / max(float(heatmap.max()) - floor, 1e-8), 0, 1)
    heat = Image.fromarray(np.uint8(focused * 255)).resize(image.size, Image.Resampling.BICUBIC)
    intensity = np.asarray(heat, dtype=np.float32)[..., None] / 255.0
    base = np.asarray(image.convert("RGB"), dtype=np.float32)
    blended = base * (1 - max_alpha * intensity) + _jet(intensity[..., 0]) * max_alpha * intensity
    return Image.fromarray(np.uint8(np.clip(blended, 0, 255)))


def _jet(values: np.ndarray) -> np.ndarray:
    channels = [np.clip(1.5 - np.abs(4 * values - offset), 0, 1) for offset in (3, 2, 1)]
    return np.stack(channels, axis=-1) * 255


def _normalize(values: np.ndarray) -> np.ndarray:
    values = np.maximum(values, 0)
    peak = values.max()
    return values / peak if peak > 0 else values
