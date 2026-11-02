// Every picture a person can upload ends up inside the one shared state row, so nothing is
// ever stored as the original camera file: the browser checks the format, shrinks it to the
// size it is actually drawn at and compresses it before it is offered back to the caller.

const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export const IMAGE_ERRORS = {
  none: "Choose a picture first.",
  format: "Use a PNG, JPG or WebP picture.",
  large: "That picture is larger than 12 MB.",
  unreadable: "That picture could not be opened."
};

export function checkImageFile(file, maxBytes = 12 * 1024 * 1024) {
  if (!file) return IMAGE_ERRORS.none;
  if (!ACCEPTED.includes(String(file.type || "").toLowerCase())) return IMAGE_ERRORS.format;
  if (file.size > maxBytes) return IMAGE_ERRORS.large;
  return "";
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(IMAGE_ERRORS.unreadable));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error(IMAGE_ERRORS.unreadable));
      image.onload = () => resolve(image);
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// A square cover for a card, cropped from wherever the person dragged the picture.
export async function cropSquareDataUrl(file, { zoom = 1, offsetX = 0, offsetY = 0, out = 640 } = {}) {
  const problem = checkImageFile(file);
  if (problem) throw new Error(problem);
  const image = await loadImage(file);
  const widest = image.naturalWidth || out;
  const tallest = image.naturalHeight || out;
  const side = Math.max(1, Math.min(widest, tallest) / Math.max(1, zoom));
  const x = Math.max(0, Math.min(widest - side, (widest - side) / 2 + offsetX));
  const y = Math.max(0, Math.min(tallest - side, (tallest - side) / 2 + offsetY));
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, out, out);
  context.drawImage(image, x, y, side, side, 0, 0, out, out);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// A wide banner: the whole picture is kept, letterboxed on white, then squeezed down.
export async function bannerDataUrl(file, { out = 1280, quality = 0.8 } = {}) {
  const problem = checkImageFile(file);
  if (problem) throw new Error(problem);
  const image = await loadImage(file);
  const widest = image.naturalWidth || out;
  const tallest = image.naturalHeight || Math.round((out * 9) / 16);
  const scale = Math.min(1, out / widest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(widest * scale));
  canvas.height = Math.max(1, Math.round(tallest * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  // A card picture is served from the same request that carries the entire library, so a
  // picture that still came out heavy is redrawn smaller rather than shipped as-is.
  if (dataUrl.length < 900_000) return dataUrl;
  canvas.width = Math.round(canvas.width / 2);
  canvas.height = Math.round(canvas.height / 2);
  const redraw = canvas.getContext("2d");
  redraw.fillStyle = "#ffffff";
  redraw.fillRect(0, 0, canvas.width, canvas.height);
  redraw.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
