from typing import Any

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from immich_ml.models.base import InferenceModel
from immich_ml.models.transforms import decode_cv2, serialize_np_array
from immich_ml.schemas import (
    ModelSession,
    ModelTask,
    ModelType,
    ObjectDetectionOutput,
    DetectedPet,
    PetRecognitionOutput,
)

_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
_INPUT_SIZE = 384


class PetEmbedder(InferenceModel):
    depends = [(ModelType.DETECTION, ModelTask.OBJECT_DETECTION)]
    identity = (ModelType.RECOGNITION, ModelTask.PET_RECOGNITION)

    def _predict(
        self,
        inputs: NDArray[np.uint8] | bytes | Image.Image,
        detections: ObjectDetectionOutput,
    ) -> PetRecognitionOutput:
        if detections["boxes"].shape[0] == 0:
            return []
        image = decode_cv2(inputs)
        crops = [self._crop(image, box) for box in detections["boxes"]]
        embeddings = self._predict_batch(crops)
        return [
            {
                "boundingBox": {"x1": int(x1), "y1": int(y1), "x2": int(x2), "y2": int(y2)},
                "embedding": serialize_np_array(emb),
                "score": float(score),
                "classId": int(class_id),
            }
            for (x1, y1, x2, y2), emb, score, class_id in zip(
                detections["boxes"], embeddings, detections["scores"], detections["class_ids"]
            )
        ]

    def _crop(self, image: NDArray[np.uint8], box: NDArray[np.float32]) -> NDArray[np.float32]:
        h, w = image.shape[:2]
        x1, y1, x2, y2 = box.astype(int)
        # small padding (10% of box size)
        bw, bh = x2 - x1, y2 - y1
        pad_x, pad_y = int(bw * 0.1), int(bh * 0.1)
        x1 = max(0, x1 - pad_x)
        y1 = max(0, y1 - pad_y)
        x2 = min(w, x2 + pad_x)
        y2 = min(h, y2 + pad_y)
        crop = image[y1:y2, x1:x2]
        # BGR→RGB, resize, normalise
        crop_rgb = crop[:, :, ::-1].astype(np.float32) / 255.0
        pil = Image.fromarray((crop_rgb * 255).astype(np.uint8))
        pil = pil.resize((_INPUT_SIZE, _INPUT_SIZE), Image.Resampling.BICUBIC)
        arr = np.asarray(pil, dtype=np.float32) / 255.0
        arr = (arr - _IMAGENET_MEAN) / _IMAGENET_STD
        return arr.transpose(2, 0, 1)  # CHW

    def _predict_batch(self, crops: list[NDArray[np.float32]]) -> NDArray[np.float32]:
        batch = np.stack(crops, axis=0)  # [N, 3, 384, 384]
        output: NDArray[np.float32] = self.session.run(
            None, {self.session.get_inputs()[0].name: batch}
        )[0]
        # L2 normalise
        norms = np.linalg.norm(output, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        return (output / norms).astype(np.float32)
