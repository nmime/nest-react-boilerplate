import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { UiApiRuntimeOverlay } from './api-runtime-overlay';
import { UiAvatar } from './avatar';
import { UiBadge } from './badge';
import { UiButton } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, UiCard } from './card';
import { UiEmptyState, UiErrorBoundary, UiLoading, UiToast } from './feedback';
import { UiCopyableText, UiNotification } from './notification';
import { UiResourceError } from './resource-error';
import { UiSection } from './section';
import { UiStatCard } from './stat-card';
import { UiStatusPill } from './status-pill';
import { UiStatusTag } from './status-tag';

const frameStyle = { display: 'grid', gap: 18, width: 'min(900px, 92vw)' } as const;

const BrokenPreview = () => {
  throw new Error('Storybook error-boundary preview');
};

const FeedbackDisplayShowcase = () => (
  <UiSection eyebrow="Shared UI" title="Feedback and display">
    <div style={frameStyle}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <UiAvatar name="Ada Operator" />
        <UiBadge label="Owner" tone="info" />
        <UiStatusTag label="Active" tone="success" />
        <UiStatusPill label="Connected" tone="success" />
        <UiCopyableText value="usr_01HXROCKET" />
      </div>
      <Alert tone="info">
        <AlertTitle>Configuration inherited</AlertTitle>
        <AlertDescription>This tenant currently uses the platform default.</AlertDescription>
      </Alert>
      <UiNotification message="The role assignment was persisted and audited." title="Access updated" tone="success" />
      <UiToast message="Background synchronization completed" tone="success" />
      <UiLoading label="Loading delivery status" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <UiStatCard detail="Across all active tenants" label="Users" value="2,481" />
        <UiStatCard detail="Pending provider delivery" label="Queued" value="31" />
      </div>
      <UiCard title="Compact card">Reusable product content.</UiCard>
      <Card>
        <CardHeader>
          <CardTitle>Composable card</CardTitle>
          <CardDescription>Header, content, and footer primitives.</CardDescription>
        </CardHeader>
        <CardContent>Content follows the same shared tokens.</CardContent>
        <CardFooter>
          <UiButton variant="secondary">Review</UiButton>
        </CardFooter>
      </Card>
    </div>
  </UiSection>
);

const meta = {
  title: 'Foundations/Feedback and display',
  component: FeedbackDisplayShowcase,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FeedbackDisplayShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CompleteSet: Story = {};

export const EmptyAndErrorStates: Story = {
  render: () => (
    <section aria-label="Empty and error states" style={frameStyle}>
      <UiEmptyState
        action={<UiButton>Create resource</UiButton>}
        description="Create the first resource to begin managing this capability."
        title="No resources yet"
      />
      <UiResourceError action={<UiButton variant="secondary">Retry</UiButton>} />
      <UiErrorBoundary fallback={<UiResourceError description="The preview failed safely." />}>
        <BrokenPreview />
      </UiErrorBoundary>
    </section>
  ),
};

export const RuntimeOverlay: Story = {
  render: () => (
    <div style={frameStyle}>
      <UiApiRuntimeOverlay
        onDismissToast={() => undefined}
        status="server-error"
        toasts={[
          { category: 'success', id: 'saved', title: 'Configuration saved' },
          { category: 'warning', id: 'retry', message: 'Provider timeout', title: 'Delivery delayed' },
        ]}
      />
    </div>
  ),
};
