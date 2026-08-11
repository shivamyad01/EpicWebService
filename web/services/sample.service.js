/**
 * The sample workbook a merchant downloads to see the expected format.
 *
 * The three visible sheets are the ones this file has always had, with the same
 * wording and the same column widths. The Orders sheet shows two rows, one per
 * case worth showing, and TrackingCompany carries a dropdown.
 *
 * Two things forced the move off the browser and SheetJS. Its community build
 * cannot write data validations — `/* dataValidations *\/` is a commented-out
 * placeholder in its writer — so an in-cell dropdown was impossible there. And
 * the carrier list is server config, so building the file in the frontend meant
 * a second copy of it in fulfillorder.jsx with a comment asking whoever came next
 * to remember both.
 */

import ExcelJS from "exceljs";

import config from "../config/index.js";

/** Chosen when the carrier is not one Shopify knows. Requires a TrackingUrl. */
const OTHER = "Other";

/** How far down the sheet the dropdown reaches, so pasted rows still get it. */
const VALIDATED_ROWS = 2000;

/**
 * Row on the Carriers sheet where the names start, under its three lines of
 * explanation and a blank. The dropdown points straight at this block, so the
 * list a merchant reads is the list the cell offers.
 *
 * This was a separate hidden sheet, which Apple Numbers does not support — it
 * un-hid it on open and told the merchant the file had been changed. A range on
 * a sheet that is already visible has nothing to reveal.
 */
const CARRIER_BLOCK_START = 5;

/**
 * Every carrier the app can resolve a tracking link for, from the same config
 * the fulfillment service matches names against.
 *
 * Both lists matter: shopifyTrackingCompanies are the names Shopify itself
 * recognises, and trackingUrlOverrides adds the ones the app supplies a link for
 * (Trackon is only in the second).
 */
const carrierNames = () => {
  const names = new Set([
    ...config.shopifyTrackingCompanies,
    ...Object.keys(config.trackingUrlOverrides || {}),
  ]);

  return [...names].sort((a, b) => a.localeCompare(b));
};

/**
 * @returns {Promise<Buffer>} the .xlsx file
 */
export const generateSampleWorkbook = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Epic Fulfill";
  workbook.created = new Date();

  const carriers = carrierNames();
  const options = [...carriers, OTHER];

  // ── Orders ────────────────────────────────────────────────────────────────
  const orders = workbook.addWorksheet("Orders");
  [
    ["OrderNumber", "TrackingNumber", "TrackingCompany", "TrackingUrl"],
    // Two rows, because there are only two cases to show. A carrier from the
    // dropdown needs no link — the app works it out.
    ["#1025", "FX123456789IN", "FedEx", ""],
    // And anything else needs one. The link ends where the number goes: the app
    // appends each row's own tracking number to it, so the same value can be
    // copied down the whole column.
    ["#1026", "JCW90000000001", OTHER, "https://jcwexpress.com/tracking?codes="],
  ].forEach((row) => orders.addRow(row));

  orders.columns = [{ width: 15 }, { width: 22 }, { width: 18 }, { width: 45 }];
  orders.getRow(1).font = { bold: true };

  // ── Carriers ──────────────────────────────────────────────────────────────
  const carriersSheet = workbook.addWorksheet("Carriers");
  [
    ["Carriers you can pick in the TrackingCompany dropdown"],
    [
      'Every name below needs no TrackingUrl — the app works the tracking link out. The last entry, "Other", is for a carrier that is not on this list.',
    ],
    [
      "For most of these, Shopify itself selects the carrier and reports delivery status — the same as picking it from the dropdown on an order.",
    ],
    [""],
    // The dropdown's source range: contiguous, starting at
    // CARRIER_BLOCK_START, with "Other" as its last entry.
    ...options.map((name) => [name]),
    [""],
    ["Any other carrier"],
    [
      'Choose "Other" in the dropdown or type the carrier\'s real name, and put the carrier\'s base tracking link in TrackingUrl — the app appends each row\'s tracking number.',
    ],
    [
      "These rows are fulfilled with your link, but Shopify cannot report delivery status for them.",
    ],
  ].forEach((row) => carriersSheet.addRow(row));

  carriersSheet.columns = [{ width: 70 }];
  carriersSheet.getRow(1).font = { bold: true };

  // ── Instructions ──────────────────────────────────────────────────────────
  const instructions = workbook.addWorksheet("Instructions");
  [
    ["How to fill the Orders sheet"],
    [""],
    ["Column", "Required?", "Notes"],
    ["OrderNumber", "Yes", "Order name as shown in Shopify, e.g. #1025 or V-304797"],
    ["TrackingNumber", "Yes", "AWB / consignment number"],
    [
      "TrackingCompany",
      "Yes",
      // Corrected from the previous sample, which said this was optional and that
      // a blank meant India Post. That stopped being true when the default
      // carrier was removed: a blank now fails the row.
      "Pick from the dropdown in the cell, or type a name from the Carriers sheet. A blank fails the row rather than shipping it under a carrier nobody chose.",
    ],
    ["TrackingUrl", "Sometimes", "Required when the carrier is not on the Carriers sheet."],
    [""],
    ["Using a carrier that is not on the Carriers sheet"],
    [
      "1.",
      'Choose "Other" in the dropdown, or type the carrier\'s real name over it — this name is shown to the customer in the shipping email.',
    ],
    [
      "2.",
      "Easiest way: put the carrier's base link — the part before the tracking number — in TrackingUrl and copy the same value down the whole column.",
    ],
    ["", "The app appends each row's own tracking number, so one link covers every row."],
    [
      "",
      "Example: https://jcwexpress.com/tracking?codes=   +   JCW90000000001   =   https://jcwexpress.com/tracking?codes=JCW90000000001",
    ],
    [
      "3.",
      "The base link has to end where the number goes, on = or /. Include https:// (the app adds it if you forget).",
    ],
    [
      "4.",
      "If the number sits in the middle of the link, mark the spot with {tracking}. Example: https://mycourier.com/track/{tracking}/details",
    ],
    [
      "5.",
      "A link that already contains the number is used exactly as written, so pasting full links per row also works.",
    ],
    [""],
    ["Good to know"],
    [
      "•",
      "Leave TrackingUrl blank for any carrier on the Carriers sheet. The app supplies the link, and Shopify keeps delivery status updated where it can.",
    ],
    ["•", "If you do fill TrackingUrl, your link is always used instead."],
    [
      "•",
      "Carriers outside Shopify's list cannot report delivery status. Their tracking link still works.",
    ],
    [
      "•",
      "A row with an unrecognized carrier and no TrackingUrl is skipped and reported as an error — it is never fulfilled with a guessed link.",
    ],
    [
      "•",
      "Carrier names are matched ignoring capitalization, so 'delhivery' and 'Delhivery' both work. Common spellings like 'Blue Dart' and 'Gati' are understood too.",
    ],
  ].forEach((row) => instructions.addRow(row));

  instructions.columns = [{ width: 18 }, { width: 12 }, { width: 80 }];
  instructions.getRow(1).font = { bold: true };

  // ── The dropdown ──────────────────────────────────────────────────────────
  // Applied to the whole column at once: setting it cell by cell makes ExcelJS
  // emit overlapping <dataValidation> entries.
  //
  // showErrorMessage is off deliberately. The dropdown is a convenience, not a
  // gate — the sample itself ships a row reading "Shiprocket", and typing a
  // carrier that Shopify does not know is a supported way to work as long as
  // TrackingUrl is filled in. Rejecting it here would break that.
  const blockEnd = CARRIER_BLOCK_START + options.length - 1;

  orders.dataValidations.add(`C2:C${VALIDATED_ROWS}`, {
    type: "list",
    allowBlank: true,
    formulae: [`Carriers!$A$${CARRIER_BLOCK_START}:$A$${blockEnd}`],
    showInputMessage: true,
    promptTitle: "Pick a carrier",
    prompt: `Choose from the list, or type your carrier's own name and put its tracking link in TrackingUrl.`,
  });

  return workbook.xlsx.writeBuffer();
};

export default { generateSampleWorkbook };
