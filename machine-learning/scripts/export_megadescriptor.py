"""One-time script to export MegaDescriptor-L-384 to ONNX opset 17."""
import timm, torch, numpy as np, onnxruntime as ort
from PIL import Image

model = timm.create_model("hf_hub:BVRA/MegaDescriptor-L-384", pretrained=True)
model.eval()

dummy = torch.zeros(1, 3, 384, 384)
torch.onnx.export(
    model, dummy, "megadescriptor-l-384.onnx",
    opset_version=17,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
)

# Verify
sess = ort.InferenceSession("megadescriptor-l-384.onnx")
out = sess.run(None, {"input": dummy.numpy()})
print("MegaDescriptor ONNX export OK:", out[0].shape)  # expect (1, 1536)
