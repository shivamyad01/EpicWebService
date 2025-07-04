import { Page, Layout, Text, Button, Icon } from "@shopify/polaris";
import {
  UploadMajor,
  AnalyticsMajor,
  SettingsMajor,
  ArrowRightMinor,
} from "@shopify/polaris-icons";
import { useNavigate } from "react-router-dom";

const FeatureCard = ({ icon, title, description, action }) => (
  <div
    style={{
      background: "#ffffff",
      borderRadius: "12px",
      padding: "24px",
      height: "100%",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.05)",
      border: "1px solid #e1e3e5",
      transition: "transform 0.2s, box-shadow 0.2s",
      ":hover": {
        transform: "translateY(-4px)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.1)",
      },
    }}
  >
    <div
      style={{
        background: "#f6f6f7",
        width: "48px",
        height: "48px",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "16px",
      }}
    >
      <Icon source={icon} color="base" />
    </div>
    <Text variant="headingMd" as="h3" fontWeight="semibold">
      {title}
    </Text>
    <Text as="p" color="subdued" style={{ marginBottom: "16px", flexGrow: 1 }}>
      {description}
    </Text>
    {action && (
      <div style={{ marginTop: "auto" }}>
        <Button plain monochrome onClick={action.onClick}>
          {action.label}
        </Button>
      </div>
    )}
  </div>
);

export default function BulkOrderFulfillmentPage() {
  const navigate = useNavigate();

  const handleFileUpload = () => {
    // Navigate to the fulfill order page
    console.log("Attempting to navigate to /fulfillorder");
    navigate("/fulfillorder");
  };

  const steps = [
    {
      title: "Upload Your File",
      description:
        "Drag and drop your CSV/XLS/XLSX file or click to browse. Our system will automatically process your order data.",
      icon: UploadMajor,
      action: {
        label: "Upload File",
        onClick: handleFileUpload,
      },
    },
    {
      title: "Review & Map Fields",
      description:
        "Our smart system will map your file columns to the correct order fields. Review and make any necessary adjustments.",
      icon: AnalyticsMajor,
    },
    {
      title: "Complete Fulfillment",
      description:
        "With one click, fulfill all your orders. Get a detailed report of the fulfillment process.",
      icon: SettingsMajor,
    },
  ];

  const features = [
    {
      title: "Bulk Processing",
      description: "Process hundreds of orders in minutes instead of hours.",
      icon: AnalyticsMajor,
    },
    {
      title: "Smart Mapping",
      description: "Automatically maps your file columns to order fields.",
      icon: SettingsMajor,
    },
    {
      title: "Custom Carriers",
      description:
        "Support for any shipping carrier with custom tracking URLs.",
      icon: ArrowRightMinor,
    },
    {
      title: "Detailed Reports",
      description: "Get comprehensive reports of all fulfilled orders.",
      icon: AnalyticsMajor,
    },
  ];

  return (
    <Page fullWidth>
      {/* Hero Section */}
      <div
        style={{
          background: "linear-gradient(135deg, #5c6ac4 0%, #202e78 100%)",
          borderRadius: "16px",
          padding: "48px 32px",
          marginBottom: "40px",
          color: "white",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 1, maxWidth: "800px" }}>
          <Text variant="headingXl" as="h1" fontWeight="bold">
            Welcome to Epic Bulk Order Fulfillment
          </Text>
          <div
            style={{
              height: "4px",
              width: "80px",
              background: "rgba(255,255,255,0.5)",
              margin: "16px 0 24px",
            }}
          />
          <Text
            as="p"
            variant="bodyLg"
            style={{ marginBottom: "32px", maxWidth: "600px", opacity: 0.9 }}
          >
            Streamline your order fulfillment process. Upload your spreadsheet
            and fulfill hundreds of orders in minutes, not hours.
          </Text>
          <div style={{ marginTop: "15px" }}>
            <Button
              primary
              size="large"
              onClick={handleFileUpload}
              icon={UploadMajor}
            >
              Start Fulfillment
            </Button>
          </div>
        </div>
      </div>

      {/* Steps Section */}
      <div style={{ marginBottom: "64px" }}>
        <div style={{ marginBottom: "15px" }}>
          <Text
            variant="headingLg"
            as="h2"
            fontWeight="semibold"
            style={{ marginBottom: "32px" }}
          >
            How It Works
          </Text>
        </div>
        <Layout>
          {steps.map((step, index) => (
            <Layout.Section oneThird key={index}>
              <FeatureCard
                icon={step.icon}
                title={`${index + 1}. ${step.title}`}
                description={step.description}
                action={step.action}
              />
            </Layout.Section>
          ))}
        </Layout>
      </div>

      {/* Features Section */}
      <div style={{ marginBottom: "64px" }}>
        <Text
          variant="headingLg"
          as="h2"
          fontWeight="semibold"
          style={{ marginBottom: "32px" }}
        >
          Powerful Features
        </Text>
        <Layout>
          {features.map((feature, index) => (
            <Layout.Section oneHalf key={index}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  marginBottom: "24px",
                  padding: "16px",
                  borderRadius: "8px",
                  ":hover": {
                    background: "#f9fafb",
                  },
                }}
              >
                <div
                  style={{
                    background: "#f6f6f7",
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: "16px",
                    flexShrink: 0,
                  }}
                >
                  <Icon source={feature.icon} color="base" />
                </div>
                <div>
                  <Text
                    variant="headingSm"
                    as="h3"
                    fontWeight="semibold"
                    style={{ marginBottom: "4px" }}
                  >
                    {feature.title}
                  </Text>
                  <Text as="p" color="subdued">
                    {feature.description}
                  </Text>
                </div>
              </div>
            </Layout.Section>
          ))}
        </Layout>
      </div>

      {/* CTA Section */}
      <div
        style={{
          background: "#f9fafb",
          borderRadius: "16px",
          padding: "48px 32px",
          textAlign: "center",
          border: "1px solid #e1e3e5",
          marginBottom: "40px",
        }}
      >
        <Text
          variant="headingLg"
          as="h2"
          fontWeight="semibold"
          style={{ marginBottom: "16px" }}
        >
          Ready to save time on order fulfillment?
        </Text>
        <Text
          as="p"
          style={{
            marginBottom: "24px",
            maxWidth: "600px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Start processing your orders in bulk today and see the difference it
          makes for your business.
        </Text>
        <div style={{ marginTop: "15px" }}>
          <Button
            primary
            size="large"
            onClick={handleFileUpload}
            icon={UploadMajor}
          >
            Start Fulfillment
          </Button>
        </div>
      </div>
    </Page>
  );
}
