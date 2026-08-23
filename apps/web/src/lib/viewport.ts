const VIEWPORT_HEIGHT_PROPERTY = "--notylo-viewport-height";

/**
 * Keeps fullscreen editor surfaces aligned with the part of the page that is
 * actually visible. Mobile Chromium can keep `100vh` tied to its layout
 * viewport while the address bar or virtual keyboard changes the visual one.
 */
export function installVisualViewportHeightSync(): () => void {
  const root = document.documentElement;
  const visualViewport = window.visualViewport;
  let frame: number | undefined;

  const update = () => {
    frame = undefined;
    const height = visualViewport?.height ?? window.innerHeight;
    if (Number.isFinite(height) && height > 0)
      root.style.setProperty(VIEWPORT_HEIGHT_PROPERTY, `${height}px`);
  };
  const schedule = () => {
    if (frame !== undefined) return;
    frame = window.requestAnimationFrame(update);
  };

  update();
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  visualViewport?.addEventListener("resize", schedule, { passive: true });
  visualViewport?.addEventListener("scroll", schedule, { passive: true });

  return () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    visualViewport?.removeEventListener("resize", schedule);
    visualViewport?.removeEventListener("scroll", schedule);
    root.style.removeProperty(VIEWPORT_HEIGHT_PROPERTY);
  };
}
