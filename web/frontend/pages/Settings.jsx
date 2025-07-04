import React, { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  TextField,
  Text,
  Button,
  Banner,
  Stack,
  Box,
  Tabs,
  Checkbox,
  Select,
  FormLayout,
  SettingToggle,
  Frame,
  Loading,
  ChoiceList,
  RangeSlider,
  Modal,
  ButtonGroup
} from '@shopify/polaris';
import { TitleBar } from '@shopify/app-bridge-react';
import { useTranslation } from 'react-i18next';
import { SettingsMajor, ProductsMajor, OrdersMajor, AnalyticsMajor, NotificationMajor } from '@shopify/polaris-icons';

// API service
const SettingsAPI = {
  getSettings: async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Return default settings if API call fails
      return {
        general: {
          storeName: '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          currency: 'USD',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
        },
        orders: {
          autoFulfill: true,
          defaultCarrier: 'UPS',
          notifyCustomers: true,
          lowStockThreshold: 10,
        },
        notifications: {
          email: {
            orderUpdates: true,
            lowStock: true,
            systemAlerts: true,
            emailAddress: ''
          },
          desktop: {
            newOrders: true,
            fulfillmentUpdates: true,
            systemAlerts: true
          }
        },
        integrations: {
          shopify: {
            enabled: true,
            apiKey: '',
            webhookUrl: ''
          },
          googleAnalytics: {
            enabled: false,
            trackingId: ''
          }
        },
        shipping: {
          defaultOrigin: {
            name: '',
            street: '',
            city: '',
            state: '',
            zip: '',
            country: 'United States'
          },
          carriers: [
            { id: 'ups', name: 'UPS', enabled: true },
            { id: 'fedex', name: 'FedEx', enabled: true },
            { id: 'usps', name: 'USPS', enabled: false },
            { id: 'dhl', name: 'DHL', enabled: false }
          ]
        },
        advanced: {
          debugMode: false,
          apiLogging: false,
          cacheEnabled: true
        }
      };
    }
  },
  saveSettings: async (settings) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save settings');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }
};

export default function Settings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ success: null, message: '' });
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Load settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loadedSettings = await SettingsAPI.getSettings();
        setSettings(loadedSettings);
      } catch (error) {
        console.error('Failed to load settings:', error);
        setSaveStatus({ success: false, message: 'Failed to load settings' });
      }
    };

    loadSettings();
  }, []);

  const handleInputChange = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleNestedChange = (section, subsection, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subsection]: {
          ...prev[section][subsection],
          [field]: value
        }
      }
    }));
  };

  const handleToggle = (section, field) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: !prev[section][field]
      }
    }));
  };

  const handleSave = async () => {
    if (!settings) return;
    
    setIsSaving(true);
    setSaveStatus({ success: null, message: '' });
    
    try {
      const result = await SettingsAPI.saveSettings(settings);
      setSaveStatus({
        success: true,
        message: 'Settings saved successfully!'
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus({
        success: false,
        message: 'Failed to save settings. Please try again.'
      });
    } finally {
      setIsSaving(false);
      // Clear success message after 3 seconds
      if (saveStatus.success) {
        setTimeout(() => {
          setSaveStatus({ success: null, message: '' });
        }, 3000);
      }
    }
  };

  const handleResetToDefaults = async () => {
    setIsSaving(true);
    try {
      localStorage.removeItem('epic-fulfill-settings');
      const defaultSettings = await SettingsAPI.getSettings();
      setSettings(defaultSettings);
      setSaveStatus({
        success: true,
        message: 'Settings reset to default values!'
      });
    } catch (error) {
      console.error('Failed to reset settings:', error);
      setSaveStatus({
        success: false,
        message: 'Failed to reset settings.'
      });
    } finally {
      setIsSaving(false);
      setIsResetModalOpen(false);
    }
  };

  const tabs = [
    {
      id: 'general',
      content: 'General',
      icon: SettingsMajor,
      panel: (
        <FormLayout>
          <TextField
            label="Store Name"
            value={settings?.general?.storeName || ''}
            onChange={(value) => handleInputChange('general', 'storeName', value)}
            autoComplete="off"
          />
          <Select
            label="Timezone"
            options={[
              { label: 'Pacific Time (PT)', value: 'America/Los_Angeles' },
              { label: 'Mountain Time (MT)', value: 'America/Denver' },
              { label: 'Central Time (CT)', value: 'America/Chicago' },
              { label: 'Eastern Time (ET)', value: 'America/New_York' },
              { label: 'GMT', value: 'GMT' },
            ]}
            value={settings?.general?.timezone || ''}
            onChange={(value) => handleInputChange('general', 'timezone', value)}
          />
          <Select
            label="Currency"
            options={[
              { label: 'US Dollar (USD)', value: 'USD' },
              { label: 'Euro (EUR)', value: 'EUR' },
              { label: 'British Pound (GBP)', value: 'GBP' },
              { label: 'Canadian Dollar (CAD)', value: 'CAD' },
            ]}
            value={settings?.general?.currency || 'USD'}
            onChange={(value) => handleInputChange('general', 'currency', value)}
          />
        </FormLayout>
      )
    },
    {
      id: 'orders',
      content: 'Orders',
      icon: OrdersMajor,
      panel: (
        <FormLayout>
          <SettingToggle
            action={{
              content: settings?.orders?.autoFulfill ? 'Enabled' : 'Disabled',
              onAction: () => handleToggle('orders', 'autoFulfill'),
            }}
            enabled={settings?.orders?.autoFulfill || false}
          >
            <Text variant="bodyMd">Automatically fulfill orders when received</Text>
          </SettingToggle>
          
          <SettingToggle
            action={{
              content: settings?.orders?.notifyCustomers ? 'Enabled' : 'Disabled',
              onAction: () => handleToggle('orders', 'notifyCustomers'),
            }}
            enabled={settings?.orders?.notifyCustomers || false}
          >
            <Text variant="bodyMd">Send email notifications to customers</Text>
          </SettingToggle>
          
          <TextField
            type="number"
            label="Low Stock Threshold"
            helpText="Get notified when inventory falls below this number"
            value={settings?.orders?.lowStockThreshold?.toString() || '10'}
            onChange={(value) => handleInputChange('orders', 'lowStockThreshold', parseInt(value) || 0)}
          />
        </FormLayout>
      )
    },
    {
      id: 'shipping',
      content: 'Shipping',
      icon: ProductsMajor,
      panel: (
        <FormLayout>
          <Text variant="headingMd" as="h3">Default Origin Address</Text>
          <TextField
            label="Business Name"
            value={settings?.shipping?.defaultOrigin?.name || ''}
            onChange={(value) => handleNestedChange('shipping', 'defaultOrigin', 'name', value)}
          />
          <TextField
            label="Street Address"
            value={settings?.shipping?.defaultOrigin?.street || ''}
            onChange={(value) => handleNestedChange('shipping', 'defaultOrigin', 'street', value)}
          />
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <TextField
                label="City"
                value={settings?.shipping?.defaultOrigin?.city || ''}
                onChange={(value) => handleNestedChange('shipping', 'defaultOrigin', 'city', value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                label="State/Province"
                value={settings?.shipping?.defaultOrigin?.state || ''}
                onChange={(value) => handleNestedChange('shipping', 'defaultOrigin', 'state', value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <TextField
                label="ZIP/Postal Code"
                value={settings?.shipping?.defaultOrigin?.zip || ''}
                onChange={(value) => handleNestedChange('shipping', 'defaultOrigin', 'zip', value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Select
                label="Country"
                options={[
                  { label: 'United States', value: 'US' },
                  { label: 'Canada', value: 'CA' },
                  { label: 'United Kingdom', value: 'GB' },
                ]}
                value={settings?.shipping?.defaultOrigin?.country || 'US'}
                onChange={(value) => handleNestedChange('shipping', 'defaultOrigin', 'country', value)}
              />
            </div>
          </div>
          
          <Box paddingBlockStart="6">
            <Text variant="headingMd" as="h3">Shipping Carriers</Text>
            <Text variant="bodyMd" color="subdued">Enable or disable shipping carriers</Text>
            <Box paddingBlockStart="4">
              {settings?.shipping?.carriers?.map((carrier) => (
                <SettingToggle
                  key={carrier.id}
                  action={{
                    content: carrier.enabled ? 'Enabled' : 'Disabled',
                    onAction: () => {
                      const updatedCarriers = settings.shipping.carriers.map(c => 
                        c.id === carrier.id ? { ...c, enabled: !c.enabled } : c
                      );
                      setSettings(prev => ({
                        ...prev,
                        shipping: {
                          ...prev.shipping,
                          carriers: updatedCarriers
                        }
                      }));
                    },
                  }}
                  enabled={carrier.enabled}
                >
                  <Text variant="bodyMd">{carrier.name}</Text>
                </SettingToggle>
              ))}
            </Box>
          </Box>
        </FormLayout>
      )
    },
    {
      id: 'notifications',
      content: 'Notifications',
      icon: NotificationMajor,
      panel: (
        <FormLayout>
          <Text variant="headingMd" as="h3">Email Notifications</Text>
          <TextField
            type="email"
            label="Notification Email"
            helpText="Email address to receive notifications"
            value={settings?.notifications?.email?.emailAddress || ''}
            onChange={(value) => handleNestedChange('notifications', 'email', 'emailAddress', value)}
          />
          
          <SettingToggle
            action={{
              content: settings?.notifications?.email?.orderUpdates ? 'Enabled' : 'Disabled',
              onAction: () => handleNestedChange('notifications', 'email', 'orderUpdates', !settings?.notifications?.email?.orderUpdates),
            }}
            enabled={settings?.notifications?.email?.orderUpdates || false}
          >
            <Text variant="bodyMd">Order updates</Text>
          </SettingToggle>
          
          <SettingToggle
            action={{
              content: settings?.notifications?.email?.lowStock ? 'Enabled' : 'Disabled',
              onAction: () => handleNestedChange('notifications', 'email', 'lowStock', !settings?.notifications?.email?.lowStock),
            }}
            enabled={settings?.notifications?.email?.lowStock || false}
          >
            <Text variant="bodyMd">Low stock alerts</Text>
          </SettingToggle>
          
          <SettingToggle
            action={{
              content: settings?.notifications?.email?.systemAlerts ? 'Enabled' : 'Disabled',
              onAction: () => handleNestedChange('notifications', 'email', 'systemAlerts', !settings?.notifications?.email?.systemAlerts),
            }}
            enabled={settings?.notifications?.email?.systemAlerts || false}
          >
            <Text variant="bodyMd">System alerts</Text>
          </SettingToggle>
          
          <Box paddingBlockStart="6">
            <Text variant="headingMd" as="h3">Desktop Notifications</Text>
            <SettingToggle
              action={{
                content: settings?.notifications?.desktop?.newOrders ? 'Enabled' : 'Disabled',
                onAction: () => handleNestedChange('notifications', 'desktop', 'newOrders', !settings?.notifications?.desktop?.newOrders),
              }}
              enabled={settings?.notifications?.desktop?.newOrders || false}
            >
              <Text variant="bodyMd">New orders</Text>
            </SettingToggle>
            
            <SettingToggle
              action={{
                content: settings?.notifications?.desktop?.fulfillmentUpdates ? 'Enabled' : 'Disabled',
                onAction: () => handleNestedChange('notifications', 'desktop', 'fulfillmentUpdates', !settings?.notifications?.desktop?.fulfillmentUpdates),
              }}
              enabled={settings?.notifications?.desktop?.fulfillmentUpdates || false}
            >
              <Text variant="bodyMd">Fulfillment updates</Text>
            </SettingToggle>
          </Box>
        </FormLayout>
      )
    },
    {
      id: 'integrations',
      content: 'Integrations',
      icon: AnalyticsMajor,
      panel: (
        <FormLayout>
          <SettingToggle
            action={{
              content: settings?.integrations?.shopify?.enabled ? 'Connected' : 'Disconnected',
              onAction: () => handleNestedChange('integrations', 'shopify', 'enabled', !settings?.integrations?.shopify?.enabled),
            }}
            enabled={settings?.integrations?.shopify?.enabled || false}
          >
            <Text variant="bodyMd">Shopify Integration</Text>
          </SettingToggle>
          
          {settings?.integrations?.shopify?.enabled && (
            <Box paddingInlineStart="4">
              <TextField
                label="API Key"
                type="password"
                value={settings?.integrations?.shopify?.apiKey || ''}
                onChange={(value) => handleNestedChange('integrations', 'shopify', 'apiKey', value)}
                autoComplete="off"
              />
              <TextField
                label="Webhook URL"
                value={settings?.integrations?.shopify?.webhookUrl || ''}
                onChange={(value) => handleNestedChange('integrations', 'shopify', 'webhookUrl', value)}
                helpText="URL to receive Shopify webhooks"
              />
            </Box>
          )}
          
          <SettingToggle
            action={{
              content: settings?.integrations?.googleAnalytics?.enabled ? 'Connected' : 'Disconnected',
              onAction: () => handleNestedChange('integrations', 'googleAnalytics', 'enabled', !settings?.integrations?.googleAnalytics?.enabled),
            }}
            enabled={settings?.integrations?.googleAnalytics?.enabled || false}
          >
            <Text variant="bodyMd">Google Analytics</Text>
          </SettingToggle>
          
          {settings?.integrations?.googleAnalytics?.enabled && (
            <Box paddingInlineStart="4">
              <TextField
                label="Tracking ID"
                value={settings?.integrations?.googleAnalytics?.trackingId || ''}
                onChange={(value) => handleNestedChange('integrations', 'googleAnalytics', 'trackingId', value)}
                helpText="UA-XXXXXXXXX-X or G-XXXXXXXXXX"
              />
            </Box>
          )}
        </FormLayout>
      )
    },
    {
      id: 'advanced',
      content: 'Advanced',
      icon: SettingsMajor,
      panel: (
        <FormLayout>
          <SettingToggle
            action={{
              content: settings?.advanced?.debugMode ? 'Enabled' : 'Disabled',
              onAction: () => handleToggle('advanced', 'debugMode'),
            }}
            enabled={settings?.advanced?.debugMode || false}
          >
            <Text variant="bodyMd">Debug Mode</Text>
            <Text variant="bodySm" color="subdued">Show detailed error messages and logs</Text>
          </SettingToggle>
          
          <SettingToggle
            action={{
              content: settings?.advanced?.apiLogging ? 'Enabled' : 'Disabled',
              onAction: () => handleToggle('advanced', 'apiLogging'),
            }}
            enabled={settings?.advanced?.apiLogging || false}
          >
            <Text variant="bodyMd">API Request Logging</Text>
            <Text variant="bodySm" color="subdued">Log all API requests and responses</Text>
          </SettingToggle>
          
          <SettingToggle
            action={{
              content: settings?.advanced?.cacheEnabled ? 'Enabled' : 'Disabled',
              onAction: () => handleToggle('advanced', 'cacheEnabled'),
            }}
            enabled={settings?.advanced?.cacheEnabled ?? true}
          >
            <Text variant="bodyMd">Browser Caching</Text>
            <Text variant="bodySm" color="subdued">Improves performance by caching data locally</Text>
          </SettingToggle>
          
          <Box paddingBlockStart="6">
            <Button destructive onClick={() => setIsResetModalOpen(true)}>
              Reset to Default Settings
            </Button>
            <Text variant="bodySm" color="subdued">
              This will restore all settings to their default values.
            </Text>
          </Box>
        </FormLayout>
      )
    }
  ];

  if (!settings) {
    return (
      <Page title="Settings">
        <Frame>
          <Loading />
        </Frame>
      </Page>
    );
  }

  return (
    <Page
      title="Settings"
      primaryAction={{
        content: 'Save Changes',
        onAction: handleSave,
        loading: isSaving,
        disabled: isSaving
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: () => window.location.reload(),
          disabled: isSaving
        }
      ]}
    >
      <TitleBar title="Settings" />
      
      <Layout>
        <Layout.Section>
          {saveStatus.message && (
            <Box paddingBlockEnd="4">
              <Banner
                title={saveStatus.message}
                status={saveStatus.success ? 'success' : 'critical'}
                onDismiss={() => setSaveStatus({ success: null, message: '' })}
              />
            </Box>
          )}
          
          <Card>
            <Tabs
              tabs={tabs}
              selected={activeTab}
              onSelect={setActiveTab}
              fitted
            />
            <Box padding="4">
              {tabs[activeTab].panel}
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
      
      <Modal
        open={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset Settings to Default?"
        primaryAction={{
          content: 'Reset Settings',
          onAction: handleResetToDefaults,
          destructive: true,
          loading: isSaving
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setIsResetModalOpen(false),
            disabled: isSaving
          }
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to reset all settings to their default values? 
            This action cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
