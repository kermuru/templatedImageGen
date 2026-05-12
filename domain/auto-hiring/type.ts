export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "internship";

export type HiringStatus = "open" | "closed" | "draft";

export type HiringPost = {
  id: number;
  title: string;
  department: string;
  location: string;
  employment_type: EmploymentType;
  status: HiringStatus;
  description: string;
  created_at: string;
  updated_at: string;
};

export type CreateHiringInput = {
  title: string;
  department: string;
  location: string;
  employment_type: EmploymentType;
  description: string;
};

export type UpdateHiringInput = Partial<CreateHiringInput> & {
  status?: HiringStatus;
};

export type LaravelCollection<T> = {
  data: T[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};

export type LaravelResource<T> = {
  data: T;
};
