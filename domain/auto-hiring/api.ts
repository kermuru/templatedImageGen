import { revalidateTag } from "next/cache";
import type {
  CreateHiringInput,
  HiringPost,
  LaravelCollection,
  LaravelResource,
  UpdateHiringInput,
} from "./type";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";
const HIRING_TAG = "hiring";

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function getHiringPosts(): Promise<HiringPost[]> {
  const res = await fetch(`${API}/hiring`, {
    headers: headers(),
    next: { tags: [HIRING_TAG] },
  });
  if (!res.ok) throw new Error(`Failed to load hiring posts (${res.status})`);
  const json: LaravelCollection<HiringPost> | HiringPost[] = await res.json();
  return Array.isArray(json) ? json : json.data;
}

export async function getHiringPost(id: number): Promise<HiringPost> {
  const res = await fetch(`${API}/hiring/${id}`, {
    headers: headers(),
    next: { tags: [`${HIRING_TAG}:${id}`] },
  });
  if (!res.ok) throw new Error(`Failed to load hiring post ${id} (${res.status})`);
  const json: LaravelResource<HiringPost> | HiringPost = await res.json();
  return "data" in json ? json.data : json;
}

export async function createHiringPost(
  input: CreateHiringInput,
): Promise<HiringPost> {
  const res = await fetch(`${API}/hiring`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create hiring post (${res.status})`);
  const json: LaravelResource<HiringPost> | HiringPost = await res.json();
  revalidateTag(HIRING_TAG, "max");
  return "data" in json ? json.data : json;
}

export async function updateHiringPost(
  id: number,
  input: UpdateHiringInput,
): Promise<HiringPost> {
  const res = await fetch(`${API}/hiring/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to update hiring post ${id} (${res.status})`);
  const json: LaravelResource<HiringPost> | HiringPost = await res.json();
  revalidateTag(HIRING_TAG, "max");
  revalidateTag(`${HIRING_TAG}:${id}`, "max");
  return "data" in json ? json.data : json;
}

export async function deleteHiringPost(id: number): Promise<void> {
  const res = await fetch(`${API}/hiring/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Failed to delete hiring post ${id} (${res.status})`);
  revalidateTag(HIRING_TAG, "max");
  revalidateTag(`${HIRING_TAG}:${id}`, "max");
}
