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
  ArrowRightIcon,
  ChartVerticalIcon,
  SettingsIcon,
  UploadIcon,
} from "@shopify/polaris-icons";
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
 */

const STEPS = [
  {
    title: "Upload Your File",
    description:
      "Drag and drop your CSV/XLS/XLSX file or click to browse. Our system will automatically process your order data.",
    icon: UploadIcon,
  },
  {
    title: "Review & Map Fields",
    description:
      "Our smart system will map your file columns to the correct order fields. Review and make any necessary adjustments.",
    icon: ChartVerticalIcon,
  },
  {
    title: "Complete Fulfillment",
    description:
      "Easily fulfill all orders with one click. Generate detailed reports instantly. Save time, reduce errors, and streamline your fulfillment process.",
    icon: SettingsIcon,
  },
];

const FEATURES = [
  {
    title: "Bulk Processing",
    description: "Process hundreds of orders in minutes instead of hours.",
    icon: ChartVerticalIcon,
  },
  {
    title: "Smart Mapping",
    description: "Automatically maps your file columns to order fields.",
    icon: SettingsIcon,
  },
  {
    title: "Custom Carriers",
    description: "Support for any shipping carrier with custom tracking URLs.",
    icon: ArrowRightIcon,
  },
  {
    title: "Detailed Reports",
    description: "Get comprehensive reports of all fulfilled orders.",
    icon: ChartVerticalIcon,
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
  const startFulfillment = () => navigate("/fulfillorder");

  return (
    <Page fullWidth>
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
                Welcome to Epic Bulk Order Fulfillment
              </Text>
              <Text as="p" variant="bodyLg" tone="subdued">
                Streamline your order fulfillment process. Upload your
                spreadsheet and fulfill hundreds of orders in minutes, not hours.
              </Text>
              <InlineStack>
                <Button
                  variant="primary"
                  size="large"
                  icon={UploadIcon}
                  onClick={startFulfillment}
                >
                  Start Fulfillment
                </Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Box>

        <BlockStack gap="400">
          <Text variant="headingLg" as="h2" fontWeight="semibold">
            How It Works
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
            Powerful Features
          </Text>
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
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
                Ready to save time on order fulfillment?
              </Text>
              <Box maxWidth="600px">
                <Text as="p" tone="subdued" alignment="center">
                  Start processing your orders in bulk today and see the
                  difference it makes for your business.
                </Text>
              </Box>
              <Button
                variant="primary"
                size="large"
                icon={UploadIcon}
                onClick={startFulfillment}
              >
                Start Fulfillment
              </Button>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
