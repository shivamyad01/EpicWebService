import {
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

  // The primary action is finding orders, not uploading. Both buttons used to go
  // straight to the upload page, which needs a filled-in spreadsheet the merchant
  // does not have yet — so the one screen that produces that sheet was reachable
  // only from the nav menu, and a new merchant's first move was to type order
  // numbers by hand into the sample file. That is the step most "Order not found"
  // rows come from, and the app already has the feature that removes it.
  const findOrders = () => navigate("/orders");
  const uploadSheet = () => navigate("/fulfillorder");

  /** Both call-to-action pairs, so the top and bottom of the page cannot drift. */
  const Actions = () => (
    <InlineStack gap="300" wrap>
      <Button variant="primary" size="large" icon={SearchIcon} onClick={findOrders}>
        Find your orders
      </Button>
      <Button size="large" icon={UploadIcon} onClick={uploadSheet}>
        I already have a sheet
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
              <Actions />
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
              <Actions />
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
