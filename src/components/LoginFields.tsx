import { Lock } from 'lucide-react';

const inputCls =
  'h-9 w-full rounded-md border border-line bg-surface2 px-3 text-sm text-fg placeholder:text-fg3 hover:border-fg3/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

export interface LoginFieldsProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  user: string;
  password: string;
  onUser: (v: string) => void;
  onPassword: (v: string) => void;
  /** The server answered "401": it wants a login. */
  needed?: boolean;
}

/** "Use a login" for downloads from a site that asks for a user name and password (HTTP Basic). */
export function LoginFields({ open, onToggle, user, password, onUser, onPassword, needed }: LoginFieldsProps) {
  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
        aria-expanded={open}
        onClick={() => onToggle(!open)}
      >
        <Lock size={12} aria-hidden />
        {open ? 'Hide login' : '+ This site needs a login (optional)'}
        {!open && user ? ` · ${user}` : ''}
      </button>
      {needed && !open && <span className="ml-2 text-[12px] text-warn">The site asks for a login.</span>}
      {open && (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <input className={inputCls} value={user} onChange={(e) => onUser(e.target.value)} placeholder="User name" autoComplete="off" spellCheck={false} aria-label="Login user name" />
          <input className={inputCls} type="password" value={password} onChange={(e) => onPassword(e.target.value)} placeholder="Password" autoComplete="off" aria-label="Login password" />
          <p className="col-span-2 text-[11.5px] text-fg3">
            {needed ? <span className="text-warn">This link needs a user name and password. </span> : null}
            The password is kept in your system’s keyring and only sent to this site, never to mirrors.
          </p>
        </div>
      )}
    </div>
  );
}
