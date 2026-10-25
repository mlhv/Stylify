"""Candidate classifier backbones, head selection and checkpoints."""

from collections.abc import Iterable
import os
from pathlib import Path

import timm
import torch
from torchvision import models as tvm

from stylify_ml.labels import LABELS

MODEL_NAMES = ("mobilenet_v3_large", "efficientnet_b0", "mobilenetv4_conv_medium")


def build_model(name: str, num_classes: int = 9, pretrained: bool = True) -> torch.nn.Module:
    if name == "mobilenet_v3_large":
        model = tvm.mobilenet_v3_large(weights="IMAGENET1K_V2" if pretrained else None)
        model.classifier[3] = torch.nn.Linear(model.classifier[3].in_features, num_classes)
    elif name == "efficientnet_b0":
        model = tvm.efficientnet_b0(weights="IMAGENET1K_V1" if pretrained else None)
        model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, num_classes)
    elif name == "mobilenetv4_conv_medium":
        model = timm.create_model(name, pretrained=pretrained, num_classes=num_classes)
    else:
        raise ValueError(f"unknown model {name!r}")
    return model


def head_parameters(model: torch.nn.Module, name: str) -> Iterable[torch.nn.Parameter]:
    """The replaced final layer only, for phase 1 of training."""
    if name == "mobilenet_v3_large":
        return model.classifier[3].parameters()
    if name == "efficientnet_b0":
        return model.classifier[1].parameters()
    if name == "mobilenetv4_conv_medium":
        return model.get_classifier().parameters()
    raise ValueError(f"unknown model {name!r}")


def save_checkpoint(path: Path, model: torch.nn.Module, name: str, extra: dict) -> None:
    """Written to a temp file and renamed, so an interrupted save never leaves a truncated checkpoint."""
    tmp = Path(path).with_name(Path(path).name + ".tmp")
    torch.save({"model": name, "labels": list(LABELS), "state_dict": model.state_dict(), **extra}, tmp)
    os.replace(tmp, path)


def load_checkpoint(path: Path) -> tuple[torch.nn.Module, dict]:
    """Return the model (eval mode) and the checkpoint's other fields."""
    ckpt = torch.load(path, map_location="cpu", weights_only=True)
    model = build_model(ckpt["model"], num_classes=len(ckpt["labels"]), pretrained=False)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, {k: v for k, v in ckpt.items() if k != "state_dict"}
