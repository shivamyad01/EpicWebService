import React, { useEffect, useRef, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  Banner,
  DropZone,
  Box,
  Spinner,
  Badge,
  Checkbox,
  Icon,
  IndexTable,
  Pagination,
  Link,
  SkeletonBodyText,
  SkeletonDisplayText,
  ProgressBar,
} from "@shopify/polaris";
import { FileIcon, UploadIcon, XIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";
import { safeFetchJson, safeFetchBlob } from "../utils/api.js";
import { downloadSampleWorkbook } from "../utils/download.js";
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

// Mirrors config.upload on the server. Checking here too turns a wasted upload and
// a 400 into an instant message next to the file the merchant just picked.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

// Two things Polaris cannot express on its own: the indeterminate sweep, and the
// entrance of the panel that replaces the drop zone. ProgressBar is determinate,
// and there is no honest percentage to show — the upload itself is milliseconds
// and the wait is Shopify fulfilling each row, which reports nothing back until
// it is done. A sweeping bar and a real elapsed clock say "working" without
// inventing a number. Colors come from Polaris custom properties so the panel
// still follows the merchant's theme.
const UPLOAD_STYLES = `
.ef-zone-swap { animation: ef-zone-in 180ms ease-out both; }
@keyframes ef-zone-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

.ef-file-row { display: flex; align-items: center; gap: var(--p-space-300); }
.ef-file-row__meta { flex: 1 1 auto; min-width: 0; }

.ef-progress {
  position: relative;
  overflow: hidden;
  block-size: var(--p-space-150);
  border-radius: var(--p-border-radius-full);
  background-color: var(--p-color-bg-fill-tertiary);
}
.ef-progress::after {
  content: "";
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 38%;
  border-radius: inherit;
  background-color: var(--p-color-bg-fill-brand);
  animation: ef-progress-sweep 1.25s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes ef-progress-sweep {
  from { transform: translateX(-105%); }
  to { transform: translateX(305%); }
}

@media (prefers-reduced-motion: reduce) {
  .ef-zone-swap { animation: none; }
  .ef-progress::after { inline-size: 100%; opacity: 0.6; animation: none; }
}
`;

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

const formatElapsed = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function FulfillOrder() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Off until the shop's saved preference arrives, and off again if it never does.
  // Shipping emails cannot be unsent, so every failure mode here has to land on
  // "don't send" — including a settings request that errors.
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [touchedNotify, setTouchedNotify] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // When the run on screen finished. Held in state rather than read from the clock
  // at render time, so a report restored from a previous run is dated when it
  // actually ran instead of being stamped with the moment you happened to look.
  const [completedAt, setCompletedAt] = useState(null);
  const [restored, setRestored] = useState(false);
  // True until the last run's report has been asked for and answered. Without it the
  // page rendered with nothing where the report goes and then popped the whole card
  // in once the request landed, which reads as the app being slow rather than as
  // something arriving.
  const [restoring, setRestoring] = useState(true);
  // A run this tab did not start: one left going when the app was closed, or started
  // in another tab. Kept apart from `uploading`, which is this tab's own upload.
  const [backgroundRun, setBackgroundRun] = useState(null);
  // Set when the last run was killed by a restart, so a report that stops partway is
  // not presented as a finished one.
  const [interrupted, setInterrupted] = useState(null);
  // Set the instant an upload begins, so a slow restore cannot land on top of a
  // fresher report. Same reasoning as `touchedNotify` below.
  const runStarted = useRef(false);
  // Read by the poller, which must not resubscribe on every tick.
  const wasRunning = useRef(false);
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

  // Seed the checkbox from the shop's saved default. Guarded on `touchedNotify`
  // so a slow response cannot reach back and flip a box the merchant has already
  // set — with an irreversible action that is the one race worth spending a flag on.
  useEffect(() => {
    let cancelled = false;

    safeFetchJson("/api/settings")
      .then((settings) => {
        if (!cancelled && !touchedNotify) setNotifyCustomer(Boolean(settings.notifyCustomers));
      })
      .catch(() => {
        // Leave it off. A default nobody can read is not worth guessing at.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bring back the last run's report.
  //
  // The paywall banner and the Plan page both tell merchants their previous
  // reports "stay available", and the server has kept them on disk all along — but
  // nothing here ever asked for them, so the report vanished on the first reload
  // and the promise was false for anyone whose plan had lapsed. This endpoint is
  // deliberately outside the subscription gate for exactly that reason.
  useEffect(() => {
    let cancelled = false;

    safeFetchJson("/api/orders/fulfillment-report")
      .then(({ report, savedAt }) => {
        // An upload that started while this was in flight owns the screen.
        if (cancelled || runStarted.current || !report?.length) return;

        setResult(report);
        setCompletedAt(savedAt || null);
        setRestored(true);
      })
      .catch(() => {
        // A 404 here is the normal state for a shop that has never run an upload.
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Watch what the shop's fulfillment is actually doing.
  //
  // A run keeps going after the app is closed, so on open the shop may already be
  // mid-run — the page has to say so rather than show the previous report as if
  // nothing were happening. When the run ends, pull in the report it produced.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const loadReport = async () => {
      const { report, savedAt } = await safeFetchJson("/api/orders/fulfillment-report");
      if (cancelled || !report?.length) return;
      setResult(report);
      setCompletedAt(savedAt || null);
      setRestored(true);
    };

    const poll = async () => {
      try {
        const state = await safeFetchJson("/api/orders/fulfillment-progress");
        if (cancelled) return;

        if (state.running) {
          wasRunning.current = true;
          setBackgroundRun(state);
          setInterrupted(null);
          // 2s: the count visibly moves without the polling costing anything.
          timer = setTimeout(poll, 2000);
          return;
        }

        setBackgroundRun(null);
        setInterrupted(state.interrupted ? state : null);

        // It was running while this tab watched, and now it is not — the report it
        // just wrote is the one to show.
        if (wasRunning.current) {
          wasRunning.current = false;
          await loadReport();
        }
      } catch {
        // Progress is a nicety. A failed check must not take the page down with it.
        if (!cancelled) setBackgroundRun(null);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // A run over a few hundred rows takes long enough that a static "processing"
  // message starts to read like a hang. A counting clock is the one piece of real
  // progress information available here, so it is the one thing shown.
  useEffect(() => {
    if (!uploading) return undefined;

    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [uploading]);

  const handleDropZoneDrop = (_dropFiles, acceptedFiles, rejectedFiles) => {
    const [accepted] = acceptedFiles;

    if (!accepted) {
      // Polaris' own rejection overlay disappears the moment the drag ends, which
      // leaves a merchant who dropped a PDF with no idea why nothing happened.
      if (rejectedFiles?.length) {
        setError(
          `"${rejectedFiles[0].name}" is not a spreadsheet. Upload a ${ACCEPTED_EXTENSIONS.join(
            ", "
          )} file.`
        );
      }
      return;
    }

    if (accepted.size > MAX_FILE_BYTES) {
      setError(
        `"${accepted.name}" is ${formatFileSize(accepted.size)}. The upload limit is ${
          MAX_FILE_BYTES / (1024 * 1024)
        } MB.`
      );
      return;
    }

    setError(null);
    setFile(accepted);
  };

  const handleRemoveFile = () => {
    setFile(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    runStarted.current = true;
    // An upload owns the screen from here; a restore that has not landed yet must
    // not leave a placeholder sitting under the run in progress.
    setRestoring(false);
    setInterrupted(null);
    setUploading(true);
    setError(null);
    setResult(null);
    setRestored(false);
    setCompletedAt(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("notifyCustomer", String(notifyCustomer));

    try {
      const data = await safeFetchJson("/api/orders/bulk-fulfill", {
        method: "POST",
        body: formData,
      });

      setResult(data.summary);
      setCompletedAt(new Date().toISOString());
      // A new run is a new report. Without this a merchant left on page 3 of the
      // last one lands on an empty table when the new run has fewer rows.
      setCurrentPage(1);
      setFile(null);
    } catch (err) {
      // 409 means this shop already has a run going — almost always one the merchant
      // left running when they closed the app. That is progress to show, not an
      // error; the poller takes it from here.
      if (err.status === 409 && err.data?.progress) {
        setBackgroundRun({ running: true, ...err.data.progress });
        wasRunning.current = true;
        setError(null);
      } else if (!billing.applySubscriptionError(err)) {
        // A plan can lapse between page load and upload. The gate's 402 turns into
        // the paywall banner rather than a raw error the merchant cannot act on.
        setError(err.message);
      }
    } finally {
      setUploading(false);
    }
  };

  // Shared with the home page, which offers the same sample — see
  // utils/download.js for why the workbook is built server-side.
  const handleDownloadSample = async () => {
    try {
      await downloadSampleWorkbook();
    } catch (err) {
      setError(err.message || "Could not download the sample file");
    }
  };

  const handleDownloadReport = async ({ failedOnly = false } = {}) => {
    try {
      const res = await safeFetchBlob(
        `/api/orders/fulfillment-report/download${failedOnly ? "?status=failed" : ""}`
      );

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        failedOnly ? "failed_fulfillments.xlsx" : "fulfillment_report.xlsx"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      // The object URL pins the blob in memory until it is revoked, and a
      // merchant working through a bad sheet downloads this more than once.
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || "Download failed");
    }
  };

  
  /**
   * Holds the space the last run's report is about to fill.
   *
   * Shaped like the summary card — a heading line and a row of three tiles — so the
   * real card replaces it without the page jumping. A merchant who has never run an
   * upload sees this for one round trip and then nothing, which is the accepted
   * trade: the common case is a returning merchant who does have a report, and for
   * them an empty page that later pops a card in reads as a stall.
   */
  const renderRestoringSummary = () => (
    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <SkeletonDisplayText size="small" />
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            {[0, 1, 2].map((i) => (
              <Card key={i} background="bg-surface-secondary">
                <BlockStack gap="200">
                  <SkeletonBodyText lines={1} />
                  <SkeletonDisplayText size="medium" />
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </BlockStack>
      </Card>
    </Layout.Section>
  );

  /**
   * A run going without this tab driving it.
   *
   * The merchant closed the app mid-upload, or started one elsewhere. Either way the
   * server is still working through the sheet, so show how far it has got and say
   * plainly that leaving is safe — that is the whole point of the feature, and a
   * merchant who does not know it will sit and watch the tab instead.
   */
  const renderBackgroundRun = () => {
    if (!backgroundRun) return null;

    const { processed = 0, total = 0 } = backgroundRun;
    const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    return (
      <Layout.Section>
        <Card>
          <BlockStack gap="300">
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <Spinner accessibilityLabel="Fulfilling your orders" size="small" />
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">
                  Fulfilling your orders…
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {processed} of {total} rows done. This keeps running if you close
                  the app — the report will be here when you come back.
                </Text>
              </BlockStack>
            </InlineStack>

            {/* Determinate, unlike the upload panel: the server reports a real row
                count, so there is an honest percentage to show. */}
            <ProgressBar progress={pct} size="small" tone="primary" />
          </BlockStack>
        </Card>
      </Layout.Section>
    );
  };

  /**
   * The last run was killed by a restart.
   *
   * The report below it is real but stops partway, so it has to be labelled — a
   * merchant reading "25 fulfilled" for a sheet of 46 would otherwise believe the
   * other 21 were considered and found fine.
   */
  const renderInterrupted = () => {
    if (!interrupted || backgroundRun) return null;

    const { processed = 0, total = 0 } = interrupted;
    const remaining = Math.max(0, total - processed);

    return (
      <Layout.Section>
        <Banner
          title="Your last run was interrupted"
          tone="warning"
          onDismiss={() => setInterrupted(null)}
        >
          <p>
            The app restarted while it was working. {processed} of {total} rows were
            fulfilled and are in the report below.
            {remaining > 0
              ? ` The remaining ${remaining} were not attempted — upload those rows again.`
              : ""}
          </p>
        </Banner>
      </Layout.Section>
    );
  };

  const renderImportSummary = () => {
    if (!result) return null;

    const total = result.length;
    const success = result.filter((r) => !r.error).length;
    const failed = total - success;

    // A run where 38 of 46 orders shipped is not "Failed". Calling it that was
    // alarming and untrue \u2014 the merchant's actual question is how much got through,
    // and the three tiles below answer it, so this only has to name the shape of the
    // outcome. All three cases are spelled out rather than reduced to pass/fail.
    const outcome =
      failed === 0
        ? { label: "All fulfilled", tone: "success" }
        : success === 0
        ? { label: "Nothing fulfilled", tone: "critical" }
        : { label: `${success} of ${total} fulfilled`, tone: "attention" };

    return (
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            {/* The outcome as a real badge beside the title, which is also where the
                empty <Badge tone="warning" /> used to sit further down the card \u2014
                a Badge with no children renders as a stray coloured pill, which is
                the orange dash that appeared next to "Status". */}
            <InlineStack align="space-between" blockAlign="center" gap="200">
              <Text as="h2" variant="headingMd">
                {restored ? "Your last run" : "Import summary"}
              </Text>
              <Badge tone={outcome.tone}>{outcome.label}</Badge>
            </InlineStack>

            {/* Said plainly, because the numbers below are identical either way and
                a merchant returning to this page should not read a finished run as
                one that just happened. */}
            {restored && (
              <Text as="p" variant="bodySm" tone="subdued">
                Restored from your previous upload. Uploading a new sheet replaces
                it.
              </Text>
            )}

            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
              <Card background="bg-surface-secondary">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total orders
                  </Text>
                  <Text variant="headingXl" as="p">
                    {total}
                  </Text>
                </BlockStack>
              </Card>
              <Card background="bg-surface-secondary">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Successful
                  </Text>
                  <Text variant="headingXl" as="p" tone="success">
                    {success}
                  </Text>
                </BlockStack>
              </Card>
              <Card background="bg-surface-secondary">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Failed
                  </Text>
                  <Text
                    variant="headingXl"
                    as="p"
                    tone={failed > 0 ? "critical" : "success"}
                  >
                    {failed}
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* Two columns now, not three: Status moved up to the badge beside the
                title, and repeating it here was the only thing that cell held. */}
            <Box background="bg-surface-secondary" borderRadius="200" padding="400">
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {restored ? "Last run" : "Date"}
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    {/* An em dash when a restored report has no timestamp: the
                        summary is kept in memory as well as on disk, so a failed
                        write leaves rows to show and no date to show them under. */}
                    {completedAt
                      ? new Date(completedAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Source
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    Epic Fulfill
                  </Text>
                </BlockStack>
              </InlineGrid>
            </Box>
          </BlockStack>
        </Card>
      </Layout.Section>
    );
  };

  const renderDetailedResults = () => {
    if (!result) return null;

    // Calculate pagination
    const totalItems = result.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = result.slice(startIndex, startIndex + itemsPerPage);
    // Matches what the server filters on: a warning row was still fulfilled, so
    // it does not belong in a sheet meant to be fixed and re-uploaded.
    const failedCount = result.filter((r) => r.error).length;

    const handlePageChange = (newPage) => {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center" gap="200">
              <Text as="h2" variant="headingMd">
                Detailed order report
              </Text>
              <InlineStack gap="200" blockAlign="center">
                {/* Only offered when there is something in it. The failed sheet
                    is the one a merchant actually works from — correct the rows,
                    re-upload it — so it carries its count and sits next to the
                    full report rather than replacing it. */}
                {failedCount > 0 && (
                  <Button
                    onClick={() => handleDownloadReport({ failedOnly: true })}
                    size="slim"
                  >
                    Download Failed Only ({failedCount})
                  </Button>
                )}
                <Button onClick={() => handleDownloadReport()} size="slim">
                  Download Full Report
                </Button>
              </InlineStack>
            </InlineStack>

            {/* IndexTable rather than a hand-built <table>: it brings the admin's
                own row, header and responsive behaviour, and it reads the theme
                instead of the hardcoded greys this used to paint itself with. */}
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={paginatedItems.length}
              selectable={false}
              headings={[
                { title: "#" },
                { title: "Order #" },
                { title: "Tracking #" },
                { title: "Shipping carrier" },
                { title: "Status" },
                { title: "Details" },
              ]}
            >
              {paginatedItems.map((r, index) => {
                const itemNumber = startIndex + index + 1;
                // Badge and Text do not share a tone vocabulary: Badge has
                // "attention", Text has "caution", and neither has the other's.
                // "warning" is valid on Badge but not on Text — passing it emitted a
                // class that does not exist, so the details on a warning row lost
                // their colour silently.
                const badgeTone = r.error
                  ? "critical"
                  : r.warning
                  ? "attention"
                  : "success";
                const textTone = r.error
                  ? "critical"
                  : r.warning
                  ? "caution"
                  : "success";

                return (
                  <IndexTable.Row
                    id={String(itemNumber)}
                    key={itemNumber}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued">
                        {itemNumber}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">
                        {r.orderNumber}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {r.trackingUrl ? (
                        <Link url={r.trackingUrl} target="_blank">
                          {r.trackingNumber || "-"}
                        </Link>
                      ) : (
                        <Text as="span">{r.trackingNumber || "-"}</Text>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{r.trackingCompany || "-"}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={badgeTone}>
                        {r.error
                          ? "Failed"
                          : r.warning
                          ? "Warning"
                          : "Success"}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone={textTone} variant="bodySm">
                        {r.error || r.warning || "Fulfilled successfully"}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>

            <InlineStack align="space-between" blockAlign="center" gap="400">
              <Text as="p" variant="bodySm" tone="subdued">
                Showing {startIndex + 1} to{" "}
                {Math.min(startIndex + itemsPerPage, totalItems)} of{" "}
                {totalItems} orders
              </Text>

              {totalPages > 1 && (
                <Pagination
                  hasPrevious={currentPage > 1}
                  onPrevious={() => handlePageChange(currentPage - 1)}
                  hasNext={currentPage < totalPages}
                  onNext={() => handlePageChange(currentPage + 1)}
                  label={`Page ${currentPage} of ${totalPages}`}
                />
              )}
            </InlineStack>
          </BlockStack>
        </Card>
      </Layout.Section>
    );
  };

  return (
    <Page fullWidth>
      {/* Same name as the nav item and the card heading below. This screen used to
          answer to three different names depending on where you read it. */}
      <TitleBar title="Upload & fulfill" />
      <style>{UPLOAD_STYLES}</style>

      <Layout>
        {blockedByBilling && (
          <Layout.Section>
            <Banner
              title="An active plan is required"
              tone="warning"
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
              tone="info"
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
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Bulk Fulfill Orders via Excel
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Drop in a sheet of order numbers and tracking details — every
                  row is fulfilled in one run.
                </Text>
              </BlockStack>

              {/* The drop zone is swapped out entirely while a run is in flight
                  rather than covered by a scrim. A full-page overlay dimmed the
                  navigation and the plan banners too, for a wait that belongs to
                  one card, and it left the merchant with nothing to look at but
                  a spinner floating over greyed-out text. */}
              {uploading ? (
                <div className="ef-zone-swap">
                  <Box
                    background="bg-surface-secondary"
                    borderColor="border"
                    borderWidth="025"
                    borderRadius="300"
                    padding="400"
                  >
                    <BlockStack gap="300">
                      <div className="ef-file-row">
                        <Spinner
                          accessibilityLabel="Fulfilling your orders"
                          size="small"
                        />
                        <div className="ef-file-row__meta">
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              Fulfilling your orders…
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued" breakWord>
                              {file?.name
                                ? `${file.name} · ${formatElapsed(elapsedSeconds)} elapsed`
                                : `${formatElapsed(elapsedSeconds)} elapsed`}
                            </Text>
                          </BlockStack>
                        </div>
                      </div>

                      <div className="ef-progress" />

                      <Text as="p" variant="bodySm" tone="subdued">
                        Large sheets take a minute or two. Keep this tab open —
                        the full report appears here as soon as the run finishes.
                      </Text>
                    </BlockStack>
                  </Box>
                </div>
              ) : (
                <DropZone
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  type="file"
                  allowMultiple={false}
                  variableHeight
                  onDrop={handleDropZoneDrop}
                >
                  {file ? (
                    <div className="ef-zone-swap">
                      <Box padding="400">
                        <div className="ef-file-row">
                          <Box
                            background="bg-fill-success-secondary"
                            borderRadius="200"
                            padding="200"
                          >
                            <Icon source={FileIcon} tone="success" />
                          </Box>
                          <div className="ef-file-row__meta">
                            <BlockStack gap="050">
                              {/* breakWord, not truncate: a filename has no
                                  spaces to wrap on, and DropZone's container is
                                  a flex item with the default min-width:auto —
                                  one long name pushes the whole card wider than
                                  the viewport. It also keeps the tail visible,
                                  which is the half that says which version of
                                  the sheet this is. */}
                              <Text
                                as="p"
                                variant="bodyMd"
                                fontWeight="semibold"
                                breakWord
                              >
                                {file.name}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {formatFileSize(file.size)} · ready to fulfill
                              </Text>
                            </BlockStack>
                          </div>
                          {/* Every click inside a DropZone reopens the file
                              picker, so removing a file would immediately ask
                              for another one. */}
                          <div onClick={(event) => event.stopPropagation()}>
                            <Button
                              icon={XIcon}
                              variant="tertiary"
                              accessibilityLabel={`Remove ${file.name}`}
                              onClick={handleRemoveFile}
                            />
                          </div>
                        </div>
                      </Box>
                    </div>
                  ) : (
                    <Box padding="500">
                      <BlockStack gap="200" inlineAlign="center">
                        <Box
                          background="bg-fill-info-secondary"
                          borderRadius="full"
                          padding="300"
                        >
                          <Icon source={UploadIcon} tone="info" />
                        </Box>
                        <BlockStack gap="100" inlineAlign="center">
                          <Text as="p" variant="headingSm">
                            Drag and drop your file here
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {ACCEPTED_EXTENSIONS.join(", ")} up to{" "}
                            {MAX_FILE_BYTES / (1024 * 1024)} MB
                          </Text>
                        </BlockStack>
                        {/* A real button rather than relying on the zone being
                            clickable: DropZone's file input is visually hidden,
                            so without one there is nothing for a keyboard to
                            land on. No onClick needed — every click inside the
                            zone opens the picker. DropZone.FileUpload would do
                            the same, but it carries 32px of its own padding and
                            leaves the action floating away from the copy. */}
                        <Box paddingBlockStart="200">
                          <Button>Browse files</Button>
                        </Box>
                      </BlockStack>
                    </Box>
                  )}
                </DropZone>
              )}

              {error && (
                <Banner
                  title="Upload failed"
                  tone="critical"
                  onDismiss={() => setError(null)}
                >
                  <p>{error}</p>
                </Banner>
              )}

              <Checkbox
                label="Send shipping notification to customers"
                helpText="Off by default. Notification emails cannot be undone, so check this only when the tracking numbers in your sheet are final."
                checked={notifyCustomer}
                onChange={(value) => {
                  setTouchedNotify(true);
                  setNotifyCustomer(value);
                }}
                disabled={uploading}
              />

              <InlineStack blockAlign="center" align="start" gap="200">
                {/* No `loading` here on purpose: Polaris swaps the label out for
                    a spinner, and the panel above is already spinning. Keeping
                    the label readable says what is happening; a second spinner
                    only says something is. */}
                <Button
                  variant="primary"
                  onClick={handleUpload}
                  disabled={
                    !file || uploading || blockedByBilling || Boolean(backgroundRun)
                  }
                >
                  {uploading || backgroundRun
                    ? "Fulfilling…"
                    : "Upload and Fulfill Orders"}
                </Button>

                {/* Left enabled without a plan on purpose — a merchant deciding
                    whether to subscribe should be able to see the file format
                    the app expects first. */}
                <Button onClick={handleDownloadSample} disabled={uploading}>
                  Download Sample Excel
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {renderBackgroundRun()}
        {renderInterrupted()}
        {/* Only while the first request is still out and nothing has replaced it. */}
        {restoring && !result && !backgroundRun && renderRestoringSummary()}
        {renderImportSummary()}
        {renderDetailedResults()}
      </Layout>
    </Page>
  );
}
