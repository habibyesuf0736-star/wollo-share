/* .docx through docx-preview, entirely in-process: the bytes never leave the phone and no
   converter service is called. The library lays the document out as page wrappers, which the
   reader then scrolls, zooms and searches like any other flow document. */

export async function openDocx(bytes) {
  const { renderAsync } = await import("docx-preview");
  let host = null;

  return {
    kind: "flow",
    format: "docx",
    count: 1,
    canRotate: false,
    canSearch: true,
    canThumb: false,
    async renderAll(container) {
      host = container;
      container.replaceChildren();
      await renderAsync(
        new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
        container,
        null,
        // A phone screen is narrower than any page, so the document is laid out as one reflowed
        // column instead of a row of A4 wrappers the student would have to swipe sideways through.
        { inWrapper: false, ignoreWidth: true, ignoreHeight: true, breakPages: false, ignoreLastRenderedPageBreak: true, experimental: true }
      );
      return { nodes: 1 };
    },
    text() {
      return host ? host.textContent : "";
    },
    host() {
      return host;
    },
    destroy() {
      host = null;
    }
  };
}
