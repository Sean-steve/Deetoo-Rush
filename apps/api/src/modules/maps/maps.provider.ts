import { requireSimulationMode } from '../../db/storage-policy';
/**
-- * DEETOO - Maps & Geocoding Provider
 * Implements address geocoding, reverse geocoding, and autocomplete abstraction
 * Compliant with ADR-002, DEE-DOM-001, DEE-API-001
 */

import { GeocodeResult, AutocompletePrediction } from '@deetoo/types';
import { logger } from '@deetoo/utils';
import { AppError } from '../../middleware/error-handler';

export interface IMapsProvider {
  geocode(address: string): Promise<GeocodeResult[]>;
  reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null>;
  autocomplete(input: string): Promise<AutocompletePrediction[]>;
}

// Highly accurate predefined landmark coordinates for Nairobi delivery zones
export const NAIROBI_PRESET_LOCATIONS: Array<{
  id: string;
  name: string;
  secondaryText: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  zone: string;
}> = [
  {
    id: 'nbo_westlands_sarit',
    name: 'Westlands (Sarit Centre)',
    secondaryText: 'Pio Gama Pinto Rd, Westlands, Nairobi',
    address: 'Sarit Centre, Karuna Rd, Westlands, Nairobi',
    city: 'Nairobi',
    lat: -1.2618,
    lng: 36.8027,
    zone: 'Westlands & Central',
  },
  {
    id: 'nbo_westlands_woodvale',
    name: 'Westlands (Woodvale Grove)',
    secondaryText: 'Mpaka Road, Westlands, Nairobi',
    address: 'Woodvale Grove, Westlands, Nairobi',
    city: 'Nairobi',
    lat: -1.2683,
    lng: 36.8044,
    zone: 'Westlands & Central',
  },
  {
    id: 'nbo_kilimani_yaya',
    name: 'Kilimani (Yaya Centre)',
    secondaryText: 'Argwings Kodhek Rd, Kilimani, Nairobi',
    address: 'Yaya Centre, Argwings Kodhek Rd, Kilimani, Nairobi',
    city: 'Nairobi',
    lat: -1.2921,
    lng: 36.7842,
    zone: 'Kilimani & Lavington',
  },
  {
    id: 'nbo_kilimani_adlife',
    name: 'Kilimani (Adlife Plaza)',
    secondaryText: 'Chania Ave / Ring Rd Kilimani, Nairobi',
    address: 'Adlife Plaza, Ring Rd Kilimani, Nairobi',
    city: 'Nairobi',
    lat: -1.2895,
    lng: 36.7885,
    zone: 'Kilimani & Lavington',
  },
  {
    id: 'nbo_cbd_kicc',
    name: 'Nairobi CBD (KICC)',
    secondaryText: 'Harambee Ave, City Square, Nairobi',
    address: 'KICC, Harambee Ave, Nairobi CBD',
    city: 'Nairobi',
    lat: -1.2884,
    lng: 36.8233,
    zone: 'Westlands & Central',
  },
  {
    id: 'nbo_cbd_mama_ngina',
    name: 'Nairobi CBD (Mama Ngina St)',
    secondaryText: 'City Centre, Nairobi',
    address: 'Mama Ngina St, Nairobi CBD',
    city: 'Nairobi',
    lat: -1.2841,
    lng: 36.8228,
    zone: 'Westlands & Central',
  },
  {
    id: 'nbo_upperhill',
    name: 'Upperhill Financial District',
    secondaryText: 'Hospital Rd / Kilimanjaro Ave, Nairobi',
    address: 'Upper Hill, Nairobi',
    city: 'Nairobi',
    lat: -1.2982,
    lng: 36.8157,
    zone: 'Westlands & Central',
  },
  {
    id: 'nbo_lavington_mall',
    name: 'Lavington (Lavington Mall)',
    secondaryText: 'James Gichuru Rd, Lavington, Nairobi',
    address: 'Lavington Mall, James Gichuru Rd, Nairobi',
    city: 'Nairobi',
    lat: -1.2785,
    lng: 36.7692,
    zone: 'Kilimani & Lavington',
  },
  {
    id: 'nbo_kileleshwa',
    name: 'Kileleshwa (Kasuku Centre)',
    secondaryText: 'Migori Rd, Kileleshwa, Nairobi',
    address: 'Kasuku Centre, Migori Rd, Kileleshwa, Nairobi',
    city: 'Nairobi',
    lat: -1.2755,
    lng: 36.7891,
    zone: 'Westlands & Central',
  },
  {
    id: 'nbo_parklands',
    name: 'Parklands (Aga Khan Hospital)',
    secondaryText: '3rd Parklands Ave, Nairobi',
    address: '3rd Parklands Ave, Parklands, Nairobi',
    city: 'Nairobi',
    lat: -1.2582,
    lng: 36.8224,
    zone: 'Westlands & Central',
  },
  {
    id: 'nbo_karen_hub',
    name: 'Karen (The Hub Karen)',
    secondaryText: 'Dagoretti Rd, Karen, Nairobi',
    address: 'The Hub Karen, Dagoretti Rd, Karen, Nairobi',
    city: 'Nairobi',
    lat: -1.3211,
    lng: 36.7062,
    zone: 'Karen & Langata',
  },
];

// Live geocoding is optional; no fake Nairobi fallback is ever used outside simulation mode.
async function mapboxLookup(search: string, autocomplete: boolean) {
  const token=process.env.MAPBOX_ACCESS_TOKEN;
  if(!token)return null;
  const url=new URL('https://api.mapbox.com/geocoding/v5/mapbox.places/'+encodeURIComponent(search)+'.json');
  url.searchParams.set('access_token',token);
  url.searchParams.set('country','ke');
  url.searchParams.set('limit','8');
  url.searchParams.set('autocomplete',autocomplete?'true':'false');
  let response:Response;
  try {
    response=await fetch(url,{signal:AbortSignal.timeout(8000)});
  } catch {
    throw new AppError(503,'MAPS_PROVIDER_UNAVAILABLE','Mapping provider unavailable');
  }
  if(!response.ok)throw new AppError(503,'MAPS_PROVIDER_FAILED','Mapping provider returned an error');
  const json=await response.json() as {features?:Array<{id:string;text:string;place_name:string;center:[number,number];context?:Array<{id:string;text:string}>}>};
  return json.features||[];
}
export class MapsProvider implements IMapsProvider {
  /**
   * Geocodes an address string to coordinate results
   */
  public async geocode(address: string): Promise<GeocodeResult[]> {
    if(!address.trim()||address.length>350)throw new AppError(400,'ADDRESS_INVALID','Valid address required');
    const live=await mapboxLookup(address,true);
    if(live)return live.map(item=>({
      latitude:item.center[1],longitude:item.center[0],formatted_address:item.place_name,
      city:item.context?.find(c=>c.id.startsWith('place.'))?.text||'Kenya',place_id:item.id
    }));
    requireSimulationMode();
    const q = address.trim().toLowerCase();

    // 1. Try matching against preset locations
    const matches = NAIROBI_PRESET_LOCATIONS.filter(
      (loc) =>
        loc.name.toLowerCase().includes(q) ||
        loc.address.toLowerCase().includes(q) ||
        loc.secondaryText.toLowerCase().includes(q)
    );

    if (matches.length > 0) {
      return matches.map((m) => ({
        latitude: m.lat,
        longitude: m.lng,
        formatted_address: m.address,
        city: m.city,
        place_id: m.id,
      }));
    }

    // 2. Default to central Nairobi if no specific match
    return [
      {
        latitude: -1.2683,
        longitude: 36.8044,
        formatted_address: `${address}, Nairobi, Kenya`,
        city: 'Nairobi',
        place_id: 'nbo_custom_geocoded',
      },
    ];
  }

  /**
   * Reverse geocodes latitude and longitude into human readable address
   */
  public async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)
      throw new AppError(400,'COORDINATES_INVALID','Valid latitude and longitude are required');
    const live=await mapboxLookup(lng+','+lat,false);
    if(live)return live[0]?{latitude:live[0].center[1],longitude:live[0].center[0],
      formatted_address:live[0].place_name,city:live[0].context?.find(c=>c.id.startsWith('place.'))?.text||'Kenya',
      place_id:live[0].id}:null;
    requireSimulationMode();
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return null;
    }

    // Find nearest preset landmark
    let nearest = NAIROBI_PRESET_LOCATIONS[0];
    let minDistance = Number.MAX_VALUE;

    for (const loc of NAIROBI_PRESET_LOCATIONS) {
      const d = Math.hypot(loc.lat - lat, loc.lng - lng);
      if (d < minDistance) {
        minDistance = d;
        nearest = loc;
      }
    }

    // If within ~3km of a landmark, reference it
    if (minDistance < 0.03) {
      return {
        latitude: lat,
        longitude: lng,
        formatted_address: `Near ${nearest.name}, ${nearest.secondaryText}`,
        city: nearest.city,
        place_id: nearest.id,
      };
    }

    return {
      latitude: lat,
      longitude: lng,
      formatted_address: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)}), Nairobi, Kenya`,
      city: 'Nairobi',
      place_id: `geo_${lat.toFixed(4)}_${lng.toFixed(4)}`,
    };
  }

  /**
   * Provides predictive address autocomplete for search inputs
   */
  public async autocomplete(input: string): Promise<AutocompletePrediction[]> {
    if(input.length>250)throw new AppError(400,'ADDRESS_INVALID','Search term is too long');
    const live=await mapboxLookup(input||'Kenya',true);
    if(live)return live.map(item=>({description:item.place_name,place_id:item.id,
      main_text:item.text,secondary_text:item.place_name,latitude:item.center[1],longitude:item.center[0]}));
    requireSimulationMode();
    const q = input.trim().toLowerCase();
    if (!q) {
      return NAIROBI_PRESET_LOCATIONS.slice(0, 6).map((m) => ({
        description: `${m.name}, ${m.secondaryText}`,
        place_id: m.id,
        main_text: m.name,
        secondary_text: m.secondaryText,
        latitude: m.lat,
        longitude: m.lng,
      }));
    }

    const filtered = NAIROBI_PRESET_LOCATIONS.filter(
      (loc) =>
        loc.name.toLowerCase().includes(q) ||
        loc.secondaryText.toLowerCase().includes(q) ||
        loc.address.toLowerCase().includes(q)
    );

    return filtered.map((m) => ({
      description: `${m.name}, ${m.secondaryText}`,
      place_id: m.id,
      main_text: m.name,
      secondary_text: m.secondaryText,
      latitude: m.lat,
      longitude: m.lng,
    }));
  }
}

export const mapsProvider = new MapsProvider();
