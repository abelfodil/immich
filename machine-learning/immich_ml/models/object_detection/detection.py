from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

from immich_ml.models.base import InferenceModel
from immich_ml.models.transforms import decode_cv2
from immich_ml.schemas import ModelSession, ModelTask, ModelType, ObjectDetectionOutput

COCO_ANIMAL_CLASSES = frozenset({15, 16, 17, 18, 19, 20, 21, 22, 23})


class CocoDetector(InferenceModel):
    depends = []
    identity = (ModelType.DETECTION, ModelTask.OBJECT_DETECTION)

    def __init__(
        self,
        model_name: str,
        min_score: float = 0.6,
        class_filter: set[int] | None = None,
        **model_kwargs: Any,
    ) -> None:
        self.min_score = model_kwargs.pop("minScore", min_score)
        raw_filter = model_kwargs.pop("classFilter", class_filter)
        self.class_filter: frozenset[int] | None = frozenset(raw_filter) if raw_filter is not None else None
        super().__init__(model_name, **model_kwargs)

    def _predict(self, inputs: NDArray[np.uint8] | bytes) -> ObjectDetectionOutput:
        image = decode_cv2(inputs)
        orig_h, orig_w = image.shape[:2]
        blob, ratio, pad = self._preprocess(image)
        raw = self.session.run(None, {self.session.get_inputs()[0].name: blob})[0]  # [1, 84, 8400]
        return self._postprocess(raw, orig_h, orig_w, ratio, pad)

    def _preprocess(
        self, image: NDArray[np.uint8]
    ) -> tuple[NDArray[np.float32], float, tuple[int, int]]:
        h, w = image.shape[:2]
        target = 640
        ratio = min(target / h, target / w)
        new_h, new_w = int(round(h * ratio)), int(round(w * ratio))
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        pad_top = (target - new_h) // 2
        pad_left = (target - new_w) // 2
        canvas = np.full((target, target, 3), 114, dtype=np.uint8)
        canvas[pad_top : pad_top + new_h, pad_left : pad_left + new_w] = resized

        blob = canvas[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
        return blob[np.newaxis], ratio, (pad_top, pad_left)

    def _postprocess(
        self,
        raw: NDArray[np.float32],
        orig_h: int,
        orig_w: int,
        ratio: float,
        pad: tuple[int, int],
    ) -> ObjectDetectionOutput:
        # raw shape: [1, 84, 8400] → transpose to [8400, 84]
        preds = raw[0].T  # [8400, 84]
        boxes_xywh = preds[:, :4]
        class_scores = preds[:, 4:]  # [8400, 80]

        class_ids = class_scores.argmax(axis=1).astype(np.int32)
        scores = class_scores[np.arange(len(class_ids)), class_ids]

        mask = scores >= self.min_score
        if self.class_filter is not None:
            mask &= np.isin(class_ids, list(self.class_filter))

        boxes_xywh = boxes_xywh[mask]
        scores = scores[mask]
        class_ids = class_ids[mask]

        if len(boxes_xywh) == 0:
            return {
                "boxes": np.empty((0, 4), dtype=np.float32),
                "scores": np.empty(0, dtype=np.float32),
                "class_ids": np.empty(0, dtype=np.int32),
            }

        # xywh (center) → xyxy, then remove letterbox offset and ratio
        pad_top, pad_left = pad
        half = boxes_xywh[:, 2:4] / 2
        x1y1 = boxes_xywh[:, :2] - half
        x2y2 = boxes_xywh[:, :2] + half
        boxes = np.concatenate([x1y1, x2y2], axis=1)
        boxes[:, [0, 2]] = (boxes[:, [0, 2]] - pad_left) / ratio
        boxes[:, [1, 3]] = (boxes[:, [1, 3]] - pad_top) / ratio
        boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, orig_w)
        boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, orig_h)

        # NMS
        keep = self._nms(boxes, scores)
        return {
            "boxes": boxes[keep].round().astype(np.float32),
            "scores": scores[keep],
            "class_ids": class_ids[keep],
        }

    def _nms(self, boxes: NDArray[np.float32], scores: NDArray[np.float32], iou_threshold: float = 0.45) -> list[int]:
        x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]
        keep: list[int] = []
        while order.size > 0:
            i = order[0]
            keep.append(int(i))
            if order.size == 1:
                break
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
            iou = inter / (areas[i] + areas[order[1:]] - inter)
            order = order[1:][iou <= iou_threshold]
        return keep

    def configure(self, **kwargs: Any) -> None:
        if "minScore" in kwargs:
            self.min_score = kwargs["minScore"]
        if "classFilter" in kwargs:
            cf = kwargs["classFilter"]
            self.class_filter = frozenset(cf) if cf is not None else None
