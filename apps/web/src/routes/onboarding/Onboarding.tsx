import { COUNTRIES, countryDefaults } from "@menu-studio/i18n";
import { VENUE_TYPES, type OrgDto, type VenueDto } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Wordmark } from "../../components/AppShell.tsx";
import { Button, ErrorNotice, Field, Input, Segmented, Select } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys, setPreferredOrgId, useMe } from "../../lib/queries.ts";

const TYPE_LABELS: Record<string, string> = { restaurant: "Restaurant", cafe: "Cafe", bar: "Bar", bakery: "Bakery", cloud_kitchen: "Cloud kitchen" };

export function Onboarding() {
  const me = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const existing = me.data?.orgs ?? [];
  const [step, setStep] = useState<"org" | "venue">("org");
  const [org, setOrg] = useState<OrgDto | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<"venue" | "agency">("venue");
  const [country, setCountry] = useState(() => (navigator.language.split("-")[1] ?? "GB").toUpperCase());
  const [venueName, setVenueName] = useState("");
  const [venueType, setVenueType] = useState<string>("restaurant");
  const [city, setCity] = useState("");
  const defaults = countryDefaults(country);

  const createOrg = useMutation({
    mutationFn: () => api<OrgDto>("/orgs", { method: "POST", body: { name: orgName.trim(), type: orgType, country } }),
    onSuccess: (created) => {
      setOrg(created);
      setPreferredOrgId(created.id);
      if (!venueName) setVenueName(orgType === "venue" ? orgName.trim() : "");
      setStep("venue");
    },
  });

  const createVenue = useMutation({
    mutationFn: () => api<VenueDto>("/venues", { method: "POST", body: { orgId: org?.id, name: venueName.trim(), venueType, city: city.trim() || null, country } }),
    onSuccess: async (venue) => {
      await queryClient.invalidateQueries({ queryKey: keys.me });
      void navigate(`/venues/${venue.id}/new`);
    },
  });

  const submitOrg = (e: FormEvent) => {
    e.preventDefault();
    createOrg.mutate();
  };
  const submitVenue = (e: FormEvent) => {
    e.preventDefault();
    createVenue.mutate();
  };

  return (
    <div className="min-h-full px-6 py-8">
      <Wordmark />
      <div className="mx-auto mt-16 max-w-[520px] animate-fade-up">
        <div className="eyebrow">Step {step === "org" ? "1" : "2"} of 2</div>
        {step === "org" ? (
          <form onSubmit={submitOrg}>
            <h1 className="display mt-2 text-[44px]">{existing.length && params.get("new") ? "A new organization" : "Let's set up your account"}</h1>
            <p className="mt-2 text-[15px] text-muted">Your organization holds your venues, menus and billing.</p>
            <div className="mt-10 flex flex-col gap-5">
              <Field label="Organization name">
                <Input required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Haveli Hospitality" autoFocus />
              </Field>
              <Field label="Account type" hint={orgType === "agency" ? "Agencies manage menus for client venues and can white-label exports." : "For restaurants, cafes and bars managing their own menus."}>
                <Segmented value={orgType} onChange={setOrgType} options={[{ value: "venue", label: "Venue" }, { value: "agency", label: "Agency" }]} />
              </Field>
              <Field label="Country" hint={`Prices in ${defaults.currency}. Billing through ${country === "IN" ? "Razorpay" : "Stripe"}.`}>
                <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                  {!COUNTRIES.some((c) => c.code === country) ? <option value={country}>{country}</option> : null}
                </Select>
              </Field>
              <Button variant="primary" size="lg" type="submit" loading={createOrg.isPending} className="mt-2">
                Continue
              </Button>
              {createOrg.error ? <ErrorNotice error={createOrg.error} /> : null}
            </div>
          </form>
        ) : (
          <form onSubmit={submitVenue}>
            <h1 className="display mt-2 text-[44px]">{orgType === "agency" ? "Your first client venue" : "Tell us about your venue"}</h1>
            <p className="mt-2 text-[15px] text-muted">This decides the currency, time zone and the address of your QR menu.</p>
            <div className="mt-10 flex flex-col gap-5">
              <Field label="Venue name">
                <Input required value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Haveli Rasoi" autoFocus />
              </Field>
              <Field label="Type">
                <Select value={venueType} onChange={(e) => setVenueType(e.target.value)}>
                  {VENUE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="City">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Delhi" />
                </Field>
                <Field label="Currency" hint={`Time zone ${defaults.timezone}`}>
                  <Input value={defaults.currency} disabled />
                </Field>
              </div>
              <Button variant="primary" size="lg" type="submit" loading={createVenue.isPending} className="mt-2">
                Create venue
              </Button>
              {createVenue.error ? <ErrorNotice error={createVenue.error} /> : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
