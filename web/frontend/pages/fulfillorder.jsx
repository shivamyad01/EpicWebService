import React, { useState } from "react";
import {
  Card,
  Page,
  Layout,
  TextContainer,
  Text,
  Button,
  Stack,
  Banner,
  DropZone,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";

export default function FulfillOrder() {
  const { t } = useTranslation();
  const shopify = useAppBridge();

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
      shopify.toast.show(t("BulkFulfillmentCard.successToast"));
    } catch (err) {
      setError(err.message);
      shopify.toast.show(err.message, { isError: true });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadSample = () => {
    const sampleData = [
      {
        Name: "#1025",
        TrackingNumber: "RX123456789IN",
        TrackingCompany: "India Post",
        TrackingUrl: "",
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
      type: "application/octet-stream", // ✅ Broader MIME type
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sample_bulk_fulfillment.xlsx";
    link.click();
  };

  return (
    <Page fullWidth>
      <TitleBar title={t("PageName.title")} />

      <Layout>
          <Layout.Section>
          <Card
            title={t(
              "BulkFulfillmentCard.title",
              "Bulk Fulfill Orders via Spreadsheet"
            )}
            sectioned
            primaryFooterAction={{
              content: uploading
                ? t("BulkFulfillmentCard.uploading", "Uploading...")
                : t(
                    "BulkFulfillmentCard.uploadAndFulfillButton",
                    "Upload and Fulfill Orders"
                  ),
              onAction: handleUpload,
              loading: uploading,
              disabled: !file || uploading,
            }}
            secondaryFooterActions={[
              {
                content: t(
                  "BulkFulfillmentCard.downloadSampleButton",
                  "Download Sample Excel"
                ),
                onAction: handleDownloadSample,
                outline: true,
              },
            ]}
          >
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
                title={t("BulkFulfillmentCard.uploadFailed", "Upload failed")}
                status="critical"
                onDismiss={() => setError(null)}
              >
                <p>{error}</p>
              </Banner>
            )}

            {result && (
              <Banner
                title={t(
                  "BulkFulfillmentCard.results",
                  "Bulk Fulfillment Results"
                )}
                status="success"
                onDismiss={() => setResult(null)}
              >
                <ul>
                  {result.map((r, index) => (
                    <li key={index}>
                      {r.orderName}:{" "}
                      {r.error
                        ? `❌ ${r.error}`
                        : `✅ Fulfilled (ID: ${r.fulfillmentId})`}
                    </li>
                  ))}
                </ul>
              </Banner>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
