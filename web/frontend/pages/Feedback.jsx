import React, { useState } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Text,
  Button,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";

export default function Feedback() {
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      setError(t("Feedback.errorMessage"));
      return;
    }

    setError("");
    setSubmitted(false);

    try {
      // Optional: Send to backend
      await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, feedback }),
      });

      setSubmitted(true);
      setName("");
      setEmail("");
      setFeedback("");
    } catch (err) {
      setError("Something went wrong. Please try again later.");
    }
  };

  return (
    <Page title={t("Feedback.title")}>
      <TitleBar title={t("Feedback.title")} />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Text as="h2" variant="headingMd">
              {t("Feedback.subtitle")}
            </Text>

            <TextField
              label={t("Feedback.nameLabel")}
              value={name}
              onChange={(val) => setName(val)}
              autoComplete="off"
            />

            <TextField
              label={t("Feedback.emailLabel")}
              type="email"
              value={email}
              onChange={(val) => setEmail(val)}
              autoComplete="email"
            />

            <TextField
              label={t("Feedback.feedbackLabel")}
              value={feedback}
              onChange={(val) => setFeedback(val)}
              multiline={4}
            />

            <Button onClick={handleSubmit} primary>
              {t("Feedback.submitButton")}
            </Button>

            {submitted && (
              <Banner title={t("Feedback.successMessage")} status="success" />
            )}

            {error && (
              <Banner
                title="Error"
                status="critical"
                onDismiss={() => setError("")}
              >
                {error}
              </Banner>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
