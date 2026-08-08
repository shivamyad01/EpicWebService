import {
  Card,
  Layout,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonPage,
} from "@shopify/polaris";

/**
 * Shown while a route's chunk is downloading.
 *
 * Routes are lazy now, so there is a real gap between clicking and rendering, and
 * an unstyled blank page inside the admin reads as "the app is broken". A skeleton
 * in the shape of the page that is coming makes the wait legible instead.
 */
export default function PageSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={4} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}
