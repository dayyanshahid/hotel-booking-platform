import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

/** Accessible 404 that preserves the customer's intent (§10). */
export default function NotFound() {
  return (
    <div className="py-12">
      <EmptyState
        title="We could not find that page"
        body="The link may be old, or the property may no longer be listed. Search again to see live availability."
        actions={
          <Link href="/en">
            <Button>Search hotels</Button>
          </Link>
        }
      />
    </div>
  );
}
