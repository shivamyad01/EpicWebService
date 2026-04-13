import { useState } from "react";
import { Card, TextContainer, Text } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { safeFetchJson } from "../utils/api.js";

export function ProductsCard() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const [isPopulating, setIsPopulating] = useState(false);
  const productsCount = 5;

  const {
    data,
    refetch: refetchProductCount,
    isLoading: isLoadingCount,
  } = useQuery({
    queryKey: ["productCount"],
    queryFn: () => safeFetchJson("/api/products/count"),
    refetchOnWindowFocus: false,
  });

  const setPopulating = (flag) => {
    shopify.loading(flag);
    setIsPopulating(flag);
  };

  const handlePopulate = async () => {
    setPopulating(true);
    try {
      const response = await safeFetchJson("/api/products", { method: "POST" });

      await refetchProductCount();

      shopify.toast.show(
        t("ProductsCard.productsCreatedToast", { count: productsCount })
      );
    } catch (error) {
      console.error('Error creating products:', error);
      shopify.toast.show(t("ProductsCard.errorCreatingProductsToast"), {
        isError: true,
      });
    }

    setPopulating(false);
  };

  return (
    <Card
      title={t("ProductsCard.title")}
      sectioned
      primaryFooterAction={{
        content: t("ProductsCard.populateProductsButton", {
          count: productsCount,
        }),
        onAction: handlePopulate,
        loading: isPopulating,
      }}
    >
      <TextContainer spacing="loose">
        <p>{t("ProductsCard.description")}</p>
        <Text as="h4" variant="headingMd">
          {t("ProductsCard.totalProductsHeading")}
          <Text variant="bodyMd" as="p" fontWeight="semibold">
            {isLoadingCount ? "-" : data?.count}
          </Text>
        </Text>
      </TextContainer>
    </Card>
  );
}
