import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  Layout,
  Page,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { safeFetchJson } from "../utils/api.js";

/**
 * Settings.
 *
 * This page used to offer around twenty-five controls — store name, timezone,
 * currency, low-stock threshold, desktop notifications, a Google Analytics id, an
 * origin address, an API key field — none of which any code read, saved into a Map
 * that every redeploy emptied. What is left is the one preference a fulfillment run
 * actually consults, and it now persists alongside the sessions.
 *
 * There is deliberately no default carrier here. A row whose carrier column is
 * blank now fails instead, because guessing one meant fulfilling a real order under
 * a carrier nobody chose and attaching a tracking link that led nowhere.
 */
export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    safeFetchJson("/api/settings")
      .then((data) => {
        if (!cancelled) setSettings({ notifyCustomers: data.notifyCustomers });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((field) => (value) => {
    setSaved(false);
    setSettings((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      const stored = await safeFetchJson("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (stored?.settings) setSettings(stored.settings);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page narrowWidth>
      <TitleBar title="Settings" />
      <Layout>
        {error && (
          <Layout.Section>
            <Banner
              title="Couldn't save your settings"
              tone="critical"
              onDismiss={() => setError("")}
            >
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {saved && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setSaved(false)}>
              <p>Settings saved. They apply to your next upload.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            {!settings ? (
              <SkeletonBodyText lines={4} />
            ) : (
              <BlockStack gap="500">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Fulfillment defaults
                  </Text>
                  <Text as="p" tone="subdued">
                    Applied to every bulk upload.
                  </Text>
                </BlockStack>

                <Checkbox
                  label="Send shipping notifications by default"
                  helpText="Sets the starting position of the notification checkbox on the upload page. Notification emails cannot be undone, so it stays off unless you turn it on."
                  checked={settings.notifyCustomers}
                  onChange={update("notifyCustomers")}
                  disabled={saving}
                />

                <div>
                  <Button variant="primary" onClick={handleSave} loading={saving}>
                    Save
                  </Button>
                </div>
              </BlockStack>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Carrier
              </Text>
              <Text as="p" tone="subdued">
                Every row needs a carrier in its Tracking Company column. There is no
                default: a blank carrier fails that row rather than shipping the
                order under one you did not choose.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
