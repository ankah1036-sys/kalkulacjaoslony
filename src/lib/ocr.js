// Odczyt tekstu ze zdjęcia — całkowicie w przeglądarce (Tesseract.js).
//
// Dlaczego tak:
// - 0 zł, bez klucza i bez konta,
// - zdjęcia klientów NIE opuszczają komputera — nic nie jest wysyłane na serwer,
// - wypluwa zwykły tekst, który czyta już nasz parser (parseText.js).
//
// Ograniczenie, które trzeba znać: to zwykły OCR — czyta LITERY, nie rozumie rysunku.
// Radzi sobie z wydrukami, rysunkami technicznymi i zrzutami ekranu.
// Pismo odręczne odczyta słabo albo wcale.

import { createWorker } from "tesseract.js";

let workerPromise = null;

// Worker jest ciężki (pobiera dane językowe ~15 MB przy pierwszym użyciu),
// więc tworzymy go raz i trzymamy na kolejne zdjęcia.
function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker("pol+eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof onProgress === "function") {
          onProgress(Math.round((m.progress || 0) * 100));
        }
      },
    }).catch((err) => {
      workerPromise = null; // pozwól spróbować ponownie po błędzie sieci
      throw err;
    });
  }
  return workerPromise;
}

/**
 * Czyta tekst ze zdjęcia.
 * @param {string|File|Blob} image - dataURL, File albo Blob
 * @param {(percent:number)=>void} [onProgress] - postęp 0–100
 * @returns {Promise<string>} rozpoznany tekst
 */
export async function readTextFromImage(image, onProgress) {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(image);
  return (data?.text || "").trim();
}
