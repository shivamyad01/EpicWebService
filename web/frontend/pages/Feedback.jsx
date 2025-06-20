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

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !feedback.trim()) {
      setError("All fields are required.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Please enter a valid email.");
      return;
    }

    setError("");
    setSubmitted(false);

    try {
      await fetch(
        "https://script.google.com/macros/s/AKfycbxsLd3ovlX-n-BhRzPq332JhN8i7CHqLFWlDGI_tV7AlvDFmo9XdmCz9h58k0tsUccgPw/exec",
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain", // Prevents preflight
          },
          body: JSON.stringify({ name, email, feedback }),
        }
      );

      setSubmitted(true);
      setName("");
      setEmail("");
      setFeedback("");
    } catch (err) {
      setError("Something went wrong. Please try again later.");
    }
  };

  return (
    <Page title={t("Feedback.title") || "Feedback"}>
      <TitleBar title={t("Feedback.title") || "Feedback"} />
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Text as="h2" variant="headingMd">
              {t("Feedback.subtitle") || "We value your feedback!"}
            </Text>

            <div style={{ marginTop: 16 }}>
              <TextField
                label="Name"
                value={name}
                onChange={setName}
                autoComplete="name"
                requiredIndicator
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                requiredIndicator
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <TextField
                label="Your Feedback"
                value={feedback}
                onChange={setFeedback}
                multiline={4}
                autoComplete="off"
                requiredIndicator
              />
            </div>

            <div style={{ marginTop: 20 }}>
              <Button onClick={handleSubmit} primary fullWidth>
                {t("Feedback.submitButton") || "Submit Feedback"}
              </Button>
            </div>

            {submitted && (
              <Banner
                title={
                  t("Feedback.successMessage") || "Thanks for your feedback!"
                }
                status="success"
                onDismiss={() => setSubmitted(false)}
              />
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
