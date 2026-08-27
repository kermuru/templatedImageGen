export type LapidaOccupant = {
  name: string;
  dob?: string;
  dod?: string;
};

export type LapidaEngravingData = {
  occupants: LapidaOccupant[];
  photo_url?: string;
  photo_base64?: string;
  lot_no: string;
  skip_bg_removal?: boolean;
  gamma?: number;
};
