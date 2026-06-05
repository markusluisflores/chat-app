import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm">
        <h1 className="text-2xl font-bold text-center mb-8 text-gray-900">Sign in</h1>
        <LoginForm />
      </div>
    </div>
  )
}
