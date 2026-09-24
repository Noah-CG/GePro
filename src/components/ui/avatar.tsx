import { cn, initials } from "@/lib/utils";

type Person = { id: string; name: string; color: string };

export function Avatar({ user, size = 24, className }: { user: Person; size?: number; className?: string }) {
  return (
    <span
      title={user.name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.4 }}
    >
      {initials(user.name)}
    </span>
  );
}

/** Avatars superposés ; au-delà de `max`, affiche "+n". */
export function AvatarStack({ users, max = 3, size = 22 }: { users: Person[]; max?: number; size?: number }) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex -space-x-1.5" title={users.map((u) => u.name).join(", ")}>
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} className="ring-2 ring-surface" />
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface-2 text-[10px] font-medium text-muted ring-2 ring-surface"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
