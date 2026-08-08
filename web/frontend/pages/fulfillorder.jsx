import React, { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Stack,
  Banner,
  DropZone,
  Box,
  Spinner,
  Badge,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { safeFetchJson, safeFetchBlob } from "../utils/api.js";
import {
  useBilling,
  openPricingPage,
  trialDaysLeft,
  formatPrice,
} from "../hooks/useBilling.js";

// Show the trial countdown only once it is worth acting on. The Plan page carries
// the full detail, so repeating "5 days left" on every visit is banner fatigue —
// by the time it matters the merchant has learned to ignore it.
const TRIAL_WARNING_DAYS = 3;

export default function FulfillOrder() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Off by default. Shipping emails cannot be unsent, so sending them is a choice
  // the merchant makes per upload rather than something the app does silently.
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const billing = useBilling();
  const navigate = useNavigate();
  const itemsPerPage = 5;

  const trialDays = trialDaysLeft(billing.trialEndsAt);
  // Only block once the check has actually come back saying so. While it is in
  // flight the hook reports active, so a subscribed merchant never sees the upload
  // button flicker to disabled on load.
  const blockedByBilling = !billing.loading && !billing.active;
  const trialEndingSoon =
    !blockedByBilling && trialDays !== null && trialDays <= TRIAL_WARNING_DAYS;
  const trialPrice = formatPrice(billing.price);

  const handleDropZoneDrop = (_dropFiles, acceptedFiles) => {
    setFile(acceptedFiles[0]);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("notifyCustomer", String(notifyCustomer));

    try {
      const data = await safeFetchJson("/api/orders/bulk-fulfill", {
        method: "POST",
        body: formData,
      });

      setResult(data.summary);
      setFile(null);
    } catch (err) {
      // A plan can lapse between page load and upload. The gate's 402 turns into
      // the paywall banner rather than a raw error the merchant cannot act on.
      if (!billing.applySubscriptionError(err)) {
        setError(err.message);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadSample = () => {
    // Carriers that work with TrackingUrl left blank, spelled exactly as the
    // server expects. Keep in sync with the union of shopifyTrackingCompanies
    // and trackingUrlOverrides in the server config.
    const carriers = [
      "Amazon Logistics UK",
      "Amazon Logistics US",
      "Bluedart",
      "Delhivery",
      "DHL eCommerce",
      "DHL Express",
      "DTDC",
      "Ecom Express",
      "Ekart",
      "FedEx",
      "Gati KWE",
      "India Post",
      "Professional Couriers",
      "Sendle",
      "Shadowfax",
      "SHREE NANDAN COURIER",
      "TNT",
      "Trackon",
      "UPS",
      "USPS",
      "XpressBees",
    ];

    const workbook = XLSX.utils.book_new();

    const ordersSheet = XLSX.utils.aoa_to_sheet([
      ["OrderNumber", "TrackingNumber", "TrackingCompany", "TrackingUrl"],
      ["#1025", "RX123456789IN", "India Post", ""],
      ["#1026", "BD987654321IN", "Bluedart", ""],
      ["#1027", "DL123456789IN", "Delhivery", ""],
      ["#1028", "DT123456789IN", "DTDC", ""],
      ["#1029", "EE123456789IN", "Ecom Express", ""],
      ["#1030", "EK123456789IN", "Ekart", ""],
      ["#1031", "XB123456789IN", "XpressBees", ""],
      ["#1032", "SF123456789IN", "Shadowfax", ""],
      ["#1033", "FX123456789IN", "FedEx", ""],
      ["#1034", "DH123456789IN", "DHL Express", ""],
      ["#1035", "TC123456789IN", "Trackon", ""],
      // Only a carrier not on the Carriers sheet needs its own link. Naming the
      // carrier is better than "Other" — this name is what the customer sees.
      [
        "#1036",
        "SR987654321IN",
        "Shiprocket",
        "https://shiprocket.co/tracking/SR987654321IN",
      ],
      // Same base link on every row — the app appends each row's own number
      ["#1037", "JCW90000000001", "Other", "https://jcwexpress.com/tracking?codes="],
      ["#1038", "JCW90000000002", "Other", "https://jcwexpress.com/tracking?codes="],
      // Or mark the spot when the number is not at the end of the link
      ["#1039", "GK123456789IN", "Other", "https://mycourier.com/track/{tracking}/details"],
    ]);

    ordersSheet["!cols"] = [
      { wch: 15 }, // OrderNumber
      { wch: 22 }, // TrackingNumber
      { wch: 18 }, // TrackingCompany
      { wch: 45 }, // TrackingUrl
    ];

    XLSX.utils.book_append_sheet(workbook, ordersSheet, "Orders");

    // The community build of SheetJS cannot write data validations, so an
    // in-cell dropdown is not possible here. A reference sheet of valid
    // carrier names is the working substitute.
    const carriersSheet = XLSX.utils.aoa_to_sheet([
      ["Carriers that need no TrackingUrl"],
      [
        "Copy a name into TrackingCompany exactly as written here and leave TrackingUrl blank. The app works out the tracking link for you.",
      ],
      [
        "For most of these, Shopify itself selects the carrier and reports delivery status — the same as picking it from the dropdown on an order.",
      ],
      [""],
      ...carriers.map((name) => [name]),
      [""],
      ["Any other carrier"],
      [
        "Type its real name in TrackingCompany, and put the carrier's base tracking link in TrackingUrl — the app appends each row's tracking number.",
      ],
      [
        "These rows are fulfilled with your link, but Shopify cannot report delivery status for them.",
      ],
    ]);

    carriersSheet["!cols"] = [{ wch: 70 }];

    XLSX.utils.book_append_sheet(workbook, carriersSheet, "Carriers");

    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ["How to fill the Orders sheet"],
      [""],
      ["Column", "Required?", "Notes"],
      [
        "OrderNumber",
        "Yes",
        "Order name as shown in Shopify, e.g. #1025 or V-304797",
      ],
      ["TrackingNumber", "Yes", "AWB / consignment number"],
      [
        "TrackingCompany",
        "No",
        "Use a name from the Carriers sheet. Leave blank to use India Post.",
      ],
      [
        "TrackingUrl",
        "Sometimes",
        "Required when the carrier is not on the Carriers sheet.",
      ],
      [""],
      ["Using a carrier that is not on the Carriers sheet"],
      [
        "1.",
        "Type the carrier's real name in TrackingCompany — this name is shown to the customer in the shipping email.",
      ],
      [
        "2.",
        "Easiest way: put the carrier's base link — the part before the tracking number — in TrackingUrl and copy the same value down the whole column.",
      ],
      [
        "",
        "The app appends each row's own tracking number, so one link covers every row.",
      ],
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
      [
        "•",
        "If you do fill TrackingUrl, your link is always used instead.",
      ],
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
    ]);

    instructionsSheet["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 80 }];

    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const blob = new Blob([excelBuffer], {
      type: "application/octet-stream",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sample_bulk_fulfillment.xlsx";
    link.click();
  };

  const handleDownloadReport = async () => {
    try {
      const res = await safeFetchBlob("/api/orders/fulfillment-report/download");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `fulfillment_report.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert(err.message || "Download failed");
    }
  };

  
  const renderImportSummary = () => {
    if (!result) return null;

    const total = result.length;
    const success = result.filter((r) => !r.error).length;
    const failed = total - success;
    const status = failed > 0 ? "Failed" : "Fulfilled successfully";
    const statusTone = failed > 0 ? "warning" : "success";

    return (
      <Layout.Section>
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: failed > 0 ? "#ffea8a" : "#bfedc1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {failed > 0 ? (
                  <span style={{ color: "#9f6b08", fontSize: "14px" }}>!</span>
                ) : (
                  <span style={{ color: "#10782e", fontSize: "14px" }}>✓</span>
                )}
              </div>
              <span>Import Summary</span>
            </div>
          }
        >
          <div style={{ padding: "16px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                marginBottom: "16px",
              }}
            >
              <div style={summaryCardStyle}>
                <Text variant="bodySm" color="subdued">
                  Total Orders
                </Text>
                <Text variant="headingXl" as="h3">
                  {total}
                </Text>
              </div>
              <div style={summaryCardStyle}>
                <Text variant="bodySm" color="subdued">
                  Successful
                </Text>
                <Text variant="headingXl" as="h3" color="success">
                  {success}
                  {total > 0 && (
                    <span
                      style={{
                        fontSize: "14px",
                        marginLeft: "8px",
                        color: "#6d7175",
                      }}
                    ></span>
                  )}
                </Text>
              </div>
              <div style={summaryCardStyle}>
                <Text variant="bodySm" color="subdued">
                  Failed
                </Text>
                <Text
                  variant="headingXl"
                  as="h3"
                  color={failed > 0 ? "critical" : "success"}
                >
                  {failed}
                  {total > 0 && (
                    <span
                      style={{
                        fontSize: "14px",
                        marginLeft: "8px",
                        color: failed > 0 ? "#d82c0d" : "#6d7175",
                      }}
                    ></span>
                  )}
                </Text>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
                padding: "16px",
                marginTop: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div>
                  <Text variant="bodySm" color="subdued">
                    Status
                  </Text>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginTop: "4px",
                    }}
                  >
                    <Badge status={statusTone} />
                    <Text variant="bodyMd" fontWeight="medium">
                      {status}
                    </Text>
                  </div>
                </div>
                <div>
                  <Text variant="bodySm" color="subdued">
                    Date
                  </Text>
                  <Text variant="bodyMd" fontWeight="medium">
                    {new Date().toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </div>
                <div>
                  <Text variant="bodySm" color="subdued">
                    Source
                  </Text>
                  <Text variant="bodyMd" fontWeight="medium">
                    Epic Fulfill
                  </Text>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </Layout.Section>
    );
  };

  const summaryCardStyle = {
    backgroundColor: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: "8px",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
  };

  const renderDetailedResults = () => {
    if (!result) return null;

    // Calculate pagination
    const totalItems = result.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = result.slice(startIndex, startIndex + itemsPerPage);

    const handlePageChange = (newPage) => {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
      <Layout.Section>
        <Card
          title={
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
              }}
            >
              <span>Detailed Order Report</span>
              <Button onClick={handleDownloadReport} size="slim">
                Download Full Report
              </Button>
            </div>
          }
          sectioned
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      borderBottom: "1px solid #e1e3e5",
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      borderBottom: "1px solid #e1e3e5",
                    }}
                  >
                    Order #
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      borderBottom: "1px solid #e1e3e5",
                    }}
                  >
                    Tracking #
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      borderBottom: "1px solid #e1e3e5",
                    }}
                  >
                    Company
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      borderBottom: "1px solid #e1e3e5",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      borderBottom: "1px solid #e1e3e5",
                    }}
                  >
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((r, index) => {
                  const itemNumber = startIndex + index + 1;
                  return (
                    <tr
                      key={itemNumber}
                      style={{
                        borderBottom: "1px solid #f4f6f8",
                        backgroundColor:
                          index % 2 === 0 ? "#ffffff" : "#f9fafb",
                        transition: "background-color 0.2s ease",
                      }}
                    >
                      <td style={{ padding: "12px", color: "#6d7175" }}>
                        {itemNumber}
                      </td>
                      <td style={{ padding: "12px" }}>{r.orderNumber}</td>
                      <td style={{ padding: "12px" }}>
                        {r.trackingUrl ? (
                          <a
                            href={r.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {r.trackingNumber || "-"}
                          </a>
                        ) : (
                          r.trackingNumber || "-"
                        )}
                      </td>
                      <td style={{ padding: "12px" }}>
                        {r.trackingCompany || "-"}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Badge
                          status={
                            r.error
                              ? "critical"
                              : r.warning
                              ? "attention"
                              : "success"
                          }
                        >
                          {r.error ? "Failed" : r.warning ? "Warning" : "Success"}
                        </Badge>
                      </td>
                      <td style={{ padding: "12px" }}>
                        {/* `tone` and "caution" are Polaris 12+ spellings and do
                            nothing on Polaris 10 — this text was rendering with no
                            colour at all. The v10 prop is `color`, and its warning
                            value is "warning". */}
                        <Text
                          as="span"
                          color={
                            r.error
                              ? "critical"
                              : r.warning
                              ? "warning"
                              : "success"
                          }
                          variant="bodySm"
                        >
                          {r.error || r.warning || "Fulfilled successfully"}
                        </Text>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Box paddingBlockStart="4">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "16px",
              }}
            >
              <Text variant="bodySm" color="subdued">
                Showing {startIndex + 1} to{" "}
                {Math.min(startIndex + itemsPerPage, totalItems)} of{" "}
                {totalItems} orders
              </Text>

              {totalPages > 1 && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    size="slim"
                  >
                    «
                  </Button>
                  <Button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    size="slim"
                  >
                    ‹
                  </Button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // Show pages around current page
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        primary={currentPage === pageNum}
                        size="slim"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}

                  <Button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    size="slim"
                  >
                    ›
                  </Button>
                  <Button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    size="slim"
                  >
                    »
                  </Button>
                </div>
              )}
            </div>
          </Box>
        </Card>
      </Layout.Section>
    );
  };

  return (
    <Page fullWidth>
      <TitleBar title="Epic Fulfill: Bulk Orders" />

      <Layout>
        {blockedByBilling && (
          <Layout.Section>
            <Banner
              title="An active plan is required"
              status="warning"
              action={{
                content: "Choose a plan",
                onAction: () => openPricingPage(billing.pricingUrl),
              }}
              secondaryAction={{
                content: "View plan details",
                onAction: () => navigate("/plan"),
              }}
            >
              <p>
                Bulk fulfillment needs an active subscription. Choosing a plan
                starts your free trial, and you can cancel from your Shopify
                admin at any time.
              </p>
              <p>
                Reports from your previous runs stay available below without a
                plan.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {trialEndingSoon && (
          <Layout.Section>
            {/* Informational, not a warning: the trial converts to the paid plan on
                its own and nothing stops working. The reason to say anything at all
                is the upcoming charge — a merchant should never be surprised by it. */}
            <Banner
              status="info"
              action={{
                content: "View plan details",
                onAction: () => navigate("/plan"),
              }}
            >
              <p>
                {trialDays === 1
                  ? "Your free trial ends today."
                  : `Your free trial ends in ${trialDays} days.`}{" "}
                {trialPrice
                  ? `Your plan then continues at ${trialPrice}.`
                  : "Your plan then continues as normal."}
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card title="Bulk Fulfill Orders via Excel" sectioned>
            <DropZone
              accept=".xlsx, .xls, .csv"
              type="file"
              onDrop={handleDropZoneDrop}
            >
              <div style={{ padding: "16px", textAlign: "center" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    backgroundColor: "#f4f6f8",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 0px",
                  }}
                >
                  <span style={{ fontSize: "24px" }}>📤</span>
                </div>
                <DropZone.FileUpload />
              </div>
              {file && (
                <Stack vertical spacing="tight" alignment="center">
                  <Text variant="bodyMd" fontWeight="medium">
                    {file.name}
                  </Text>
                </Stack>
              )}
            </DropZone>

            {error && (
              <Banner
                title="Upload failed"
                status="critical"
                onDismiss={() => setError(null)}
              >
                <p>{error}</p>
              </Banner>
            )}

            <Box paddingBlockStart="4">
              <Checkbox
                label="Send shipping notification to customers"
                helpText="Off by default. Notification emails cannot be undone, so check this only when the tracking numbers in your sheet are final."
                checked={notifyCustomer}
                onChange={setNotifyCustomer}
                disabled={uploading}
              />
            </Box>

            <Box paddingBlockStart="4">
              <Stack alignment="center" distribution="start" spacing="tight">
                <Button
                  primary
                  onClick={handleUpload}
                  loading={uploading}
                  disabled={!file || uploading || blockedByBilling}
                >
                  {uploading ? "Uploading..." : "Upload and Fulfill Orders"}
                </Button>

                {/* Left enabled without a plan on purpose — a merchant deciding
                    whether to subscribe should be able to see the file format
                    the app expects first. */}
                <Button onClick={handleDownloadSample}>
                  Download Sample Excel
                </Button>
              </Stack>
            </Box>
          </Card>
        </Layout.Section>

        {uploading && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <Spinner accessibilityLabel="Uploading file" size="large" />
              <div style={{ marginTop: "16px" }}>
                <Text variant="bodyMd" as="p">
                  Processing your file...
                </Text>
              </div>
            </div>
          </div>
        )}

        {renderImportSummary()}
        {renderDetailedResults()}
      </Layout>
    </Page>
  );
}
