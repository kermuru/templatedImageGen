export type MemorialCardV3Data = {
  full_name: string;
  date_of_interment: string;
  mass_service_time?: string;       // e.g. "9:30 AM"
  interment_service_time?: string;  // e.g. "10:00 AM"
  // V3 draws the venue chips rather than baking them into the artwork.
  location?: string;                // bold line, e.g. "RENAISSANCE PARK"
  location_sub?: string;            // caption under it, e.g. "PARK AND CHAPELS"
  time_caption?: string;            // caption under the time, e.g. "AT RENAISSANCE PARK"
  date_of_birth?: string;
  date_died?: string;
  date_of_mass?: string;
  person_photo_url?: string;
};

export type UploadResponse = {
  url: string;
};
