import React, { useState } from "react";
import {
  Page,
  Layout,
  AlphaCard,
  VerticalStack,
  HorizontalStack,
  Divider,
  Text,
  Button,
  ButtonGroup,
  Badge,
  Banner,
  List,
  Modal,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  useBilling,
  openPricingPage,
  trialDaysLeft,
  formatPrice,
} from "../hooks/useBilling.js";

/**
 * Plan page.
 *
 * Deliberately not behind the subscription gate — a merchant with no plan is
 * exactly who needs to reach it. Everything that changes a plan happens on
 * Shopify's hosted pricing page, so this page only reports state and links out.
 *
 * Built on Polaris primitives with no inline styles: AnnotatedSection for the
 * settings-page shape, AlphaCard for surfaces, and stacks with gap tokens for
 * spacing. Hand-rolled padding here would drift from the admin the first time
 * Shopify adjusts its spacing scale.
 */

/** One label/value line inside a card. */
function DetailRow({ label, value }) {
  return (
    <HorizontalStack align="space-between" blockAlign="baseline" gap="4">
      <Text as="span" color="subdued">
        {label}
      </Text>
      <Text as="span" fontWeight="medium" alignment="end">
        {value}
      </Text>
    </HorizontalStack>
  );
}

const formatDate = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

function PlanSkeleton() {
  return (
    <Page>
      <TitleBar title="Plan" />
      <Layout>
        <Layout.AnnotatedSection
          title="Subscription"
          description="Your plan is managed by Shopify."
        >
          <AlphaCard>
            <VerticalStack gap="4">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={3} />
            </VerticalStack>
          </AlphaCard>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}

export default function Plan() {
  const billing = useBilling();
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [cancelled, setCancelled] = useState(null);

  const trialDays = trialDaysLeft(billing.trialEndsAt);
  const inTrial = trialDays !== null;

  // Fail-open reports active:true with no plan name, so every label on this page
  // has to derive from the same flag — otherwise it reads "No plan" beside an
  // "Active" badge, which is worse than saying nothing.
  const unknown = Boolean(billing.unknown);
  const planTitle = billing.planName || (unknown ? "Plan unavailable" : "No plan");
  const priceLabel = formatPrice(billing.price);

  // There is only one plan, so there is nothing to switch to. An active subscriber
  // needs exactly one action here, and it is cancelling. Only a merchant without a
  // plan is sent to Shopify's pricing page.
  const canCancel = billing.active && !unknown;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // force = true, so a merchant who just subscribed is not handed the same
      // cached "no plan" answer they are already staring at
      await billing.refresh(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await billing.cancel();
      setConfirmOpen(false);
      // "already cancelled" is reported as cancelled:false, and it is not an error
      // worth showing — the merchant wanted no plan and has none.
      setCancelled({ planName: result?.planName || null });
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (billing.loading) return <PlanSkeleton />;

  const statusBadge = unknown ? (
    <Badge>Couldn't check</Badge>
  ) : !billing.active ? (
    <Badge status="critical">No plan</Badge>
  ) : inTrial ? (
    <Badge status="info">Free trial</Badge>
  ) : (
    <Badge status="success">Active</Badge>
  );

  const statusValue = unknown
    ? "Couldn't be confirmed"
    : billing.active
    ? inTrial
      ? `${trialDays === 1 ? "Last day" : `${trialDays} days left`} of free trial`
      : "Active"
    : "No active plan";

  return (
    <Page>
      <TitleBar title="Plan" />

      <Layout>
        {cancelled && (
          <Layout.Section>
            <Banner
              title="Your plan is cancelled"
              status="success"
              onDismiss={() => setCancelled(null)}
            >
              <p>
                Bulk fulfillment has stopped. Any unused part of the current
                period is refunded by Shopify.
              </p>
              <p>
                Your fulfillment reports stay downloadable, and you can subscribe
                again at any time.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {cancelError && (
          <Layout.Section>
            <Banner
              title="Couldn't cancel your plan"
              status="critical"
              onDismiss={() => setCancelError(null)}
            >
              <p>{cancelError}</p>
            </Banner>
          </Layout.Section>
        )}

        {unknown && (
          <Layout.Section>
            <Banner status="warning">
              <p>
                We couldn't reach Shopify to confirm your subscription. Your
                access is unaffected — try again in a moment.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {!billing.active && !unknown && !cancelled && (
          <Layout.Section>
            <Banner
              title="Bulk fulfillment is paused"
              status="warning"
              action={{
                content: "Choose a plan",
                onAction: () => openPricingPage(billing.pricingUrl),
              }}
            >
              <p>
                Choose a plan to upload and fulfill orders again. Reports from
                your previous runs stay available.
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.AnnotatedSection
          id="subscription"
          title="Subscription"
          description="Plans are managed by Shopify. Any charge appears on your regular Shopify bill, not as a separate invoice."
        >
          <AlphaCard>
            <VerticalStack gap="5">
              <HorizontalStack align="space-between" blockAlign="start" gap="4">
                <VerticalStack gap="1">
                  <Text as="h2" variant="headingMd">
                    {planTitle}
                  </Text>
                  {priceLabel && (
                    <Text as="p" variant="bodySm" color="subdued">
                      {priceLabel}
                    </Text>
                  )}
                </VerticalStack>
                <HorizontalStack gap="2">
                  {statusBadge}
                  {/* Dev and demo stores can only hold test subscriptions. Saying
                      so here heads off the obvious question about the $0. */}
                  {billing.test === true && <Badge>Test</Badge>}
                </HorizontalStack>
              </HorizontalStack>

              {billing.test === true && (
                <Banner status="info">
                  <p>
                    This is a test subscription on a development store. It is
                    never charged. Regular pricing applies once the store goes
                    live.
                  </p>
                </Banner>
              )}

              <Divider />

              <VerticalStack gap="3">
                <DetailRow label="Status" value={statusValue} />
                {inTrial && (
                  <DetailRow
                    label="Trial ends"
                    value={formatDate(billing.trialEndsAt) || "—"}
                  />
                )}
                {billing.currentPeriodEnd && (
                  <DetailRow
                    label={inTrial ? "First charge" : "Renews"}
                    value={formatDate(billing.currentPeriodEnd) || "—"}
                  />
                )}
              </VerticalStack>

              <Divider />

              <ButtonGroup>
                {canCancel ? (
                  <Button
                    destructive
                    outline
                    onClick={() => setConfirmOpen(true)}
                    loading={cancelling}
                  >
                    Cancel plan
                  </Button>
                ) : (
                  <Button primary onClick={() => openPricingPage(billing.pricingUrl)}>
                    {unknown ? "View plan" : "Choose a plan"}
                  </Button>
                )}
                <Button onClick={handleRefresh} loading={refreshing}>
                  Refresh
                </Button>
              </ButtonGroup>
            </VerticalStack>
          </AlphaCard>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          id="included"
          title="What's included"
          description="Every plan includes the full fulfillment workflow."
        >
          <AlphaCard>
            <List>
              <List.Item>
                Bulk fulfill orders from an Excel or CSV upload
              </List.Item>
              <List.Item>
                Tracking numbers and carrier links written straight to Shopify
              </List.Item>
              <List.Item>
                Automatic carrier matching, so Shopify keeps delivery status
                updated
              </List.Item>
              <List.Item>
                A downloadable report for every run, with a reason for each failed
                row
              </List.Item>
            </List>
          </AlphaCard>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          id="cancelling"
          title="Cancelling"
          description="You stay in control of the subscription from your Shopify admin."
        >
          <AlphaCard>
            <VerticalStack gap="3">
              <Text as="p" color="subdued">
                Use <b>Cancel plan</b> above, or cancel from{" "}
                <b>Settings → Apps and sales channels</b> in your Shopify admin.
                Uninstalling the app also cancels it.
              </Text>
              <Text as="p" color="subdued">
                Bulk fulfillment stops as soon as you cancel, and Shopify refunds
                the unused part of the current period. Fulfillments already created
                stay in place, and your reports remain downloadable without a plan.
              </Text>
            </VerticalStack>
          </AlphaCard>
        </Layout.AnnotatedSection>
      </Layout>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Cancel your plan?"
        primaryAction={{
          content: "Cancel plan",
          destructive: true,
          loading: cancelling,
          onAction: handleCancel,
        }}
        secondaryActions={[
          {
            content: "Keep my plan",
            disabled: cancelling,
            onAction: () => setConfirmOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <VerticalStack gap="3">
            {/* Stated plainly because it is the part merchants get wrong: Shopify
                drops a cancelled subscription out of activeSubscriptions at once,
                so this is not "cancel at period end". */}
            <Text as="p">
              Bulk fulfillment stops <b>immediately</b> — not at the end of your
              billing period.
            </Text>
            <List>
              <List.Item>
                Shopify refunds the unused part of the current period.
              </List.Item>
              <List.Item>
                Orders you have already fulfilled are unaffected.
              </List.Item>
              <List.Item>
                Your fulfillment reports stay downloadable.
              </List.Item>
              <List.Item>You can subscribe again at any time.</List.Item>
            </List>
          </VerticalStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
