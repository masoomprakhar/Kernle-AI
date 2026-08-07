"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function VerifyForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState(params.get("token") || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api("/auth/verify-email", { method: "POST", auth: false, body: { token } });
      setMessage("Email verified. You can continue to onboarding.");
      setTimeout(() => router.push("/onboarding"), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-fade-in shadow-none">
      <CardHeader>
        <CardTitle>Verify email</CardTitle>
        <CardDescription>
          Paste the verification token from your email
          {params.get("email") ? ` for ${params.get("email")}` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="token">Verification token</Label>
            <Input id="token" required value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Verifying…" : "Verify email"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
