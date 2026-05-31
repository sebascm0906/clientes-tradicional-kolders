import { redirect } from "next/navigation";

export default async function LoginMagicLink({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; phone?: string }>;
}) {
  const params = await searchParams;
  const token = params.token || "";
  const phone = params.phone || "";
  const query = new URLSearchParams({ token, phone });

  redirect(`/auth?${query.toString()}`);
}
