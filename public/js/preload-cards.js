// Preload all card images to smooth multiplayer animations.
// Uses CARD_IMAGE_MAP from kaloki-table.js.

(function () {
  function preloadCardImages() {
    try {
      if (typeof CARD_IMAGE_MAP === "undefined") {
        console.warn("CARD_IMAGE_MAP not found, skipping card preload.");
        return;
      }

      const urls = [];
      const seen = new Set();

      // All mapped card faces
      Object.values(CARD_IMAGE_MAP).forEach((key) => {
        const path = `/cards/${key}.png`;
        if (!seen.has(path)) {
          seen.add(path);
          urls.push(path);
        }
      });

      // Card back image
      urls.push("/cards/BACK_JAMAICA.png");

      let loaded = 0;
      const total = urls.length;

      urls.forEach((src) => {
        const img = new Image();
        img.onload = img.onerror = function () {
          loaded++;
          if (loaded === total) {
            console.log("All card images preloaded");
          }
        };
        img.src = src;
      });
    } catch (err) {
      console.warn("Error preloading card images:", err);
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    preloadCardImages();
  } else {
    document.addEventListener("DOMContentLoaded", preloadCardImages);
  }
})();
