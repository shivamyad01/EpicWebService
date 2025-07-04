import React, { useState, useCallback } from "react";
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
  Spinner,
  Icon,
  Select,
  InlineError,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import {
  EmailMajor,
  ProfileMajor,
  NoteMajor,
  StarFilledMinor,
  StarOutlineMinor,
} from "@shopify/polaris-icons";

const FEEDBACK_TYPES = [
  { label: "Feedback", value: "feedback" },
  { label: "Bug Report", value: "bug" },
  { label: "Feature Request", value: "feature" },
  { label: "Other", value: "other" },
];

const RATINGS = [1, 2, 3, 4, 5];

export default function Feedback() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    feedbackType: "feedback",
    rating: 0,
    feedback: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    feedback: false,
  });

  const isValidEmail = useCallback(
    (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    []
  );

  const handleChange = useCallback(
    (field) => (value) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));

      // Clear error when user starts typing
      if (error) setError("");
    },
    [error]
  );

  const handleBlur = useCallback(
    (field) => () => {
      setTouched((prev) => ({
        ...prev,
        [field]: true,
      }));
    },
    []
  );

  const validateForm = useCallback(() => {
    const { name, email, feedback } = formData;
    const errors = [];

    if (!name.trim()) errors.push("Name is required");
    if (!email.trim()) {
      errors.push("Email is required");
    } else if (!isValidEmail(email)) {
      errors.push("Please enter a valid email");
    }
    if (!feedback.trim()) errors.push("Feedback is required");

    return errors;
  }, [formData, isValidEmail]);

  const handleSubmit = async () => {
    const errors = validateForm();

    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await fetch(
        "https://script.google.com/macros/s/AKfycbxsLd3ovlX-n-BhRzPq332JhN8i7CHqLFWlDGI_tV7AlvDFmo9XdmCz9h58k0tsUccgPw/exec",
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            ...formData,
            timestamp: new Date().toISOString(),
          }),
        }
      );

      setSubmitted(true);
      setFormData({
        name: "",
        email: "",
        feedbackType: "feedback",
        rating: 0,
        feedback: "",
      });
      setTouched({
        name: false,
        email: false,
        feedback: false,
      });
    } catch (err) {
      setError(
        "We're having trouble submitting your feedback. Please try again later."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRatingStars = () => (
    <Stack vertical spacing="tight">
      <Text variant="bodyMd" color="subdued">
        How would you rate your experience?
      </Text>
      <Stack spacing="extraTight">
        {RATINGS.map((star) => (
          <button
            key={star}
            onClick={() => handleChange("rating")(star)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
            }}
            aria-label={`Rate ${star} out of 5`}
          >
            <Icon
              source={
                star <= formData.rating ? StarFilledMinor : StarOutlineMinor
              }
              color={star <= formData.rating ? "warning" : "base"}
            />
          </button>
        ))}
      </Stack>
    </Stack>
  );

  const renderForm = () => (
    <Stack
      vertical
      spacing="loose"
      style={{
        maxHeight: "calc(100vh - 200px)",
        overflowY: "auto",
        padding: "8px",
      }}
    >
      <Box paddingBlockStart="4">
        <Text as="h2" variant="headingXl">
          {t("Feedback.title") || "Share Your Feedback"}
        </Text>
        <Text as="p" variant="bodyMd" color="subdued">
          {t("Feedback.subtitle") ||
            "We'd love to hear your thoughts to help improve our service."}
        </Text>
      </Box>

      <Stack vertical spacing="base">
        <div>
          <Select
            label="Feedback type"
            options={FEEDBACK_TYPES}
            onChange={(value) => handleChange("feedbackType")(value)}
            value={formData.feedbackType}
          />
        </div>

        <div>
          <TextField
            label="Your name"
            value={formData.name}
            onChange={handleChange("name")}
            onBlur={handleBlur("name")}
            autoComplete="name"
            prefix={<Icon source={ProfileMajor} color="base" />}
            error={
              touched.name && !formData.name.trim() ? "Name is required" : ""
            }
          />
        </div>

        <div>
          <TextField
            label="Email address"
            type="email"
            value={formData.email}
            onChange={handleChange("email")}
            onBlur={handleBlur("email")}
            autoComplete="email"
            prefix={<Icon source={EmailMajor} color="base" />}
            error={
              touched.email &&
              (!formData.email.trim()
                ? "Email is required"
                : !isValidEmail(formData.email)
                ? "Please enter a valid email"
                : "")
            }
          />
        </div>

        {renderRatingStars()}

        <div>
          <TextField
            label="Your feedback"
            value={formData.feedback}
            onChange={handleChange("feedback")}
            onBlur={handleBlur("feedback")}
            multiline={4}
            autoComplete="off"
            helpText="Be as detailed as possible"
            error={
              touched.feedback && !formData.feedback.trim()
                ? "Feedback is required"
                : ""
            }
            prefix={<Icon source={NoteMajor} color="base" />}
          />
        </div>

        <Box paddingBlockStart="4">
          <Button
            onClick={handleSubmit}
            primary
            fullWidth
            size="large"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            {t("Feedback.submitButton") || "Submit Feedback"}
          </Button>
        </Box>
      </Stack>
    </Stack>
  );

  const renderSuccessMessage = () => (
    <Stack
      vertical
      spacing="loose"
      alignment="center"
      style={{ padding: "16px 0" }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            backgroundColor: "#e3f1df",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <Icon source={NoteMajor} color="success" />
        </div>
        <Text as="h2" variant="headingXl">
          Thank You for Your Feedback!
        </Text>
        <Text as="p" variant="bodyLg" color="subdued">
          We appreciate you taking the time to help us improve. Your insights
          are valuable to us.
        </Text>
      </div>
      <Box paddingBlockStart="4">
        <Button onClick={() => setSubmitted(false)}>
          Submit Another Feedback
        </Button>
      </Box>
    </Stack>
  );

  return (
    <Page fullWidth>
      <TitleBar title={t("Feedback.title") || "Feedback"} />
      <Layout>
        <Layout.Section>
          <Card sectioned style={{ maxWidth: "800px", margin: "0 auto" }}>
            {error && (
              <Box paddingBlockEnd="4">
                <Banner
                  title=""
                  status="critical"
                  onDismiss={() => setError("")}
                >
                  <p>{error}</p>
                </Banner>
              </Box>
            )}

            {submitted ? renderSuccessMessage() : renderForm()}

            <Box paddingBlockStart="8">
              <Text as="p" variant="bodySm" color="subdued" alignment="center">
                Need immediate assistance?{" "}
                <Link url="mailto:support@epicfulfill.com" external>
                  Contact our support team
                </Link>
              </Text>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
