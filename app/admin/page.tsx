import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata = {
  title: "管理画面 | YouTubeコメントオーバーレイ"
};

type SearchParams = Record<string, string | string[] | undefined>;

function getOauthNotice(searchParams?: SearchParams) {
  const oauth = searchParams?.oauth;
  const value = Array.isArray(oauth) ? oauth[0] : oauth;
  if (!value) {
    return undefined;
  }
  if (value === "connected") return "YouTube OAuthに接続しました。";
  if (value === "failed") return "YouTube OAuthに失敗しました。もう一度接続してください。";
  if (value === "missing-code") return "OAuthコールバックに認可コードがありませんでした。";
  return undefined;
}

export default async function AdminPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  return <AdminDashboard initialNotice={getOauthNotice(await searchParams)} />;
}
