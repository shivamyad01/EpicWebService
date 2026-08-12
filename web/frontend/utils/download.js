/**
 * Browser-side file downloads.
 *
 * The sample workbook is offered from more than one screen, so the endpoint and
 * the filename live here rather than being written out again next to each button.
 * Two copies of a filename is one copy too many for the day it changes.
 */

import { safeFetchBlob } from "./api.js";

/**
 * Save a blob response to disk under `filename`.
 *
 * The object URL pins the blob in memory until it is revoked, and a merchant
 * working through a bad sheet downloads these more than once.
 */
const saveBlob = async (response, filename) => {
  const url = window.URL.createObjectURL(await response.blob());
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * The example spreadsheet.
 *
 * Built and downloaded from the server: it carries a real in-cell dropdown of
 * carrier names, which needs data validations the community build of SheetJS
 * cannot write — and the list comes from the same server config the fulfillment
 * service matches names against, so the two cannot drift apart.
 *
 * Ungated on purpose. A merchant deciding whether to subscribe should be able to
 * see the format the app expects first.
 *
 * @throws whatever safeFetchBlob throws, for the caller to surface
 */
export const downloadSampleWorkbook = async () => {
  const response = await safeFetchBlob("/api/orders/sample-file");
  await saveBlob(response, "sample_bulk_fulfillment.xlsx");
};
