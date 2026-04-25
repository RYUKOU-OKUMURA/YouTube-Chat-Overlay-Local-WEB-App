import { OverlayClient } from "@/components/overlay/OverlayClient";

export const dynamic = "force-dynamic";

export default async function OverlayPage({
  params
}: {
  params: Promise<{ overlayToken: string }>;
}) {
  const { overlayToken } = await params;
  return <OverlayClient overlayToken={overlayToken} />;
}
