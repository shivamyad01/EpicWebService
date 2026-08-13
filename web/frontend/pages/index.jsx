import { useState } from "react";
import {
  Badge,
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
  ChevronDownIcon,
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
 * Built entirely from Polaris primitives and design tokens, never inline styles or
 * literal colours. The page once hardcoded its own card shadows, greys and a
 * gradient, which drifted from the admin around it and rendered wrong the moment
 * Shopify shipped dark mode. Every colour below is a token, so both themes and any
 * future palette change come for free.
 *
 * Why it looks the way it does:
 *
 *  - The hero keeps the neutral `bg-surface-brand` surface. A tinted panel was
 *    tried here and the neutral one won: the colour on this page belongs to the
 *    sheet preview and the feature marks, and a tinted hero competed with both.
 *  - The right third of the hero shows the sheet itself. A merchant's first question
 *    is "what am I filling in?", and three mocked rows answer it faster than the
 *    paragraph beside them. It is built from Box and InlineGrid rather than an
 *    image, so it stays sharp, themes correctly and costs no download.
 *  - Feature marks carry a tone each — the icon and its tile tint drawn from the
 *    same token family — instead of six identical grey squares. The tones are
 *    chosen to mean something: the finder that surfaces problems is `warning`, the
 *    guard against mistyping is `success`.
 *
 * Sized to one screen: nothing here scrolls at a normal admin window size, and the
 * closing "Ready to get started?" card is gone — it repeated the three buttons
 * already at the top.
 *
 * The copy is load-bearing, not decoration. This page used to describe a
 * "Review & Map Fields" step and a "Smart Mapping" feature, neither of which
 * exists: the parser takes a fixed set of column names and rejects anything else.
 * A merchant who read that arrived expecting their own headers to be understood and
 * got "Missing required column" instead. Every claim below describes something the
 * app actually does.
 */

/** The real sequence. Each step needs what the one before it produced. */
const STEPS = [
  {
    title: "Find your orders",
    description:
      "Download your unfulfilled orders as a sheet, order numbers filled in.",
    icon: SearchIcon,
  },
  {
    title: "Add tracking numbers",
    description:
      "Paste the numbers. Pick carriers from the dropdown.",
    icon: ClipboardIcon,
  },
  {
    title: "Upload and fulfill",
    description:
      "One run. The report names anything that failed.",
    icon: UploadIcon,
  },
];

/**
 * `tone` is the Icon tone; `tint` is the matching surface behind it. They are kept
 * as a pair so a mark is never a green icon on a yellow tile.
 */
const FEATURES = [
  {
    title: "Bulk fulfillment",
    description:
      "Hundreds of orders per upload.",
    icon: PackageIcon,
    tone: "emphasis",
    tint: "bg-surface-emphasis",
  },
  {
    title: "Order numbers filled in",
    description:
      "Nothing to type, nothing to mistype.",
    icon: OrderIcon,
    tone: "success",
    tint: "bg-surface-success",
  },
  {
    title: "Missing tracking finder",
    description:
      "Find shipments that went out untracked.",
    icon: AlertTriangleIcon,
    tone: "warning",
    tint: "bg-surface-warning",
  },
  {
    title: "Carrier dropdown",
    description:
      "Pick a carrier. Shopify tracks delivery.",
    icon: DeliveryIcon,
    tone: "info",
    tint: "bg-surface-info",
  },
  {
    title: "A report for every run",
    description:
      "The whole run, or just the failed rows.",
    icon: ReceiptIcon,
    tone: "magic",
    tint: "bg-surface-magic",
  },
  {
    title: "Notifications off by default",
    description:
      "Emails send only when you tick the box.",
    icon: EmailIcon,
    tone: "caution",
    tint: "bg-surface-caution",
  },
];

/** The columns the parser actually requires, with plausible values. */
const SHEET_COLUMNS = ["OrderNumber", "TrackingNumber", "ShippingCarrier"];
const SHEET_ROWS = [
  ["#1001", "FX123456789IN", "FedEx"],
  ["#1002", "1491234567890", "Delhivery"],
  ["#1003", "RX445566778IN", "India Post"],
];

/**
 * Carriers named in the caption under the sheet, as a sample of what the dropdown
 * holds.
 *
 * Every name must be a real entry in that dropdown, which comes from config.carriers
 * on the server — naming a carrier a merchant cannot actually pick is worse than
 * naming none. Note "Bluedart", one word: "Blue Dart" is an alias the parser
 * understands, not a selectable option, so the spaced form would advertise a choice
 * that is not in the list.
 *
 * "Other" is last because it is the dropdown's last entry, and it is the one a
 * merchant most needs to know exists — it covers a carrier Shopify does not know.
 */
const CARRIER_OPTIONS = ["Bluedart", "Delhivery", "DTDC", "India Post", "Other"];

/**
 * Icon in a tinted rounded square, the admin's treatment for a feature mark.
 *
 * `padding` must be a real space token. The scale runs 0, 025, 050, 100, 150, 200,
 * 300, … — there is no 250, and passing one emits `var(--p-space-250)`, which is
 * undefined, so the tile silently collapses to no padding at all rather than
 * failing. That is what had these tiles rendering cramped.
 */
const IconTile = ({ source, tone = "base", tint = "bg-surface-secondary", padding = "200" }) => (
  <Box background={tint} borderRadius="200" padding={padding} minWidth="fit-content">
    <Icon source={source} tone={tone} />
  </Box>
);

/**
 * A carrier cell drawn as the in-cell dropdown it really is.
 *
 * The sheet ships a genuine Excel data validation on this column, and that is the
 * detail that turns "type the carrier exactly right" into "pick it from a list" — so
 * it is worth showing rather than only describing. A border and a chevron are enough
 * to read as a control; an expanded option list was tried here and cost the card
 * roughly twice its height, most of it blank space beside the menu, for information
 * the caption below carries in one line.
 */
const CarrierCell = ({ value, active = false }) => (
  <Box
    background="bg-surface"
    borderColor={active ? "border-emphasis" : "border"}
    // Excel draws a heavier ring on the cell you are actually in.
    borderWidth={active ? "050" : "025"}
    borderRadius="100"
    shadow={active ? "100" : undefined}
  >
    {/* stretch, so the caret button runs the full height of the cell and reads as
        attached to it rather than floating inside it. */}
    <InlineStack align="space-between" blockAlign="stretch" gap="0" wrap={false}>
      <Box paddingInlineStart="150" paddingBlock="050">
        <Text as="span" variant="bodyXs" fontWeight={active ? "semibold" : "regular"}>
          {value}
        </Text>
      </Box>

      {/* The caret in its own bordered block, which is what Excel's in-cell
          dropdown button looks like — a plain chevron floating in a cell reads as
          decoration, a divided button reads as something to click. */}
      <Box
        background={active ? "bg-surface-emphasis" : "bg-surface-secondary"}
        borderColor={active ? "border-emphasis" : "border"}
        borderInlineStartWidth="025"
        borderStartEndRadius="100"
        borderEndEndRadius="100"
        paddingInline="050"
        paddingBlock="050"
        minWidth="fit-content"
      >
        <Icon source={ChevronDownIcon} tone={active ? "emphasis" : "base"} />
      </Box>
    </InlineStack>
  </Box>
);

/**
 * The sample sheet, drawn rather than screenshotted.
 *
 * Answers "what do I actually fill in?" at a glance, using the same three column
 * names the parser requires — so the picture cannot drift from what the upload
 * accepts. `bodyXs` and tight padding keep it near the height of the copy beside it.
 */
const SheetPreview = () => (
  <Box
    background="bg-surface"
    borderRadius="200"
    borderColor="border"
    borderWidth="025"
    shadow="200"
    minWidth="340px"
  >
    <BlockStack gap="0">
      <Box
        background="bg-surface-secondary"
        padding="200"
        borderColor="border"
        borderBlockEndWidth="025"
        borderStartStartRadius="200"
        borderStartEndRadius="200"
      >
        <InlineGrid columns={3} gap="200">
          {SHEET_COLUMNS.map((column) => (
            <Text key={column} as="span" variant="bodyXs" tone="subdued" fontWeight="semibold">
              {column}
            </Text>
          ))}
        </InlineGrid>
      </Box>

      {SHEET_ROWS.map((row, index) => (
        <Box
          key={row[0]}
          padding="150"
          borderColor="border-secondary"
          // No rule under the last row — the card's own border closes it off.
          borderBlockEndWidth={index === SHEET_ROWS.length - 1 ? "0" : "025"}
        >
          <InlineGrid columns={3} gap="200">
            <Text as="span" variant="bodyXs" fontWeight="semibold">
              {row[0]}
            </Text>
            <Text as="span" variant="bodyXs" tone="subdued">
              {row[1]}
            </Text>
            {/* One cell shown selected. A row of identical controls reads as
                styling; one of them ringed reads as a control someone is using. */}
            <CarrierCell
              value={row[2]}
              active={index === SHEET_ROWS.length - 1}
            />
          </InlineGrid>
        </Box>
      ))}
    </BlockStack>
  </Box>
);

/** Section heading with its strapline beside it, costing one line instead of two. */
const SectionHeading = ({ title, children }) => (
  <InlineStack align="space-between" blockAlign="baseline" gap="300" wrap>
    <Text variant="headingMd" as="h2" fontWeight="semibold">
      {title}
    </Text>
    <Text as="p" variant="bodySm" tone="subdued">
      {children}
    </Text>
  </InlineStack>
);

export default function BulkOrderFulfillmentPage() {
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

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

  return (
    <Page fullWidth>
      {/* Every other screen names itself in the admin header; this one left it
          blank, on the page where a merchant most needs to know where they are. */}
      <TitleBar title="EPIC: Bulk Order Fulfillment" />

      <BlockStack gap="400">
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
          padding="600"
          data-testid="hero"
        >
          <InlineGrid columns={{ xs: 1, lg: ["twoThirds", "oneThird"] }} gap="600">
            <BlockStack gap="400">
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="info">Bulk fulfillment</Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Excel or CSV
                  </Text>
                </InlineStack>
                <Text variant="headingXl" as="h1" fontWeight="bold">
                  Fulfill your orders from a spreadsheet
                </Text>
                <Box maxWidth="620px">
                  <Text as="p" variant="bodyLg" tone="subdued">
                    Download your orders, add tracking, upload the sheet. Hundreds
                    go out in one run.
                  </Text>
                </Box>
              </BlockStack>

              {/* All three routes in, named together. Written inline rather than as
                  a component defined in this render body — that would be a new type
                  every pass, remounting the buttons and taking focus off the one
                  just clicked the moment the download starts loading. */}
              <InlineStack gap="200" wrap>
                <Button
                  variant="primary"
                  icon={UploadIcon}
                  onClick={() => navigate("/fulfillorder")}
                >
                  Upload and fulfill
                </Button>
                <Button icon={SearchIcon} onClick={() => navigate("/orders")}>
                  Find your orders
                </Button>
                <Button
                  icon={ArrowDownIcon}
                  onClick={handleDownloadSample}
                  loading={downloading}
                >
                  Download sample
                </Button>
              </InlineStack>
            </BlockStack>

            <BlockStack gap="150">
              <Text as="p" variant="bodyXs" tone="subdued" fontWeight="semibold">
                YOUR SHEET
              </Text>
              <SheetPreview />
              {/* Carries what the expanded menu used to, in one line: that the
                  column is a real dropdown, a few of the names in it, and the
                  "Other" escape hatch. Naming actual carriers is what makes it
                  concrete — see CARRIER_OPTIONS for why they have to be real. */}
              {/* Text only. The cells above already carry the caret, so repeating it
                  here read as a second control rather than as a caption. */}
              <Text as="p" variant="bodyXs" tone="subdued">
                Carrier is a dropdown — {CARRIER_OPTIONS.slice(0, 2).join(", ")} and
                160+ more. No typing.
              </Text>
            </BlockStack>
          </InlineGrid>
        </Box>

        <BlockStack gap="300">
          <SectionHeading title="How it works">Three steps.</SectionHeading>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            {STEPS.map((step, index) => (
              <Card key={step.title} padding="400">
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    {/* One accent across all three, so the sequence reads as a
                        single flow rather than three unrelated cards. */}
                    <IconTile
                      source={step.icon}
                      tone="emphasis"
                      tint="bg-surface-emphasis"
                    />
                    <Text variant="bodySm" as="span" tone="subdued" fontWeight="medium">
                      Step {index + 1}
                    </Text>
                  </InlineStack>
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      {step.title}
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {step.description}
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </BlockStack>

        <BlockStack gap="300">
          <SectionHeading title="What you get">
            Included on every plan.
          </SectionHeading>
          {/* Three across on wide screens, so six cards fill two even rows. */}
          <InlineGrid columns={{ xs: 1, sm: 2, lg: 3 }} gap="300">
            {FEATURES.map((feature) => (
              <Card key={feature.title} padding="400">
                <InlineStack gap="300" blockAlign="start" wrap={false}>
                  <IconTile
                    source={feature.icon}
                    tone={feature.tone}
                    tint={feature.tint}
                    padding="300"
                  />
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      {feature.title}
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {feature.description}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Card>
            ))}
          </InlineGrid>
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
