export type BarongStatus = "pending" | "processing" | "done" | "failed";

/** One photo queued for the Barong edit. Mirrors core-system's barong_edit_jobs row. */
export type BarongJob = {
  id: number;
  name: string | null;
  /** Raw sex value captured from the sheet. */
  sex: string | null;
  /** What that resolved to: barong | filipiniana. */
  garment: string | null;
  photolink: string;
  status: BarongStatus;
  /** Set once the source photo is stored — the "before" thumbnail. */
  input_path: string | null;
  /** Set once the edit lands — the "after" thumbnail. */
  output_path: string | null;
  /** True when the canvas was grown and missing body generated, rather than re-dressed in place. */
  extended: boolean;
  /** Detected crop: upper_chest | lower_chest | full_torso. */
  framing: string | null;
  /** The arms left the frame and had to be reconstructed. */
  arms_cut: boolean;
  /** Head height as a fraction of the source photo; sets the body scale. */
  head_fraction: number | null;
  duration_ms: number | null;
  attempts: number;
  error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type BarongCounts = Record<BarongStatus, number>;

/** Backend-side settings, echoed so the page can state the live filter/engine. */
export type BarongConfig = {
  model: string;
  mask_mode: string;
  detect_mode: string;
  /** Garment used when the sheet's sex cell is blank or unrecognised. */
  garment_default: string;
  /** down = arms repositioned straight down and cropped at the wrists. */
  arms_pose: string;
  filter: { action: string; status_not: string };
};

export type BarongStatusResponse = {
  ok: boolean;
  counts: BarongCounts;
  jobs: BarongJob[];
  config: BarongConfig;
};

export type BarongSyncResult = {
  ok: boolean;
  created: number;
  skipped: number;
  eligible: number;
};

export type BarongProcessResult = {
  ok: boolean;
  /** false = nothing was pending, the queue is drained. */
  processed: boolean;
  job: BarongJob | null;
};

export type BarongCountResult = {
  ok: boolean;
  requeued?: number;
  dispatched?: number;
};

/**
 * A portrait the family uploaded through the portal.
 *
 * `dressed` means `photo` has been swapped for the Barong/Filipiniana version —
 * which is what the lapida engraver and the video livestreaming supplier receive,
 * because NlioNotificationService reads that column live when it builds their
 * service order. The family's upload is preserved in `original_url`.
 */
export type BarongUpload = {
  id: number;
  document_no: string;
  occupant: string | null;
  /** Drives the garment: female → Filipiniana, otherwise Barong. */
  gender: string | null;
  uploader_name: string | null;
  dressed: boolean;
  /** What suppliers will receive. */
  photo_url: string | null;
  /** The family's original, once set aside. */
  original_url: string | null;
  barong_edit_id: number | null;
  gdrive_link: string | null;
  /** Drive archiving is optional — a failure here never loses the edit. */
  drive_error: string | null;
  created_at: string | null;
};

export type BarongUploadsResponse = {
  ok: boolean;
  document_no: string;
  photos: BarongUpload[];
};

export type BarongUploadResult = {
  ok: boolean;
  photo: BarongUpload;
};
