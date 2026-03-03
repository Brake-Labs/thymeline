// Public layout for auth pages — no session check
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
