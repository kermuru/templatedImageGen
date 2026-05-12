import { getHiringPosts } from "../api";

export async function DisplayHiring() {
  const posts = await getHiringPosts();

  if (posts.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No open positions right now.
      </p>
    );
  }

  return (
    <ul className="flex w-full flex-col gap-4">
      {posts.map((post) => (
        <li
          key={post.id}
          className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
              {post.title}
            </h3>
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              {post.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {post.department} &middot; {post.location} &middot;{" "}
            {post.employment_type.replace("_", " ")}
          </p>
          {post.description && (
            <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {post.description}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
