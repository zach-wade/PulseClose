import { redirect } from "next/navigation";

// app.pulseclose.com is the product, not the marketing site.
// The marketing site lives at pulseclose.com (WordPress).
export default function RootPage() {
  redirect("/login");
}
