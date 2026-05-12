export type MemorialCardData = {
  full_name: string;
  date_of_interment: string;
  mass_service_time?: string;       // e.g. "9:00 AM"
  interment_service_time?: string;  // e.g. "10:00 AM"
  location?: string;                // e.g. "Renaissance Park"
  date_of_birth?: string;
  date_died?: string;
  date_of_mass?: string;
  person_photo_url?: string;
};

export type UploadResponse = {
  url: string;
};
