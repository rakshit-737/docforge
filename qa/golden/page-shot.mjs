/* The document page, not the application's scroll container. Integer viewport
   placement prevents a different shell's fractional scroll offset from changing
   glyph antialiasing. Only position is normalized; no document pixels/styles are
   masked, cropped, or replaced. Both classic and web use this exact operation. */
export async function pageShot(locator, path) {
  const previous = await locator.evaluate((element) => {
    const previous = element.getAttribute("style");
    element.style.setProperty("position", "fixed", "important");
    element.style.setProperty("top", "0", "important");
    element.style.setProperty("left", "0", "important");
    element.style.setProperty("margin", "0", "important");
    element.style.setProperty("z-index", "2147483647", "important");
    return previous;
  });
  try {
    await locator.screenshot({ path, animations: "disabled" });
  } finally {
    await locator.evaluate((element, previous) => {
      if (previous === null) element.removeAttribute("style");
      else element.setAttribute("style", previous);
    }, previous);
  }
}
