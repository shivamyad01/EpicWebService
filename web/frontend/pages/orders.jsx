import React, { useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  ChoiceList,
  EmptyState,
  IndexTable,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
  useIndexResourceState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";

import { safeFetchJson, safeFetchBlob } from "../utils/api.js";
import { notFoundImage } from "../assets";

/**
 * Orders waiting to be fulfilled.
 *
 * The step before an upload: see what is outstanding, then take a spreadsheet of
 * it with the order numbers already filled in. Typing order numbers by hand is
 * what produces most "Order not found" rows, and this page removes the typing.
 */

const today = () => new Date().toLocaleDateString("en-CA");

const shiftDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString("en-CA");
};

/**
 * The ranges merchants actually ask for. "Today" is the common one — what came
 * in today that has not gone out yet — so it is the default.
 */
const PRESETS = [
  { label: "Today", value: "today", range: () => [today(), today()] },
  { label: "Yesterday", value: "yesterday", range: () => [shiftDays(1), shiftDays(1)] },
  { label: "Last 7 days", value: "7", range: () => [shiftDays(6), today()] },
  { label: "Last 30 days", value: "30", range: () => [shiftDays(29), today()] },
  { label: "Custom range", value: "custom", range: null },
];

/** Whole days between an order and now, for the "waiting" column. */
const daysWaiting = (createdAt) =>
  Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));

/**
 * The three buckets, in the order a merchant thinks about them.
 */
const STATUS_TABS = [
  { label: "Still to fulfil", value: "unfulfilled" },
  { label: "Already fulfilled", value: "fulfilled" },
  { label: "All orders", value: "all" },
];

/**
 * ordersCount answers EXACT below a threshold and AT_LEAST above it, so a very
 * large range is shown as "1000+" rather than as a number that is quietly wrong.
 */
const formatCount = ({ count, exact }) => (exact ? String(count) : `${count}+`);

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function Orders() {
  const navigate = useNavigate();

  const [preset, setPreset] = useState(["today"]);
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  // Which bucket the table and the download are showing. The counts below cover
  // the whole range regardless, so switching this never needs another look-up
  // to know what else is there.
  const [status, setStatus] = useState("unfulfilled");

  const [counts, setCounts] = useState(null);
  const [orders, setOrders] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Polaris tracks the selection for us, keyed by the id on each row.
  const rows = orders || [];
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows.map((order) => ({ ...order, id: order.name })));

  const rangeParams = (which = status) => {
    const chosen = PRESETS.find((p) => p.value === preset[0]);
    const [from, to] = chosen?.range ? chosen.range() : [fromDate, toDate];

    // Resolved here, in the merchant's own timezone: picking 10 August asks for
    // their 10 August, not UTC's.
    return new URLSearchParams({
      from: new Date(`${from}T00:00:00`).toISOString(),
      to: new Date(`${to}T23:59:59.999`).toISOString(),
      status: which,
    });
  };

  const load = async (which) => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const data = await safeFetchJson(`/api/orders/pending?${rangeParams(which)}`);
      setCounts(data.counts);
      setOrders(data.orders);
      setTruncated(Boolean(data.truncated));
      setStatus(which);
    } catch (err) {
      setOrders(null);
      setCounts(null);
      setError(err.message || "Could not load your orders");
    } finally {
      setLoading(false);
    }
  };

  const handleFind = () => load(status);

  /**
   * Download the sheet. With rows ticked it carries only those; otherwise every
   * order in the range.
   */
  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    setNotice(null);

    const only = allResourcesSelected ? [] : selectedResources;

    try {
      const res = await safeFetchBlob(`/api/orders/pending-sheet?${rangeParams()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ only }),
      });

      const count = res.headers.get("X-Order-Count");
      const url = window.URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `orders_to_fulfill_${today()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setNotice(
        `Downloaded ${count} order${count === "1" ? "" : "s"}. Add tracking numbers, pick carriers from the dropdown, then upload it on the Fulfill Order page.`
      );
    } catch (err) {
      setError(err.message || "Could not build the sheet");
    } finally {
      setDownloading(false);
    }
  };

  const isCustom = preset[0] === "custom";
  const selectedCount = selectedResources.length;

  return (
    <Page>
      <TitleBar title="Orders to fulfill" />

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Find orders waiting to be fulfilled
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Download them as a spreadsheet with the order numbers already
                  filled in — you only add tracking numbers and pick carriers.
                </Text>
              </BlockStack>

              <ChoiceList
                title="Date range"
                titleHidden
                choices={PRESETS}
                selected={preset}
                onChange={setPreset}
              />

              {isCustom && (
                <InlineStack gap="300" blockAlign="end" wrap>
                  <TextField
                    label="From"
                    type="date"
                    value={fromDate}
                    onChange={setFromDate}
                    max={today()}
                    autoComplete="off"
                  />
                  <TextField
                    label="To"
                    type="date"
                    value={toDate}
                    onChange={setToDate}
                    max={today()}
                    autoComplete="off"
                  />
                </InlineStack>
              )}

              <InlineStack gap="200">
                <Button variant="primary" onClick={handleFind} loading={loading}>
                  Find orders
                </Button>
                <Button onClick={() => navigate("/fulfillorder")}>
                  Go to upload
                </Button>
              </InlineStack>

              <Text as="p" variant="bodySm" tone="subdued">
                Shopify only allows apps to read orders from the last 60 days.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {error && (
          <Layout.Section>
            <Banner title="Couldn't load orders" tone="critical" onDismiss={() => setError(null)}>
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {notice && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setNotice(null)}>
              <p>{notice}</p>
            </Banner>
          </Layout.Section>
        )}

        {counts && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  What is in this range
                </Text>

                <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Still to fulfil
                      </Text>
                      <Text as="p" variant="headingXl">
                        {formatCount(counts.unfulfilled)}
                      </Text>
                      {counts.partial.count > 0 && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          includes {formatCount(counts.partial)} partly shipped
                        </Text>
                      )}
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Already fulfilled
                      </Text>
                      <Text as="p" variant="headingXl" tone="success">
                        {formatCount(counts.fulfilled)}
                      </Text>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Total orders
                      </Text>
                      <Text as="p" variant="headingXl">
                        {formatCount(counts.total)}
                      </Text>
                    </BlockStack>
                  </Card>
                </InlineGrid>

                {/* One control drives both the table and the download, so what
                    you are looking at is always what you get. */}
                <ButtonGroup variant="segmented">
                  {STATUS_TABS.map((tab) => (
                    <Button
                      key={tab.value}
                      pressed={status === tab.value}
                      onClick={() => load(tab.value)}
                      disabled={loading}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </ButtonGroup>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {orders && orders.length === 0 && (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Nothing waiting in that range"
                image={notFoundImage}
              >
                <p>
                  Every order in these dates is already fulfilled. Try a wider
                  range, or include partially fulfilled orders.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        )}

        {orders && orders.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center" gap="200">
                  <Text as="h2" variant="headingMd">
                    {orders.length} order{orders.length === 1 ? "" : "s"} waiting
                  </Text>
                  <Button
                    variant="primary"
                    onClick={handleDownload}
                    loading={downloading}
                  >
                    {selectedCount > 0 && !allResourcesSelected
                      ? `Download ${selectedCount} selected`
                      : "Download sheet"}
                  </Button>
                </InlineStack>

                {truncated && (
                  <Banner tone="warning">
                    <p>
                      Showing the oldest {orders.length} orders — there are more
                      in this range. Narrow the dates to reach the rest.
                    </p>
                  </Banner>
                )}

                {/* Oldest first, so whatever has been waiting longest is at the
                    top and hard to overlook. */}
                <IndexTable
                  resourceName={{ singular: "order", plural: "orders" }}
                  itemCount={orders.length}
                  selectedItemsCount={allResourcesSelected ? "All" : selectedCount}
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Order" },
                    { title: "Placed" },
                    { title: "Waiting" },
                    { title: "Status" },
                  ]}
                >
                  {orders.map((order, index) => {
                    const waiting = daysWaiting(order.createdAt);

                    return (
                      <IndexTable.Row
                        id={order.name}
                        key={order.name}
                        position={index}
                        selected={selectedResources.includes(order.name)}
                      >
                        <IndexTable.Cell>
                          <Text as="span" fontWeight="semibold">
                            {order.name}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{formatDate(order.createdAt)}</IndexTable.Cell>
                        <IndexTable.Cell>
                          {/* Three days is where a merchant starts hearing from
                              customers, so that is where this starts shouting. */}
                          <Text as="span" tone={waiting >= 3 ? "critical" : undefined}>
                            {waiting === 0
                              ? "Today"
                              : `${waiting} day${waiting === 1 ? "" : "s"}`}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge
                            tone={
                              order.fulfillmentStatus === "PARTIALLY_FULFILLED"
                                ? "attention"
                                : undefined
                            }
                          >
                            {order.fulfillmentStatus === "PARTIALLY_FULFILLED"
                              ? "Partial"
                              : "Unfulfilled"}
                          </Badge>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
