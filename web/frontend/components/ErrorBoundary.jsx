import React from "react";
import { Banner, BlockStack, Card, Layout, Page, Text } from "@shopify/polaris";

/**
 * Catches a render error and shows it.
 *
 * Without this, anything that throws during render unmounts the whole tree and
 * React leaves an empty <div id="app"> behind — which inside the Shopify admin is
 * indistinguishable from the app failing to load at all, and gives the merchant
 * nothing to report and no way to recover but a full reload.
 *
 * A class is required: there is still no hook equivalent of componentDidCatch.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // The merchant sees the banner; this is what makes it findable in the console
    // and in whatever log collector gets wired up later.
    console.error("[app] render failed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Page>
        <Layout>
          <Layout.Section>
            <Banner
              title="Something went wrong"
              tone="critical"
              action={{ content: "Reload", onAction: () => window.location.reload() }}
            >
              <p>
                This page failed to load. Reloading usually fixes it. If it keeps
                happening, send us the message below.
              </p>
            </Banner>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Error detail
                </Text>
                <Text as="p" tone="subdued" breakWord>
                  {String(this.state.error?.message || this.state.error)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }
}
