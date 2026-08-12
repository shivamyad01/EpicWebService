import { useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Icon,
  InlineGrid,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ClipboardIcon,
  DeliveryIcon,
  EmailIcon,
  OrderIcon,
  PackageIcon,
  ReceiptIcon,
  SearchIcon,
  UploadIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";

import { downloadSampleWorkbook } from "../utils/download.js";

/**
 * Everything here is built from Polaris primitives and design tokens rather than
 * inline styles. The page used to hardcode its own card shadows, greys and a
 * gradient, which meant it drifted from the admin around it and rendered wrong
 * once Shopify shipped dark mode — tokens follow the merchant's theme.
 *
 * The previous version also set `style` on <Text>, which Polaris does not accept,
 * so none of that spacing ever applied; the gaps now come from the stack
 * components that actually own layout.
 *
 * The copy is load-bearing, not decoration. This page used to describe a
 * "Review & Map Fields" step and a "Smart Mapping" feature, neither of which
 * exists: the parser takes a fixed set of column names and rejects anything else.
 * A merchant who read that arrived expecting their own headers to be understood
 * and got "Missing required column" instead — the first screen taught the wrong
 * model of the product, which is worse than saying nothing. Every claim below
 * describes something the app actually does.
 */

/**
 * The real three steps, in the order they happen. Numbered in the render because
 * this genuinely is a sequence — each step needs the artifact the one before it
 * produced.
 */
const STEPS = [
  {
    title: "Find your orders",
    description:
      "Pick a date range and see what is still waiting to ship. Download the list as a spreadsheet with every order number already filled in.",
    icon: SearchIcon,
  },
  {
    title: "Add tracking numbers",
    description:
      "Paste in each tracking number and pick the carrier from the dropdown built into the sheet. You never type an order number yourself.",
    icon: ClipboardIcon,
  },
  {
    title: "Upload and fulfill",
    description:
      "Drop the sheet back in. Every row is fulfilled in one run, and the report names the reason for any row that did not go through.",
    icon: UploadIcon,
  },
];

const FEATURES = [
  {
    title: "Bulk fulfillment",
    description:
      "One upload fulfills every row in the sheet — hundreds of orders in a single run.",
    icon: PackageIcon,
  },
  {
    title: "Order numbers filled in for you",
    description:
      "The sheet arrives listing your unfulfilled orders. Nothing to type, so no rows fail as “Order not found”.",
    icon: OrderIcon,
  },
  {
    title: "Find shipments missing tracking",
    description:
      "Catch orders that went out without a tracking number, and add it without fulfilling them a second time.",
    icon: AlertTriangleIcon,
  },
  {
    title: "Carrier links that stay current",
    description:
      "Pick a carrier and Shopify builds the tracking link and keeps delivery status updated. Supply your own URL for anything it does not know.",
    icon: DeliveryIcon,
  },
  {
    title: "A report for every run",
    description:
      "Download the whole run, or just the failed rows with the reason beside each one, ready to correct and re-upload.",
    icon: ReceiptIcon,
  },
  {
    title: "Notifications stay your call",
    description:
      "Shipping emails are off unless you turn them on for that upload. They cannot be unsent, so nothing sends them for you.",
    icon: EmailIcon,
  },
];

/** Icon in a tinted rounded square, the admin's usual treatment for feature marks. */
const IconTile = ({ source }) => (
  <Box
    background="bg-surface-secondary"
    borderRadius="200"
    padding="300"
    minWidth="fit-content"
  >
    <Icon source={source} tone="base" />
  </Box>
);

export default function BulkOrderFulfillmentPage() {
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const uploadSheet = () => navigate("/fulfillorder");
  const findOrders = () => navigate("/orders");

  const handleDownloadSample = async () => {
    setDownloading(true);
    setError(null);

    try {
      await downloadSampleWorkbook();
    } catch (err) {
      setError(err.message || "Could not download the sample file");
    } finally {
      setDownloading(false);
    }
  };

  /**
   * The three ways in, offered together.
   *
   * This page used to lead with uploading and nothing else, which sent merchants
   * to a drop zone needing a spreadsheet they had no way to get — the screen that
   * builds one was reachable only from the nav menu. Naming all three routes here
   * is what fixes that: whichever state a merchant arrives in, the next step is on
   * screen. Rendered from one place so the top and bottom of the page cannot drift
   * apart.
   *
   * A function rather than a component used as a JSX tag: a component defined in
   * the render body is a new type on every pass, so React would unmount and remount
   * these buttons each time — taking focus off the one just clicked the moment
   * `downloading` flips it into its loading state.
   */
  const renderActions = () => (
    <InlineStack gap="300" wrap>
      <Button variant="primary" size="large" icon={UploadIcon} onClick={uploadSheet}>
        Upload and fulfill
      </Button>
      <Button size="large" icon={SearchIcon} onClick={findOrders}>
        Find your orders
      </Button>
      <Button
        size="large"
        icon={ArrowDownIcon}
        onClick={handleDownloadSample}
        loading={downloading}
      >
        Download sample
      </Button>
    </InlineStack>
  );

  return (
    <Page fullWidth>
      {/* Every other screen names itself in the admin header; this one left it
          blank, on the one page where a merchant most needs to know where they
          are. */}
      <TitleBar title="Epic Fulfill" />

      <BlockStack gap="800">
        {error && (
          <Banner
            title="Couldn't download the sample"
            tone="critical"
            onDismiss={() => setError(null)}
          >
            <p>{error}</p>
          </Banner>
        )}

        <Box
          background="bg-surface-brand"
          borderRadius="300"
          padding="800"
          data-testid="hero"
        >
          <Box maxWidth="640px">
            <BlockStack gap="400">
              <Text variant="headingXl" as="h1" fontWeight="bold">
                Fulfill your orders from a spreadsheet
              </Text>
              <Text as="p" variant="bodyLg" tone="subdued">
                Download your unfulfilled orders with the order numbers already
                filled in, add tracking numbers, and upload the sheet. Hundreds of
                orders go out in one run.
              </Text>
              {renderActions()}
            </BlockStack>
          </Box>
        </Box>

        <BlockStack gap="400">
          <Text variant="headingLg" as="h2" fontWeight="semibold">
            How it works
          </Text>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            {STEPS.map((step, index) => (
              <Card key={step.title}>
                <BlockStack gap="300">
                  <IconTile source={step.icon} />
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    {`${index + 1}. ${step.title}`}
                  </Text>
                  <Text as="p" tone="subdued">
                    {step.description}
                  </Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </BlockStack>

        <BlockStack gap="400">
          <Text variant="headingLg" as="h2" fontWeight="semibold">
            What you get
          </Text>
          {/* Three across on wide screens so six cards fill two even rows. */}
          <InlineGrid columns={{ xs: 1, sm: 2, lg: 3 }} gap="400">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <InlineStack gap="400" blockAlign="start" wrap={false}>
                  <IconTile source={feature.icon} />
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      {feature.title}
                    </Text>
                    <Text as="p" tone="subdued">
                      {feature.description}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Card>
            ))}
          </InlineGrid>
        </BlockStack>

        <Card>
          <Box padding="400">
            <BlockStack gap="400" inlineAlign="center">
              <Text variant="headingLg" as="h2" fontWeight="semibold">
                Ready to clear your unfulfilled orders?
              </Text>
              <Box maxWidth="600px">
                <Text as="p" tone="subdued" alignment="center">
                  Start with today's orders and see how much of the work the sheet
                  does for you.
                </Text>
              </Box>
              {renderActions()}
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
