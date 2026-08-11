import { Card, EmptyState, Page } from "@shopify/polaris";
import { t } from "../utils/i18nUtils";
import { notFoundImage } from "../assets";

export default function NotFound() {
  return (
    <Page>
      <Card>
        <EmptyState heading={t("NotFound.heading")} image={notFoundImage}>
          <p>{t("NotFound.description")}</p>
        </EmptyState>
      </Card>
    </Page>
  );
}
