/**
 * Scales a picture down to fit `max` pixels on its longest side and re-encodes it as
 * JPEG, which also drops its metadata (location and camera details).
 */
export async function shrinkImage(file: File, max = 1600, quality = 0.85): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Couldn't read that image"))),
      "image/jpeg",
      quality,
    ),
  );
}
