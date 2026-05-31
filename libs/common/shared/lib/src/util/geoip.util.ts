export interface GeoIpInfo {
  country?: string;
  city?: string;
}

export const emptyGeoIpInfo = (): GeoIpInfo => ({});
