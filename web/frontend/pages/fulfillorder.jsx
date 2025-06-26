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
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sample");

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
    const status = failed > 0 ? "Failed" : "Success";

    return (
      <Layout.Section>
        <Card title="Import Summary">
          <Box padding="4">
            <HorizontalGrid
              columns={{ xs: 1, sm: 6 }}
              gap="4"
              alignItems="center"
              borderColor="border"
              borderRadius="base"
              background="bg-surface"
            >
              <Text fontWeight="semibold">Date</Text>
              <Text fontWeight="semibold">Import Source</Text>
              <Text fontWeight="semibold">Total Upload</Text>
              <Text fontWeight="semibold">Successful</Text>
              <Text fontWeight="semibold">Failed</Text>
              <Text fontWeight="semibold">Status</Text>

              <Text>{new Date().toLocaleDateString("en-GB")}</Text>
              <Text>Epic Fulfill</Text>
              <Text>{total}</Text>
              <Text>{success}</Text>
              <Text>{failed}</Text>
              <Text>
                <Badge tone={failed > 0 ? "critical" : "success"}>
                  {status}
                </Badge>
              </Text>
            </HorizontalGrid>
          </Box>
        </Card>
      </Layout.Section>
    );
  };

  const renderDetailedResults = () => {
    if (!result) return null;

    return (
      <Layout.Section>
        <Card title="Detailed Order Report" sectioned>
          <HorizontalGrid
            columns={{ xs: 1, sm: 5 }}
            gap="4"
            borderColor="border"
            borderRadius="base"
            background="bg-surface"
          >
            <Text fontWeight="semibold">Order Number</Text>
            <Text fontWeight="semibold">Tracking Number</Text>
            <Text fontWeight="semibold">Tracking Company</Text>
            <Text fontWeight="semibold">Status</Text>
            <Text fontWeight="semibold">Reason</Text>

            {result.map((r, index) => (
              <React.Fragment key={index}>
                <Text>{r.orderNumber}</Text>
                <Text>{r.trackingNumber || "-"}</Text>
                <Text>{r.trackingCompany || "-"}</Text>
                <Text tone={r.error ? "critical" : "success"}>
                  {r.error ? "Failed" : "Success"}
                </Text>
                <Text>{r.error || "Fulfilled successfully"}</Text>
              </React.Fragment>
            ))}
          </HorizontalGrid>

          <Box paddingBlockStart="4">
            <Button onClick={handleDownloadReport}>
              Download Report Excel
            </Button>
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
              <DropZone.FileUpload />
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
          <Layout.Section>
            <Card sectioned>
              <Spinner accessibilityLabel="Uploading" size="large" />
            </Card>
          </Layout.Section>
        )}

        {renderImportSummary()}
        {renderDetailedResults()}
      </Layout>
    </Page>
  );
}
