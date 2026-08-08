import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  Layout,
  Page,
  Select,
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
 * that every redeploy emptied. What is left is the two settings a fulfillment run
 * actually consults, and they now persist alongside the sessions.
 *
 * The carrier list is served by the API rather than hardcoded here: Shopify only
 * builds a tracking link when the carrier name matches its own spelling exactly,
 * so the list has one home, in web/config.
 */
export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await safeFetchJson("/api/settings");
        if (cancelled) return;
        setSettings({
          defaultCarrier: data.defaultCarrier,
          notifyCustomers: data.notifyCustomers,
        });
        setCarriers(data.carriers || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

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

      // Show what was stored, not what was sent — the server rejects a carrier
      // Shopify does not recognise, and the merchant should see that happen.
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
            <Banner title="Couldn't save your settings" tone="critical" onDismiss={() => setError("")}>
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
              <SkeletonBodyText lines={5} />
            ) : (
              <BlockStack gap="500">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Fulfillment defaults
                  </Text>
                  <Text as="p" tone="subdued">
                    Applied to every bulk upload. Anything your sheet specifies wins
                    over these.
                  </Text>
                </BlockStack>

                <Select
                  label="Default carrier"
                  helpText="Used when a row has no carrier. Shopify only builds a tracking link for carriers it recognises, so the list is limited to those."
                  options={carriers.map((name) => ({ label: name, value: name }))}
                  value={settings.defaultCarrier}
                  onChange={update("defaultCarrier")}
                  disabled={saving}
                />

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
      </Layout>
    </Page>
  );
}
