import React, { useEffect, useState } from "react";
import {
  UpdateBranchSchema,
  BatchOpeningHoursSchema,
} from "@deetoo/validation";
import { useAuth } from "../../../../packages/auth/src/react";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  Select,
} from "../../../../packages/ui/src/index";
import {
  errorMessage,
  PageHeading,
  ResourceState,
  useResource,
} from "../../../../packages/ui/src/workflows";
import { LocateFixed, MapPin, Store, Clock3, ChefHat, Truck, Settings2 } from "lucide-react";
import { LocationMap } from "../../../../packages/ui/src/LocationMap";
import { getBrowserCurrentLocation } from "../../../../packages/ui-web/src/geolocation";
export function BranchSettings({
  branchId,
  canManage,
  onChanged,
}: {
  branchId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { apiClient } = useAuth();
  const path = `/merchant/branches/${encodeURIComponent(branchId)}`;
  const branch = useResource<any>(path);
  const schedule = useResource<any[]>(path + "/opening-hours");
  const [fields, setFields] = useState({
    name: "",
    address_line1: "",
    phone: "",
    latitude: "",
    longitude: "",
    prep_default_min: "",
    min_order_minor: "",
  });
  const [hours, setHours] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (branch.data)
      setFields({
        name: branch.data.name,
        address_line1: branch.data.address_line1,
        phone: branch.data.phone || "",
        latitude: String(branch.data.latitude ?? ""),
        longitude: String(branch.data.longitude ?? ""),
        prep_default_min: String(branch.data.prep_default_min),
        min_order_minor: String(branch.data.min_order_minor),
      });
  }, [branch.data]);
  useEffect(() => {
    if (schedule.data) setHours(schedule.data.map((h) => ({ ...h })));
  }, [schedule.data]);
  async function useCurrentLocation() {
    setIsLocating(true);
    setError(null);
    setSaved("");
    try {
      const coords = await getBrowserCurrentLocation();
      setFields((current) => ({
        ...current,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
      }));
      setSaved("GPS coordinates updated. Save the branch to persist them.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsLocating(false);
    }
  }

  async function save(
    endpoint: string,
    method: string,
    payload: any,
    schema: any,
  ) {
    setError(null);
    setSaved("");
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i: any) => i.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      await apiClient.request(endpoint, {
        method,
        body: JSON.stringify(parsed.data),
      });
      await Promise.all([branch.refresh(), schedule.refresh()]);
      onChanged();
      setSaved("Branch settings saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const changeField = (key: keyof typeof fields, value: string) => setFields(current => ({...current, [key]: value}));
  const validLat = Number(fields.latitude);
  const validLng = Number(fields.longitude);
  const locationValid = fields.latitude.trim() !== "" && fields.longitude.trim() !== "" &&
    Number.isFinite(validLat) && Number.isFinite(validLng) && Math.abs(validLat) <= 90 && Math.abs(validLng) <= 180;
  return (
    <div className="space-y-5">
      <PageHeading eyebrow="Branch settings" title="Branch settings"
        subtitle="Manage your branch information, location, operating hours and preparation settings." />
      {error && <ErrorState message={error} />}
      {saved && <p role="status" className="text-emerald-700 text-sm">{saved}</p>}
      <nav className="merchant-v2-tabs" aria-label="Branch setting sections">
        {[["General","#branch-general"],["Location","#branch-location"],["Operating hours","#branch-hours"],["Preparation","#branch-prep"]].map(([label,href]) =>
          <a key={href} className="merchant-v2-settings-tab" href={href}>{label}</a>)}
      </nav>
      <div className="merchant-v2-settings-layout">
        <ResourceState resource={branch}>
          {branch.data && (
            <form className="merchant-v2-branch-form" onSubmit={event => {
              event.preventDefault();
              void save(path, "PATCH", {
                ...fields,
                phone: fields.phone || undefined,
                latitude: Number(fields.latitude),
                longitude: Number(fields.longitude),
                prep_default_min: Number(fields.prep_default_min),
                min_order_minor: Number(fields.min_order_minor),
              }, UpdateBranchSchema);
            }}>
              <Card id="branch-general" className="merchant-v2-general-settings">
                <h2 className="merchant-v2-panel-title"><Store size={21}/> General information</h2>
                <p className="text-xs text-slate-500 mb-5">Basic details about this branch.</p>
                <FormField label="Branch name" required><Input disabled={!canManage} value={fields.name} onChange={event => changeField("name", event.target.value)} /></FormField>
                <FormField label="Street address" required><Input disabled={!canManage} value={fields.address_line1} onChange={event => changeField("address_line1", event.target.value)} /></FormField>
                <FormField label="Phone number"><Input disabled={!canManage} type="tel" value={fields.phone} onChange={event => changeField("phone", event.target.value)} /></FormField>
                <p className="text-xs text-slate-500 mt-5">Branch status is controlled from the Store status menu at the top of the page.</p>
              </Card>
              <Card id="branch-location" className="merchant-v2-location-settings">
                <h2 className="merchant-v2-panel-title"><MapPin size={21}/> Location</h2>
                <p className="text-xs text-slate-500 mb-5">Set the coordinates used for pickup and delivery.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Latitude" required><Input disabled={!canManage} type="number" step="any" value={fields.latitude} onChange={event => changeField("latitude", event.target.value)} /></FormField>
                  <FormField label="Longitude" required><Input disabled={!canManage} type="number" step="any" value={fields.longitude} onChange={event => changeField("longitude", event.target.value)} /></FormField>
                </div>
                <div className="merchant-v2-coordinate-map">
                  {locationValid
                    ? <LocationMap points={[{id: branchId,label:branch.data.name || "Branch", latitude:validLat, longitude:validLng,kind:"pickup"}]}/>
                    : <p>Enter valid coordinates to preview this branch location.</p>}
                </div>
                {canManage && <Button type="button" variant="outline" disabled={busy || isLocating} onClick={() => void useCurrentLocation()} className="gap-2 mt-3">
                  <LocateFixed size={15}/>{isLocating ? "Getting GPS…" : "Use current location"}
                </Button>}
              </Card>
              <Card id="branch-prep" className="merchant-v2-prep-settings">
                <h2 className="merchant-v2-panel-title"><ChefHat size={21}/> Preparation settings</h2>
                <p className="text-xs text-slate-500 mb-4">Set default preparation time and minimum order amount.</p>
                <FormField label="Default preparation time (minutes)"><Input disabled={!canManage} type="number" min="1" value={fields.prep_default_min} onChange={event => changeField("prep_default_min",event.target.value)} /></FormField>
                <FormField label="Minimum order (minor currency units)"><Input disabled={!canManage} type="number" min="0" value={fields.min_order_minor} onChange={event => changeField("min_order_minor",event.target.value)} /></FormField>
                {canManage && <Button type="submit" className="mt-4" isLoading={busy}>Save branch settings</Button>}
              </Card>
            </form>
          )}
        </ResourceState>
        <ResourceState resource={schedule}>
          <Card id="branch-hours" className="merchant-v2-hours-settings">
            <h2 className="merchant-v2-panel-title"><Clock3 size={21}/> Operating hours</h2>
            <p className="text-xs text-slate-500 mb-4">When this branch accepts orders · {branch.data?.timezone || "local time"}</p>
            <form onSubmit={event => {event.preventDefault();void save(path + "/opening-hours","PUT",hours,BatchOpeningHoursSchema);}}>
              {hours.map((hour,i) => (
                <fieldset key={hour.id || i} className="merchant-v2-hour-row">
                  <legend className="sr-only">Opening interval {i+1}</legend>
                  <FormField label="Day"><Select disabled={!canManage} value={hour.day_of_week} onChange={event => setHours(hours.map((h,j) => i === j ? {...h,day_of_week:Number(event.target.value)} : h))}>
                    {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day,d) => <option key={day} value={d}>{day}</option>)}
                  </Select></FormField>
                  <div className="grid grid-cols-2 gap-2">
                    {(["open_time","close_time"] as const).map(key => <FormField key={key} label={key === "open_time" ? "Opens" : "Closes"}>
                      <Input disabled={!canManage || hour.is_closed} type="time" value={hour[key]} onChange={event => setHours(hours.map((h,j) => i === j ? {...h,[key]:event.target.value} : h))}/>
                    </FormField>)}
                  </div>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={hour.is_closed} disabled={!canManage}
                    onChange={event => setHours(hours.map((h,j) => i === j ? {...h,is_closed:event.target.checked} : h))}/> Closed</label>
                  {canManage && <Button type="button" size="sm" variant="ghost" onClick={() => setHours(hours.filter((_,j) => j !== i))}>Remove interval</Button>}
                </fieldset>
              ))}
              {canManage && <div className="flex flex-wrap gap-2 mt-4">
                <Button type="button" variant="outline" onClick={() => setHours([...hours,{day_of_week:0,open_time:"09:00",close_time:"17:00",is_closed:false}])}>+ Add interval</Button>
                <Button type="submit" disabled={Boolean(schedule.error)} isLoading={busy}>Save hours</Button>
              </div>}
            </form>
          </Card>
        </ResourceState>
        <Card className="merchant-v2-delivery-settings">
          <h2 className="merchant-v2-panel-title"><Truck size={21}/> Delivery & service</h2>
          <p className="text-xs text-slate-500">Delivery coverage and fulfillment options are currently administered centrally. Contact DeeToo Support to request changes.</p>
        </Card>
      </div>
    </div>
  );
}
