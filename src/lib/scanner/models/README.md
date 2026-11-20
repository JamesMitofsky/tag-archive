# Scanner models

`u2netp.onnx` is U²-Netp, the small (4.6 MB) variant of U²-Net, a salient-object
segmentation network: given a photo, it marks the pixels of the thing the photo
is of. The scanner uses that mask to find the page's corners (see
`../segment.ts` and `../outline.ts`).

- Model and weights: Qin et al., "U²-Net: Going Deeper with Nested U-Structure
  for Salient Object Detection" (2020), <https://github.com/xuebinqin/U-2-Net>,
  Apache License 2.0.
- This ONNX export: the `u2netp.onnx` published with rembg,
  <https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx>.
- SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`

Input: `1×3×320×320` float32, RGB, scaled to 0–1 then normalized with the
ImageNet mean and standard deviation. The first output is the mask,
`1×1×320×320`, already passed through a sigmoid.
