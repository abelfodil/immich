"""One-time script to export YOLOv8m to ONNX opset 17."""
from ultralytics import YOLO
import onnx, numpy as np, onnxruntime as ort

model = YOLO("yolov8m.pt")
model.export(format="onnx", opset=17, imgsz=640, dynamic=False)

# Verify
sess = ort.InferenceSession("yolov8m.onnx")
dummy = np.zeros((1, 3, 640, 640), dtype=np.float32)
out = sess.run(None, {sess.get_inputs()[0].name: dummy})
assert out[0].shape == (1, 84, 8400), f"Unexpected shape: {out[0].shape}"
print("YOLOv8m ONNX export OK:", out[0].shape)
