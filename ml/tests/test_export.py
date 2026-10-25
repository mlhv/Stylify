import json

import pytest
import torch

pytest.importorskip("executorch")  # the gaming PC installs without it

from stylify_ml.data import MEAN, STD
from stylify_ml.export import ParityError, check_parity, check_top1_agreement, export_pte, main, write_metadata
from stylify_ml.labels import LABELS
from stylify_ml.models import build_model, load_checkpoint, save_checkpoint


def _tiny(seed: int) -> torch.nn.Module:
    torch.manual_seed(seed)
    return torch.nn.Sequential(
        torch.nn.Conv2d(3, 4, 3), torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten(), torch.nn.Linear(4, 9)
    ).eval()


tiny = _tiny(0)
other_tiny = _tiny(1)


def test_export_parity_on_tiny_model(tmp_path):
    n = export_pte(tiny, tmp_path / "m.pte")
    assert n > 0
    assert check_parity(tmp_path / "m.pte", tiny, torch.rand(4, 3, 224, 224)) < 1e-3


def test_parity_error_when_outputs_differ(tmp_path):
    export_pte(tiny, tmp_path / "m.pte")
    with pytest.raises(ParityError):
        check_parity(tmp_path / "m.pte", other_tiny, torch.rand(2, 3, 224, 224))


def test_metadata_has_the_spec_keys(tmp_path):
    meta = write_metadata(tmp_path, threshold=0.7, model="efficientnet_b0", run="r1",
                          scores={"valBalancedAccuracy": 0.9, "personalTop1": 0.8, "personalTop3": 0.95})
    on_disk = json.loads((tmp_path / "classifier.json").read_text())
    assert on_disk == meta
    assert set(on_disk) == {"labels", "inputSize", "resizeMode", "normalize", "threshold",
                            "model", "run", "exportedAt", "scores", "quantized"}
    assert on_disk["quantized"] is None
    assert on_disk["labels"] == list(LABELS) and on_disk["inputSize"] == 224 and on_disk["resizeMode"] == "stretch"
    assert on_disk["normalize"] == {"mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}


def test_placeholder_cli(tmp_path):
    main(["--placeholder", "--out", str(tmp_path)])
    meta = json.loads((tmp_path / "classifier.json").read_text())
    assert meta["threshold"] == 1.0 and meta["model"] == "placeholder"
    assert meta["run"] is None
    assert meta["scores"] == {"valBalancedAccuracy": None, "personalTop1": None, "personalTop3": None,
                              "usersTop1": None, "usersTop3": None,
                              "carousellTop1": None, "carousellTop3": None}
    assert (tmp_path / "classifier.pte").stat().st_size > 0


def test_checkpoint_round_trip(tmp_path):
    m = build_model("mobilenet_v3_large", pretrained=False)
    save_checkpoint(tmp_path / "best.pt", m, "mobilenet_v3_large", {"threshold": 0.5})
    loaded, meta = load_checkpoint(tmp_path / "best.pt")
    assert meta["model"] == "mobilenet_v3_large" and meta["threshold"] == 0.5 and meta["labels"] == list(LABELS)


def test_parity_error_when_output_shapes_differ(tmp_path):
    export_pte(tiny, tmp_path / "m.pte")
    five = torch.nn.Sequential(*list(tiny.children())[:-1], torch.nn.Linear(4, 5)).eval()
    with pytest.raises(ParityError, match="shape"):
        check_parity(tmp_path / "m.pte", five, torch.rand(1, 3, 224, 224))


def test_export_run_rejects_checkpoint_with_different_labels(tmp_path):
    m = build_model("mobilenet_v3_large", pretrained=False)
    run = tmp_path / "run"
    run.mkdir()
    torch.save({"model": "mobilenet_v3_large", "labels": list(reversed(LABELS)), "state_dict": m.state_dict()},
               run / "best.pt")
    with pytest.raises(ValueError, match="labels"):
        main(["--run", str(run), "--out", str(tmp_path / "out")])
    assert not (tmp_path / "out").exists()


def test_export_uses_the_training_normalisation():
    import stylify_ml.export as export
    assert export.MEAN is MEAN and export.STD is STD


def _confident_tiny() -> torch.nn.Module:
    """A tiny model whose top-1 is clear (a large bias on label 3), so int8 rounding cannot flip it."""
    model = _tiny(2)
    with torch.no_grad():
        model[3].bias.zero_()
        model[3].bias[3] = 5.0
    return model


def test_int8_export_runs_and_agrees(tmp_path):
    model = _confident_tiny()
    torch.manual_seed(0)
    inputs = torch.rand(8, 3, 224, 224)
    n = export_pte(model, tmp_path / "q.pte", quantize=True, calibration=inputs)
    assert n > 0
    assert check_top1_agreement(tmp_path / "q.pte", model, inputs, min_agreement=0.75) >= 0.75


def test_top1_agreement_error_when_models_differ(tmp_path):
    export_pte(_confident_tiny(), tmp_path / "m.pte")
    other = _tiny(3)
    with torch.no_grad():
        other[3].bias.zero_()
        other[3].bias[5] = 5.0
    with pytest.raises(ParityError):
        check_top1_agreement(tmp_path / "m.pte", other, torch.rand(4, 3, 224, 224), min_agreement=0.9)


def test_quantize_without_calibration_is_an_error(tmp_path):
    with pytest.raises(ValueError, match="calibration"):
        export_pte(tiny, tmp_path / "q.pte", quantize=True)


def test_metadata_records_quantized(tmp_path):
    write_metadata(tmp_path, threshold=0.7, model="m", run="r", scores={}, quantized="int8")
    assert json.loads((tmp_path / "classifier.json").read_text())["quantized"] == "int8"
