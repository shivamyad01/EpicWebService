import React, { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Text,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Box,
  Spinner,
  Icon,
  Select,
  InlineError,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { t } from "../utils/i18nUtils";
import {
  EmailIcon,
  ProfileIcon,
  NoteIcon,
  StarFilledIcon,
  StarIcon,
} from "@shopify/polaris-icons";

const FEEDBACK_TYPES = [
  { label: "Feedback", value: "feedback" },
  { label: "Bug Report", value: "bug" },
  { label: "Feature Request", value: "feature" },
  { label: "Other", value: "other" },
];

const RATINGS = [1, 2, 3, 4, 5];

/**
 * Where feedback is posted.
 *
 * Overridable at build time so the endpoint can be changed without editing a
 * component, and so a fork is not silently posting into someone else's inbox. The
 * literal is the fallback because that is what shipped before this was configurable.
 */
const FEEDBACK_ENDPOINT =
  import.meta.env?.VITE_FEEDBACK_ENDPOINT ||
  "https://script.google.com/macros/s/AKfycbxsLd3ovlX-n-BhRzPq332JhN8i7CHqLFWlDGI_tV7AlvDFmo9XdmCz9h58k0tsUccgPw/exec";

/** Shown when the submission does not get through, so the merchant has a way out. */
const SUPPORT_EMAIL = "support@epicfulfill.com";

export default function Feedback() {
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
      // The response was previously ignored, so a rejected or failing endpoint still
      // produced "Thank you for your feedback!" — the merchant walked away believing
      // a bug report had been filed when nothing had been recorded. Anything other
      // than a 2xx is a failure and has to be shown as one.
      const response = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          ...formData,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`The feedback service replied ${response.status}`);
      }

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
      // Name the way out. "Try again later" on its own leaves a merchant with a bug
      // report and nowhere to put it.
      setError(
        `We couldn't send your feedback. Please try again, or email us at ${SUPPORT_EMAIL}.`
      );
      console.error("[feedback] submission failed:", err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRatingStars = () => (
    <BlockStack gap="200">
      <Text as="p" variant="bodyMd" tone="subdued">
        How would you rate your experience?
      </Text>
      {/* Polaris Buttons rather than hand-styled <button>s: these carry the admin's
          focus ring and hit area, follow the merchant's theme instead of hardcoded
          styles, and `pressed` publishes aria-pressed so the chosen rating is
          announced rather than only coloured in. */}
      <InlineStack gap="100">
        {RATINGS.map((star) => (
          <Button
            key={star}
            variant="tertiary"
            icon={star <= formData.rating ? StarFilledIcon : StarIcon}
            accessibilityLabel={`Rate ${star} out of 5`}
            pressed={star === formData.rating}
            onClick={() => handleChange("rating")(star)}
          />
        ))}
      </InlineStack>
    </BlockStack>
  );

  const renderForm = () => (
    <BlockStack gap="500">
      <Box paddingBlockStart="400">
        <Text as="h2" variant="headingXl">
          {t("Feedback.title") || "Share Your Feedback"}
        </Text>
        <Text as="p" variant="bodyMd" tone="subdued">
          {t("Feedback.subtitle") ||
            "We'd love to hear your thoughts to help improve our service."}
        </Text>
      </Box>

      <BlockStack gap="400">
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
            prefix={<Icon source={ProfileIcon} tone="base" />}
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
            prefix={<Icon source={EmailIcon} tone="base" />}
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
            prefix={<Icon source={NoteIcon} tone="base" />}
          />
        </div>

        <Box paddingBlockStart="400">
          <Button
            onClick={handleSubmit}
            variant="primary"
            fullWidth
            size="large"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            {t("Feedback.submitButton") || "Submit Feedback"}
          </Button>
        </Box>
      </BlockStack>
    </BlockStack>
  );

  const renderSuccessMessage = () => (
    <BlockStack gap="500" inlineAlign="center">
      <BlockStack gap="400" inlineAlign="center">
        <Box
          background="bg-fill-success-secondary"
          borderRadius="full"
          padding="400"
        >
          <Icon source={NoteIcon} tone="success" />
        </Box>
        <Text as="h2" variant="headingXl" alignment="center">
          Thank You for Your Feedback!
        </Text>
        <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
          We appreciate you taking the time to help us improve. Your insights
          are valuable to us.
        </Text>
      </BlockStack>
      <Box paddingBlockStart="400">
        <Button onClick={() => setSubmitted(false)}>
          Submit Another Feedback
        </Button>
      </Box>
    </BlockStack>
  );

  return (
    <Page narrowWidth>
      {/* The nav item's name, not the page's headline — the admin header says where
          you are, and "We value your feedback" is not the name of anywhere. */}
      <TitleBar title={t("NavigationMenu.feedback") || "Feedback"} />
      <Layout>
        <Layout.Section>
          {/* Card lost `sectioned` in Polaris 12 and never took `style` — the
              width cap belongs on the page, which is what narrowWidth does. */}
          <Card>
            {error && (
              <Box paddingBlockEnd="400">
                <Banner
                  title=""
                  tone="critical"
                  onDismiss={() => setError("")}
                >
                  <p>{error}</p>
                </Banner>
              </Box>
            )}

            {submitted ? renderSuccessMessage() : renderForm()}

            <Box paddingBlockStart="800">
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
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
