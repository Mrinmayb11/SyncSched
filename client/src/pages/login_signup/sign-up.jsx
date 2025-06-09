import supabase from '@/lib/supabase/SupabaseClient'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import AuthRedirect from '@/components/auth/AuthRedirect';

export default function SignUp() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()
  let [searchParams] = useSearchParams()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(event.target)
    const email = formData.get('email')
    const password = formData.get('password')
    const repeatPassword = formData.get('repeat-password')
    const origin = window.location.origin;
    const username = formData.get('username');

    // Input validation
    if (!email) {
      setError('Email is required')
      setLoading(false)
      return
    }

    if (!password) {
      setError('Password is required')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      setLoading(false)
      return
    }

    if (password !== repeatPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }


    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/confirm`, // Redirect to confirmation handler 
          data: {
            display_name: username,
          },
        },
      })

      if (error) {
        // Handle specific Supabase errors
        if (error.message.includes('email')) {
          throw new Error('Invalid email address')
        }
        if (error.message.includes('password')) {
          throw new Error('Password is too weak')
        }
        throw error
      }

      setSuccess(true)
    } catch (error) {
      console.error('Sign up error:', error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      {/* Redirect authenticated users */}
      <AuthRedirect />
      
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          {success ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Thank you for signing up!</CardTitle>
                <CardDescription>Check your email to confirm</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  You've successfully signed up. Please check your email to confirm your account
                  before signing in.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Sign up</CardTitle>
                <CardDescription>Create a new account</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit}>
                  <div className="flex flex-col gap-6">
                    <div className="grid gap-2">
                      <Label htmlFor="username">Username</Label>
                      <Input 
                        id="username" 
                        name="username" 
                        type="text" 
                        placeholder="username" 
                        required 
                        disabled={loading}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input 
                        id="email" 
                        name="email" 
                        type="email" 
                        placeholder="m@example.com" 
                        required 
                        disabled={loading}
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center">
                        <Label htmlFor="password">Password</Label>
                      </div>
                      <Input 
                        id="password" 
                        name="password" 
                        type="password" 
                        required 
                        disabled={loading}
                        minLength={6}
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center">
                        <Label htmlFor="repeat-password">Repeat Password</Label>
                      </div>
                      <Input 
                        id="repeat-password" 
                        name="repeat-password" 
                        type="password" 
                        required 
                        disabled={loading}
                        minLength={6}
                      />
                    </div>
                    {error && (
                      <div className="rounded-md bg-red-50 p-3">
                        <p className="text-sm text-red-500">{error}</p>
                      </div>
                    )}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Creating an account...' : 'Sign up'}
                    </Button>
                  </div>
                  <div className="mt-4 text-center text-sm">
                    Already have an account?{' '}
                    <Link to="/login" className="underline underline-offset-4">
                      Login
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
