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
  HorizontalGrid,
  Box,
  Spinner,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import * as XLSX from "xlsx";

export default function FulfillOrder() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

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

    try {
      const res = await fetch("/api/orders/bulk-fulfill", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Bulk fulfillment failed");
      }

      setResult(data.summary);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadSample = () => {
    const sampleData = [
      {
        OrderNumber: "#1025",
        TrackingNumber: "RX123456789IN",
        TrackingCompany: "India Post",
        TrackingUrl: ""
      },
      {
        OrderNumber: "#1026",
        TrackingNumber: "EX987654321IN",
        TrackingCompany: "BlueDart",
        TrackingUrl: "https://www.bluedart.com/tracking?ref=EX987654321IN"
      },
      {
        OrderNumber: "1027",
        TrackingNumber: "CP123456789IN",
        TrackingCompany: "Delhivery",
        TrackingUrl: ""
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    
    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 15 }, // OrderNumber
      { wch: 20 }, // TrackingNumber
      { wch: 15 }, // TrackingCompany
      { wch: 50 }  // TrackingUrl
    ];
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

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
      const res = await fetch("/api/orders/fulfillment-report/download");

      if (!res.ok) {
        throw new Error("Failed to download report");
      }

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
                        {r.trackingNumber || "-"}
                      </td>
                      <td style={{ padding: "12px" }}>
                        {r.trackingCompany || "-"}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Badge status={r.error ? "critical" : "success"}>
                          {r.error ? "Failed" : "Success"}
                        </Badge>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Text
                          tone={r.error ? "critical" : "success"}
                          variant="bodySm"
                        >
                          {r.error || "Fulfilled successfully"}
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
              <Stack alignment="center" distribution="start" spacing="tight">
                <Button
                  primary
                  onClick={handleUpload}
                  loading={uploading}
                  disabled={!file || uploading}
                >
                  {uploading ? "Uploading..." : "Upload and Fulfill Orders"}
                </Button>

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
