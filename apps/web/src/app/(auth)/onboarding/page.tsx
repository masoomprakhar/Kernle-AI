"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function OnboardingPage() {
  const router = useRouter();
  const { refreshUser, loginWithTokens } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [useCase, setUseCase] = useState("Retail");
  const [skuBand, setSkuBand] = useState("lt_1k");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{
        accessToken?: string;
        refreshToken?: string;
        organizationId?: string;
        workspaceId?: string;
      }>("/auth/onboarding", {
        method: "POST",
        body: { companyName, industry: industry || undefined, useCase, skuBand },
      });
      if (res.accessToken && res.refreshToken) {
        await loginWithTokens(res.accessToken, res.refreshToken);
      } else {
        await refreshUser();
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-fade-in shadow-none">
      <CardHeader>
        <CardTitle>Set up your organization</CardTitle>
        <CardDescription>A few details so Kernle can tailor your catalog workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="company">Company name</Label>
            <Input
              id="company"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label>Primary use case</Label>
            <Select value={useCase} onValueChange={setUseCase}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Retail">Retail</SelectItem>
                <SelectItem value="B2B_Manufacturing">B2B Manufacturing</SelectItem>
                <SelectItem value="Fashion">Fashion</SelectItem>
                <SelectItem value="Food_Beverage">Food & Beverage</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>SKU band</Label>
            <Select value={skuBand} onValueChange={setSkuBand}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lt_1k">Under 1,000</SelectItem>
                <SelectItem value="1k_10k">1,000 – 10,000</SelectItem>
                <SelectItem value="10k_100k">10,000 – 100,000</SelectItem>
                <SelectItem value="100k_plus">100,000+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating workspace…" : "Finish setup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
