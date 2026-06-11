import { RegisterForm } from '@/components/auth/RegisterForm'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm">
        <h1 className="text-2xl font-bold text-center mb-8 text-gray-900">Create account</h1>
        <RegisterForm />
      </div>
    </div>
  )
}
