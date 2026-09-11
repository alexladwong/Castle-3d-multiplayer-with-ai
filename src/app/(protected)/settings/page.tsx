import type { Metadata } from "next";
import { SettingsWorkbench } from "@/components/settings/settings-workbench";
import { Display, Eyebrow, Section } from "@/components/ui-kit";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Section width="app" padding="md" className="pt-8 sm:pt-10">
      <header className="mb-8 grid gap-2">
        <Eyebrow>Your setup</Eyebrow>
        <Display level={3} as="h1">Settings</Display>
        <p className="max-w-prose text-[15px] text-muted-foreground">
          Changes save themselves and follow you to every device.
        </p>
      </header>
      <SettingsWorkbench />
    </Section>
  );
}
